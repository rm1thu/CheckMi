from typing import Generator, List, Optional, Dict, Any
from datetime import datetime, timedelta, time as dt_time
import math
import secrets
import string
import hashlib
import hmac
import os
import re
from urllib.parse import urlparse

import requests
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    ForeignKey,
    DateTime,
    create_engine,
    func,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session


# ===================== DB SETUP =====================

DATABASE_URL = "mysql+pymysql://root:@localhost:3306/CheckMi"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ===================== DB MODELS =====================

class UserDB(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    role = Column(String(100), nullable=False, default="Self")


class FamilyDB(Base):
    __tablename__ = "families"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False, default="My Family")
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class FamilyMemberDB(Base):
    __tablename__ = "family_members"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("family_id", "user_id", name="uq_family_user"),
    )


class FamilyGoalDB(Base):
    __tablename__ = "family_goals"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=False, unique=True, index=True)

    steps_goal = Column(Integer, nullable=False, default=10000)
    sleep_goal = Column(Float, nullable=False, default=8.0)

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class FamilyChatMessageDB(Base):
    __tablename__ = "family_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    message = Column(String(1000), nullable=False)
    parent_id = Column(Integer, ForeignKey("family_chat_messages.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class MetricEntryDB(Base):
    __tablename__ = "metric_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    heart_rate = Column(Float, nullable=False)
    weight = Column(Float, nullable=False)
    steps = Column(Integer, nullable=False)
    sleep = Column(Float, nullable=False)

    blood_glucose = Column(Float, nullable=False)
    systolic_bp = Column(Float, nullable=False)
    diastolic_bp = Column(Float, nullable=False)
    cholesterol = Column(Float, nullable=False)

    created_at = Column(DateTime, nullable=False, server_default=func.now())


class ShareCodeDB(Base):
    """
    One active share code per family.
    """
    __tablename__ = "share_codes"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=False, unique=True)
    code = Column(String(12), nullable=False, unique=True, index=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class MetricConsentDB(Base):
    """
    Consent-based sharing: per-user consent for each metric within a family.
    One row per (family_id, user_id, metric_key).
    """
    __tablename__ = "metric_consent"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    metric_key = Column(String(50), nullable=False)  # e.g. "heartRate", "bloodGlucose"
    is_shared = Column(Integer, nullable=False, default=0)  # 0/1

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("family_id", "user_id", "metric_key", name="uq_consent_family_user_metric"),
    )


class AlertDB(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    category = Column(String(30), nullable=False, default="info")  # goal|info|warning|urgent
    title = Column(String(140), nullable=False)
    message = Column(String(300), nullable=False)
    severity = Column(String(20), nullable=False, default="info")  # info|warning|urgent

    metric_type = Column(String(50), nullable=True)  # steps|heartRate|bloodPressure etc
    metric_value = Column(Float, nullable=True)

    is_read = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class MedicationDB(Base):
    __tablename__ = "medications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    name = Column(String(120), nullable=False)
    dosage = Column(String(120), nullable=False, default="1 dose")
    instructions = Column(String(255), nullable=True)
    schedule_times = Column(String(120), nullable=False, default="08:00")  # CSV: HH:MM,HH:MM

    pills_remaining = Column(Integer, nullable=False, default=0)
    refill_threshold = Column(Integer, nullable=False, default=5)
    is_active = Column(Integer, nullable=False, default=1)  # 0/1

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class MedicationLogDB(Base):
    __tablename__ = "medication_logs"

    id = Column(Integer, primary_key=True, index=True)
    medication_id = Column(Integer, ForeignKey("medications.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    status = Column(String(16), nullable=False, default="taken")  # taken|missed
    scheduled_at = Column(DateTime, nullable=True)
    note = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


# ===================== AUTH MODELS =====================

class AuthUserDB(Base):
    __tablename__ = "auth_users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    salt = Column(String(32), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)


class AuthTokenDB(Base):
    __tablename__ = "auth_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class AdminTokenDB(Base):
    __tablename__ = "admin_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    admin_username = Column(String(100), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class DataDeletionRequestDB(Base):
    __tablename__ = "data_deletion_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    request_type = Column(String(40), nullable=False, index=True)  # delete_data | delete_account
    status = Column(String(20), nullable=False, default="pending", index=True)  # pending | approved | rejected
    requested_at = Column(DateTime, nullable=False, server_default=func.now())
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(String(100), nullable=True)
    review_note = Column(String(500), nullable=True)


Base.metadata.create_all(bind=engine)


# ===================== HELPERS =====================

DEFAULT_FAMILY_STEPS_GOAL = 10000
DEFAULT_FAMILY_SLEEP_GOAL = 8.0

ADMIN_FIXED_USERNAME = os.getenv("CHECKMI_ADMIN_USERNAME", "admin")
ADMIN_FIXED_PASSWORD = os.getenv("CHECKMI_ADMIN_PASSWORD", "admin123")

DELETE_REQUEST_DATA = "delete_data"
DELETE_REQUEST_ACCOUNT = "delete_account"
DELETE_REQUEST_ALLOWED = {DELETE_REQUEST_DATA, DELETE_REQUEST_ACCOUNT}

MED_LOG_TAKEN = "taken"
MED_LOG_MISSED = "missed"
MED_LOG_ALLOWED = {MED_LOG_TAKEN, MED_LOG_MISSED}
SCHEDULE_TIME_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

NAME_MIN_LENGTH = 2
NAME_MAX_LENGTH = 100
ROLE_MAX_LENGTH = 100
PASSWORD_MIN_LENGTH = 8
FAMILY_STEPS_GOAL_MAX = 100000
FAMILY_SLEEP_GOAL_MIN = 1.0
FAMILY_SLEEP_GOAL_MAX = 24.0
FAMILY_CHAT_MESSAGE_MAX = 500
MEDICATION_NAME_MAX = 120
MEDICATION_DOSAGE_MAX = 120
MEDICATION_INSTRUCTIONS_MAX = 255
METRIC_HEART_RATE_MIN = 30
METRIC_HEART_RATE_MAX = 240
METRIC_WEIGHT_MIN = 1.0
METRIC_WEIGHT_MAX = 500.0
METRIC_STEPS_MAX = 100000
METRIC_SLEEP_MAX = 24.0
METRIC_BLOOD_GLUCOSE_MIN = 0.1
METRIC_BLOOD_GLUCOSE_MAX = 40.0
METRIC_SYSTOLIC_BP_MIN = 50
METRIC_SYSTOLIC_BP_MAX = 260
METRIC_DIASTOLIC_BP_MIN = 30
METRIC_DIASTOLIC_BP_MAX = 180
METRIC_CHOLESTEROL_MIN = 0.1
METRIC_CHOLESTEROL_MAX = 20.0


def trim_text(value: Optional[str]) -> str:
    return (value or "").strip()


def normalize_person_text(value: Optional[str]) -> str:
    return re.sub(r"\s+", " ", trim_text(value))


def validate_person_name(value: str, label: str) -> str:
    cleaned = normalize_person_text(value)
    if len(cleaned) < NAME_MIN_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"{label} must be at least {NAME_MIN_LENGTH} characters",
        )
    if len(cleaned) > NAME_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"{label} must be {NAME_MAX_LENGTH} characters or fewer",
        )
    return cleaned


def validate_role_text(value: str) -> str:
    cleaned = normalize_person_text(value)
    if not cleaned:
        raise HTTPException(status_code=400, detail="Role cannot be empty")
    if len(cleaned) > ROLE_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Role must be {ROLE_MAX_LENGTH} characters or fewer",
        )
    return cleaned


def validate_email_value(value: str) -> str:
    cleaned = trim_text(value).lower()
    if not cleaned or not EMAIL_RE.match(cleaned):
        raise HTTPException(status_code=400, detail="Invalid email")
    if len(cleaned) > 255:
        raise HTTPException(status_code=400, detail="Email is too long")
    return cleaned


def validate_password_strength(value: str) -> str:
    if len(value) < PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {PASSWORD_MIN_LENGTH} characters",
        )
    if not re.search(r"\d", value):
        raise HTTPException(status_code=400, detail="Password must include a number")
    if not re.search(r"[^A-Za-z0-9]", value):
        raise HTTPException(status_code=400, detail="Password must include a symbol")
    return value


def validate_family_steps_goal(value: int) -> int:
    steps = int(value)
    if steps <= 0:
        raise HTTPException(status_code=400, detail="Steps goal must be greater than 0")
    if steps > FAMILY_STEPS_GOAL_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Steps goal must be {FAMILY_STEPS_GOAL_MAX} or less",
        )
    return steps


def validate_family_sleep_goal(value: float) -> float:
    sleep = float(value)
    if sleep < FAMILY_SLEEP_GOAL_MIN or sleep > FAMILY_SLEEP_GOAL_MAX:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Sleep goal must be between {int(FAMILY_SLEEP_GOAL_MIN)} "
                f"and {int(FAMILY_SLEEP_GOAL_MAX)} hours"
            ),
        )
    return sleep


def validate_chat_message_text(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", trim_text(value))
    if not cleaned:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(cleaned) > FAMILY_CHAT_MESSAGE_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Message is too long (max {FAMILY_CHAT_MESSAGE_MAX} chars)",
        )
    if not any(ch.isalnum() for ch in cleaned):
        raise HTTPException(
            status_code=400,
            detail="Message must include letters or numbers",
        )
    return cleaned


def validate_medication_name(value: str) -> str:
    cleaned = normalize_person_text(value)
    if not cleaned:
        raise HTTPException(status_code=400, detail="Medication name is required")
    if len(cleaned) > MEDICATION_NAME_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Medication name must be {MEDICATION_NAME_MAX} characters or fewer",
        )
    return cleaned


def validate_medication_dosage(value: Optional[str]) -> str:
    cleaned = normalize_person_text(value or "1 dose") or "1 dose"
    if len(cleaned) > MEDICATION_DOSAGE_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Dosage must be {MEDICATION_DOSAGE_MAX} characters or fewer",
        )
    return cleaned


def validate_optional_text(value: Optional[str], label: str, max_length: int) -> Optional[str]:
    if value is None:
        return None
    cleaned = trim_text(value)
    if not cleaned:
        return None
    if len(cleaned) > max_length:
        raise HTTPException(
            status_code=400,
            detail=f"{label} must be {max_length} characters or fewer",
        )
    return cleaned


def validate_non_negative_int(value: Optional[int], field_name: str, default: int) -> int:
    number = int(default if value is None else value)
    if number < 0:
        raise HTTPException(status_code=400, detail=f"{field_name} cannot be negative")
    return number


def validate_medication_log_status(value: str) -> str:
    status = trim_text(value).lower()
    if status not in MED_LOG_ALLOWED:
        raise HTTPException(status_code=400, detail="status must be 'taken' or 'missed'")
    return status


def validate_positive_int(value: int, field_name: str) -> int:
    number = int(value)
    if number <= 0:
        raise HTTPException(status_code=400, detail=f"{field_name} must be greater than 0")
    return number


def validate_metric_number(
    value: Optional[float],
    field_name: str,
    minimum: float,
    maximum: float,
    *,
    integer: bool = False,
) -> float:
    if value is None:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")

    number = float(value)
    if not math.isfinite(number):
        raise HTTPException(status_code=400, detail=f"{field_name} must be a valid number")

    if integer and not number.is_integer():
        raise HTTPException(status_code=400, detail=f"{field_name} must be a whole number")

    if number < minimum or number > maximum:
        min_display = int(minimum) if float(minimum).is_integer() else minimum
        max_display = int(maximum) if float(maximum).is_integer() else maximum
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} must be between {min_display} and {max_display}",
        )

    return int(number) if integer else number


def latest_entry_for_user(db: Session, user_id: int):
    return (
        db.query(MetricEntryDB)
        .filter(MetricEntryDB.user_id == user_id)
        .order_by(MetricEntryDB.created_at.desc())
        .first()
    )


def parse_schedule_times_csv(raw: str) -> List[str]:
    values = [v.strip() for v in (raw or "").split(",") if v.strip()]
    out: List[str] = []                    
    seen = set()
    for value in values:
        if not SCHEDULE_TIME_RE.match(value):
            continue
        if value in seen:
            continue
        seen.add(value)
        out.append(value)
    out.sort()
    return out


def normalize_schedule_times(values: List[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for value in values:
        vv = (value or "").strip()
        if not SCHEDULE_TIME_RE.match(vv):
            raise HTTPException(status_code=400, detail=f"Invalid schedule time: {value}")
        if vv in seen:
            continue
        seen.add(vv)
        out.append(vv)
    out.sort()
    if not out:
        raise HTTPException(status_code=400, detail="At least one valid schedule time is required")
    return out


def parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid datetime format")


def get_next_medication_reminder(schedule_times: List[str], now: datetime) -> Optional[datetime]:
    if not schedule_times:
        return None
    candidates: List[datetime] = []
    for day_offset in [0, 1]:
        date_value = (now + timedelta(days=day_offset)).date()
        for clock in schedule_times:
            hours, minutes = clock.split(":")
            dt = datetime.combine(date_value, dt_time(int(hours), int(minutes)))
            if dt >= now:
                candidates.append(dt)
    if not candidates:
        return None
    candidates.sort()
    return candidates[0]


def calculate_medication_adherence(
    db: Session,
    medication: MedicationDB,
    now: datetime,
    days: int,
) -> float:
    if days <= 0:
        return 0.0
    schedule_times = parse_schedule_times_csv(medication.schedule_times)
    if not schedule_times:
        return 0.0

    since = now - timedelta(days=days)
    start = medication.created_at or since
    effective_start = since if start < since else start
    covered_days = (now.date() - effective_start.date()).days + 1
    if covered_days < 0:
        covered_days = 0
    expected = covered_days * len(schedule_times)
    if expected <= 0:
        return 0.0

    taken = int(
        db.query(func.count(MedicationLogDB.id))
        .filter(
            MedicationLogDB.medication_id == medication.id,
            MedicationLogDB.user_id == medication.user_id,
            MedicationLogDB.status == MED_LOG_TAKEN,
            MedicationLogDB.created_at >= since,
        )
        .scalar()
        or 0
    )

    ratio = (taken / expected) * 100.0
    if ratio < 0:
        ratio = 0.0
    if ratio > 100:
        ratio = 100.0
    return round(ratio, 1)


def generate_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def make_salt(length: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str, salt: str) -> str:
    iterations = 310000
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()
    return f"pbkdf2_sha256${iterations}${digest}"


def verify_password(password: str, salt: str, stored_hash: str) -> bool:
    # Current format: pbkdf2_sha256$<iterations>$<digest_hex>
    if stored_hash.startswith("pbkdf2_sha256$"):
        parts = stored_hash.split("$", 2)
        if len(parts) != 3:
            return False
        _, iter_str, expected_digest = parts
        try:
            iterations = int(iter_str)
        except ValueError:
            return False

        computed_digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            iterations,
        ).hex()
        return hmac.compare_digest(computed_digest, expected_digest)

    # Backward compatibility with legacy single-pass SHA256(salt + password).
    legacy_digest = hashlib.sha256((salt + password).encode()).hexdigest()
    return hmac.compare_digest(legacy_digest, stored_hash)


def generate_token(length: int = 48) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def get_current_user(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
) -> UserDB:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization.split(" ", 1)[1].strip()
    row = db.query(AuthTokenDB).filter(AuthTokenDB.token == token).first()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(UserDB).filter(UserDB.id == row.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found for token")

    return user


def get_current_admin(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization.split(" ", 1)[1].strip()
    row = db.query(AdminTokenDB).filter(AdminTokenDB.token == token).first()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid admin token")
    return row.admin_username


def request_label(request_type: str) -> str:
    if request_type == DELETE_REQUEST_DATA:
        return "delete data"
    if request_type == DELETE_REQUEST_ACCOUNT:
        return "delete account"
    return request_type


def create_or_get_pending_deletion_request(
    db: Session,
    user_id: int,
    request_type: str,
) -> DataDeletionRequestDB:
    row = (
        db.query(DataDeletionRequestDB)
        .filter(
            DataDeletionRequestDB.user_id == user_id,
            DataDeletionRequestDB.request_type == request_type,
            DataDeletionRequestDB.status == "pending",
        )
        .first()
    )
    if row:
        return row

    row = DataDeletionRequestDB(
        user_id=user_id,
        request_type=request_type,
        status="pending",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def execute_delete_my_data(db: Session, user_id: int):
    membership = get_active_family_membership(db, user_id)
    family_id = membership.family_id if membership else None

    db.query(MetricEntryDB).filter(MetricEntryDB.user_id == user_id).delete(synchronize_session=False)
    db.query(AlertDB).filter(AlertDB.user_id == user_id).delete(synchronize_session=False)
    db.query(MedicationLogDB).filter(MedicationLogDB.user_id == user_id).delete(synchronize_session=False)
    db.query(MedicationDB).filter(MedicationDB.user_id == user_id).delete(synchronize_session=False)
    db.query(FamilyChatMessageDB).filter(FamilyChatMessageDB.user_id == user_id).delete(synchronize_session=False)

    if family_id:
        db.query(MetricConsentDB).filter(
            MetricConsentDB.family_id == family_id,
            MetricConsentDB.user_id == user_id
        ).delete(synchronize_session=False)

    db.commit()


def execute_delete_my_account(db: Session, user_id: int):
    membership = get_active_family_membership(db, user_id)
    family_id = membership.family_id if membership else None

    db.query(AuthTokenDB).filter(AuthTokenDB.user_id == user_id).delete(synchronize_session=False)

    db.query(MetricEntryDB).filter(MetricEntryDB.user_id == user_id).delete(synchronize_session=False)
    db.query(AlertDB).filter(AlertDB.user_id == user_id).delete(synchronize_session=False)
    db.query(MedicationLogDB).filter(MedicationLogDB.user_id == user_id).delete(synchronize_session=False)
    db.query(MedicationDB).filter(MedicationDB.user_id == user_id).delete(synchronize_session=False)
    db.query(FamilyChatMessageDB).filter(FamilyChatMessageDB.user_id == user_id).delete(synchronize_session=False)

    if family_id:
        db.query(MetricConsentDB).filter(
            MetricConsentDB.family_id == family_id,
            MetricConsentDB.user_id == user_id
        ).delete(synchronize_session=False)

    db.query(FamilyMemberDB).filter(
        FamilyMemberDB.user_id == user_id
    ).delete(synchronize_session=False)

    owned_families = db.query(FamilyDB).filter(FamilyDB.owner_user_id == user_id).all()

    for fam in owned_families:
        remaining_members = (
            db.query(FamilyMemberDB)
            .filter(FamilyMemberDB.family_id == fam.id)
            .all()
        )

        if len(remaining_members) == 0:
            db.query(MetricConsentDB).filter(
                MetricConsentDB.family_id == fam.id
            ).delete(synchronize_session=False)

            db.query(ShareCodeDB).filter(
                ShareCodeDB.family_id == fam.id
            ).delete(synchronize_session=False)

            db.query(FamilyGoalDB).filter(
                FamilyGoalDB.family_id == fam.id
            ).delete(synchronize_session=False)

            db.query(FamilyChatMessageDB).filter(
                FamilyChatMessageDB.family_id == fam.id
            ).delete(synchronize_session=False)

            db.query(FamilyMemberDB).filter(
                FamilyMemberDB.family_id == fam.id
            ).delete(synchronize_session=False)

            db.query(FamilyDB).filter(
                FamilyDB.id == fam.id
            ).delete(synchronize_session=False)
        else:
            fam.owner_user_id = remaining_members[0].user_id
            db.add(fam)

    db.flush()

    db.query(AuthUserDB).filter(AuthUserDB.user_id == user_id).delete(synchronize_session=False)
    db.query(UserDB).filter(UserDB.id == user_id).delete(synchronize_session=False)
    db.query(DataDeletionRequestDB).filter(
        DataDeletionRequestDB.user_id == user_id,
        DataDeletionRequestDB.status == "pending",
    ).update({DataDeletionRequestDB.status: "approved"}, synchronize_session=False)

    db.commit()


def create_family_for_user(db: Session, user_id: int, family_name: str = "My Family") -> FamilyDB:
    family = FamilyDB(owner_user_id=user_id, name=family_name)
    db.add(family)
    db.commit()
    db.refresh(family)

    db.add(FamilyMemberDB(family_id=family.id, user_id=user_id))
    db.add(
        FamilyGoalDB(
            family_id=family.id,
            steps_goal=DEFAULT_FAMILY_STEPS_GOAL,
            sleep_goal=DEFAULT_FAMILY_SLEEP_GOAL,
        )
    )
    db.commit()
    return family


def get_active_family_membership(db: Session, user_id: int) -> Optional[FamilyMemberDB]:
    memberships = (
        db.query(FamilyMemberDB)
        .filter(FamilyMemberDB.user_id == user_id)
        .order_by(FamilyMemberDB.created_at.desc(), FamilyMemberDB.id.desc())
        .all()
    )
    if not memberships:
        return None

    active = memberships[0]
    stale_family_ids = [row.family_id for row in memberships[1:]]

    for family_id in stale_family_ids:
        leave_family_membership(db, user_id, family_id)

    if stale_family_ids:
        db.expire_all()
        active = (
            db.query(FamilyMemberDB)
            .filter(
                FamilyMemberDB.user_id == user_id,
                FamilyMemberDB.family_id == active.family_id,
            )
            .order_by(FamilyMemberDB.created_at.desc(), FamilyMemberDB.id.desc())
            .first()
        )

    return active


def get_user_family_id(db: Session, user_id: int) -> Optional[int]:
    row = get_active_family_membership(db, user_id)
    return row.family_id if row else None


def get_or_create_share_code_for_family(db: Session, family_id: int) -> str:
    existing = db.query(ShareCodeDB).filter(ShareCodeDB.family_id == family_id).first()
    if existing:
        return existing.code

    for _ in range(30):
        code = generate_code(6)
        taken = db.query(ShareCodeDB).filter(ShareCodeDB.code == code).first()
        if not taken:
            row = ShareCodeDB(family_id=family_id, code=code)
            db.add(row)
            db.commit()
            return code

    raise HTTPException(status_code=500, detail="Could not generate share code")


def rotate_share_code_for_family(db: Session, family_id: int) -> str:
    existing = db.query(ShareCodeDB).filter(ShareCodeDB.family_id == family_id).first()
    if existing:
        db.delete(existing)
        db.commit()
    return get_or_create_share_code_for_family(db, family_id)


def get_or_create_family_goals(db: Session, family_id: int) -> FamilyGoalDB:
    goals = db.query(FamilyGoalDB).filter(FamilyGoalDB.family_id == family_id).first()
    if goals:
        return goals

    goals = FamilyGoalDB(
        family_id=family_id,
        steps_goal=DEFAULT_FAMILY_STEPS_GOAL,
        sleep_goal=DEFAULT_FAMILY_SLEEP_GOAL,
    )
    db.add(goals)
    db.commit()
    db.refresh(goals)
    return goals


def ensure_user_has_family(db: Session, user: UserDB) -> int:
    family_id = get_user_family_id(db, user.id)
    if not family_id:
        fam = create_family_for_user(db, user.id, family_name=f"{user.first_name}'s Family")
        family_id = fam.id
        get_or_create_share_code_for_family(db, family_id)
    return family_id


def leave_family_membership(db: Session, user_id: int, family_id: int) -> None:
    """
    Remove a user from a family and keep family ownership/data consistent.
    - Removes user's consent rows in that family.
    - Removes membership row for that user.
    - If family becomes empty, deletes family-linked data and the family.
    - If owner leaves (or owner is no longer a member), transfers ownership.
    """
    db.query(MetricConsentDB).filter(
        MetricConsentDB.family_id == family_id,
        MetricConsentDB.user_id == user_id,
    ).delete(synchronize_session=False)

    db.query(FamilyMemberDB).filter(
        FamilyMemberDB.family_id == family_id,
        FamilyMemberDB.user_id == user_id,
    ).delete(synchronize_session=False)

    family = db.query(FamilyDB).filter(FamilyDB.id == family_id).first()
    if not family:
        db.commit()
        return

    remaining_members = (
        db.query(FamilyMemberDB)
        .filter(FamilyMemberDB.family_id == family_id)
        .all()
    )

    if len(remaining_members) == 0:
        db.query(MetricConsentDB).filter(
            MetricConsentDB.family_id == family_id
        ).delete(synchronize_session=False)
        db.query(ShareCodeDB).filter(
            ShareCodeDB.family_id == family_id
        ).delete(synchronize_session=False)
        db.query(FamilyGoalDB).filter(
            FamilyGoalDB.family_id == family_id
        ).delete(synchronize_session=False)
        db.query(FamilyChatMessageDB).filter(
            FamilyChatMessageDB.family_id == family_id
        ).delete(synchronize_session=False)
        db.query(FamilyMemberDB).filter(
            FamilyMemberDB.family_id == family_id
        ).delete(synchronize_session=False)
        db.query(FamilyDB).filter(
            FamilyDB.id == family_id
        ).delete(synchronize_session=False)
        db.commit()
        return

    remaining_user_ids = {m.user_id for m in remaining_members}
    if family.owner_user_id == user_id or family.owner_user_id not in remaining_user_ids:
        family.owner_user_id = remaining_members[0].user_id
        db.add(family)

    db.commit()


def assert_same_family(db: Session, viewer_user_id: int, target_user_id: int):
    viewer_family = get_user_family_id(db, viewer_user_id)
    target_family = get_user_family_id(db, target_user_id)
    if not viewer_family or viewer_family != target_family:
        raise HTTPException(status_code=403, detail="Not allowed")


def display_role_for_viewer(raw_role: Optional[str], target_user_id: int, viewer_user_id: int) -> str:
    """
    Keep "Self" only for the viewer's own profile.
    For other people, fallback "Self" reads better as "Family member".
    """
    role = (raw_role or "").strip()
    if not role:
        return "Self" if target_user_id == viewer_user_id else "Family member"
    if target_user_id != viewer_user_id and role.lower() == "self":
        return "Family member"
    return role


def as_deletion_request_item(db: Session, row: DataDeletionRequestDB) -> "DeletionRequestItem":
    u = db.query(UserDB).filter(UserDB.id == row.user_id).first()
    auth = db.query(AuthUserDB).filter(AuthUserDB.user_id == row.user_id).first()

    if u:
        user_name = f"{u.first_name} {u.last_name}"
        user_role = u.role or "Self"
    else:
        user_name = f"Deleted user #{row.user_id}"
        user_role = "Deleted"

    return DeletionRequestItem(
        id=row.id,
        userId=row.user_id,
        userName=user_name,
        userRole=user_role,
        userEmail=auth.email if auth else None,
        requestType=row.request_type,
        status=row.status,
        requestedAt=row.requested_at.isoformat() if row.requested_at else "",
        reviewedAt=row.reviewed_at.isoformat() if row.reviewed_at else None,
        reviewedBy=row.reviewed_by,
        reviewNote=row.review_note,
    )


# -------- Consent helpers --------

CONSENT_KEYS = [
    "heartRate",
    "weight",
    "steps",
    "sleep",
    "bloodGlucose",
    "systolicBP",
    "diastolicBP",
    "cholesterol",
]


def ensure_default_consent_rows(db: Session, family_id: int, user_id: int):
    """
    Create missing consent rows for a user in a family.
    Defaults: steps/sleep ON, others OFF until user explicitly shares.
    """
    default_on = {"steps", "sleep"}
    for key in CONSENT_KEYS:
        exists = (
            db.query(MetricConsentDB)
            .filter(
                MetricConsentDB.family_id == family_id,
                MetricConsentDB.user_id == user_id,
                MetricConsentDB.metric_key == key,
            )
            .first()
        )
        if not exists:
            db.add(
                MetricConsentDB(
                    family_id=family_id,
                    user_id=user_id,
                    metric_key=key,
                    is_shared=1 if key in default_on else 0,
                )
            )
    db.commit()


def get_consent_map(db: Session, family_id: int, owner_user_id: int) -> Dict[str, bool]:
    rows = (
        db.query(MetricConsentDB)
        .filter(
            MetricConsentDB.family_id == family_id,
            MetricConsentDB.user_id == owner_user_id,
        )
        .all()
    )
    m = {r.metric_key: bool(r.is_shared) for r in rows}
    for k in CONSENT_KEYS:
        m.setdefault(k, False)
    return m


# -------- Alerts helpers --------

def build_alerts_from_metrics(m: Dict[str, Any]) -> List[Dict[str, Any]]:
    alerts: List[Dict[str, Any]] = []

    steps = m.get("steps")
    sleep = m.get("sleep")
    hr = m.get("heartRate")
    sys_bp = m.get("systolicBP")
    dia_bp = m.get("diastolicBP")
    bg = m.get("bloodGlucose")
    chol = m.get("cholesterol")

    # Goals
    if isinstance(steps, (int, float)) and steps >= 10000:
        alerts.append({
            "category": "goal",
            "title": "Steps goal achieved",
            "message": f"You reached {int(steps)} steps today.",
            "severity": "info",
            "metric_type": "steps",
            "metric_value": float(steps),
        })

    if isinstance(sleep, (int, float)) and sleep >= 8:
        alerts.append({
            "category": "goal",
            "title": "Sleep goal achieved",
            "message": f"You slept {sleep:.1f} hours.",
            "severity": "info",
            "metric_type": "sleep",
            "metric_value": float(sleep),
        })

    # Unusual patterns (rule-based)
    if isinstance(hr, (int, float)) and hr > 110:
        alerts.append({
            "category": "warning",
            "title": "High heart rate detected",
            "message": f"Your heart rate is {int(hr)} bpm. If you feel unwell, rest and consider seeking medical advice.",
            "severity": "warning",
            "metric_type": "heartRate",
            "metric_value": float(hr),
        })

    if isinstance(sys_bp, (int, float)) and isinstance(dia_bp, (int, float)):
        if sys_bp >= 180 or dia_bp >= 120:
            alerts.append({
                "category": "urgent",
                "title": "Very high blood pressure",
                "message": f"Reading {int(sys_bp)}/{int(dia_bp)} mmHg is very high. If you have symptoms, seek urgent help.",
                "severity": "urgent",
                "metric_type": "bloodPressure",
                "metric_value": float(sys_bp),
            })
        elif sys_bp >= 140 or dia_bp >= 90:
            alerts.append({
                "category": "warning",
                "title": "High blood pressure detected",
                "message": f"Reading {int(sys_bp)}/{int(dia_bp)} mmHg is above the normal range.",
                "severity": "warning",
                "metric_type": "bloodPressure",
                "metric_value": float(sys_bp),
            })

    if isinstance(bg, (int, float)) and bg > 7.8:
        alerts.append({
            "category": "warning",
            "title": "High blood glucose detected",
            "message": f"Blood glucose is {bg:.1f} mmol/L. Consider monitoring and lifestyle guidance.",
            "severity": "warning",
            "metric_type": "bloodGlucose",
            "metric_value": float(bg),
        })

    if isinstance(chol, (int, float)) and chol > 5.0:
        alerts.append({
            "category": "warning",
            "title": "High cholesterol detected",
            "message": f"Cholesterol is {chol:.1f} mmol/L (above 5.0). Consider lifestyle guidance and monitoring.",
            "severity": "warning",
            "metric_type": "cholesterol",
            "metric_value": float(chol),
        })

    if isinstance(steps, (int, float)) and steps < 3000:
        alerts.append({
            "category": "info",
            "title": "Low activity today",
            "message": f"You’ve logged {int(steps)} steps so far. A short walk can help.",
            "severity": "info",
            "metric_type": "steps",
            "metric_value": float(steps),
        })

    return alerts


def save_alerts(db: Session, user_id: int, alerts: List[Dict[str, Any]]):
    for a in alerts:
        db.add(AlertDB(
            user_id=user_id,
            category=a.get("category", "info"),
            title=a.get("title", "Alert"),
            message=a.get("message", ""),
            severity=a.get("severity", "info"),
            metric_type=a.get("metric_type"),
            metric_value=a.get("metric_value"),
            is_read=0,
        ))
    db.commit()


def create_family_join_alerts(db: Session, family_id: int, joined_user: UserDB):
    joined_name = f"{joined_user.first_name} {joined_user.last_name}".strip() or "A family member"
    recipient_ids = [
        int(row.user_id)
        for row in (
            db.query(FamilyMemberDB.user_id)
            .filter(
                FamilyMemberDB.family_id == family_id,
                FamilyMemberDB.user_id != joined_user.id,
            )
            .all()
        )
    ]

    if not recipient_ids:
        return

    for recipient_id in recipient_ids:
        db.add(
            AlertDB(
                user_id=recipient_id,
                category="family",
                title="New family member",
                message=f"{joined_name} joined your family group.",
                severity="info",
                metric_type=None,
                metric_value=None,
                is_read=0,
            )
        )

    db.commit()


# ===================== NHS LIVE WELL RECOMMENDATIONS =====================

NHS_LIVEWELL_URL = "https://sandbox.api.service.nhs.uk/nhs-website-content/live-well"


def _nhs_headers() -> Dict[str, str]:
    api_key = os.getenv("NHS_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="NHS_API_KEY is not set. Set it as an environment variable before running the server.",
        )
    return {"accept": "application/json", "apikey": api_key}


def fetch_nhs_livewell_topics() -> List[Dict[str, Any]]:
    try:
        r = requests.get(NHS_LIVEWELL_URL, headers=_nhs_headers(), timeout=15)
        if r.status_code != 200:
            print("⚠️ NHS API error:", r.status_code, r.text[:200])
            return []
        payload = r.json()
    except Exception as e:
        print("⚠️ NHS API request failed:", e)
        return []

    if isinstance(payload, dict):
        v = payload.get("data")
        if isinstance(v, list):
            return v
        for key in ["items", "results"]:
            vv = payload.get(key)
            if isinstance(vv, list):
                return vv
        if isinstance(v, dict):
            for key in ["items", "results", "data"]:
                vv = v.get(key)
                if isinstance(vv, list):
                    return vv

    if isinstance(payload, list):
        return payload

    return []


def _as_text(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    if isinstance(v, dict):
        for k in ["value", "text", "title", "label", "name", "url"]:
            if k in v and isinstance(v[k], str):
                return v[k]
        return ""
    return str(v)


LIVEWELL_SLUG_ALIASES: Dict[str, List[str]] = {
    "exercise": ["exercise", "exercise-and-fitness", "get-active", "physical-activity"],
    "sleep-and-tiredness": ["sleep-and-tiredness", "sleep", "insomnia", "tiredness"],
    "healthy-eating": ["healthy-eating", "eat-well", "food-and-diet", "nutrition"],
    "healthy-weight": ["healthy-weight", "lose-weight", "weight-management", "weight-loss"],
}

LIVEWELL_FALLBACK_BY_SLUG: Dict[str, Dict[str, str]] = {
    "exercise": {
        "title": "NHS exercise advice",
        "summary": "Support your activity levels with NHS movement and fitness guidance.",
        "url": "https://www.nhs.uk/live-well/exercise/",
    },
    "sleep-and-tiredness": {
        "title": "NHS sleep advice",
        "summary": "Improve sleep quality with NHS sleep and tiredness guidance.",
        "url": "https://www.nhs.uk/live-well/sleep-and-tiredness/",
    },
    "healthy-eating": {
        "title": "NHS healthy eating advice",
        "summary": "Use NHS food and diet guidance to support long-term health.",
        "url": "https://www.nhs.uk/live-well/eat-well/",
    },
    "healthy-weight": {
        "title": "NHS healthy weight advice",
        "summary": "Use NHS healthy weight guidance for practical lifestyle support.",
        "url": "https://www.nhs.uk/live-well/healthy-weight/",
    },
}


def normalize_slug(raw: str) -> str:
    v = (raw or "").strip().lower()
    if not v:
        return ""

    if "://" in v:
        try:
            p = urlparse(v).path or ""
            v = p.strip("/").split("/")[-1].strip().lower()
        except Exception:
            return ""

    return v.strip("/")


def pick_topic_for_slug(by_slug: Dict[str, Dict[str, Any]], target_slug: str) -> Optional[Dict[str, Any]]:
    candidates = LIVEWELL_SLUG_ALIASES.get(target_slug, [target_slug])

    for c in candidates:
        row = by_slug.get(normalize_slug(c))
        if row:
            return row

    for k, row in by_slug.items():
        for c in candidates:
            cc = normalize_slug(c)
            if cc and (cc in k or k in cc):
                return row

    return None


def livewell_reasons_from_metrics(m: Dict[str, Any]) -> Dict[str, List[str]]:
    reasons: Dict[str, List[str]] = {}

    def add_reason(slug: str, reason: str):
        if slug not in reasons:
            reasons[slug] = []
        if reason not in reasons[slug]:
            reasons[slug].append(reason)

    steps = m.get("steps")
    if isinstance(steps, (int, float)) and steps < 5000:
        add_reason("exercise", f"low daily steps ({int(steps)})")

    sleep = m.get("sleep")
    if isinstance(sleep, (int, float)) and sleep < 7:
        add_reason("sleep-and-tiredness", f"low sleep duration ({sleep:.1f} hours)")

    sys_bp = m.get("systolicBP")
    dia_bp = m.get("diastolicBP")
    if isinstance(sys_bp, (int, float)) and isinstance(dia_bp, (int, float)):
        if sys_bp >= 180 or dia_bp >= 120:
            reason = f"very high blood pressure ({int(sys_bp)}/{int(dia_bp)} mmHg)"
            add_reason("healthy-eating", reason)
            add_reason("exercise", reason)
            add_reason("healthy-weight", reason)
        elif sys_bp >= 140 or dia_bp >= 90:
            reason = f"high blood pressure ({int(sys_bp)}/{int(dia_bp)} mmHg)"
            add_reason("healthy-eating", reason)
            add_reason("exercise", reason)
            add_reason("healthy-weight", reason)

    cholesterol = m.get("cholesterol")
    if isinstance(cholesterol, (int, float)) and cholesterol > 5:
        reason = f"high cholesterol ({cholesterol:.1f} mmol/L)"
        add_reason("healthy-eating", reason)
        add_reason("healthy-weight", reason)
        add_reason("exercise", reason)

    weight = m.get("weight")
    if isinstance(weight, (int, float)) and weight >= 85:
        add_reason("healthy-weight", f"higher weight range ({weight:.1f} kg)")

    bg = m.get("bloodGlucose")
    if isinstance(bg, (int, float)) and bg > 7.8:
        reason = f"high blood glucose ({bg:.1f} mmol/L)"
        add_reason("healthy-eating", reason)
        add_reason("exercise", reason)
        add_reason("healthy-weight", reason)

    hr = m.get("heartRate")
    if isinstance(hr, (int, float)) and hr > 100:
        add_reason("exercise", f"high heart rate ({int(hr)} bpm)")

    return reasons


def decide_livewell_slugs_from_metrics(m: Dict[str, Any]) -> List[str]:
    return list(livewell_reasons_from_metrics(m).keys())


def build_recommendations(metrics: Dict[str, Any]) -> List[Dict[str, Any]]:
    topics = fetch_nhs_livewell_topics()
    reasons_by_slug = livewell_reasons_from_metrics(metrics)
    wanted_slugs = list(reasons_by_slug.keys())

    by_slug: Dict[str, Dict[str, Any]] = {}
    for t in topics:
        if isinstance(t, dict):
            slug = normalize_slug(_as_text(t.get("slug")))
            if not slug:
                slug = normalize_slug(_as_text(t.get("url")))
            if slug:
                by_slug[slug] = t

    results: List[Dict[str, Any]] = []

    # Safety banner for very high BP
    sys_bp = metrics.get("systolicBP")
    dia_bp = metrics.get("diastolicBP")
    if isinstance(sys_bp, (int, float)) and isinstance(dia_bp, (int, float)):
        if sys_bp >= 180 or dia_bp >= 120:
            results.append({
                "title": "Seek urgent medical advice",
                "summary": "Your blood pressure reading is very high. If you feel unwell or have symptoms like chest pain, severe headache, confusion, or shortness of breath, seek urgent medical help.",
                "url": "https://www.nhs.uk/nhs-services/urgent-and-emergency-care-services/when-to-call-999/",
                "slug": "urgent",
                "severity": "urgent",
                "source": "NHS",
            })

    for slug in wanted_slugs:
        t = pick_topic_for_slug(by_slug, slug)
        reasons = reasons_by_slug.get(slug, [])
        reason_text = "; ".join(reasons[:3]) if reasons else ""

        if t:
            summary_base = _as_text(t.get("description")) or _as_text(t.get("summary"))
            summary = summary_base
            if reason_text:
                summary = (summary_base + " " if summary_base else "") + f"Triggered by: {reason_text}."

            results.append({
                "title": _as_text(t.get("title")) or "NHS advice",
                "summary": summary,
                "url": _as_text(t.get("url")),
                "slug": _as_text(slug),
                "severity": "info",
                "source": "NHS",
            })
            continue

        fallback = LIVEWELL_FALLBACK_BY_SLUG.get(slug)
        if fallback:
            summary = fallback["summary"]
            if reason_text:
                summary = f"{summary} Triggered by: {reason_text}."
            results.append({
                "title": fallback["title"],
                "summary": summary,
                "url": fallback["url"],
                "slug": slug,
                "severity": "info",
                "source": "NHS",
            })

    # Fallback if NHS is down or no matches
    if not results:
        results.append({
            "title": "NHS Live Well advice",
            "summary": "Recommendations are temporarily unavailable from the NHS service. Use general NHS guidance below.",
            "url": "https://www.nhs.uk/live-well/",
            "slug": "live-well",
            "severity": "info",
            "source": "NHS",
        })

    return results


# ===================== SCHEMAS =====================

class Metrics(BaseModel):

    heartRate: Optional[float] = None
    weight: Optional[float] = None
    steps: Optional[int] = None
    sleep: Optional[float] = None
    bloodGlucose: Optional[float] = None
    systolicBP: Optional[float] = None
    diastolicBP: Optional[float] = None
    cholesterol: Optional[float] = None


class UserSummary(BaseModel):
    name: str
    role: str
    metrics: Metrics


class FamilyMemberSummary(BaseModel):
    id: int
    name: str
    role: str
    metrics: Optional[Metrics] = None


class MetricHistoryItem(BaseModel):
    heartRate: Optional[float] = None
    weight: Optional[float] = None
    steps: Optional[int] = None
    sleep: Optional[float] = None
    bloodGlucose: Optional[float] = None
    systolicBP: Optional[float] = None
    diastolicBP: Optional[float] = None
    cholesterol: Optional[float] = None
    timestamp: str


class ShareCodeResponse(BaseModel):
    code: str


class FamilyInfo(BaseModel):
    id: int
    name: str


class FamilyGoals(BaseModel):
    steps: int
    sleep: float


class FamilyChatMessageCreate(BaseModel):
    message: str
    parentId: Optional[int] = None


class FamilyChatMessageItem(BaseModel):
    id: int
    familyId: int
    userId: int
    userName: str
    userRole: str
    message: str
    parentId: Optional[int] = None
    createdAt: str


class UpdateFamilyGoalsRequest(BaseModel):
    steps: Optional[int] = None
    sleep: Optional[float] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    firstName: str
    lastName: str
    email: str
    password: str


class JoinFamilyRequest(BaseModel):
    code: str


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    token: str
    username: str


class DeletionRequestItem(BaseModel):
    id: int
    userId: int
    userName: str
    userRole: str
    userEmail: Optional[str] = None
    requestType: str
    status: str
    requestedAt: str
    reviewedAt: Optional[str] = None
    reviewedBy: Optional[str] = None
    reviewNote: Optional[str] = None


class DeletionRequestDecision(BaseModel):
    note: Optional[str] = None


class AdminOverview(BaseModel):
    totalUsers: int
    totalFamilies: int
    totalFamilyMembers: int
    totalMetricEntries: int
    metricsLast24h: int
    alertsLast24h: int
    pendingDeletionRequests: int


class AdminUserItem(BaseModel):
    id: int
    name: str
    role: str
    email: Optional[str] = None
    familyId: Optional[int] = None
    familyName: Optional[str] = None
    lastMetricAt: Optional[str] = None
    pendingDeletionRequests: int = 0


class AdminFamilyItem(BaseModel):
    id: int
    name: str
    ownerUserId: int
    ownerName: Optional[str] = None
    memberCount: int
    stepsGoal: int
    sleepGoal: float
    createdAt: Optional[str] = None


class AdminAlertItem(BaseModel):
    id: int
    userId: int
    userName: str
    severity: str
    category: str
    title: str
    message: str
    metricType: Optional[str] = None
    metricValue: Optional[float] = None
    isRead: int
    createdAt: str


class AdminUpdateUserRoleRequest(BaseModel):
    role: str


class MedicationItem(BaseModel):
    id: int
    name: str
    dosage: str
    instructions: Optional[str] = None
    scheduleTimes: List[str]
    pillsRemaining: int
    refillThreshold: int
    isActive: bool
    adherence7d: float
    adherence30d: float
    nextReminderAt: Optional[str] = None
    dueSoon: bool
    refillAlert: bool
    lastLogStatus: Optional[str] = None
    lastLogAt: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


class MedicationSummary(BaseModel):
    totalMedications: int
    activeMedications: int
    dueSoonCount: int
    refillAlertCount: int
    averageAdherence7d: float
    averageAdherence30d: float


class MedicationOverviewResponse(BaseModel):
    summary: MedicationSummary
    medications: List[MedicationItem]


class MedicationCreateRequest(BaseModel):
    name: str
    dosage: Optional[str] = "1 dose"
    instructions: Optional[str] = None
    scheduleTimes: List[str]
    pillsRemaining: Optional[int] = 0
    refillThreshold: Optional[int] = 5
    isActive: Optional[bool] = True


class MedicationUpdateRequest(BaseModel):
    name: Optional[str] = None
    dosage: Optional[str] = None
    instructions: Optional[str] = None
    scheduleTimes: Optional[List[str]] = None
    pillsRemaining: Optional[int] = None
    refillThreshold: Optional[int] = None
    isActive: Optional[bool] = None


class MedicationLogCreateRequest(BaseModel):
    status: str
    scheduledAt: Optional[str] = None
    note: Optional[str] = None


class MedicationLogItem(BaseModel):
    id: int
    medicationId: int
    status: str
    scheduledAt: Optional[str] = None
    note: Optional[str] = None
    createdAt: str


class MedicationLogActionResponse(BaseModel):
    detail: str
    medication: MedicationItem


class RecommendationItem(BaseModel):
    title: str
    summary: Optional[str] = ""
    url: Optional[str] = ""
    slug: Optional[str] = ""
    severity: str = "info"
    source: str = "NHS"


class PreventiveCareItem(BaseModel):
    name: str
    due: str  # YYYY-MM-DD
    cadence: str
    detail: Optional[str] = ""


class ConsentItem(BaseModel):
    metricType: str
    isShared: bool


class AlertItem(BaseModel):
    id: int
    category: str
    title: str
    message: str
    severity: str
    metric_type: Optional[str] = None
    metric_value: Optional[float] = None
    is_read: int
    created_at: str


class MarkReadRequest(BaseModel):
    alertIds: List[int]


class MeProfile(BaseModel):
    id: int
    firstName: str
    lastName: str
    name: str
    role: str
    email: Optional[str] = None


def metrics_from_entry(e: MetricEntryDB) -> Metrics:
    return Metrics(
        heartRate=e.heart_rate,
        weight=e.weight,
        steps=e.steps,
        sleep=e.sleep,
        bloodGlucose=e.blood_glucose,
        systolicBP=e.systolic_bp,
        diastolicBP=e.diastolic_bp,
        cholesterol=e.cholesterol,
    )


def filter_metrics_by_consent(full: Optional[Metrics], consent: Dict[str, bool]) -> Optional[Metrics]:
    if full is None:
        return None
    return Metrics(
        heartRate=full.heartRate if consent.get("heartRate") else None,
        weight=full.weight if consent.get("weight") else None,
        steps=full.steps if consent.get("steps") else None,
        sleep=full.sleep if consent.get("sleep") else None,
        bloodGlucose=full.bloodGlucose if consent.get("bloodGlucose") else None,
        systolicBP=full.systolicBP if consent.get("systolicBP") else None,
        diastolicBP=full.diastolicBP if consent.get("diastolicBP") else None,
        cholesterol=full.cholesterol if consent.get("cholesterol") else None,
    )


def medication_item_from_row(
    db: Session,
    row: MedicationDB,
    now: Optional[datetime] = None,
) -> MedicationItem:
    current = now or datetime.utcnow()
    schedule_times = parse_schedule_times_csv(row.schedule_times)
    next_reminder = get_next_medication_reminder(schedule_times, current) if row.is_active else None
    due_soon = False
    if next_reminder:
        seconds = (next_reminder - current).total_seconds()
        due_soon = 0 <= seconds <= 3600

    latest_log = (
        db.query(MedicationLogDB)
        .filter(
            MedicationLogDB.medication_id == row.id,
            MedicationLogDB.user_id == row.user_id,
        )
        .order_by(MedicationLogDB.created_at.desc(), MedicationLogDB.id.desc())
        .first()
    )

    adherence_7d = calculate_medication_adherence(db, row, current, 7)
    adherence_30d = calculate_medication_adherence(db, row, current, 30)

    return MedicationItem(
        id=row.id,
        name=row.name,
        dosage=row.dosage,
        instructions=row.instructions,
        scheduleTimes=schedule_times,
        pillsRemaining=int(row.pills_remaining or 0),
        refillThreshold=int(row.refill_threshold or 0),
        isActive=bool(row.is_active),
        adherence7d=adherence_7d,
        adherence30d=adherence_30d,
        nextReminderAt=next_reminder.isoformat() if next_reminder else None,
        dueSoon=due_soon,
        refillAlert=bool(row.pills_remaining <= row.refill_threshold),
        lastLogStatus=latest_log.status if latest_log else None,
        lastLogAt=latest_log.created_at.isoformat() if latest_log and latest_log.created_at else None,
        createdAt=row.created_at.isoformat() if row.created_at else None,
        updatedAt=row.updated_at.isoformat() if row.updated_at else None,
    )


def medication_summary_from_items(items: List[MedicationItem]) -> MedicationSummary:
    if not items:
        return MedicationSummary(
            totalMedications=0,
            activeMedications=0,
            dueSoonCount=0,
            refillAlertCount=0,
            averageAdherence7d=0.0,
            averageAdherence30d=0.0,
        )

    active_items = [item for item in items if item.isActive]
    average7 = round(sum(item.adherence7d for item in items) / len(items), 1)
    average30 = round(sum(item.adherence30d for item in items) / len(items), 1)
    return MedicationSummary(
        totalMedications=len(items),
        activeMedications=len(active_items),
        dueSoonCount=sum(1 for item in items if item.dueSoon),
        refillAlertCount=sum(1 for item in items if item.refillAlert),
        averageAdherence7d=average7,
        averageAdherence30d=average30,
    )


# ===================== APP =====================

app = FastAPI(title="CheckMi Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===================== ROUTES =====================

@app.get("/")
def root():
    return {"message": "CheckMi backend running"}


# ===================== AUTH ROUTES =====================

@app.post("/auth/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    email = validate_email_value(payload.email)

    existing = db.query(AuthUserDB).filter(AuthUserDB.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    first = validate_person_name(payload.firstName, "First name")
    last = validate_person_name(payload.lastName, "Last name")
    validate_password_strength(payload.password)

    user = UserDB(first_name=first, last_name=last, role="Self")
    db.add(user)
    db.commit()
    db.refresh(user)

    family = create_family_for_user(db, user.id, family_name=f"{first}'s Family")
    get_or_create_share_code_for_family(db, family.id)

    # consent defaults for new user
    ensure_default_consent_rows(db, family.id, user.id)

    salt = make_salt()
    auth_user = AuthUserDB(
        email=email,
        salt=salt,
        password_hash=hash_password(payload.password, salt),
        user_id=user.id,
    )
    db.add(auth_user)

    token = generate_token()
    db.add(AuthTokenDB(token=token, user_id=user.id))
    db.commit()

    return {"token": token}


@app.post("/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    auth_user = db.query(AuthUserDB).filter(AuthUserDB.email == email).first()
    if not auth_user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(payload.password, auth_user.salt, auth_user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Migrate legacy hashes on successful login.
    if not auth_user.password_hash.startswith("pbkdf2_sha256$"):
        auth_user.password_hash = hash_password(payload.password, auth_user.salt)
        db.add(auth_user)

    token = generate_token()
    db.add(AuthTokenDB(token=token, user_id=auth_user.user_id))
    db.commit()

    return {"token": token}


@app.post("/admin/login", response_model=AdminLoginResponse)
def admin_login(payload: AdminLoginRequest, db: Session = Depends(get_db)):
    username = payload.username.strip()
    password = payload.password

    if username != ADMIN_FIXED_USERNAME or password != ADMIN_FIXED_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    token = generate_token()
    db.add(AdminTokenDB(token=token, admin_username=username))
    db.commit()
    return AdminLoginResponse(token=token, username=username)


# ===================== PROTECTED ROUTES (ME) =====================

@app.get("/me", response_model=MeProfile)
def get_me(
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    auth_row = db.query(AuthUserDB).filter(AuthUserDB.user_id == user.id).first()
    return MeProfile(
        id=user.id,
        firstName=user.first_name,
        lastName=user.last_name,
        name=f"{user.first_name} {user.last_name}",
        role=user.role,
        email=auth_row.email if auth_row else None,
    )
class UpdateMeRequest(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None  # updates AuthUserDB


@app.put("/me", response_model=MeProfile)
def update_me(
    payload: UpdateMeRequest,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Update user table fields
    if payload.firstName is not None:
        user.first_name = validate_person_name(payload.firstName, "First name")

    if payload.lastName is not None:
        user.last_name = validate_person_name(payload.lastName, "Last name")

    if payload.role is not None:
        user.role = validate_role_text(payload.role)

    # Update email in auth_users
    if payload.email is not None:
        v = validate_email_value(payload.email)

        auth_row = db.query(AuthUserDB).filter(AuthUserDB.user_id == user.id).first()
        if not auth_row:
            raise HTTPException(status_code=404, detail="Auth record not found")

        # prevent duplicate email
        taken = db.query(AuthUserDB).filter(AuthUserDB.email == v, AuthUserDB.user_id != user.id).first()
        if taken:
            raise HTTPException(status_code=400, detail="Email already in use")

        auth_row.email = v
        db.add(auth_row)

    db.add(user)
    db.commit()

    auth_row = db.query(AuthUserDB).filter(AuthUserDB.user_id == user.id).first()
    return MeProfile(
        id=user.id,
        firstName=user.first_name,
        lastName=user.last_name,
        name=f"{user.first_name} {user.last_name}",
        role=user.role,
        email=auth_row.email if auth_row else None,
    )


@app.get("/me/family", response_model=FamilyInfo)
def get_my_family(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    family_id = ensure_user_has_family(db, user)
    family = db.query(FamilyDB).filter(FamilyDB.id == family_id).first()
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    return FamilyInfo(id=family.id, name=family.name)


@app.get("/me/summary", response_model=UserSummary)
def get_me_summary(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    latest = latest_entry_for_user(db, user.id)
    if not latest:
        raise HTTPException(status_code=404, detail="No metrics yet")

    return UserSummary(
        name=f"{user.first_name} {user.last_name}",
        role=user.role,
        metrics=metrics_from_entry(latest),  # owner sees all
    )


@app.get("/me/metrics/history", response_model=List[MetricHistoryItem])
def get_my_history(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    entries = (
        db.query(MetricEntryDB)
        .filter(MetricEntryDB.user_id == user.id)
        .order_by(MetricEntryDB.created_at.asc())
        .all()
    )
    if not entries:
        raise HTTPException(status_code=404, detail="No history yet")

    # owner sees all
    return [
        MetricHistoryItem(
            **metrics_from_entry(e).dict(),
            timestamp=e.created_at.isoformat() if e.created_at else "",
        )
        for e in entries
    ]


@app.put("/me/metrics", response_model=UserSummary)
def add_my_metrics(payload: Metrics, user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    heart_rate = validate_metric_number(
        payload.heartRate,
        "Heart Rate",
        METRIC_HEART_RATE_MIN,
        METRIC_HEART_RATE_MAX,
        integer=True,
    )
    weight = validate_metric_number(
        payload.weight,
        "Weight",
        METRIC_WEIGHT_MIN,
        METRIC_WEIGHT_MAX,
    )
    steps = validate_metric_number(
        payload.steps,
        "Steps",
        0,
        METRIC_STEPS_MAX,
        integer=True,
    )
    sleep = validate_metric_number(
        payload.sleep,
        "Sleep",
        0,
        METRIC_SLEEP_MAX,
    )
    blood_glucose = validate_metric_number(
        payload.bloodGlucose,
        "Blood Glucose",
        METRIC_BLOOD_GLUCOSE_MIN,
        METRIC_BLOOD_GLUCOSE_MAX,
    )
    systolic_bp = validate_metric_number(
        payload.systolicBP,
        "Systolic BP",
        METRIC_SYSTOLIC_BP_MIN,
        METRIC_SYSTOLIC_BP_MAX,
        integer=True,
    )
    diastolic_bp = validate_metric_number(
        payload.diastolicBP,
        "Diastolic BP",
        METRIC_DIASTOLIC_BP_MIN,
        METRIC_DIASTOLIC_BP_MAX,
        integer=True,
    )
    cholesterol = validate_metric_number(
        payload.cholesterol,
        "Cholesterol",
        METRIC_CHOLESTEROL_MIN,
        METRIC_CHOLESTEROL_MAX,
    )

    validated_metrics = Metrics(
        heartRate=int(heart_rate),
        weight=weight,
        steps=int(steps),
        sleep=sleep,
        bloodGlucose=blood_glucose,
        systolicBP=int(systolic_bp),
        diastolicBP=int(diastolic_bp),
        cholesterol=cholesterol,
    )

    entry = MetricEntryDB(
        user_id=user.id,
        heart_rate=validated_metrics.heartRate,
        weight=validated_metrics.weight,
        steps=validated_metrics.steps,
        sleep=validated_metrics.sleep,
        blood_glucose=validated_metrics.bloodGlucose,
        systolic_bp=validated_metrics.systolicBP,
        diastolic_bp=validated_metrics.diastolicBP,
        cholesterol=validated_metrics.cholesterol,
    )
    db.add(entry)
    db.commit()

    alerts = build_alerts_from_metrics(validated_metrics.dict())
    if alerts:
        save_alerts(db, user.id, alerts)

    return UserSummary(
        name=f"{user.first_name} {user.last_name}",
        role=user.role,
        metrics=validated_metrics,
    )


@app.get("/me/medications", response_model=MedicationOverviewResponse)
def get_my_medications(
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(MedicationDB)
        .filter(MedicationDB.user_id == user.id)
        .order_by(MedicationDB.is_active.desc(), MedicationDB.created_at.desc(), MedicationDB.id.desc())
        .all()
    )
    now = datetime.utcnow()
    items = [medication_item_from_row(db, row, now=now) for row in rows]

    def item_sort_key(item: MedicationItem):
        if item.nextReminderAt:
            try:
                next_dt = datetime.fromisoformat(item.nextReminderAt)
            except ValueError:
                next_dt = datetime.max
        else:
            next_dt = datetime.max
        return (
            0 if item.dueSoon else 1,
            0 if item.nextReminderAt else 1,
            next_dt,
            (item.name or "").lower(),
        )

    items.sort(key=item_sort_key)
    summary = medication_summary_from_items(items)
    return MedicationOverviewResponse(summary=summary, medications=items)


@app.post("/me/medications", response_model=MedicationItem)
def create_my_medication(
    payload: MedicationCreateRequest,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = validate_medication_name(payload.name)
    schedule_times = normalize_schedule_times(payload.scheduleTimes)

    dosage = validate_medication_dosage(payload.dosage)
    instructions = validate_optional_text(
        payload.instructions,
        "Instructions",
        MEDICATION_INSTRUCTIONS_MAX,
    )
    pills_remaining = validate_non_negative_int(
        payload.pillsRemaining,
        "pillsRemaining",
        0,
    )
    refill_threshold = validate_non_negative_int(
        payload.refillThreshold,
        "refillThreshold",
        5,
    )

    row = MedicationDB(
        user_id=user.id,
        name=name,
        dosage=dosage,
        instructions=instructions,
        schedule_times=",".join(schedule_times),
        pills_remaining=pills_remaining,
        refill_threshold=refill_threshold,
        is_active=1 if payload.isActive is not False else 0,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return medication_item_from_row(db, row)


@app.put("/me/medications/{medication_id}", response_model=MedicationItem)
def update_my_medication(
    medication_id: int,
    payload: MedicationUpdateRequest,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(MedicationDB)
        .filter(MedicationDB.id == medication_id, MedicationDB.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Medication not found")

    if payload.name is not None:
        row.name = validate_medication_name(payload.name)

    if payload.dosage is not None:
        row.dosage = validate_medication_dosage(payload.dosage)

    if payload.instructions is not None:
        row.instructions = validate_optional_text(
            payload.instructions,
            "Instructions",
            MEDICATION_INSTRUCTIONS_MAX,
        )

    if payload.scheduleTimes is not None:
        schedule_times = normalize_schedule_times(payload.scheduleTimes)
        row.schedule_times = ",".join(schedule_times)

    if payload.pillsRemaining is not None:
        row.pills_remaining = validate_non_negative_int(
            payload.pillsRemaining,
            "pillsRemaining",
            0,
        )

    if payload.refillThreshold is not None:
        row.refill_threshold = validate_non_negative_int(
            payload.refillThreshold,
            "refillThreshold",
            0,
        )

    if payload.isActive is not None:
        row.is_active = 1 if payload.isActive else 0

    db.add(row)
    db.commit()
    db.refresh(row)
    return medication_item_from_row(db, row)


@app.delete("/me/medications/{medication_id}")
def delete_my_medication(
    medication_id: int,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(MedicationDB)
        .filter(MedicationDB.id == medication_id, MedicationDB.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Medication not found")

    db.query(MedicationLogDB).filter(
        MedicationLogDB.medication_id == row.id,
        MedicationLogDB.user_id == user.id,
    ).delete(synchronize_session=False)
    db.delete(row)
    db.commit()
    return {"detail": "Medication deleted."}


@app.get("/me/medications/{medication_id}/logs", response_model=List[MedicationLogItem])
def get_my_medication_logs(
    medication_id: int,
    days: int = 14,
    limit: int = 120,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(MedicationDB)
        .filter(MedicationDB.id == medication_id, MedicationDB.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Medication not found")

    safe_days = max(1, min(days, 90))
    safe_limit = max(1, min(limit, 500))
    since = datetime.utcnow() - timedelta(days=safe_days)

    logs = (
        db.query(MedicationLogDB)
        .filter(
            MedicationLogDB.medication_id == row.id,
            MedicationLogDB.user_id == user.id,
            MedicationLogDB.created_at >= since,
        )
        .order_by(MedicationLogDB.created_at.desc(), MedicationLogDB.id.desc())
        .limit(safe_limit)
        .all()
    )

    return [
        MedicationLogItem(
            id=log.id,
            medicationId=log.medication_id,
            status=log.status,
            scheduledAt=log.scheduled_at.isoformat() if log.scheduled_at else None,
            note=log.note,
            createdAt=log.created_at.isoformat() if log.created_at else "",
        )
        for log in logs
    ]


@app.post("/me/medications/{medication_id}/logs", response_model=MedicationLogActionResponse)
def create_my_medication_log(
    medication_id: int,
    payload: MedicationLogCreateRequest,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(MedicationDB)
        .filter(MedicationDB.id == medication_id, MedicationDB.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Medication not found")

    status = validate_medication_log_status(payload.status)
    note = validate_optional_text(
        payload.note,
        "Medication note",
        MEDICATION_INSTRUCTIONS_MAX,
    )
    scheduled_at = parse_iso_datetime(payload.scheduledAt)
    log = MedicationLogDB(
        medication_id=row.id,
        user_id=user.id,
        status=status,
        scheduled_at=scheduled_at,
        note=note,
    )
    db.add(log)

    if status == MED_LOG_TAKEN and row.pills_remaining > 0:
        row.pills_remaining -= 1
    db.add(row)
    db.commit()
    db.refresh(row)

    updated_item = medication_item_from_row(db, row)
    return MedicationLogActionResponse(
        detail=f"Dose marked as {status}.",
        medication=updated_item,
    )



# ===================== DOWNLOAD / DELETE MY DATA (GDPR) =====================

@app.get("/me/export")
def export_my_data(
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Auth account row (email)
    auth_row = db.query(AuthUserDB).filter(AuthUserDB.user_id == user.id).first()

    # Family membership + family details
    membership = get_active_family_membership(db, user.id)
    family = None
    share_code = None
    family_goals = None
    if membership:
        family = db.query(FamilyDB).filter(FamilyDB.id == membership.family_id).first()
        share_code_row = db.query(ShareCodeDB).filter(ShareCodeDB.family_id == membership.family_id).first()
        share_code = share_code_row.code if share_code_row else None
        goals_row = db.query(FamilyGoalDB).filter(FamilyGoalDB.family_id == membership.family_id).first()
        family_goals = {
            "steps": goals_row.steps_goal if goals_row else DEFAULT_FAMILY_STEPS_GOAL,
            "sleep": goals_row.sleep_goal if goals_row else DEFAULT_FAMILY_SLEEP_GOAL,
        }

    # User data tables
    metrics = (
        db.query(MetricEntryDB)
        .filter(MetricEntryDB.user_id == user.id)
        .order_by(MetricEntryDB.created_at.asc())
        .all()
    )

    consents: List[MetricConsentDB] = []
    if membership:
        consents = (
            db.query(MetricConsentDB)
            .filter(
                MetricConsentDB.family_id == membership.family_id,
                MetricConsentDB.user_id == user.id,
            )
            .all()
        )

    alerts = (
        db.query(AlertDB)
        .filter(AlertDB.user_id == user.id)
        .order_by(AlertDB.created_at.asc())
        .all()
    )

    tokens = (
        db.query(AuthTokenDB)
        .filter(AuthTokenDB.user_id == user.id)
        .order_by(AuthTokenDB.created_at.asc())
        .all()
    )

    export = {
        "exportedAt": datetime.utcnow().isoformat() + "Z",
        "user": {
            "id": user.id,
            "firstName": user.first_name,
            "lastName": user.last_name,
            "role": user.role,
            "email": auth_row.email if auth_row else None,
        },
        "family": None if not membership or not family else {
            "familyId": family.id,
            "familyName": family.name,
            "ownerUserId": family.owner_user_id,
            "createdAt": family.created_at.isoformat() if family.created_at else None,
            "joinedAt": membership.created_at.isoformat() if membership.created_at else None,
            # Optional: share code can be considered sensitive; remove if you prefer
            "shareCode": share_code,
            "goals": family_goals,
        },
        "metrics": [
            {
                "id": m.id,
                "createdAt": m.created_at.isoformat() if m.created_at else None,
                "heartRate": m.heart_rate,
                "weight": m.weight,
                "steps": m.steps,
                "sleep": m.sleep,
                "bloodGlucose": m.blood_glucose,
                "systolicBP": m.systolic_bp,
                "diastolicBP": m.diastolic_bp,
                "cholesterol": m.cholesterol,
            }
            for m in metrics
        ],
        "consent": [
            {
                "id": c.id,
                "familyId": c.family_id,
                "metricType": c.metric_key,
                "isShared": bool(c.is_shared),
                "createdAt": c.created_at.isoformat() if c.created_at else None,
                "updatedAt": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in consents
        ],
        "alerts": [
            {
                "id": a.id,
                "category": a.category,
                "title": a.title,
                "message": a.message,
                "severity": a.severity,
                "metricType": a.metric_type,
                "metricValue": a.metric_value,
                "isRead": int(a.is_read),
                "createdAt": a.created_at.isoformat() if a.created_at else None,
            }
            for a in alerts
        ],
        # Optional: include token metadata (NOT the token values) if you want.
        # If you don't want any auth-related data in export, delete this field.
        "auth": {
            "activeSessions": [
                {
                    "id": t.id,
                    "createdAt": t.created_at.isoformat() if t.created_at else None,
                    # Don't export raw token unless you explicitly want that
                    "tokenMasked": (t.token[:6] + "..." + t.token[-4:]) if t.token else None,
                }
                for t in tokens
            ]
        },
    }

    return export


@app.delete("/me/data")
def delete_my_data(
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Requests deletion of personal data.
    Request must be approved by an admin.
    """
    row = create_or_get_pending_deletion_request(db, user.id, DELETE_REQUEST_DATA)
    return {
        "detail": f"Your request to {request_label(row.request_type)} was sent to admin for approval.",
        "requestId": row.id,
        "status": row.status,
    }


@app.delete("/me")
def delete_my_account(
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Requests account deletion.
    Request must be approved by an admin.
    """
    row = create_or_get_pending_deletion_request(db, user.id, DELETE_REQUEST_ACCOUNT)
    return {
        "detail": f"Your request to {request_label(row.request_type)} was sent to admin for approval.",
        "requestId": row.id,
        "status": row.status,
    }


# ===================== ADMIN ROUTES =====================

@app.get("/admin/deletion-requests", response_model=List[DeletionRequestItem])
def admin_list_deletion_requests(
    status: str = "pending",
    admin_username: str = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    _ = admin_username  # auth gate
    normalized = (status or "pending").strip().lower()
    if normalized not in {"pending", "approved", "rejected", "all"}:
        raise HTTPException(status_code=400, detail="Invalid status filter")

    q = db.query(DataDeletionRequestDB)
    if normalized != "all":
        q = q.filter(DataDeletionRequestDB.status == normalized)

    rows = (
        q.order_by(DataDeletionRequestDB.requested_at.desc(), DataDeletionRequestDB.id.desc())
        .limit(300)
        .all()
    )
    return [as_deletion_request_item(db, r) for r in rows]


@app.post("/admin/deletion-requests/{request_id}/approve")
def admin_approve_deletion_request(
    request_id: int,
    payload: Optional[DeletionRequestDecision] = None,
    admin_username: str = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    row = db.query(DataDeletionRequestDB).filter(DataDeletionRequestDB.id == request_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")
    if row.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be approved")

    user_exists = db.query(UserDB.id).filter(UserDB.id == row.user_id).first() is not None
    try:
        if user_exists:
            if row.request_type == DELETE_REQUEST_DATA:
                execute_delete_my_data(db, row.user_id)
            elif row.request_type == DELETE_REQUEST_ACCOUNT:
                execute_delete_my_account(db, row.user_id)
            else:
                raise HTTPException(status_code=400, detail="Unknown request type")
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise

    row = db.query(DataDeletionRequestDB).filter(DataDeletionRequestDB.id == request_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Request no longer exists")

    row.status = "approved"
    row.reviewed_by = admin_username
    row.reviewed_at = datetime.utcnow()
    note = ((payload.note if payload else None) or "").strip()
    if not user_exists:
        row.review_note = "Approved: user no longer exists."
    elif note:
        row.review_note = note
    db.add(row)
    db.commit()

    return {
        "detail": f"Request #{request_id} approved.",
        "requestId": request_id,
        "status": row.status,
    }


@app.post("/admin/deletion-requests/{request_id}/reject")
def admin_reject_deletion_request(
    request_id: int,
    payload: DeletionRequestDecision,
    admin_username: str = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    row = db.query(DataDeletionRequestDB).filter(DataDeletionRequestDB.id == request_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")
    if row.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be rejected")

    row.status = "rejected"
    row.reviewed_by = admin_username
    row.reviewed_at = datetime.utcnow()
    note = (payload.note or "").strip()
    row.review_note = note or "Rejected by admin"
    db.add(row)
    db.commit()

    return {
        "detail": f"Request #{request_id} rejected.",
        "requestId": request_id,
        "status": row.status,
    }


@app.get("/admin/overview", response_model=AdminOverview)
def admin_get_overview(
    admin_username: str = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    _ = admin_username  # auth gate
    now = datetime.utcnow()
    since_24h = now - timedelta(hours=24)

    return AdminOverview(
        totalUsers=int(db.query(func.count(UserDB.id)).scalar() or 0),
        totalFamilies=int(db.query(func.count(FamilyDB.id)).scalar() or 0),
        totalFamilyMembers=int(db.query(func.count(FamilyMemberDB.id)).scalar() or 0),
        totalMetricEntries=int(db.query(func.count(MetricEntryDB.id)).scalar() or 0),
        metricsLast24h=int(
            db.query(func.count(MetricEntryDB.id))
            .filter(MetricEntryDB.created_at >= since_24h)
            .scalar()
            or 0
        ),
        alertsLast24h=int(
            db.query(func.count(AlertDB.id))
            .filter(AlertDB.created_at >= since_24h)
            .scalar()
            or 0
        ),
        pendingDeletionRequests=int(
            db.query(func.count(DataDeletionRequestDB.id))
            .filter(DataDeletionRequestDB.status == "pending")
            .scalar()
            or 0
        ),
    )


@app.get("/admin/users", response_model=List[AdminUserItem])
def admin_list_users(
    query: str = "",
    limit: int = 120,
    admin_username: str = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    _ = admin_username  # auth gate
    safe_limit = max(1, min(limit, 300))
    q = (query or "").strip().lower()

    users = db.query(UserDB).order_by(UserDB.id.desc()).all()
    if not users:
        return []

    emails_by_user: Dict[int, str] = {
        int(row.user_id): row.email
        for row in db.query(AuthUserDB.user_id, AuthUserDB.email).all()
    }

    family_id_by_user: Dict[int, int] = {
        int(row.user_id): int(row.family_id)
        for row in db.query(FamilyMemberDB.user_id, FamilyMemberDB.family_id).all()
    }
    family_name_by_id: Dict[int, str] = {
        int(row.id): row.name
        for row in db.query(FamilyDB.id, FamilyDB.name).all()
    }

    latest_metric_rows = (
        db.query(
            MetricEntryDB.user_id.label("user_id"),
            func.max(MetricEntryDB.created_at).label("latest_at"),
        )
        .group_by(MetricEntryDB.user_id)
        .all()
    )
    latest_metric_at_by_user: Dict[int, Any] = {
        int(row.user_id): row.latest_at for row in latest_metric_rows
    }

    pending_request_rows = (
        db.query(
            DataDeletionRequestDB.user_id.label("user_id"),
            func.count(DataDeletionRequestDB.id).label("count"),
        )
        .filter(DataDeletionRequestDB.status == "pending")
        .group_by(DataDeletionRequestDB.user_id)
        .all()
    )
    pending_count_by_user: Dict[int, int] = {
        int(row.user_id): int(row.count or 0) for row in pending_request_rows
    }

    out: List[AdminUserItem] = []
    for user in users:
        name = f"{user.first_name} {user.last_name}".strip()
        family_id = family_id_by_user.get(user.id)
        family_name = family_name_by_id.get(family_id) if family_id else None
        latest_metric_at = latest_metric_at_by_user.get(user.id)

        item = AdminUserItem(
            id=user.id,
            name=name,
            role=user.role or "Self",
            email=emails_by_user.get(user.id),
            familyId=family_id,
            familyName=family_name,
            lastMetricAt=latest_metric_at.isoformat() if latest_metric_at else None,
            pendingDeletionRequests=pending_count_by_user.get(user.id, 0),
        )

        if q:
            haystack = " ".join(
                [
                    str(item.id),
                    item.name or "",
                    item.role or "",
                    item.email or "",
                    item.familyName or "",
                ]
            ).lower()
            if q not in haystack:
                continue

        out.append(item)
        if len(out) >= safe_limit:
            break

    return out


@app.put("/admin/users/{user_id}/role", response_model=AdminUserItem)
def admin_update_user_role(
    user_id: int,
    payload: AdminUpdateUserRoleRequest,
    admin_username: str = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    _ = admin_username  # auth gate
    new_role = (payload.role or "").strip()
    if not new_role:
        raise HTTPException(status_code=400, detail="Role is required")

    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = new_role[:100]
    db.add(user)
    db.commit()

    auth_row = db.query(AuthUserDB).filter(AuthUserDB.user_id == user.id).first()
    membership = get_active_family_membership(db, user.id)
    family = db.query(FamilyDB).filter(FamilyDB.id == membership.family_id).first() if membership else None
    latest_metric = (
        db.query(MetricEntryDB.created_at)
        .filter(MetricEntryDB.user_id == user.id)
        .order_by(MetricEntryDB.created_at.desc())
        .first()
    )
    pending_count = int(
        db.query(func.count(DataDeletionRequestDB.id))
        .filter(
            DataDeletionRequestDB.user_id == user.id,
            DataDeletionRequestDB.status == "pending",
        )
        .scalar()
        or 0
    )

    latest_metric_at = latest_metric[0] if latest_metric else None
    return AdminUserItem(
        id=user.id,
        name=f"{user.first_name} {user.last_name}",
        role=user.role or "Self",
        email=auth_row.email if auth_row else None,
        familyId=membership.family_id if membership else None,
        familyName=family.name if family else None,
        lastMetricAt=latest_metric_at.isoformat() if latest_metric_at else None,
        pendingDeletionRequests=pending_count,
    )


@app.get("/admin/families", response_model=List[AdminFamilyItem])
def admin_list_families(
    query: str = "",
    limit: int = 120,
    admin_username: str = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    _ = admin_username  # auth gate
    safe_limit = max(1, min(limit, 300))
    q = (query or "").strip().lower()

    families = (
        db.query(FamilyDB)
        .order_by(FamilyDB.created_at.desc(), FamilyDB.id.desc())
        .all()
    )
    if not families:
        return []

    member_count_rows = (
        db.query(
            FamilyMemberDB.family_id.label("family_id"),
            func.count(FamilyMemberDB.id).label("count"),
        )
        .group_by(FamilyMemberDB.family_id)
        .all()
    )
    member_count_by_family: Dict[int, int] = {
        int(row.family_id): int(row.count or 0) for row in member_count_rows
    }

    goals_by_family: Dict[int, FamilyGoalDB] = {
        int(row.family_id): row for row in db.query(FamilyGoalDB).all()
    }

    owner_name_by_user_id: Dict[int, str] = {
        int(row.id): f"{row.first_name} {row.last_name}".strip()
        for row in db.query(UserDB.id, UserDB.first_name, UserDB.last_name).all()
    }

    out: List[AdminFamilyItem] = []
    for family in families:
        owner_name = owner_name_by_user_id.get(family.owner_user_id, f"User #{family.owner_user_id}")
        goals = goals_by_family.get(family.id)
        steps_goal = goals.steps_goal if goals else DEFAULT_FAMILY_STEPS_GOAL
        sleep_goal = goals.sleep_goal if goals else DEFAULT_FAMILY_SLEEP_GOAL

        item = AdminFamilyItem(
            id=family.id,
            name=family.name,
            ownerUserId=family.owner_user_id,
            ownerName=owner_name,
            memberCount=member_count_by_family.get(family.id, 0),
            stepsGoal=steps_goal,
            sleepGoal=sleep_goal,
            createdAt=family.created_at.isoformat() if family.created_at else None,
        )

        if q:
            haystack = " ".join(
                [
                    str(item.id),
                    item.name or "",
                    item.ownerName or "",
                ]
            ).lower()
            if q not in haystack:
                continue

        out.append(item)
        if len(out) >= safe_limit:
            break

    return out


@app.get("/admin/alerts", response_model=List[AdminAlertItem])
def admin_list_alerts(
    severity: str = "all",
    unread_only: int = 0,
    limit: int = 120,
    admin_username: str = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    _ = admin_username  # auth gate
    normalized_severity = (severity or "all").strip().lower()
    if normalized_severity not in {"all", "info", "warning", "urgent"}:
        raise HTTPException(status_code=400, detail="Invalid severity filter")

    safe_limit = max(1, min(limit, 500))
    q = db.query(AlertDB)
    if normalized_severity != "all":
        q = q.filter(AlertDB.severity == normalized_severity)
    if int(unread_only or 0) == 1:
        q = q.filter(AlertDB.is_read == 0)

    rows = (
        q.order_by(AlertDB.created_at.desc(), AlertDB.id.desc())
        .limit(safe_limit)
        .all()
    )
    if not rows:
        return []

    user_ids = list({row.user_id for row in rows})
    user_name_by_id: Dict[int, str] = {
        int(row.id): f"{row.first_name} {row.last_name}".strip()
        for row in db.query(UserDB.id, UserDB.first_name, UserDB.last_name)
        .filter(UserDB.id.in_(user_ids))
        .all()
    } if user_ids else {}

    out: List[AdminAlertItem] = []
    for row in rows:
        out.append(
            AdminAlertItem(
                id=row.id,
                userId=row.user_id,
                userName=user_name_by_id.get(row.user_id, f"User #{row.user_id}"),
                severity=row.severity,
                category=row.category,
                title=row.title,
                message=row.message,
                metricType=row.metric_type,
                metricValue=row.metric_value,
                isRead=int(row.is_read or 0),
                createdAt=row.created_at.isoformat() if row.created_at else "",
            )
        )

    return out


# ===================== CONSENT ROUTES =====================

@app.get("/me/consent", response_model=List[ConsentItem])
def get_my_consent(
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    family_id = ensure_user_has_family(db, user)
    ensure_default_consent_rows(db, family_id, user.id)

    consent = get_consent_map(db, family_id, user.id)
    return [ConsentItem(metricType=k, isShared=bool(consent[k])) for k in CONSENT_KEYS]


@app.put("/me/consent", response_model=List[ConsentItem])
def update_my_consent(
    payload: ConsentItem,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    family_id = ensure_user_has_family(db, user)

    if payload.metricType not in CONSENT_KEYS:
        raise HTTPException(status_code=400, detail="Unknown metricType")

    ensure_default_consent_rows(db, family_id, user.id)

    row = (
        db.query(MetricConsentDB)
        .filter(
            MetricConsentDB.family_id == family_id,
            MetricConsentDB.user_id == user.id,
            MetricConsentDB.metric_key == payload.metricType,
        )
        .first()
    )
    if not row:
        row = MetricConsentDB(
            family_id=family_id,
            user_id=user.id,
            metric_key=payload.metricType,
            is_shared=1 if payload.isShared else 0,
        )
        db.add(row)
    else:
        row.is_shared = 1 if payload.isShared else 0

    db.commit()

    consent = get_consent_map(db, family_id, user.id)
    return [ConsentItem(metricType=k, isShared=bool(consent[k])) for k in CONSENT_KEYS]


# ===================== ALERT ROUTES =====================

@app.get("/me/alerts", response_model=List[AlertItem])
def get_my_alerts(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(AlertDB)
        .filter(AlertDB.user_id == user.id)
        .order_by(AlertDB.created_at.desc())
        .limit(50)
        .all()
    )

    return [
        AlertItem(
            id=r.id,
            category=r.category,
            title=r.title,
            message=r.message,
            severity=r.severity,
            metric_type=r.metric_type,
            metric_value=r.metric_value,
            is_read=r.is_read,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in rows
    ]


@app.post("/me/alerts/mark-read")
def mark_alerts_read(payload: MarkReadRequest, user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    if not payload.alertIds:
        return {"message": "No alerts provided"}

    (
        db.query(AlertDB)
        .filter(AlertDB.user_id == user.id, AlertDB.id.in_(payload.alertIds))
        .update({AlertDB.is_read: 1}, synchronize_session=False)
    )
    db.commit()
    return {"message": "Marked as read"}


# ===================== NHS ENDPOINT =====================

@app.get("/me/recommendations", response_model=List[RecommendationItem])
def get_my_recommendations(
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    latest = latest_entry_for_user(db, user.id)
    if not latest:
        raise HTTPException(status_code=404, detail="No metrics yet")

    metrics_dict = {
        "heartRate": latest.heart_rate,
        "weight": latest.weight,
        "steps": latest.steps,
        "sleep": latest.sleep,
        "bloodGlucose": latest.blood_glucose,
        "systolicBP": latest.systolic_bp,
        "diastolicBP": latest.diastolic_bp,
        "cholesterol": latest.cholesterol,
    }

    try:
        recs = build_recommendations(metrics_dict)
        return recs
    except Exception as e:
        print("⚠️ build_recommendations failed:", e)
        return [
            RecommendationItem(
                title="NHS Live Well advice",
                summary="Recommendations are temporarily unavailable from the NHS service. Use general NHS guidance below.",
                url="https://www.nhs.uk/live-well/",
                slug="live-well",
                severity="info",
                source="NHS",
            )
        ]


@app.get("/users/{user_id}/recommendations", response_model=List[RecommendationItem])
def get_user_recommendations(
    user_id: int,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assert_same_family(db, user.id, user_id)

    latest = latest_entry_for_user(db, user_id)
    if not latest:
        raise HTTPException(status_code=404, detail="No metrics yet")

    full_metrics = metrics_from_entry(latest)
    family_id = get_user_family_id(db, user.id)

    if user.id == user_id:
        metrics_out = full_metrics
    else:
        ensure_default_consent_rows(db, family_id, user_id)
        consent = get_consent_map(db, family_id, user_id)
        metrics_out = filter_metrics_by_consent(full_metrics, consent)

    metrics_dict = metrics_out.dict() if metrics_out else {}

    try:
        return build_recommendations(metrics_dict)
    except Exception as e:
        print("⚠️ build_recommendations failed:", e)
        return [
            RecommendationItem(
                title="NHS Live Well advice",
                summary="Recommendations are temporarily unavailable from the NHS service. Use general NHS guidance below.",
                url="https://www.nhs.uk/live-well/",
                slug="live-well",
                severity="info",
                source="NHS",
            )
        ]


@app.get("/me/preventive-care", response_model=List[PreventiveCareItem])
def get_my_preventive_care(
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow().date()
    latest = latest_entry_for_user(db, user.id)
    latest_date = latest.created_at.date() if latest and latest.created_at else now

    def next_fixed_date(month_index: int, day: int):
        due = datetime(now.year, month_index + 1, day).date()
        if due < now:
            due = datetime(now.year + 1, month_index + 1, day).date()
        return due

    items: List[PreventiveCareItem] = [
        PreventiveCareItem(
            name="Annual Health Check",
            due=next_fixed_date(2, 15).isoformat(),
            cadence="Yearly",
            detail="Routine annual review with your GP or primary care team.",
        ),
        PreventiveCareItem(
            name="Flu Vaccine",
            due=next_fixed_date(9, 1).isoformat(),
            cadence="Yearly",
            detail="Seasonal flu protection recommended each year.",
        ),
        PreventiveCareItem(
            name="Dental Checkup",
            due=(latest_date + timedelta(days=180)).isoformat(),
            cadence="Every 6 months",
            detail="Regular checkup for oral and gum health.",
        ),
    ]

    if latest:
        if (latest.systolic_bp or 0) >= 140 or (latest.diastolic_bp or 0) >= 90:
            items.append(
                PreventiveCareItem(
                    name="Blood Pressure Review",
                    due=(latest_date + timedelta(days=30)).isoformat(),
                    cadence="As advised",
                    detail="Recent blood pressure readings suggest a follow-up review.",
                )
            )

        if (latest.blood_glucose or 0) > 7.8:
            items.append(
                PreventiveCareItem(
                    name="Blood Glucose Review",
                    due=(latest_date + timedelta(days=30)).isoformat(),
                    cadence="As advised",
                    detail="Schedule follow-up testing and dietary guidance.",
                )
            )

        if (latest.cholesterol or 0) > 5.0:
            items.append(
                PreventiveCareItem(
                    name="Cholesterol Follow-up",
                    due=(latest_date + timedelta(days=90)).isoformat(),
                    cadence="As advised",
                    detail="Repeat lipid review to track progress.",
                )
            )

    items.sort(key=lambda item: item.due)
    return items


@app.get("/users/{user_id}/preventive-care", response_model=List[PreventiveCareItem])
def get_user_preventive_care(
    user_id: int,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assert_same_family(db, user.id, user_id)

    now = datetime.utcnow().date()
    latest = latest_entry_for_user(db, user_id)
    latest_date = latest.created_at.date() if latest and latest.created_at else now

    def next_fixed_date(month_index: int, day: int):
        due = datetime(now.year, month_index + 1, day).date()
        if due < now:
            due = datetime(now.year + 1, month_index + 1, day).date()
        return due

    items: List[PreventiveCareItem] = [
        PreventiveCareItem(
            name="Annual Health Check",
            due=next_fixed_date(2, 15).isoformat(),
            cadence="Yearly",
            detail="Routine annual review with your GP or primary care team.",
        ),
        PreventiveCareItem(
            name="Flu Vaccine",
            due=next_fixed_date(9, 1).isoformat(),
            cadence="Yearly",
            detail="Seasonal flu protection recommended each year.",
        ),
        PreventiveCareItem(
            name="Dental Checkup",
            due=(latest_date + timedelta(days=180)).isoformat(),
            cadence="Every 6 months",
            detail="Regular checkup for oral and gum health.",
        ),
    ]

    if latest:
        full_metrics = metrics_from_entry(latest)
        family_id = get_user_family_id(db, user.id)

        if user.id == user_id:
            metrics_out = full_metrics
        else:
            ensure_default_consent_rows(db, family_id, user_id)
            consent = get_consent_map(db, family_id, user_id)
            metrics_out = filter_metrics_by_consent(full_metrics, consent)

        metrics_dict = metrics_out.dict() if metrics_out else {}

        if (metrics_dict.get("systolicBP") or 0) >= 140 or (metrics_dict.get("diastolicBP") or 0) >= 90:
            items.append(
                PreventiveCareItem(
                    name="Blood Pressure Review",
                    due=(latest_date + timedelta(days=30)).isoformat(),
                    cadence="As advised",
                    detail="Recent blood pressure readings suggest a follow-up review.",
                )
            )

        if (metrics_dict.get("bloodGlucose") or 0) > 7.8:
            items.append(
                PreventiveCareItem(
                    name="Blood Glucose Review",
                    due=(latest_date + timedelta(days=30)).isoformat(),
                    cadence="As advised",
                    detail="Schedule follow-up testing and dietary guidance.",
                )
            )

        if (metrics_dict.get("cholesterol") or 0) > 5.0:
            items.append(
                PreventiveCareItem(
                    name="Cholesterol Follow-up",
                    due=(latest_date + timedelta(days=90)).isoformat(),
                    cadence="As advised",
                    detail="Repeat lipid review to track progress.",
                )
            )

    items.sort(key=lambda item: item.due)
    return items


# ===================== FAMILY ROUTES (ENFORCE CONSENT) =====================

@app.get("/family/goals", response_model=FamilyGoals)
def get_family_goals(
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    family_id = ensure_user_has_family(db, user)
    goals = get_or_create_family_goals(db, family_id)
    return FamilyGoals(steps=goals.steps_goal, sleep=goals.sleep_goal)


@app.put("/family/goals", response_model=FamilyGoals)
def update_family_goals(
    payload: UpdateFamilyGoalsRequest,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    family_id = ensure_user_has_family(db, user)
    family = db.query(FamilyDB).filter(FamilyDB.id == family_id).first()
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    if family.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the family owner can update goals")

    if payload.steps is None and payload.sleep is None:
        raise HTTPException(status_code=400, detail="Provide at least one goal field")

    goals = get_or_create_family_goals(db, family_id)

    if payload.steps is not None:
        goals.steps_goal = validate_family_steps_goal(payload.steps)

    if payload.sleep is not None:
        goals.sleep_goal = validate_family_sleep_goal(payload.sleep)

    db.add(goals)
    db.commit()
    db.refresh(goals)
    return FamilyGoals(steps=goals.steps_goal, sleep=goals.sleep_goal)


@app.get("/family/chat/messages", response_model=List[FamilyChatMessageItem])
def get_family_chat_messages(
    limit: int = 100,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    family_id = ensure_user_has_family(db, user)
    safe_limit = max(1, min(int(limit), 200))

    rows = (
        db.query(FamilyChatMessageDB)
        .filter(FamilyChatMessageDB.family_id == family_id)
        .order_by(FamilyChatMessageDB.created_at.desc(), FamilyChatMessageDB.id.desc())
        .limit(safe_limit)
        .all()
    )

    user_ids = list({r.user_id for r in rows})
    user_map: Dict[int, UserDB] = {}
    if user_ids:
        user_map = {
            u.id: u
            for u in db.query(UserDB).filter(UserDB.id.in_(user_ids)).all()
        }

    out_desc: List[FamilyChatMessageItem] = []
    for r in rows:
        author = user_map.get(r.user_id)
        out_desc.append(
            FamilyChatMessageItem(
                id=r.id,
                familyId=r.family_id,
                userId=r.user_id,
                userName=f"{author.first_name} {author.last_name}" if author else f"User {r.user_id}",
                userRole=display_role_for_viewer(
                    author.role if author else None,
                    r.user_id,
                    user.id,
                ),
                message=r.message,
                parentId=r.parent_id,
                createdAt=r.created_at.isoformat() if r.created_at else "",
            )
        )

    out_desc.reverse()
    return out_desc


@app.post("/family/chat/messages", response_model=FamilyChatMessageItem)
def post_family_chat_message(
    payload: FamilyChatMessageCreate,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    family_id = ensure_user_has_family(db, user)
    text = validate_chat_message_text(payload.message)

    parent_id: Optional[int] = None
    if payload.parentId is not None:
        validate_positive_int(payload.parentId, "parentId")
        parent = (
            db.query(FamilyChatMessageDB)
            .filter(
                FamilyChatMessageDB.id == payload.parentId,
                FamilyChatMessageDB.family_id == family_id,
            )
            .first()
        )
        if not parent:
            raise HTTPException(status_code=404, detail="Parent message not found")
        parent_id = parent.id

    row = FamilyChatMessageDB(
        family_id=family_id,
        user_id=user.id,
        message=text,
        parent_id=parent_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return FamilyChatMessageItem(
        id=row.id,
        familyId=row.family_id,
        userId=row.user_id,
        userName=f"{user.first_name} {user.last_name}",
        userRole=display_role_for_viewer(user.role, user.id, user.id),
        message=row.message,
        parentId=row.parent_id,
        createdAt=row.created_at.isoformat() if row.created_at else "",
    )


@app.get("/family", response_model=List[FamilyMemberSummary])
def get_family(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    family_id = ensure_user_has_family(db, user)

    members = db.query(FamilyMemberDB).filter(FamilyMemberDB.family_id == family_id).all()

    results: List[FamilyMemberSummary] = []
    for m in members:
        u = db.query(UserDB).filter(UserDB.id == m.user_id).first()
        if not u:
            continue

        latest = latest_entry_for_user(db, u.id)
        full_metrics = metrics_from_entry(latest) if latest else None

        # Owner always sees their own full metrics
        if u.id == user.id:
            metrics_out = full_metrics
        else:
            # Ensure consent exists and filter
            ensure_default_consent_rows(db, family_id, u.id)
            consent = get_consent_map(db, family_id, u.id)
            metrics_out = filter_metrics_by_consent(full_metrics, consent)

        results.append(
            FamilyMemberSummary(
                id=u.id,
                name=f"{u.first_name} {u.last_name}",
                role=display_role_for_viewer(u.role, u.id, user.id),
                metrics=metrics_out,
            )
        )

    return results


@app.get("/family/members/{user_id}", response_model=FamilyMemberSummary)
def get_family_member(
    user_id: int,
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    family_id = ensure_user_has_family(db, user)

    member_row = (
        db.query(FamilyMemberDB)
        .filter(FamilyMemberDB.family_id == family_id, FamilyMemberDB.user_id == user_id)
        .first()
    )
    if not member_row:
        raise HTTPException(status_code=403, detail="Not in your family")

    u = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    latest = latest_entry_for_user(db, u.id)
    full_metrics = metrics_from_entry(latest) if latest else None

    if u.id == user.id:
        metrics_out = full_metrics
    else:
        ensure_default_consent_rows(db, family_id, u.id)
        consent = get_consent_map(db, family_id, u.id)
        metrics_out = filter_metrics_by_consent(full_metrics, consent)

    return FamilyMemberSummary(
        id=u.id,
        name=f"{u.first_name} {u.last_name}",
        role=display_role_for_viewer(u.role, u.id, user.id),
        metrics=metrics_out,
    )


@app.post("/family/join")
def join_family(payload: JoinFamilyRequest, user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    code = payload.code.strip().upper()
    row = db.query(ShareCodeDB).filter(ShareCodeDB.code == code).first()
    if not row:
        raise HTTPException(status_code=404, detail="Invalid code")

    current_membership = get_active_family_membership(db, user.id)

    if current_membership and current_membership.family_id == row.family_id:
        ensure_default_consent_rows(db, row.family_id, user.id)
        return {"message": "Already in this family"}

    if current_membership:
        leave_family_membership(db, user.id, current_membership.family_id)

    exists = (
        db.query(FamilyMemberDB)
        .filter(FamilyMemberDB.family_id == row.family_id, FamilyMemberDB.user_id == user.id)
        .first()
    )
    if not exists:
        db.add(FamilyMemberDB(family_id=row.family_id, user_id=user.id))
        db.commit()

    # Create consent rows for the user in the new family
    ensure_default_consent_rows(db, row.family_id, user.id)
    create_family_join_alerts(db, row.family_id, user)

    return {"message": "Joined family successfully"}


@app.post("/family/leave")
def leave_family(
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = get_active_family_membership(db, user.id)
    if not membership:
        raise HTTPException(status_code=404, detail="You are not in a family")

    leave_family_membership(db, user.id, membership.family_id)
    return {"message": "Left family successfully"}


@app.get("/users/{user_id}/summary", response_model=UserSummary)
def get_user_summary(user_id: int, user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    assert_same_family(db, user.id, user_id)

    target = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    latest = latest_entry_for_user(db, user_id)
    if not latest:
        raise HTTPException(status_code=404, detail="No metrics yet")

    full_metrics = metrics_from_entry(latest)

    family_id = get_user_family_id(db, user.id)  # same family
    if user.id == user_id:
        metrics_out = full_metrics
    else:
        ensure_default_consent_rows(db, family_id, user_id)
        consent = get_consent_map(db, family_id, user_id)
        metrics_out = filter_metrics_by_consent(full_metrics, consent)

    return UserSummary(
        name=f"{target.first_name} {target.last_name}",
        role=display_role_for_viewer(target.role, target.id, user.id),
        metrics=metrics_out,
    )


@app.get("/users/{user_id}/metrics/history", response_model=List[MetricHistoryItem])
def get_user_history(user_id: int, user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    assert_same_family(db, user.id, user_id)

    entries = (
        db.query(MetricEntryDB)
        .filter(MetricEntryDB.user_id == user_id)
        .order_by(MetricEntryDB.created_at.asc())
        .all()
    )
    if not entries:
        raise HTTPException(status_code=404, detail="No history yet")

    family_id = get_user_family_id(db, user.id)

    # Owner sees full; others see filtered
    if user.id == user_id:
        return [
            MetricHistoryItem(
                **metrics_from_entry(e).dict(),
                timestamp=e.created_at.isoformat() if e.created_at else "",
            )
            for e in entries
        ]

    ensure_default_consent_rows(db, family_id, user_id)
    consent = get_consent_map(db, family_id, user_id)

    filtered: List[MetricHistoryItem] = []
    for e in entries:
        full = metrics_from_entry(e)
        out = filter_metrics_by_consent(full, consent)
        filtered.append(
            MetricHistoryItem(
                **out.dict(),
                timestamp=e.created_at.isoformat() if e.created_at else "",
            )
        )
    return filtered


# ===================== SHARE CODE ROUTES =====================

@app.get("/me/share-code", response_model=ShareCodeResponse)
def get_share_code(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    family_id = ensure_user_has_family(db, user)
    code = get_or_create_share_code_for_family(db, family_id)
    return ShareCodeResponse(code=code)


@app.post("/me/share-code/rotate", response_model=ShareCodeResponse)
def rotate_code(user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    family_id = ensure_user_has_family(db, user)
    code = rotate_share_code_for_family(db, family_id)
    return ShareCodeResponse(code=code)

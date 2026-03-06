from typing import Generator, List, Optional, Dict, Any
from datetime import datetime, timedelta
import secrets
import string
import hashlib
import hmac
import os

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


Base.metadata.create_all(bind=engine)


# ===================== HELPERS =====================

DEFAULT_FAMILY_STEPS_GOAL = 10000
DEFAULT_FAMILY_SLEEP_GOAL = 8.0

def latest_entry_for_user(db: Session, user_id: int):
    return (
        db.query(MetricEntryDB)
        .filter(MetricEntryDB.user_id == user_id)
        .order_by(MetricEntryDB.created_at.desc())
        .first()
    )


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


def get_user_family_id(db: Session, user_id: int) -> Optional[int]:
    row = db.query(FamilyMemberDB).filter(FamilyMemberDB.user_id == user_id).first()
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


def decide_livewell_slugs_from_metrics(m: Dict[str, Any]) -> List[str]:
    wanted: List[str] = []

    steps = m.get("steps")
    if isinstance(steps, (int, float)) and steps < 5000:
        wanted.append("exercise")

    sleep = m.get("sleep")
    if isinstance(sleep, (int, float)) and sleep < 7:
        wanted.append("sleep-and-tiredness")

    sys_bp = m.get("systolicBP")
    dia_bp = m.get("diastolicBP")
    if isinstance(sys_bp, (int, float)) and isinstance(dia_bp, (int, float)):
        if sys_bp >= 180 or dia_bp >= 120:
            wanted.extend(["healthy-eating", "exercise", "healthy-weight"])
        elif sys_bp >= 140 or dia_bp >= 90:
            wanted.extend(["healthy-eating", "exercise", "healthy-weight"])

    cholesterol = m.get("cholesterol")
    if isinstance(cholesterol, (int, float)) and cholesterol > 5:
        wanted.extend(["healthy-eating", "healthy-weight", "exercise"])

    weight = m.get("weight")
    if isinstance(weight, (int, float)) and weight >= 85:
        wanted.append("healthy-weight")

    bg = m.get("bloodGlucose")
    if isinstance(bg, (int, float)) and bg > 7.8:
        wanted.extend(["healthy-eating", "exercise", "healthy-weight"])

    hr = m.get("heartRate")
    if isinstance(hr, (int, float)) and hr > 100:
        wanted.append("exercise")

    seen = set()
    deduped: List[str] = []
    for s in wanted:
        if s not in seen:
            seen.add(s)
            deduped.append(s)
    return deduped


def build_recommendations(metrics: Dict[str, Any]) -> List[Dict[str, Any]]:
    topics = fetch_nhs_livewell_topics()
    wanted_slugs = decide_livewell_slugs_from_metrics(metrics)

    by_slug: Dict[str, Dict[str, Any]] = {}
    for t in topics:
        if isinstance(t, dict):
            slug = t.get("slug")
            if isinstance(slug, str):
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
        t = by_slug.get(slug)
        if not t:
            continue
        results.append({
            "title": _as_text(t.get("title")) or "NHS advice",
            "summary": _as_text(t.get("description")) or _as_text(t.get("summary")),
            "url": _as_text(t.get("url")),
            "slug": _as_text(slug),
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
    email = normalize_email(payload.email)
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")

    existing = db.query(AuthUserDB).filter(AuthUserDB.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    first = payload.firstName.strip()
    last = payload.lastName.strip()
    if not first or not last:
        raise HTTPException(status_code=400, detail="First name and last name are required")

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
        v = payload.firstName.strip()
        if not v:
            raise HTTPException(status_code=400, detail="First name cannot be empty")
        user.first_name = v

    if payload.lastName is not None:
        v = payload.lastName.strip()
        if not v:
            raise HTTPException(status_code=400, detail="Last name cannot be empty")
        user.last_name = v

    if payload.role is not None:
        v = payload.role.strip()
        if not v:
            raise HTTPException(status_code=400, detail="Role cannot be empty")
        user.role = v

    # Update email in auth_users
    if payload.email is not None:
        v = normalize_email(payload.email)
        if not v or "@" not in v:
            raise HTTPException(status_code=400, detail="Invalid email")

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
    # Metrics schema is Optional because of consent filtering, but logging requires all fields
    required = ["heartRate", "weight", "steps", "sleep", "bloodGlucose", "systolicBP", "diastolicBP", "cholesterol"]
    missing = [k for k in required if getattr(payload, k) is None]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required metric fields: {', '.join(missing)}")

    entry = MetricEntryDB(
        user_id=user.id,
        heart_rate=payload.heartRate,
        weight=payload.weight,
        steps=int(payload.steps),
        sleep=payload.sleep,
        blood_glucose=payload.bloodGlucose,
        systolic_bp=payload.systolicBP,
        diastolic_bp=payload.diastolicBP,
        cholesterol=payload.cholesterol,
    )
    db.add(entry)
    db.commit()

    alerts = build_alerts_from_metrics(payload.dict())
    if alerts:
        save_alerts(db, user.id, alerts)

    return UserSummary(
        name=f"{user.first_name} {user.last_name}",
        role=user.role,
        metrics=payload,
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
    membership = db.query(FamilyMemberDB).filter(FamilyMemberDB.user_id == user.id).first()
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
    Deletes the user's personal data (metrics, alerts, consent rows),
    but keeps their account.
    """
    # Find family membership for consent deletion
    membership = db.query(FamilyMemberDB).filter(FamilyMemberDB.user_id == user.id).first()
    family_id = membership.family_id if membership else None

    # Delete personal content
    db.query(MetricEntryDB).filter(MetricEntryDB.user_id == user.id).delete(synchronize_session=False)
    db.query(AlertDB).filter(AlertDB.user_id == user.id).delete(synchronize_session=False)

    if family_id:
        db.query(MetricConsentDB).filter(
            MetricConsentDB.family_id == family_id,
            MetricConsentDB.user_id == user.id
        ).delete(synchronize_session=False)

    db.commit()
    return {"detail": "All personal data deleted (account retained)."}


@app.delete("/me")
def delete_my_account(
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Deletes the user's account and associated data.
    Also safely handles any families they own.
    """
    try:
        user_id = user.id

        # Identify membership / family (may be None)
        membership = db.query(FamilyMemberDB).filter(FamilyMemberDB.user_id == user_id).first()
        family_id = membership.family_id if membership else None

        # 1) Delete auth tokens
        db.query(AuthTokenDB).filter(AuthTokenDB.user_id == user_id).delete(synchronize_session=False)

        # 2) Delete user-owned data
        db.query(MetricEntryDB).filter(MetricEntryDB.user_id == user_id).delete(synchronize_session=False)
        db.query(AlertDB).filter(AlertDB.user_id == user_id).delete(synchronize_session=False)

        # 3) Delete THIS user's consent rows (if we know their family)
        if family_id:
            db.query(MetricConsentDB).filter(
                MetricConsentDB.family_id == family_id,
                MetricConsentDB.user_id == user_id
            ).delete(synchronize_session=False)

        # 4) Remove membership row(s) for this user
        db.query(FamilyMemberDB).filter(
            FamilyMemberDB.user_id == user_id
        ).delete(synchronize_session=False)

        # 5) Handle ALL families this user owns
        owned_families = db.query(FamilyDB).filter(FamilyDB.owner_user_id == user_id).all()

        for fam in owned_families:
            remaining_members = (
                db.query(FamilyMemberDB)
                .filter(FamilyMemberDB.family_id == fam.id)
                .all()
            )

            if len(remaining_members) == 0:
                # delete family-linked tables FIRST (FK order)
                db.query(MetricConsentDB).filter(
                    MetricConsentDB.family_id == fam.id
                ).delete(synchronize_session=False)

                db.query(ShareCodeDB).filter(
                    ShareCodeDB.family_id == fam.id
                ).delete(synchronize_session=False)

                # (safe cleanup even though should be empty)
                db.query(FamilyMemberDB).filter(
                    FamilyMemberDB.family_id == fam.id
                ).delete(synchronize_session=False)

                # now delete the family
                db.query(FamilyDB).filter(
                    FamilyDB.id == fam.id
                ).delete(synchronize_session=False)
            else:
                # Transfer ownership to first remaining member
                fam.owner_user_id = remaining_members[0].user_id
                db.add(fam)

        db.flush()

        # 6) Delete auth user row
        db.query(AuthUserDB).filter(AuthUserDB.user_id == user_id).delete(synchronize_session=False)

        # 7) Delete the user
        db.query(UserDB).filter(UserDB.id == user_id).delete(synchronize_session=False)

        db.commit()
        return {"detail": "Account and associated data deleted."}

    except Exception:
        db.rollback()
        raise


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
        if payload.steps <= 0:
            raise HTTPException(status_code=400, detail="Steps goal must be greater than 0")
        goals.steps_goal = int(payload.steps)

    if payload.sleep is not None:
        if payload.sleep <= 0 or payload.sleep > 24:
            raise HTTPException(status_code=400, detail="Sleep goal must be between 0 and 24 hours")
        goals.sleep_goal = float(payload.sleep)

    db.add(goals)
    db.commit()
    db.refresh(goals)
    return FamilyGoals(steps=goals.steps_goal, sleep=goals.sleep_goal)


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
                role=u.role,
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
        role=u.role,
        metrics=metrics_out,
    )


@app.post("/family/join")
def join_family(payload: JoinFamilyRequest, user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    code = payload.code.strip().upper()
    row = db.query(ShareCodeDB).filter(ShareCodeDB.code == code).first()
    if not row:
        raise HTTPException(status_code=404, detail="Invalid code")

    current_membership = (
        db.query(FamilyMemberDB)
        .filter(FamilyMemberDB.user_id == user.id)
        .first()
    )

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

    return {"message": "Joined family successfully"}


@app.post("/family/leave")
def leave_family(
    user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = (
        db.query(FamilyMemberDB)
        .filter(FamilyMemberDB.user_id == user.id)
        .first()
    )
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
        role=target.role,
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

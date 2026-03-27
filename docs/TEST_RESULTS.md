# CheckMi Test Results

## 1. Purpose

This document records the current testing evidence for CheckMi. It separates:

- checks that have been actually executed
- manual tests that still need to be run on device or simulator
- accessibility checks that should be recorded separately from general feature tests
- white-box logic that has been verified by source inspection

This makes the report accurate and avoids claiming tests were run when they were only planned.

## 2. Executed validation checks

These checks were actually run on `2026-03-18`.

| ID | Check | Result | Evidence |
|---|---|---|---|
| EV1 | `npx tsc --noEmit` | Passed | TypeScript completed with no errors |
| EV2 | `python3 -m py_compile server/main.py` | Passed | Python backend file compiled successfully |
| EV3 | `npm run lint` | Passed with warning | One existing warning in [welcome.tsx:29](/Users/mithu/CheckMi/app/welcome.tsx:29), no lint errors |

## 3. Black-box results

These tests should be completed by running the app in Expo on a simulator or physical device. They are listed here in result format so you can update them after testing.

| ID | Feature | Result | Notes |
|---|---|---|---|
| BB1 | Sign up with valid data | Pending manual test | Confirm account is created and user enters app |
| BB2 | Sign up validation | Pending manual test | Test invalid email and weak password |
| BB3 | Login | Pending manual test | Test valid login |
| BB4 | Profile update | Pending manual test | Test valid name, role, and email change |
| BB5 | Profile validation | Pending manual test | Test blank/short name and invalid email |
| BB6 | Health metrics entry | Pending manual test | Confirm latest metrics refresh correctly |
| BB7 | Recommendations | Pending manual test | Confirm NHS or fallback content appears |
| BB8 | Preventive care | Pending manual test | Confirm preventive items load |
| BB9 | Join family with valid code | Pending manual test | Confirm family dashboard updates |
| BB10 | Join family with invalid code | Pending manual test | Confirm request is rejected cleanly |
| BB11 | Save family goals | Pending manual test | Confirm steps and sleep goals save |
| BB12 | Family goals validation | Pending manual test | Test invalid steps/sleep values |
| BB13 | Send family chat message | Pending manual test | Confirm message appears in chat |
| BB14 | Family chat validation | Pending manual test | Test empty and too-long messages |
| BB15 | Create medication | Pending manual test | Confirm medication appears with correct data |
| BB16 | Medication validation | Pending manual test | Test invalid time and negative values |
| BB17 | Medication adherence logging | Pending manual test | Confirm taken/missed logs update adherence |
| BB18 | Theme toggle | Pending manual test | Confirm consistent light/dark behaviour |
| BB19 | Magnification mode | Pending manual test | Confirm enlarged cards/content |
| BB20 | PDF export | Pending manual test | Confirm readable PDF is generated |
| BB21 | Deletion request | Pending manual test | Confirm request is sent to admin |
| BB22 | Admin login | Pending manual test | Confirm admin page loads |
| BB23 | Admin approval | Pending manual test | Confirm request status changes after approval |

## 4. Accessibility results

Accessibility testing is also in scope for this project. No dedicated accessibility audit has been executed yet, so the checks below are recorded as pending until they are completed on device, simulator, or web.

| ID | Accessibility check | Result | Notes |
|---|---|---|---|
| AX1 | Keyboard navigation and logical focus order | Pending manual test | Confirm all interactive controls can be reached and used without a mouse |
| AX2 | Visible focus states | Pending manual test | Confirm focused buttons, inputs, tabs, and links are clearly highlighted |
| AX3 | Form labels, hints, and error messaging | Pending manual test | Confirm fields have clear labels and validation messages are announced clearly |
| AX4 | Screen reader names and roles | Pending manual test | Confirm controls expose meaningful labels and roles to assistive technology |
| AX5 | Heading structure and landmarks | Pending manual test | Confirm major sections are announced in a logical order |
| AX6 | Color contrast and magnification support | Pending manual test | Confirm text remains readable and the magnification mode still preserves usability |

## 5. White-box analysis results

These items have been checked against the current source code. They are useful for the report as white-box evidence, but they are not the same as automated runtime tests.

White-box testing for this project is grouped into:

1. Statement coverage
2. Branch or decision coverage
3. Condition coverage
4. Path coverage

### 5.1 Statement Coverage Results

| ID | Logic area | Current status | Evidence |
|---|---|---|---|
| WB1 | Signup success flow | Verified by source inspection | [main.py:1828](/Users/mithu/CheckMi/server/main.py:1828) |
| WB2 | Medication creation flow | Verified by source inspection | [main.py:2140](/Users/mithu/CheckMi/server/main.py:2140) |
| WB3 | Data export flow | Verified by source inspection | [main.py:2352](/Users/mithu/CheckMi/server/main.py:2352), [main.py:2408](/Users/mithu/CheckMi/server/main.py:2408) |
| WB4 | Admin approval flow | Verified by source inspection | [main.py:2544](/Users/mithu/CheckMi/server/main.py:2544) |

### 5.2 Branch or Decision Coverage Results

| ID | Logic area | Current status | Evidence |
|---|---|---|---|
| WB5 | Signup invalid email branch | Verified by source inspection | [main.py:334](/Users/mithu/CheckMi/server/main.py:334), [main.py:1828](/Users/mithu/CheckMi/server/main.py:1828) |
| WB6 | Signup weak password branch | Verified by source inspection | [main.py:343](/Users/mithu/CheckMi/server/main.py:343) |
| WB7 | Family goal owner authorization | Verified by source inspection | [main.py:3277](/Users/mithu/CheckMi/server/main.py:3277) |
| WB8 | Medication log status validation | Verified by source inspection | [main.py:441](/Users/mithu/CheckMi/server/main.py:441), [main.py:2305](/Users/mithu/CheckMi/server/main.py:2305) |
| WB9 | Recommendation fallback logic | Verified by source inspection | [main.py:1340](/Users/mithu/CheckMi/server/main.py:1340), [main.py:3031](/Users/mithu/CheckMi/server/main.py:3031) |

### 5.3 Condition Coverage Results

| ID | Logic area | Current status | Evidence |
|---|---|---|---|
| WB10 | Profile blank/short name validation | Verified by source inspection | [main.py:307](/Users/mithu/CheckMi/server/main.py:307), [main.py:1926](/Users/mithu/CheckMi/server/main.py:1926) |
| WB11 | Profile invalid email validation | Verified by source inspection | [main.py:334](/Users/mithu/CheckMi/server/main.py:334), [main.py:1926](/Users/mithu/CheckMi/server/main.py:1926) |
| WB12 | Family steps goal validation | Verified by source inspection | [main.py:356](/Users/mithu/CheckMi/server/main.py:356), [main.py:3277](/Users/mithu/CheckMi/server/main.py:3277) |
| WB13 | Family chat validation branches | Verified by source inspection | [main.py:381](/Users/mithu/CheckMi/server/main.py:381), [main.py:3357](/Users/mithu/CheckMi/server/main.py:3357) |
| WB14 | Medication validation rules | Verified by source inspection | [main.py:2140](/Users/mithu/CheckMi/server/main.py:2140), [main.py:2182](/Users/mithu/CheckMi/server/main.py:2182), [main.py:508](/Users/mithu/CheckMi/server/main.py:508) |

### 5.4 Path Coverage Results

| ID | Logic area | Current status | Evidence |
|---|---|---|---|
| WB15 | Medication schedule normalization | Verified by source inspection | [main.py:508](/Users/mithu/CheckMi/server/main.py:508) |
| WB16 | Medication adherence calculation | Verified by source inspection | [main.py:554](/Users/mithu/CheckMi/server/main.py:554) |

### 5.5 White-box code snippet evidence

The following snippets show the internal logic that was inspected during white-box testing. These are useful to include in a report because they show the exact branches, conditions, and paths being tested.

#### Branch coverage example: password strength validation

Source: [main.py:343](/Users/mithu/CheckMi/server/main.py:343)

```python
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
```

White-box interpretation: this logic supports branch testing because each `if` statement creates a separate decision outcome. Tests should cover too-short passwords, passwords without numbers, passwords without symbols, and a valid password that reaches the `return`.

#### Condition coverage example: family chat validation

Source: [main.py:381](/Users/mithu/CheckMi/server/main.py:381)

```python
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
```

White-box interpretation: this is a condition coverage example because the tester can deliberately trigger each logical rule: empty input, over-length input, symbol-only input, and valid text.

#### Branch and authorization example: family goals update

Source: [main.py:3277](/Users/mithu/CheckMi/server/main.py:3277)

```python
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
```

White-box interpretation: this route is suited to decision testing because it contains clear success and failure branches for missing family records, non-owner access, and empty update payloads.

#### Path coverage example: medication schedule normalization

Source: [main.py:508](/Users/mithu/CheckMi/server/main.py:508)

```python
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
```

White-box interpretation: this is a path coverage example because testing can follow different execution paths through invalid input rejection, duplicate removal, sorting, and the successful normalized output path.

#### Path coverage example: medication adherence calculation

Source: [main.py:554](/Users/mithu/CheckMi/server/main.py:554)

```python
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
```

White-box interpretation: this function supports path testing because it has multiple early-return paths and a main calculation path. Tests can verify zero-day input, empty schedules, future/invalid coverage windows, and a normal adherence percentage path.

## 5. Report-ready summary

At the current stage of the project, static validation checks were executed successfully. TypeScript compilation passed, Python backend compilation passed, and linting completed with one existing warning but no errors. In addition, the white-box testing structure for the project was mapped across statement coverage, branch coverage, condition coverage, and path coverage. Source inspection confirmed that important logic in signup validation, family goal authorization, family chat limits, medication validation, recommendation fallback, export generation, and admin approval is present in the current implementation.

Manual black-box feature testing should still be completed on device or simulator to convert the pending functional tests into final pass/fail results for the report.

## 6. Final results table for report use

You can update this once manual testing is complete:

| Test type | Number planned | Confirmed passed | Confirmed failed | Notes |
|---|---|---|---|---|
| Executed validation checks | 3 | 3 | 0 | One lint warning remains |
| Black-box manual tests | 23 | 0 | 0 | Pending manual execution |
| White-box source inspections | 16 | 16 | 0 | Verified by source inspection |

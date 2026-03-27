# CheckMi Testing Plan

## 1. Purpose

This document gives a practical testing plan for CheckMi using both black-box and white-box testing. It is written so it can be used in two ways:

- as a checklist while you test the app
- as material you can reuse in your report

The matching results record is in [TEST_RESULTS.md](/Users/mithu/CheckMi/docs/TEST_RESULTS.md).

## 2. What black-box and white-box testing mean

### Black-box testing

Black-box testing checks whether the app behaves correctly from the user's point of view, without focusing on the internal code. The tester enters data, uses features, and checks whether the result matches the expected behaviour.

### White-box testing

White-box testing checks the internal logic of the app. It focuses on code paths, validation branches, conditions, and data flow. In this project, white-box testing is mainly based on the backend validation logic and key frontend decision paths.

## 3. Testing approach used in this project

CheckMi does not currently have a dedicated automated test framework configured in `package.json`, so the most realistic approach for this stage of the project is:

- manual black-box feature testing
- white-box logic/path testing against important functions and routes
- static validation using TypeScript, linting, and Python compilation

Useful validation commands:

```bash
npx tsc --noEmit
npm run lint
python3 -m py_compile server/main.py
```

## 4. Test environment

Suggested environment for testing:

- Frontend: Expo app running on iOS simulator, Android emulator, or physical device
- Backend: FastAPI server running locally
- Database: local MySQL `CheckMi`
- Network: local development environment

## 5. Black-box test cases

These tests check user-visible behaviour only.

| ID | Feature | Test data / action | Expected result | Status |
|---|---|---|---|---|
| BB1 | Sign up | Enter valid first name, last name, email, and strong password | Account is created and user is taken into the app | Not yet run |
| BB2 | Sign up validation | Enter invalid email or weak password | Sign up is blocked and a clear validation message is shown | Not yet run |
| BB3 | Login | Enter correct email and password | User is logged in successfully | Not yet run |
| BB4 | Profile update | Change name, role, and email to valid values | Profile saves successfully and values refresh correctly | Not yet run |
| BB5 | Profile validation | Enter invalid email or blank/too-short name | Save is blocked and error message is shown | Not yet run |
| BB6 | Health metrics | Log a valid health entry on the home screen | Dashboard/home data refreshes and latest metrics are visible | Not yet run |
| BB7 | Recommendations | Open recommendations after metrics exist | NHS-based recommendations or fallback guidance are shown | Not yet run |
| BB8 | Preventive care | Open preventive care section | Preventive care items load correctly | Not yet run |
| BB9 | Join family | Enter a valid family share code | User joins the family and family dashboard updates | Not yet run |
| BB10 | Join family invalid | Enter an invalid or empty family code | Join is rejected with an error message | Not yet run |
| BB11 | Family goals | Enter valid steps and sleep goal values | Goals save and update on the dashboard | Not yet run |
| BB12 | Family goals validation | Enter invalid steps or sleep values | Save is blocked and error message is shown | Not yet run |
| BB13 | Family chat | Send a valid family message | Message appears in the family chat list | Not yet run |
| BB14 | Family chat validation | Try to send an empty or too-long message | Message is rejected and user sees an error | Not yet run |
| BB15 | Medication create | Add medication with valid name, schedule, and quantities | Medication appears in tracker with correct details | Not yet run |
| BB16 | Medication validation | Enter invalid time or negative quantity | Save is blocked and error message is shown | Not yet run |
| BB17 | Medication adherence | Mark a medication as taken or missed | Log is saved and adherence values update | Not yet run |
| BB18 | Theme toggle | Switch between light and dark mode | App theme changes consistently across pages | Not yet run |
| BB19 | Magnification mode | Turn magnification mode on in settings | Cards and key content appear larger | Not yet run |
| BB20 | PDF export | Tap download data/export in settings | A readable PDF export is generated and shared/opened | Not yet run |
| BB21 | Deletion request | Request data deletion or account deletion | Request is sent to admin for approval | Not yet run |
| BB22 | Admin login | Enter valid admin credentials | Admin page opens successfully | Not yet run |
| BB23 | Admin approval | Approve a pending deletion request | Request status updates correctly | Not yet run |

## 6. White-box test cases

White-box testing for CheckMi is structured around four standard areas:

1. Statement coverage
2. Branch or decision coverage
3. Condition coverage
4. Path coverage

### 6.1 Statement coverage

Statement coverage checks whether important statements in the code execute at least once.

| ID | Code area | Statement to exercise | Expected result | Reference |
|---|---|---|---|---|
| WB1 | Signup success flow | Execute user creation, family creation, consent setup, and token creation statements | Account is created successfully | [main.py:1780](/Users/mithu/CheckMi/server/main.py:1780) |
| WB2 | Medication creation flow | Execute medication save statements with valid input | Medication is stored successfully | [main.py:2034](/Users/mithu/CheckMi/server/main.py:2034) |
| WB3 | Data export flow | Execute export object construction statements | Export payload is generated successfully | [main.py:2246](/Users/mithu/CheckMi/server/main.py:2246) |
| WB4 | Admin approval flow | Execute request approval and metadata update statements | Request status changes to approved | [main.py:2438](/Users/mithu/CheckMi/server/main.py:2438) |

### 6.2 Branch or Decision Coverage

Branch coverage checks whether both true and false outcomes of important decisions are exercised.

| ID | Code area | Branch to test | Expected result | Reference |
|---|---|---|---|---|
| WB5 | Signup validation | Invalid email branch in signup flow | Backend rejects invalid email and does not create user | [main.py:1780](/Users/mithu/CheckMi/server/main.py:1780) |
| WB6 | Signup validation | Weak password branch | Backend rejects passwords without enough strength | [main.py:328](/Users/mithu/CheckMi/server/main.py:328) |
| WB7 | Family goal authorization | Non-owner tries to change family goals | Backend returns `403` and goals remain unchanged | [main.py:3171](/Users/mithu/CheckMi/server/main.py:3171) |
| WB8 | Medication log validation | Submit log with status other than `taken` or `missed` | Backend rejects invalid status | [main.py:2199](/Users/mithu/CheckMi/server/main.py:2199) |
| WB9 | Recommendation fallback | NHS content unavailable or no match found | Backend returns fallback recommendation item | [main.py:1291](/Users/mithu/CheckMi/server/main.py:1291), [main.py:2925](/Users/mithu/CheckMi/server/main.py:2925) |

### 6.3 Condition Coverage

Condition coverage checks whether individual logical conditions are tested with valid and invalid values.

| ID | Code area | Condition to test | Expected result | Reference |
|---|---|---|---|---|
| WB10 | Profile update validation | Blank or too-short name update | Backend returns validation error and does not save | [main.py:1878](/Users/mithu/CheckMi/server/main.py:1878) |
| WB11 | Profile update validation | Invalid email update | Backend rejects invalid email and keeps previous email | [main.py:1878](/Users/mithu/CheckMi/server/main.py:1878) |
| WB12 | Family goal validation | Steps goal upper bound and positive-number condition | Invalid goal is rejected | [main.py:3171](/Users/mithu/CheckMi/server/main.py:3171) |
| WB13 | Family chat validation | Empty message and max-length condition | Empty or too-long message is rejected | [main.py:3251](/Users/mithu/CheckMi/server/main.py:3251) |
| WB14 | Medication creation and update validation | Invalid name, negative quantity, invalid schedule, or oversized text | Medication is rejected with validation error | [main.py:2034](/Users/mithu/CheckMi/server/main.py:2034), [main.py:2075](/Users/mithu/CheckMi/server/main.py:2075) |

### 6.4 Path Coverage

Path coverage checks whether complete execution paths through important logic are tested.

| ID | Code area | Path to test | Expected result | Reference |
|---|---|---|---|---|
| WB15 | Medication schedule normalization | Pass duplicate and unsorted times through normalization path | Backend sorts times and removes duplicates | [main.py:459](/Users/mithu/CheckMi/server/main.py:459) |
| WB16 | Medication adherence calculation | Check zero-log, partial-log, and full-log execution paths | Adherence percentage matches expected calculation | [main.py:505](/Users/mithu/CheckMi/server/main.py:505) |

## 7. Recommended evidence to collect

For your report, collect evidence such as:

- screenshots of successful feature flows
- screenshots of validation errors
- screenshots of admin approval actions
- terminal output of `npx tsc --noEmit`
- terminal output of `npm run lint`
- terminal output of `python3 -m py_compile server/main.py`

## 8. How to write this in your report

You can describe the testing like this:

### Black-box testing write-up

Black-box testing was used to verify that the app behaved correctly from the user's perspective. The internal implementation was not considered during these tests. Instead, the focus was on whether features such as sign up, login, profile update, family joining, medication creation, PDF export, and admin approval produced the expected outputs for valid and invalid inputs.

### White-box testing write-up

White-box testing was used to examine internal logic paths and validation rules in the application. This included checking backend branches for signup validation, profile update validation, family goal authorization, family chat message validation, medication schedule normalization, adherence calculation, recommendation fallback behaviour, and deletion approval processing. This helped confirm that critical decision paths in the code behaved as intended.

## 9. Suggested testing summary table for the report

You can summarise your results in a short table like this after running the tests:

| Test type | Number planned | Number passed | Number failed | Notes |
|---|---|---|---|---|
| Black-box | 23 |  |  |  |
| White-box | 16 |  |  |  |

## 10. Good final evaluation sentence

Overall, the testing showed that the main user flows, validation rules, and backend decision paths in CheckMi behaved as expected in the local development environment, while also highlighting areas where future automated testing could strengthen the project further.

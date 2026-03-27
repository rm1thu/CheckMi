# CheckMi Project Documentation

## 1. Project overview

CheckMi is a family-oriented mobile health monitoring application. The app allows users to log daily health data, view trends, receive recommendations, share selected metrics with family members, manage medications, and interact within a family dashboard. It also includes an admin workflow for approving privacy-sensitive actions such as data deletion and account deletion.

The project combines a mobile frontend built with Expo React Native and a FastAPI backend connected to MySQL.

## 2. Problem the project addresses

Many health apps focus only on individual tracking. CheckMi is designed to support both personal monitoring and family-based care. The main problem it addresses is the lack of a simple system where:

- users can track key health indicators in one place
- families can stay informed without seeing data the user has not consented to share
- users can receive understandable health guidance
- medication adherence can be monitored alongside other health data
- data/privacy requests can be handled through a controlled admin workflow

## 3. Project aims

The main aims of CheckMi are:

- to help users record and review essential health metrics
- to support family communication and goal setting
- to improve awareness through alerts, trends, and recommendations
- to make medication adherence easier to manage
- to include privacy, consent, and accessibility as part of the design

## 4. Target users

CheckMi is suitable for:

- individuals who want to monitor long-term health indicators
- families supporting each other with shared goals and updates
- caregivers who need a simple view of agreed shared information
- administrators managing deletion requests and high-level monitoring

## 5. Core features

### 5.1 Authentication

- User sign up and login
- Admin login with a fixed username and password, configurable by environment variables
- Token-based authentication for both users and admin users

### 5.2 Health metric tracking

Users can log and review:

- heart rate
- weight
- steps
- sleep
- blood glucose
- systolic blood pressure
- diastolic blood pressure
- cholesterol

The home screen shows current metric cards and allows new entries to be submitted to the backend.

### 5.3 Recommendations and preventive care

- The app requests recommendation content from the backend
- The backend maps user metrics to NHS-related advice where possible
- The app also provides preventive care items such as checks or health actions relevant to the user
- If NHS content is unavailable, the backend returns fallback guidance so the feature still works

### 5.4 Family management

CheckMi includes a family grouping system with:

- family creation on sign up
- share/invite code generation and rotation
- join family and leave family actions
- family member snapshots on the dashboard
- member-specific profile/summary views
- family-level goal setting

### 5.5 Consent-based sharing

The app does not assume every metric should be visible to family members. Instead, sharing is consent-based.

- Consent is stored per family, per user, and per metric
- Shared family views respect these consent settings
- This supports privacy while still allowing family collaboration

### 5.6 Alerts

- The backend generates alert items for unusual or important conditions
- Alerts include severity levels such as `info`, `warning`, and `urgent`
- Users can view alerts and mark them as read
- Admins can also review cross-user alerts through the admin console

### 5.7 Family chat/forum

- Families can send messages inside the dashboard
- Messages are linked to a family and a user
- This supports lightweight communication around goals, reminders, or wellbeing updates

### 5.8 Medication adherence tracker

The medication feature includes:

- medication creation, editing, and deletion
- dosage and instruction fields
- one or more daily schedule times
- next reminder calculation
- refill threshold warnings
- taken/missed logging
- 7-day and 30-day adherence percentages

This makes the medication system more than a static list. It supports day-to-day adherence monitoring.

### 5.9 Settings, privacy, and export

The settings page includes:

- profile details
- light mode, dark mode, and system theme support
- magnification mode for larger cards/text presentation
- data export
- data deletion request
- account deletion request

Data export is generated as a readable PDF on the frontend using the backend export payload.

### 5.10 Admin console

The admin area is not limited to request approval. It includes:

- admin overview statistics
- user management
- family monitoring
- alert monitoring
- deletion request review and approval/rejection
- role updating for users

This supports governance and moderation in the app.

## 6. Frontend architecture

The frontend uses Expo Router with file-based routing.

### Important frontend routes

- `app/welcome.tsx`: landing page
- `app/(auth)/login.tsx`: user login
- `app/(auth)/signup.tsx`: user registration
- `app/(tabs)/index.tsx`: home page
- `app/(tabs)/dashboard.tsx`: family dashboard
- `app/(tabs)/settings.tsx`: settings and privacy page
- `app/medications.tsx`: medication tracker
- `app/admin.tsx`: admin console
- `app/member/[id].tsx`: individual family member details
- `app/profile.tsx`: profile view

### Frontend design decisions

- Theme support is centralized in `src/theme-mode.tsx`
- User preferences such as notifications and magnification are stored in `src/prefs.ts`
- Secure local persistence is handled with `expo-secure-store`
- The UI has been adjusted to support both dark mode and light mode consistently
- Page transitions between tabs use Expo Router tab animation settings

## 7. Backend architecture

The backend is implemented in `server/main.py` using FastAPI.

### Backend responsibilities

- authentication and token validation
- health metric storage and summaries
- family membership and goals
- consent handling
- alerts
- NHS recommendation building
- preventive care output
- medication management
- admin review workflows
- export and deletion actions

### Main API groups

#### Authentication

- `POST /auth/signup`
- `POST /auth/login`
- `POST /admin/login`

#### User profile and metrics

- `GET /me`
- `PUT /me`
- `GET /me/summary`
- `GET /me/metrics/history`
- `PUT /me/metrics`

#### Medications

- `GET /me/medications`
- `POST /me/medications`
- `PUT /me/medications/{medication_id}`
- `DELETE /me/medications/{medication_id}`
- `GET /me/medications/{medication_id}/logs`
- `POST /me/medications/{medication_id}/logs`

#### Recommendations, alerts, and preventive care

- `GET /me/alerts`
- `POST /me/alerts/mark-read`
- `GET /me/recommendations`
- `GET /users/{user_id}/recommendations`
- `GET /me/preventive-care`
- `GET /users/{user_id}/preventive-care`

#### Family features

- `GET /family`
- `GET /family/members/{user_id}`
- `POST /family/join`
- `POST /family/leave`
- `GET /family/goals`
- `PUT /family/goals`
- `GET /family/chat/messages`
- `POST /family/chat/messages`
- `GET /me/share-code`
- `POST /me/share-code/rotate`

#### Privacy and export

- `GET /me/export`
- `DELETE /me/data`
- `DELETE /me`

#### Admin

- `GET /admin/deletion-requests`
- `POST /admin/deletion-requests/{request_id}/approve`
- `POST /admin/deletion-requests/{request_id}/reject`
- `GET /admin/overview`
- `GET /admin/users`
- `PUT /admin/users/{user_id}/role`
- `GET /admin/families`
- `GET /admin/alerts`

## 8. Database design

The backend uses SQLAlchemy ORM with MySQL. Tables are created from the model definitions in `server/main.py`.

### Main tables and purpose

- `users`: stores profile identity and role label
- `families`: stores family groups and owner user
- `family_members`: links users to families
- `family_goals`: stores shared family goals such as steps and sleep
- `family_chat_messages`: stores family discussion posts/messages
- `metric_entries`: stores logged health metrics
- `share_codes`: stores family invite/share codes
- `metric_consent`: stores per-metric sharing consent
- `alerts`: stores generated alert messages
- `medications`: stores medication schedules and refill settings
- `medication_logs`: stores taken/missed medication actions
- `auth_users`: stores login email and password hash data
- `auth_tokens`: stores user auth tokens
- `admin_tokens`: stores admin auth tokens
- `data_deletion_requests`: stores pending, approved, or rejected delete requests

## 9. Important implementation details

### 9.1 Theme and accessibility

CheckMi includes accessibility-oriented preferences:

- light mode
- dark mode
- system theme mode
- magnified cards mode

Theme state is managed centrally and persisted locally, which makes the visual experience consistent across pages.

### 9.2 Avatar consistency

The app uses shared avatar helper logic so user initials and avatar colors stay consistent across the home page, dashboard, settings, and member views.

### 9.3 PDF export

The backend returns structured export data through `/me/export`. The settings screen converts this into a readable PDF so the exported file is human-friendly rather than raw JSON.

### 9.4 Medication reminder logic

Medication scheduling is based on one or more `HH:MM` times stored for each medication. The backend calculates:

- next reminder time
- due-soon state
- refill warnings
- adherence percentages over recent periods

### 9.5 Family privacy model

One of the strongest design choices in the app is that family sharing is not all-or-nothing. Users can share selected metrics while keeping others private. This is important for trust and ethical handling of personal health data.

## 10. External integration

### NHS content

The app uses NHS Live Well related content through the backend.

Purpose:

- to provide trustworthy, recognizable health advice
- to connect metric patterns to practical suggestions
- to improve the usefulness of the recommendation feature

Important note:

- the feature requires `NHS_API_KEY`
- if NHS content is unavailable, the app falls back to a general recommendation response

This is an important point to discuss in a report because it shows both integration value and reliability planning.

## 11. Security and privacy considerations

Important security/privacy measures in the current implementation:

- token-based authenticated API access
- admin-only review of deletion requests
- consent-controlled family data sharing
- local storage of preferences and tokens using SecureStore
- PDF export under user control

Current limitations to acknowledge:

- the database URL is currently hardcoded in the backend
- the admin login uses fixed credentials unless overridden by environment variables
- token management is custom and could be strengthened further in a production system

## 12. Accessibility features

Accessibility-related work already present in the app includes:

- dark mode
- brighter typography in dark mode
- magnification mode
- clearer card sizing for readability
- PDF export that presents information in a more readable format

Potential future improvements:

- screen reader-specific labels and roles
- high contrast mode
- text size presets beyond current magnification mode
- voice input for data entry

## 13. Testing and validation

Detailed white-box and black-box test cases are documented in [TESTING_PLAN.md](/Users/mithu/CheckMi/docs/TESTING_PLAN.md).

Useful validation commands for the project are:

```bash
npx tsc --noEmit
npm run lint
python3 -m py_compile server/main.py
```

At this stage, the project mainly relies on static validation and manual feature testing. That is acceptable for a student project, but in a report it is worth noting that automated integration and unit tests would be a valuable next step.

## 14. Known limitations

The main limitations to document are:

- backend logic is concentrated in a single `main.py` file
- configuration is only partly environment-driven
- NHS recommendation behavior depends on the external service and mapping logic
- admin authentication is functional but basic
- the app would benefit from a fuller automated test suite

## 15. Suggested future improvements

- move backend configuration fully into environment variables
- split backend into routers, services, and models for maintainability
- add push notifications for medication reminders
- add stronger admin audit logging
- improve recommendation coverage for all health metrics
- add automated testing
- add Apple Health or Google Fit integration

## 16. Suggested report structure

If you are writing an academic or project report, this structure will fit the app well:

1. Introduction
2. Problem statement
3. Aims and objectives
4. Requirements
5. System design
6. Implementation
7. API and database design
8. Accessibility, privacy, and security
9. Testing and evaluation
10. Limitations
11. Future work
12. Conclusion

## 17. Short summary for a report

CheckMi is a family-focused health monitoring mobile application built with Expo React Native, FastAPI, and MySQL. It enables users to record health metrics, receive NHS-based recommendations, manage medications, share selected data with family members through consent settings, communicate in a family dashboard, and request data-related actions that are reviewed by an admin. The system places strong emphasis on usability, privacy, accessibility, and practical health support.

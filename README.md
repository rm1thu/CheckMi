# CheckMi

CheckMi is a mobile health monitoring app built with Expo React Native and a FastAPI backend. It helps users track everyday health metrics, share selected information with family members, receive NHS-based guidance, manage medications, and request data actions through an admin approval workflow.

## What the app does

- Tracks core health metrics: heart rate, weight, steps, sleep, blood glucose, blood pressure, and cholesterol
- Supports family groups with invite/share codes, role labels, member snapshots, and shared family goals
- Provides recommendations and preventive care guidance using NHS-linked content
- Includes a medication adherence tracker with schedules, refill warnings, and taken/missed logs
- Offers alerts, consent-based metric sharing, PDF data export, and admin-reviewed deletion requests
- Supports light mode, dark mode, and magnified cards for accessibility

## Main screens

- `Welcome`, `Login`, `Signup`
- `Home` for personal metrics, recommendations, preventive care, goals, and quick actions
- `Dashboard` for family overview, family member snapshots, goals, and family chat/forum
- `Settings` for profile, theme, accessibility, export, privacy, and account/data actions
- `Medications` for medication schedules and adherence
- `Admin` for overview, user management, family monitoring, alerts, and request approvals

## Tech stack

- Frontend: Expo, React Native, TypeScript, Expo Router
- Backend: FastAPI, SQLAlchemy, Pydantic
- Database: MySQL
- Local storage: `expo-secure-store`
- Device/document features: Expo FileSystem, Sharing, Linking
- External integration: NHS Live Well API content

## Project structure

```text
app/                 Expo Router screens
components/          shared UI components
src/                 auth, API, theme, preferences, avatar helpers
server/main.py       FastAPI app, models, helpers, endpoints
docs/                project documentation for report/write-up use
```

## Run locally

### 1. Install dependencies

```bash
npm install
```

### 2. Start the backend

The backend is defined in `server/main.py` and currently expects a local MySQL database called `CheckMi`.

Important current backend configuration:

- Database URL is set in code as `mysql+pymysql://root:@localhost:3306/CheckMi`
- Admin login defaults:
  - username: `admin`
  - password: `admin123`
- These admin credentials can be overridden with:
  - `CHECKMI_ADMIN_USERNAME`
  - `CHECKMI_ADMIN_PASSWORD`
- NHS recommendations require `NHS_API_KEY`

Example backend run command:

```bash
uvicorn server.main:app --reload
```

### 3. Start the Expo app

The package scripts already force `TMPDIR=/tmp`, which helps avoid Metro cache permission problems on macOS.

```bash
npm run start
```

You can also use:

```bash
npm run ios
npm run android
npm run web
```

## Useful documentation

- Full project documentation: [docs/PROJECT_DOCUMENTATION.md](/Users/mithu/CheckMi/docs/PROJECT_DOCUMENTATION.md)
- White-box and black-box testing plan: [docs/TESTING_PLAN.md](/Users/mithu/CheckMi/docs/TESTING_PLAN.md)

## Validation commands

```bash
npx tsc --noEmit
npm run lint
python3 -m py_compile server/main.py
```

## Current implementation notes

- The backend creates tables automatically with SQLAlchemy on startup
- Theme preference and accessibility preferences are stored locally with SecureStore
- Data export is generated as a readable PDF on the frontend using the backend export payload
- Account deletion and data deletion are request-based and require admin approval
- NHS-based recommendations fall back to generic guidance if the live service is unavailable

## Known limitations

- The database URL is hardcoded and should be moved fully to environment variables
- Authentication uses custom token tables rather than a more complete auth provider
- NHS recommendation coverage depends on available mappings and NHS API availability
- The backend is currently implemented in a single `main.py`, which works for a project build but is not ideal for long-term maintainability

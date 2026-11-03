# Arshith Connect

> **Enterprise Workforce Management, Real-Time Attendance Tracking & Administration Platform**

Arshith Connect is an integrated full-stack enterprise workforce management platform featuring a **Native Android Application**, a modern **React Web Application**, a high-performance **FastAPI REST Service**, and **Firebase Cloud Functions** with PostgreSQL and Firebase Firestore integration.

---

## 📁 Repository Structure

```text
Arshith-Connect/
├── android/              # Native Android App (Java, Gradle, ViewBinding, Firebase SDK)
├── frontend/             # React 19 + Vite Web Application (Modular Pure CSS, Lucide Icons)
├── backend/              # FastAPI + SQLAlchemy 2.0 + Alembic REST API Service
├── functions/            # Firebase Cloud Functions (v2) for Event Triggers & Notifications
├── firebase.json         # Firebase Configuration (Firestore, Storage, Functions, Hosting)
├── firestore.rules       # Cloud Firestore Security Rules
├── firestore.indexes.json# Firestore Composite Indexes
├── storage.rules         # Firebase Cloud Storage Security Rules
├── .firebaserc           # Firebase Project Configuration
└── README.md             # Project Documentation
```

---

## 🚀 Key Modules & Capabilities

### 📱 Android Application (`android/`)
- **Employee Portal**:
  - GPS-verified Check In (WFO requires 100m office geofence & selfie camera capture; WFH bypasses photo/GPS).
  - Daily Punch Out with duration logging.
  - Leave Applications (Casual, Sick, Earned) with real-time status.
  - Scheduled daily work updates across 4 distinct shift timeframes.
  - Organization announcements and Jitsi Meet video conference integration.
- **Admin Portal**:
  - Real-time workforce dashboard (Present, Late, WFH, WFO, Leaves).
  - Employee approval workflow (authorizes `pending` accounts).
  - Leave request approvals and rejections with automated notifications.
  - Office timings configuration (thresholds, grace periods, office GPS coordinates).
  - Monthly attendance summaries and CSV report exports.

### 💻 Web Application (`frontend/`)
- Built with **React 19**, **Vite**, **React Router v7**, and **Lucide React**.
- Modular Vanilla CSS with design tokens, responsive layout, and glassmorphism styling.
- Admin management dashboards, employee lists, holiday management, and work assignment boards.
- Web-based attendance check-in modal with webcam selfie capture and browser geolocation.
- Video meetings, circulars, and daily standup reviews.

### ⚡ REST API Backend (`backend/`)
- High-performance **FastAPI** service with **SQLAlchemy 2.0** ORM and **Alembic** migrations.
- Role-based JWT authentication, Pydantic v2 schemas, and PostgreSQL storage.
- Comprehensive test suite covering attendance, leaves, announcements, and assignments.

### 🔔 Cloud Functions (`functions/`)
- Firebase Cloud Functions v2 (Node.js) triggered on Firestore document events.
- Automated email dispatch via **Nodemailer** (SMTP).
- Instant SMS notifications via **Twilio** upon employee registration approval or rejection.

---

## 🛠️ Technology Stack

- **Frontend**:
  - Framework: React.js 19 (ESModules, JSX)
  - Tooling: Vite 8
  - Routing: React Router DOM v7
  - Styling: Pure Vanilla Modular CSS (Design tokens with CSS custom properties)
  - Icons: Lucide React
  - HTTP Client: Axios with automatic JWT Bearer token request interceptor
- **Backend**:
  - Framework: Python 3.13 & FastAPI
  - ASGI Server: Uvicorn
  - ORM: SQLAlchemy 2.0
  - Database Driver: Psycopg 3 (`postgresql+psycopg://...`)
  - Database Migrations: Alembic
  - Data Validation: Pydantic v2
  - Authentication: JWT tokens (`pyjwt`) & Secure password hashing (`bcrypt`)
- **Database & Cloud**:
  - PostgreSQL 18.4 (`arshith_connect_db`)
  - Google Cloud / Firebase Firestore & Storage
- **Testing**:
  - Pytest (`pytest`, `httpx`)

---

## 🗄️ PostgreSQL Database Setup

1. **Database Name**: `arshith_connect_db`
2. **Local PostgreSQL Connection URL**:
   ```text
   postgresql+psycopg://postgres:Ameen9080@localhost:5432/arshith_connect_db
   ```
3. **Database Tables**:
   - `users`: Core authentication identity, role (`admin` | `employee`), hashed passwords.
   - `employees`: Roster details, code, department, designation, joining date, status.
   - `attendance`: Attendance date, check-in, check-out, work mode (`WFO` | `WFH`), status (`Present` | `Late` | `Absent`).
   - `leaves`: Leave type, date boundaries, duration, reason, status (`Pending` | `Approved` | `Rejected`), reviewer.
   - `holidays`: Annual corporate observed calendar, holiday type, date, description.
   - `meetings`: Title, date, time, duration, organizer, platform, meeting link.
   - `announcements`: Broadcast circulars, author, priority (`High` | `Normal`), message body.
   - `teams`: Department teams, descriptions, team leaders.
   - `team_members`: Staff assignments to teams.
   - `work_assignments`: Task delegation, priority, deadlines, progress tracking (0-100%).
   - `work_updates`: Daily standup submissions, completed tasks, impediments/blockers.
   - `registration_requests`: Pending employee account applications.
   - `office_timings`: Regular hours and special occasion schedules with late grace periods.

---

## 🔐 Seed Credentials

The database is seeded on startup with default test accounts:

### Administrator Account
- **Email**: `admin@arshith.com`
- **Password**: `AdminPassword@123`
- **Portal URL**: `http://localhost:5173/admin/login`

### Employee Account
- **Email**: `employee@arshith.com`
- **Password**: `Employee@123`
- **Portal URL**: `http://localhost:5173/login`

---

## 🚀 Running the Project

### Prerequisites
- **Node.js**: v18 or later (`node -v`)
- **npm**: v9 or later (`npm -v`)
- **Python**: v3.10+ (v3.12 or v3.13 recommended)
- **Database**: Firebase Firestore (configured in `.env`) or local PostgreSQL 15+

---

### 1. FastAPI Backend (`backend/`)
```powershell
cd backend

# Create and activate virtual environment
python -m venv .venv
# On Windows:
.\.venv\Scripts\Activate.ps1
# On macOS / Linux:
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
# Copy .env.example to .env and configure your Firebase / DB keys
copy .env.example .env

# Run database migrations (if using PostgreSQL)
alembic upgrade head

# Start API server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
- API Base URL: `http://127.0.0.1:8000`
- Interactive Swagger Docs: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/health`

---

### 2. Web Frontend (`frontend/`)
```powershell
cd frontend

# Install dependencies
npm install

# Configure environment variables
# Copy .env.example to .env and verify VITE_API_BASE_URL=http://127.0.0.1:8000
copy .env.example .env

# Start Vite dev server
npm run dev
```
- Web Application URL: `http://localhost:5173`

### 3. Android Application (`android/`)
1. Open [`android/`](android/) in **Android Studio**.
2. Configure `local.properties` with your Android SDK location.
3. Build & run:
   ```bash
   ./gradlew assembleDebug
   ```

### 4. Firebase Cloud Functions (`functions/`)
```bash
cd functions
npm install
npm run serve  # Local emulator
firebase deploy --only functions
```

---

## 🔒 Security & Rules
- **Firestore Rules**: Strict RBAC ensuring employees can only access their own records while admins have supervisory access.
- **Storage Rules**: Guard profile photos and check-in camera captures.

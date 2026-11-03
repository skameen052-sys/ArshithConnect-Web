from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
import os
from fastapi import FastAPI, Request, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.firebase import init_firebase, is_firebase_live
from app.services.init_firestore import init_firestore_seed
from app.db.session import check_db_connection, SessionLocal, close_db_connections, engine
from sqlalchemy import text

# Import all API Routers
from app.routers import (
    auth,
    employees,
    attendance,
    leaves,
    holidays,
    meetings,
    announcements,
    teams,
    assignments,
    work_updates,
    registration_requests,
    office_timings,
    reports,
    dashboard,
    salary_structures,
    payroll,
    payslips,
    payments,
    recruitment,
    performance,
    loans,
    separation,
    departments,
    audit,
    settings as settings_router,
    chat,
    notifications,
    payslip_requests,
)

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initializes Firebase Firestore, validates connectivity, and seeds default records."""
    logger.info(f"Starting Arshith Connect Backend with DATABASE_BACKEND='{settings.DATABASE_BACKEND}'...")
    
    # 1. Initialize Firebase Admin SDK and Firestore
    try:
        init_firebase()
        if is_firebase_live():
            logger.info(f"Cloud Firestore connected successfully [Project: {settings.FIREBASE_PROJECT_ID}, Database: {settings.FIREBASE_DATABASE_NAME}].")
        else:
            logger.info("Firebase credentials pending; operational using local Firestore JSON store.")
        init_firestore_seed()
    except Exception as e:
        logger.error(f"Error during Firebase / Firestore initialization: {e}", exc_info=True)

    # 2. Check legacy PostgreSQL connection non-destructively
    try:
        if check_db_connection():
            logger.info("PostgreSQL database connection verified (legacy backend available).")
            try:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name VARCHAR(150);"))
                    conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_number VARCHAR(100);"))
                    conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS pan_number VARCHAR(50);"))
                    conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS uan_number VARCHAR(50);"))
                    conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS payslip_requests (
                            id SERIAL PRIMARY KEY,
                            request_code VARCHAR(50) UNIQUE,
                            employee_id VARCHAR(50) NOT NULL,
                            employee_name VARCHAR(150) NOT NULL,
                            employee_email VARCHAR(255) NOT NULL,
                            month INTEGER NOT NULL,
                            year INTEGER NOT NULL,
                            payslip_month VARCHAR(50) NOT NULL,
                            reason VARCHAR(150) NOT NULL,
                            additional_details TEXT,
                            status VARCHAR(50) DEFAULT 'PENDING' NOT NULL,
                            submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
                            reviewed_by VARCHAR(150),
                            reviewed_at TIMESTAMPTZ,
                            rejection_reason TEXT,
                            payslip_id VARCHAR(100),
                            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
                            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
                        );
                    """))
                    conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS work_schedules (
                            id SERIAL PRIMARY KEY,
                            schedule_id VARCHAR(50) UNIQUE NOT NULL,
                            name VARCHAR(100) NOT NULL,
                            section INTEGER NOT NULL,
                            work_start VARCHAR(20) NOT NULL,
                            work_end VARCHAR(20) NOT NULL,
                            work_start_display VARCHAR(20) NOT NULL,
                            work_end_display VARCHAR(20) NOT NULL,
                            work_schedule_str VARCHAR(100) NOT NULL,
                            window_start VARCHAR(20) NOT NULL,
                            window_end VARCHAR(20) NOT NULL,
                            window_start_display VARCHAR(20) NOT NULL,
                            window_end_display VARCHAR(20) NOT NULL,
                            submission_window_str VARCHAR(100) NOT NULL,
                            recurrence VARCHAR(50) DEFAULT 'Daily',
                            applicable_to VARCHAR(100) DEFAULT 'All',
                            is_active BOOLEAN DEFAULT TRUE,
                            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
                            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
                        );
                    """))
                    conn.execute(text("ALTER TABLE work_updates ADD COLUMN IF NOT EXISTS employee_email VARCHAR(255);"))
                    conn.execute(text("ALTER TABLE work_updates ADD COLUMN IF NOT EXISTS section INTEGER;"))
                    conn.execute(text("ALTER TABLE work_updates ADD COLUMN IF NOT EXISTS work_schedule VARCHAR(100);"))
                    conn.execute(text("ALTER TABLE work_updates ADD COLUMN IF NOT EXISTS submission_window VARCHAR(100);"))
                    conn.execute(text("ALTER TABLE work_updates ADD COLUMN IF NOT EXISTS schedule_name VARCHAR(100);"))
                    conn.execute(text("ALTER TABLE work_updates ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;"))
                    conn.execute(text("ALTER TABLE work_updates ADD COLUMN IF NOT EXISTS submitted_time VARCHAR(50);"))
                    conn.execute(text("ALTER TABLE work_updates ADD COLUMN IF NOT EXISTS firestore_path VARCHAR(255);"))
                    conn.commit()
            except Exception as mig_err:
                logger.warning(f"PostgreSQL column sync skipped or already applied: {mig_err}")
        else:
            logger.info("PostgreSQL is not actively connected (all application requests served via Firestore).")
    except Exception as e:
        logger.warning(f"PostgreSQL connection check skipped: {e}")

    yield

    logger.info("Shutting down Arshith Connect Backend Application...")
    try:
        close_db_connections()
    except Exception:
        pass


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Enterprise workforce attendance, employee management, and operations API for Arshith Connect powered by Firebase Firestore.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# Configure CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.FRONTEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files directory for assets and chat attachments
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(os.path.join(static_dir, "chat_uploads"), exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

from app.core.exceptions import DuplicateFieldsException, RegistrationValidationException

# Duplicate Fields Exception Handler
@app.exception_handler(DuplicateFieldsException)
async def duplicate_fields_exception_handler(request: Request, exc: DuplicateFieldsException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "errors": exc.errors,
        },
    )

# Registration Validation Exception Handler
@app.exception_handler(RegistrationValidationException)
async def registration_validation_exception_handler(request: Request, exc: RegistrationValidationException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "errors": exc.errors,
        },
    )


# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred. Please try again later."},
    )


# Health Check Endpoints
@app.get("/health", tags=["Health"])
@app.get(f"{settings.API_V1_STR}/health", tags=["Health"])
def health_check():
    """Verify application readiness and Firebase Firestore connectivity."""
    fb_live = is_firebase_live()
    return {
        "status": "healthy",
        "database_backend": settings.DATABASE_BACKEND,
        "firebase_project_id": settings.FIREBASE_PROJECT_ID,
        "firebase_database_name": settings.FIREBASE_DATABASE_NAME,
        "firestore_live": fb_live,
        "storage_bucket": settings.FIREBASE_STORAGE_BUCKET,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0",
    }


@app.get("/", tags=["Root"])
def root():
    return {
        "app": settings.PROJECT_NAME,
        "version": "1.0.0",
        "database_backend": settings.DATABASE_BACKEND,
        "documentation": "/docs",
        "status": "online",
    }


# Include Routers under API_V1_STR ("/api")
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(employees.router, prefix=settings.API_V1_STR)
app.include_router(attendance.router, prefix=settings.API_V1_STR)
app.include_router(leaves.router, prefix=settings.API_V1_STR)
app.include_router(holidays.router, prefix=settings.API_V1_STR)
app.include_router(meetings.router, prefix=settings.API_V1_STR)
app.include_router(announcements.router, prefix=settings.API_V1_STR)
app.include_router(teams.router, prefix=settings.API_V1_STR)
app.include_router(assignments.router, prefix=settings.API_V1_STR)
app.include_router(work_updates.router, prefix=settings.API_V1_STR)
app.include_router(work_updates.schedules_router, prefix=settings.API_V1_STR)
app.include_router(registration_requests.router, prefix=f"{settings.API_V1_STR}/registration-requests", tags=["Registration Requests"])
app.include_router(registration_requests.router, prefix=f"{settings.API_V1_STR}/admin/employee-registrations", tags=["Admin Employee Registrations"])
app.include_router(office_timings.router, prefix=settings.API_V1_STR)
app.include_router(reports.router, prefix=settings.API_V1_STR)
app.include_router(dashboard.router, prefix=settings.API_V1_STR)
app.include_router(salary_structures.router, prefix=settings.API_V1_STR)
app.include_router(payroll.router, prefix=settings.API_V1_STR)
app.include_router(payslips.router, prefix=settings.API_V1_STR)
app.include_router(payslip_requests.router, prefix=settings.API_V1_STR)
app.include_router(payslip_requests.admin_router, prefix=settings.API_V1_STR)
app.include_router(payments.router, prefix=settings.API_V1_STR)
app.include_router(recruitment.router, prefix=settings.API_V1_STR)
app.include_router(performance.router, prefix=settings.API_V1_STR)
app.include_router(loans.router, prefix=settings.API_V1_STR)
app.include_router(separation.router, prefix=settings.API_V1_STR)
app.include_router(departments.router, prefix=settings.API_V1_STR)
app.include_router(audit.router, prefix=settings.API_V1_STR)
app.include_router(settings_router.router, prefix=settings.API_V1_STR)
app.include_router(chat.router, prefix=settings.API_V1_STR)
app.include_router(notifications.router, prefix=settings.API_V1_STR)

# Aliases for Admin / Employee Dashboard direct access
@app.get(f"{settings.API_V1_STR}/admin/dashboard", tags=["Dashboards"])
def admin_dashboard_alias(res: dict = Depends(dashboard.get_admin_dashboard)):
    return res


@app.get(f"{settings.API_V1_STR}/employee/dashboard", tags=["Dashboards"])
def employee_dashboard_alias(res: dict = Depends(dashboard.get_employee_dashboard)):
    return res

from typing import Generator, Optional
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings

# Resilient connection arguments with short timeout to prevent blocking when PostgreSQL is offline
connect_args = {}
if "psycopg" in settings.DATABASE_URL:
    connect_args["connect_timeout"] = 3

# Engine with resilient, bounded connection pooling tailored for local/production stability
engine = create_engine(
    settings.DATABASE_URL,
    pool_size=5,
    max_overflow=2,
    pool_timeout=5,
    pool_pre_ping=True,
    pool_recycle=1800,
    connect_args=connect_args,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Optional[Session], None, None]:
    """Dependency that provides a clean, request-scoped SQLAlchemy session with guaranteed rollback and cleanup."""
    if settings.DATABASE_BACKEND == "firebase":
        yield None
        return

    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def check_db_connection() -> bool:
    """Verify database connectivity at startup or health checks."""
    if settings.DATABASE_BACKEND == "firebase":
        from app.services.firestore_service import FirestoreService
        return FirestoreService.is_available()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def close_db_connections() -> None:
    """Safely dispose of connection pool during application shutdown."""
    engine.dispose()

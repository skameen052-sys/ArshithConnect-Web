from datetime import datetime, date, timezone
from typing import Optional
from sqlalchemy import Integer, String, Text, Date, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class WorkUpdate(Base):
    __tablename__ = "work_updates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    update_code: Mapped[Optional[str]] = mapped_column(String(50), unique=True, index=True, nullable=True)  # "UPD-001"
    employee_id: Mapped[Optional[str]] = mapped_column(String(50), index=True, nullable=True)
    employee_name: Mapped[str] = mapped_column(String(100), nullable=False)
    employee_email: Mapped[Optional[str]] = mapped_column(String(255), index=True, nullable=True)
    date: Mapped[date] = mapped_column(Date, default=date.today, index=True, nullable=False)
    time: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    section: Mapped[Optional[int]] = mapped_column(Integer, index=True, nullable=True)  # 1, 2, 3, 4
    work_schedule: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    submission_window: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    schedule_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tag: Mapped[str] = mapped_column(String(100), default="Operations", nullable=False)
    tasks_completed: Mapped[str] = mapped_column(Text, nullable=False)
    blockers: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="None")
    submitted_time: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    firestore_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

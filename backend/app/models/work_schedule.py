from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Integer, String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class WorkSchedule(Base):
    """
    SQLAlchemy model for Daily Work Update Schedules.
    Allows administrators to configure daily submission windows and work times.
    """
    __tablename__ = "work_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    schedule_id: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)  # "SCH-01"
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # "Work Update 01"
    section: Mapped[int] = mapped_column(Integer, nullable=False)  # 1, 2, 3, 4
    work_start: Mapped[str] = mapped_column(String(20), nullable=False)  # "09:30"
    work_end: Mapped[str] = mapped_column(String(20), nullable=False)  # "11:00"
    work_start_display: Mapped[str] = mapped_column(String(20), nullable=False)  # "9:30 AM"
    work_end_display: Mapped[str] = mapped_column(String(20), nullable=False)  # "11:00 AM"
    work_schedule_str: Mapped[str] = mapped_column(String(100), nullable=False)  # "9:30 AM - 11:00 AM"

    window_start: Mapped[str] = mapped_column(String(20), nullable=False)  # "10:30"
    window_end: Mapped[str] = mapped_column(String(20), nullable=False)  # "11:00"
    window_start_display: Mapped[str] = mapped_column(String(20), nullable=False)  # "10:30 AM"
    window_end_display: Mapped[str] = mapped_column(String(20), nullable=False)  # "11:00 AM"
    submission_window_str: Mapped[str] = mapped_column(String(100), nullable=False)  # "10:30 AM - 11:00 AM"

    recurrence: Mapped[str] = mapped_column(String(50), default="Daily", nullable=False)
    applicable_to: Mapped[str] = mapped_column(String(100), default="All", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

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


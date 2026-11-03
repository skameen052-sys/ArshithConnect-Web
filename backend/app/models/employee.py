from datetime import datetime, date, timezone
from typing import Optional, List
from sqlalchemy import Integer, String, Float, Date, DateTime, ForeignKey, Index, text, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = (
        Index(
            "uq_employees_phone",
            "phone",
            unique=True,
            postgresql_where=text("phone IS NOT NULL AND phone != '' AND phone != '--'"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    employee_id: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, unique=True
    )
    full_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="--")
    department: Mapped[str] = mapped_column(String(100), nullable=False, default="Operations", index=True)
    designation: Mapped[str] = mapped_column(String(100), nullable=False, default="Team Member")
    joining_date: Mapped[date] = mapped_column(Date, default=date.today, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)  # "Active", "Inactive", "On Leave"
    shift: Mapped[str] = mapped_column(String(100), default="General (09:00 AM - 06:00 PM)", nullable=False)
    location: Mapped[str] = mapped_column(String(100), default="HQ Office", nullable=False)
    attendance_percentage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bank_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True, default=None)
    account_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default=None)
    pan_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default=None)
    uan_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default=None)
    profile_photo: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)

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

    # Relationships
    user = relationship("User", back_populates="employee")
    attendances = relationship("Attendance", back_populates="employee", cascade="all, delete-orphan")
    leaves = relationship("Leave", back_populates="employee", cascade="all, delete-orphan")

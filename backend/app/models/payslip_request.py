from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Integer, String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class PayslipRequest(Base):
    """
    SQLAlchemy model for Employee Payslip Download Requests.
    Maintains complete audit lifecycle: submission -> admin review -> approval/rejection -> secure unlock.
    """
    __tablename__ = "payslip_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    request_code: Mapped[Optional[str]] = mapped_column(String(50), unique=True, index=True, nullable=True)  # e.g. "PSR-202610-001"
    employee_id: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    employee_name: Mapped[str] = mapped_column(String(150), nullable=False)
    employee_email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    payslip_month: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. "October 2026"
    reason: Mapped[str] = mapped_column(String(150), nullable=False)
    additional_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="PENDING", index=True, nullable=False)  # "PENDING", "APPROVED", "REJECTED"
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payslip_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

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


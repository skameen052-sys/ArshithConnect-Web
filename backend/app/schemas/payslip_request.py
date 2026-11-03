from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class PayslipRequestCreate(BaseModel):
    month: int = Field(..., ge=1, le=12, description="Target salary month (1-12)")
    year: int = Field(..., ge=2020, le=2030, description="Target salary year")
    reason: str = Field(..., min_length=2, max_length=150, description="Category / reason for download request")
    additional_details: Optional[str] = Field(None, max_length=500, description="Optional extra justification (max 500 chars)")


class PayslipRequestApprove(BaseModel):
    notes: Optional[str] = Field(None, max_length=500, description="Administrative authorization notes")


class PayslipRequestReject(BaseModel):
    rejection_reason: str = Field(..., min_length=3, max_length=500, description="Mandatory administrative justification for declining request")


class PayslipRequestResponse(BaseModel):
    id: str
    request_code: Optional[str] = None
    employee_id: str
    employee_name: str
    employee_email: str
    month: int
    year: int
    payslip_month: str
    reason: str
    additional_details: Optional[str] = None
    status: str
    submitted_at: str
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    payslip_id: Optional[str] = None
    file_available: bool = False
    download_url: Optional[str] = None

    class Config:
        from_attributes = True


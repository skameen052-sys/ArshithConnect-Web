from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class EmployeeBase(BaseModel):
    name: Optional[str] = None
    fullName: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = "--"
    role: Optional[str] = None
    designation: Optional[str] = None
    dept: Optional[str] = None
    department: Optional[str] = None
    shift: Optional[str] = "General (09:00 AM - 06:00 PM)"
    location: Optional[str] = "HQ Office"
    bank_name: Optional[str] = None
    bankName: Optional[str] = None
    account_number: Optional[str] = None
    accountNumber: Optional[str] = None
    pan_number: Optional[str] = None
    panNumber: Optional[str] = None
    pan: Optional[str] = None
    uan_number: Optional[str] = None
    uanNumber: Optional[str] = None
    uan: Optional[str] = None
    pf_number: Optional[str] = None
    profile_photo: Optional[str] = None
    profilePhoto: Optional[str] = None


class EmployeeCreate(BaseModel):
    id: Optional[str] = None
    employeeId: Optional[str] = None
    name: Optional[str] = None
    fullName: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = "--"
    role: Optional[str] = "Team Member"
    designation: Optional[str] = None
    dept: Optional[str] = "Operations"
    department: Optional[str] = None
    status: Optional[str] = "Active"
    shift: Optional[str] = "General (09:00 AM - 06:00 PM)"
    location: Optional[str] = "HQ Office"
    bank_name: Optional[str] = None
    bankName: Optional[str] = None
    account_number: Optional[str] = None
    accountNumber: Optional[str] = None
    pan_number: Optional[str] = None
    panNumber: Optional[str] = None
    pan: Optional[str] = None
    uan_number: Optional[str] = None
    uanNumber: Optional[str] = None
    uan: Optional[str] = None
    pf_number: Optional[str] = None
    profile_photo: Optional[str] = None
    profilePhoto: Optional[str] = None


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    fullName: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    designation: Optional[str] = None
    dept: Optional[str] = None
    department: Optional[str] = None
    status: Optional[str] = None
    shift: Optional[str] = None
    location: Optional[str] = None
    bank_name: Optional[str] = None
    bankName: Optional[str] = None
    account_number: Optional[str] = None
    accountNumber: Optional[str] = None
    pan_number: Optional[str] = None
    panNumber: Optional[str] = None
    pan: Optional[str] = None
    uan_number: Optional[str] = None
    uanNumber: Optional[str] = None
    uan: Optional[str] = None
    pf_number: Optional[str] = None
    profile_photo: Optional[str] = None
    profilePhoto: Optional[str] = None


class EmployeeResponse(BaseModel):
    id: str
    employeeId: str
    name: str
    fullName: str
    email: str
    phone: str
    role: str
    designation: str
    dept: str
    department: str
    status: str
    joining: str
    shift: str
    location: str
    attendancePercentage: Optional[float] = None
    bank_name: Optional[str] = None
    bankName: Optional[str] = None
    account_number: Optional[str] = None
    accountNumber: Optional[str] = None
    pan_number: Optional[str] = None
    panNumber: Optional[str] = None
    pan: Optional[str] = None
    uan_number: Optional[str] = None
    uanNumber: Optional[str] = None
    uan: Optional[str] = None
    pf_number: Optional[str] = None
    profile_photo: Optional[str] = None
    profilePhoto: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

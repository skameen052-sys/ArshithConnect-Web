from datetime import date, datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict


class WorkScheduleBase(BaseModel):
    schedule_id: str
    name: str
    section: int
    work_start: str  # "09:30"
    work_end: str    # "11:00"
    work_start_display: Optional[str] = None
    work_end_display: Optional[str] = None
    work_schedule_str: Optional[str] = None

    window_start: str  # "10:30"
    window_end: str    # "11:00"
    window_start_display: Optional[str] = None
    window_end_display: Optional[str] = None
    submission_window_str: Optional[str] = None

    recurrence: Optional[str] = "Daily"
    applicable_to: Optional[str] = "All"
    is_active: bool = True


class WorkScheduleCreate(BaseModel):
    name: str
    section: int
    work_start: str
    work_end: str
    window_start: str
    window_end: str
    recurrence: Optional[str] = "Daily"
    applicable_to: Optional[str] = "All"
    is_active: Optional[bool] = True


class WorkScheduleUpdate(BaseModel):
    name: Optional[str] = None
    section: Optional[int] = None
    work_start: Optional[str] = None
    work_end: Optional[str] = None
    window_start: Optional[str] = None
    window_end: Optional[str] = None
    recurrence: Optional[str] = None
    applicable_to: Optional[str] = None
    is_active: Optional[bool] = None


class WorkScheduleResponse(WorkScheduleBase):
    id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    # Dynamic status fields when queried for an employee today
    status: Optional[str] = None  # "submitted" | "open" | "upcoming" | "closed"
    status_text: Optional[str] = None
    button_text: Optional[str] = None
    is_open: Optional[bool] = False
    has_submitted: Optional[bool] = False
    submission_details: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)


class WorkUpdateSubmission(BaseModel):
    scheduleId: Optional[str] = None
    section: int  # 1, 2, 3, 4
    workSchedule: Optional[str] = None
    submissionWindow: Optional[str] = None
    scheduleName: Optional[str] = None
    updateText: str
    date: Optional[str] = None


class WorkUpdateLegacyCreate(BaseModel):
    empName: Optional[str] = None
    employeeName: Optional[str] = None
    employeeId: Optional[str] = None
    updateText: Optional[str] = None
    tasksCompleted: Optional[str] = None
    blockers: Optional[str] = "None"
    tag: Optional[str] = "Operations"


class WorkUpdateItem(BaseModel):
    id: str
    documentId: str
    firestorePath: Optional[str] = None
    employeeId: Optional[str] = None
    employeeName: str
    employeeEmail: Optional[str] = None
    date: str
    section: Optional[int] = None
    workSchedule: Optional[str] = "-"
    submissionWindow: Optional[str] = "-"
    scheduleName: Optional[str] = None
    update: str
    submittedAt: Optional[str] = None
    submittedTime: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

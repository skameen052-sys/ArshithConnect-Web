from datetime import datetime, date, timezone
from typing import List, Optional, Dict, Any
from zoneinfo import ZoneInfo
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.firebase import get_firestore_client, is_firebase_live
from app.db.session import get_db, SessionLocal
from app.dependencies.auth import get_current_user, get_current_admin
from app.services.firestore_service import firestore_service
from app.schemas.work_update import (
    WorkScheduleBase,
    WorkScheduleCreate,
    WorkScheduleUpdate,
    WorkScheduleResponse,
    WorkUpdateSubmission,
    WorkUpdateLegacyCreate,
)

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/work-updates", tags=["Work Updates"])
schedules_router = APIRouter(prefix="/work-schedules", tags=["Work Schedules"])

IST = ZoneInfo("Asia/Kolkata")

# Canonical default schedules (in case database has not yet been seeded)
DEFAULT_SCHEDULES = [
    {
        "schedule_id": "SCH-01",
        "name": "Work Update 01",
        "section": 1,
        "work_start": "09:30",
        "work_end": "11:00",
        "work_start_display": "9:30 AM",
        "work_end_display": "11:00 AM",
        "work_schedule_str": "9:30 AM - 11:00 AM",
        "window_start": "10:30",
        "window_end": "11:00",
        "window_start_display": "10:30 AM",
        "window_end_display": "11:00 AM",
        "submission_window_str": "10:30 AM - 11:00 AM",
        "recurrence": "Daily",
        "applicable_to": "All",
        "is_active": True,
    },
    {
        "schedule_id": "SCH-02",
        "name": "Work Update 02",
        "section": 2,
        "work_start": "11:15",
        "work_end": "13:00",
        "work_start_display": "11:15 AM",
        "work_end_display": "1:00 PM",
        "work_schedule_str": "11:15 AM - 1:00 PM",
        "window_start": "12:30",
        "window_end": "13:00",
        "window_start_display": "12:30 PM",
        "window_end_display": "1:00 PM",
        "submission_window_str": "12:30 PM - 1:00 PM",
        "recurrence": "Daily",
        "applicable_to": "All",
        "is_active": True,
    },
    {
        "schedule_id": "SCH-03",
        "name": "Work Update 03",
        "section": 3,
        "work_start": "14:00",
        "work_end": "16:00",
        "work_start_display": "2:00 PM",
        "work_end_display": "4:00 PM",
        "work_schedule_str": "2:00 PM - 4:00 PM",
        "window_start": "15:30",
        "window_end": "16:00",
        "window_start_display": "3:30 PM",
        "window_end_display": "4:00 PM",
        "submission_window_str": "3:30 PM - 4:00 PM",
        "recurrence": "Daily",
        "applicable_to": "All",
        "is_active": True,
    },
    {
        "schedule_id": "SCH-04",
        "name": "Work Update 04",
        "section": 4,
        "work_start": "16:15",
        "work_end": "18:00",
        "work_start_display": "4:15 PM",
        "work_end_display": "6:00 PM",
        "work_schedule_str": "4:15 PM - 6:00 PM",
        "window_start": "18:00",
        "window_end": "18:30",
        "window_start_display": "6:00 PM",
        "window_end_display": "6:30 PM",
        "submission_window_str": "6:00 PM - 6:30 PM",
        "recurrence": "Daily",
        "applicable_to": "All",
        "is_active": True,
    },
]


def time_to_minutes(t_str: str) -> int:
    """Parse time string like '10:30', '10:30 AM', '1:00 PM' into minutes since midnight."""
    if not t_str:
        return 0
    t_str = t_str.strip().upper()
    try:
        if "AM" in t_str or "PM" in t_str:
            dt = datetime.strptime(t_str, "%I:%M %p")
            return dt.hour * 60 + dt.minute
        parts = t_str.split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except Exception:
        return 0


def format_minutes_to_display(minutes: int) -> str:
    """Format minutes since midnight to '10:30 AM'."""
    h = (minutes // 60) % 24
    m = minutes % 60
    am_pm = "AM" if h < 12 else "PM"
    h12 = h % 12
    if h12 == 0:
        h12 = 12
    return f"{h12}:{m:02d} {am_pm}"


def get_current_ist() -> tuple[datetime, int, str]:
    """Get current datetime in Asia/Kolkata, minutes since midnight, and date string."""
    now_ist = datetime.now(IST)
    curr_min = now_ist.hour * 60 + now_ist.minute
    today_str = now_ist.strftime("%Y-%m-%d")
    return now_ist, curr_min, today_str


def get_all_schedules_from_db() -> List[dict]:
    """Retrieve schedules from Firestore, or fallback to default."""
    schedules = firestore_service.list_documents("work_schedules")
    if not schedules:
        return [dict(s) for s in DEFAULT_SCHEDULES]
    
    # Sort by section
    schedules.sort(key=lambda s: int(s.get("section", 99)))
    return schedules


def resolve_employee_info(current_user) -> dict:
    """Resolve authoritative employee details for current authenticated session."""
    user_id = str(getattr(current_user, "id", "") or getattr(current_user, "uid", ""))
    email = str(getattr(current_user, "email", "")).strip().lower()
    name = getattr(current_user, "full_name", None) or getattr(current_user, "name", None) or ""
    emp_id = getattr(current_user, "employee_id", None) or getattr(current_user, "employeeId", None) or ""

    # Check Firestore employees if missing name or emp_id
    if (not name or not emp_id) and email:
        matches = firestore_service.list_documents("employees", [("email", "==", email)])
        if matches:
            e = matches[0]
            name = name or e.get("full_name") or e.get("name") or e.get("employeeName") or ""
            emp_id = emp_id or e.get("employee_id") or e.get("employeeId") or ""

    if not name:
        name = email.split("@")[0].capitalize() if email else "Employee"

    return {
        "uid": user_id,
        "email": email,
        "name": name,
        "employee_id": emp_id or user_id,
    }


def calculate_availability(schedule: dict, current_minutes: int, has_submitted: bool) -> dict:
    """
    Calculate schedule status and button state matching mobile reference screenshots:
    A. Submitted: 'Work update submitted for today', button 'ALREADY SUBMITTED'
    B. Open: 'Update is available now • {window}', button 'SUBMIT WORK UPDATE'
    C. Upcoming: 'Available from {window_start}', button 'NOT AVAILABLE'
    D. Closed: 'Update window closed', button 'NOT AVAILABLE'
    """
    w_start = time_to_minutes(schedule.get("window_start", ""))
    w_end = time_to_minutes(schedule.get("window_end", ""))
    w_disp = schedule.get("submission_window_str") or f"{schedule.get('window_start_display')} - {schedule.get('window_end_display')}"
    w_start_disp = schedule.get("window_start_display") or format_minutes_to_display(w_start)

    if has_submitted:
        return {
            "status": "submitted",
            "status_text": "Work update submitted for today",
            "button_text": "ALREADY SUBMITTED",
            "is_open": False,
            "can_submit": False,
        }

    if not schedule.get("is_active", True):
        return {
            "status": "inactive",
            "status_text": "Schedule is currently inactive",
            "button_text": "NOT AVAILABLE",
            "is_open": False,
            "can_submit": False,
        }

    if current_minutes < w_start:
        return {
            "status": "upcoming",
            "status_text": f"Available from {w_disp}",
            "button_text": "NOT AVAILABLE",
            "is_open": False,
            "can_submit": False,
        }
    elif w_start <= current_minutes <= w_end:
        return {
            "status": "open",
            "status_text": f"Update is available now • {w_disp}",
            "button_text": "SUBMIT WORK UPDATE",
            "is_open": True,
            "can_submit": True,
        }
    else:
        return {
            "status": "closed",
            "status_text": "Update window closed",
            "button_text": "NOT AVAILABLE",
            "is_open": False,
            "can_submit": False,
        }


# =====================================================================
# EMPLOYEE: TODAY'S SCHEDULES & AVAILABILITY
# =====================================================================

@router.get("/today-schedules")
def get_today_schedules_for_employee(current_user=Depends(get_current_user)):
    """
    Return today's work schedules configured by admin along with the employee's
    submission status and real-time availability window (Asia/Kolkata).
    """
    emp = resolve_employee_info(current_user)
    uid = emp["uid"]
    email = emp["email"]
    now_ist, curr_min, today_str = get_current_ist()

    # Read existing submissions for this employee today from Firestore
    # Path: workUpdates/{uid}/dailyUpdates/{date}_section_{section}
    submissions_by_section = {}
    client = get_firestore_client()
    if client and uid:
        try:
            sub_refs = client.collection("workUpdates").document(uid).collection("dailyUpdates").where("date", "==", today_str).stream()
            for doc in sub_refs:
                d = doc.to_dict()
                sec = d.get("section")
                if sec is not None:
                    submissions_by_section[int(sec)] = d
        except Exception as e:
            logger.warning(f"Error fetching employee dailyUpdates from Firestore: {e}")

    # Fallback/supplement: check by email in collectionGroup if UID differed
    if not submissions_by_section and client and email:
        try:
            for doc in client.collection_group("dailyUpdates").stream():
                d = doc.to_dict()
                if d.get("date") == today_str and str(d.get("employeeEmail", "")).strip().lower() == email:
                    sec = d.get("section")
                    if sec is not None:
                        submissions_by_section[int(sec)] = d
        except Exception as e:
            logger.warning(f"Error checking dailyUpdates by email: {e}")

    # Also check local SQLite/PostgreSQL fallback if Firestore had no records
    if not submissions_by_section:
        try:
            db = SessionLocal()
            res = db.execute(
                text("SELECT section, tasks_completed, submitted_time, submitted_at FROM work_updates WHERE employee_email = :email AND date = :dt"),
                {"email": email, "dt": today_str}
            ).fetchall()
            for r in res:
                if r[0] is not None:
                    submissions_by_section[int(r[0])] = {
                        "section": r[0],
                        "update": r[1],
                        "submittedTime": r[2],
                    }
            db.close()
        except Exception:
            pass

    schedules = get_all_schedules_from_db()
    result = []
    for sch in schedules:
        sec = int(sch.get("section", 1))
        submission = submissions_by_section.get(sec)
        has_sub = submission is not None

        avail = calculate_availability(sch, curr_min, has_sub)

        item = {
            "id": sch.get("schedule_id") or str(sch.get("id", "")),
            "schedule_id": sch.get("schedule_id", f"SCH-0{sec}"),
            "name": sch.get("name", f"Work Update 0{sec}"),
            "section": sec,
            "work_start": sch.get("work_start", "09:30"),
            "work_end": sch.get("work_end", "11:00"),
            "work_start_display": sch.get("work_start_display", "9:30 AM"),
            "work_end_display": sch.get("work_end_display", "11:00 AM"),
            "work_schedule_str": sch.get("work_schedule_str", "9:30 AM - 11:00 AM"),
            "window_start": sch.get("window_start", "10:30"),
            "window_end": sch.get("window_end", "11:00"),
            "window_start_display": sch.get("window_start_display", "10:30 AM"),
            "window_end_display": sch.get("window_end_display", "11:00 AM"),
            "submission_window_str": sch.get("submission_window_str", "10:30 AM - 11:00 AM"),
            "recurrence": sch.get("recurrence", "Daily"),
            "applicable_to": sch.get("applicable_to", "All"),
            "is_active": sch.get("is_active", True),
            # Status
            "status": avail["status"],
            "status_text": avail["status_text"],
            "button_text": avail["button_text"],
            "is_open": avail["is_open"],
            "has_submitted": has_sub,
            "submission_details": submission,
        }
        result.append(item)

    return {
        "date": today_str,
        "currentTime": now_ist.strftime("%I:%M %p"),
        "employee": emp,
        "schedules": result,
    }


# =====================================================================
# EMPLOYEE: SUBMIT WORK UPDATE
# =====================================================================

@router.post("", status_code=status.HTTP_201_CREATED)
def submit_work_update(
    data: WorkUpdateSubmission,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submit daily work update during the permitted window.
    Saves to Firestore (workUpdates/{uid}/dailyUpdates/{date}_section_{section})
    and dual-writes to PostgreSQL.
    """
    emp = resolve_employee_info(current_user)
    uid = emp["uid"]
    email = emp["email"]
    name = emp["name"]
    emp_id = emp["employee_id"]

    text_content = (data.updateText or "").strip()
    if not text_content:
        raise HTTPException(status_code=400, detail="Work update text is required.")

    now_ist, curr_min, today_str = get_current_ist()
    sec = int(data.section)
    document_id = f"{today_str}_section_{sec}"

    # 1. Fetch configured schedule for this section
    schedules = get_all_schedules_from_db()
    matching_sch = next((s for s in schedules if int(s.get("section", 0)) == sec), None)
    if not matching_sch:
        raise HTTPException(status_code=404, detail=f"No work schedule configured for Section {sec}.")

    if not matching_sch.get("is_active", True):
        raise HTTPException(status_code=400, detail="This work schedule is currently inactive.")

    # 2. Server-side time window validation in Asia/Kolkata
    w_start = time_to_minutes(matching_sch.get("window_start", ""))
    w_end = time_to_minutes(matching_sch.get("window_end", ""))
    w_disp = matching_sch.get("submission_window_str") or "the configured window"

    if curr_min < w_start:
        raise HTTPException(
            status_code=400,
            detail=f"Submission window has not opened yet. Available from {w_disp}."
        )
    if curr_min > w_end:
        raise HTTPException(
            status_code=400,
            detail=f"Update window closed at {matching_sch.get('window_end_display', '')}. Late submissions are not permitted."
        )

    # 3. Check duplicate submission
    client = get_firestore_client()
    doc_path = f"workUpdates/{uid}/dailyUpdates/{document_id}"
    if client and uid:
        try:
            existing = client.document(doc_path).get()
            if existing.exists:
                raise HTTPException(
                    status_code=400,
                    detail="Work update has already been submitted for this schedule today."
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Error checking existing update in Firestore: {e}")

    now_time_str = now_ist.strftime("%I:%M %p").lower()
    now_utc = datetime.now(timezone.utc)

    work_sched_str = matching_sch.get("work_schedule_str") or data.workSchedule or "-"
    sub_win_str = matching_sch.get("submission_window_str") or data.submissionWindow or "-"
    sched_name = matching_sch.get("name") or data.scheduleName or f"Work Update 0{sec}"

    # 4. Save to Firestore
    firestore_data = {
        "employeeId": uid,
        "employeeEmail": email,
        "employeeName": name,
        "date": today_str,
        "section": sec,
        "workSchedule": work_sched_str,
        "submissionWindow": sub_win_str,
        "scheduleName": sched_name,
        "update": text_content,
        "submittedAt": now_utc,
        "submittedTime": now_time_str,
    }

    if client and uid:
        try:
            client.document(doc_path).set(firestore_data)
        except Exception as e:
            logger.error(f"Failed to write work update to Firestore at {doc_path}: {e}")
            raise HTTPException(status_code=500, detail=f"Database write failed: {str(e)}")

    # 5. Dual-write to PostgreSQL
    try:
        from app.models.work_update import WorkUpdate as PgWorkUpdate
        pg_update = PgWorkUpdate(
            update_code=f"UPD-{today_str.replace('-', '')}-{sec}-{uid[:6] if uid else '000'}",
            employee_id=emp_id,
            employee_name=name,
            employee_email=email,
            date=date.fromisoformat(today_str),
            time=now_time_str,
            section=sec,
            work_schedule=work_sched_str,
            submission_window=sub_win_str,
            schedule_name=sched_name,
            tag="Operations",
            tasks_completed=text_content,
            submitted_time=now_time_str,
            submitted_at=now_utc,
            firestore_path=doc_path,
        )
        db.add(pg_update)
        db.commit()
    except Exception as pg_err:
        logger.warning(f"PostgreSQL work update sync skipped: {pg_err}")
        db.rollback()

    return {
        "success": True,
        "message": "Work update submitted successfully.",
        "data": {
            "id": document_id,
            "documentId": document_id,
            "employeeName": name,
            "employeeEmail": email,
            "date": today_str,
            "section": sec,
            "workSchedule": work_sched_str,
            "submissionWindow": sub_win_str,
            "update": text_content,
            "submittedTime": now_time_str,
        }
    }


# =====================================================================
# ADMIN: LIST WORK UPDATES (Screenshots 1 & 2)
# =====================================================================

@router.get("")
def list_work_updates(
    date: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    section: Optional[str] = Query(None),
    schedule_id: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    """
    Retrieve all employee work updates with real employee names, section, schedule,
    submission window, update content, and submitted timestamp.
    Reads from Firestore collectionGroup('dailyUpdates') with fallback to PostgreSQL.
    """
    user_role = str(getattr(current_user, "role", "employee")).strip().lower()
    client = get_firestore_client()

    updates = []
    
    # 1. Fetch employee name lookup from Firestore to ensure full names match
    employee_name_cache = {}
    if client:
        try:
            for emp_doc in client.collection("employees").stream():
                edata = emp_doc.to_dict()
                ename = edata.get("name") or edata.get("full_name") or edata.get("employeeName") or ""
                e_id = edata.get("employee_id") or edata.get("employeeId") or ""
                e_email = str(edata.get("email") or "").strip().lower()
                if ename:
                    employee_name_cache[emp_doc.id] = (ename, e_id, e_email)
                    if e_email:
                        employee_name_cache[e_email] = (ename, e_id, e_email)
                    if e_id:
                        employee_name_cache[e_id] = (ename, e_id, e_email)
        except Exception as e:
            logger.warning(f"Error loading employee cache: {e}")

    # 2. Query Firestore
    if client:
        try:
            docs = list(client.collection_group("dailyUpdates").stream())
            for d in docs:
                data = d.to_dict()
                if date and data.get("date") != date:
                    continue
                path = d.reference.path
                doc_id = d.id

                emp_uid = data.get("employeeId") or ""
                emp_email = str(data.get("employeeEmail") or "").strip().lower()
                
                # Resolve employee name
                cached = employee_name_cache.get(emp_uid) or employee_name_cache.get(emp_email)
                if cached:
                    emp_name = cached[0]
                    emp_code = cached[1]
                else:
                    emp_name = data.get("employeeName") or (emp_email.split("@")[0].capitalize() if emp_email else "Employee")
                    emp_code = emp_uid

                # If non-admin user, only return their own
                if user_role != "admin" and emp_email != str(getattr(current_user, "email", "")).lower():
                    continue

                # Submitted timestamp formatting
                sub_at = data.get("submittedAt")
                sub_at_iso = ""
                sub_disp = data.get("submittedTime") or ""
                if hasattr(sub_at, "isoformat"):
                    sub_at_iso = sub_at.isoformat()
                    # Convert UTC timestamp to IST for display
                    if hasattr(sub_at, "astimezone"):
                        sub_ist = sub_at.astimezone(IST)
                        sub_disp = sub_ist.strftime("%d %b %Y, %I:%M %p")
                    else:
                        sub_disp = sub_at.strftime("%d %b %Y, %I:%M %p")
                elif isinstance(sub_at, datetime):
                    sub_at_iso = sub_at.isoformat()
                    sub_disp = sub_at.strftime("%d %b %Y, %I:%M %p")

                sec_val = data.get("section")
                try:
                    sec_int = int(sec_val) if sec_val is not None else None
                except Exception:
                    sec_int = None

                item = {
                    "id": doc_id,
                    "documentId": doc_id,
                    "firestorePath": path,
                    "employeeId": emp_code or emp_uid or "--",
                    "employeeName": emp_name,
                    "employeeEmail": emp_email,
                    "date": data.get("date", ""),
                    "section": sec_int,
                    "workSchedule": data.get("workSchedule") or "-",
                    "submissionWindow": data.get("submissionWindow") or "-",
                    "scheduleName": data.get("scheduleName") or (f"Work Update 0{sec_int}" if sec_int else "-"),
                    "update": data.get("update") or data.get("tasks_completed") or "",
                    "submittedAt": sub_at_iso,
                    "submittedTime": sub_disp or data.get("submittedTime") or "Today",
                }
                updates.append(item)
        except Exception as e:
            logger.error(f"Error querying dailyUpdates collectionGroup: {e}")

    # Fallback to PostgreSQL if Firestore was unavailable or returned 0
    if not updates:
        try:
            db = SessionLocal()
            q = "SELECT id, update_code, employee_id, employee_name, employee_email, date, section, work_schedule, submission_window, schedule_name, tasks_completed, submitted_time, submitted_at, firestore_path FROM work_updates"
            params = {}
            conditions = []
            if date:
                conditions.append("date = :dt")
                params["dt"] = date
            if user_role != "admin":
                conditions.append("employee_email = :email")
                params["email"] = getattr(current_user, "email", "")
            if conditions:
                q += " WHERE " + " AND ".join(conditions)
            q += " ORDER BY submitted_at DESC NULLS LAST, id DESC"

            rows = db.execute(text(q), params).fetchall()
            for r in rows:
                sub_at = r[12]
                sub_at_iso = sub_at.isoformat() if sub_at else ""
                sub_disp = sub_at.strftime("%d %b %Y, %I:%M %p") if sub_at else (r[11] or "")
                updates.append({
                    "id": str(r[0]),
                    "documentId": r[1] or str(r[0]),
                    "firestorePath": r[13],
                    "employeeId": r[2] or "--",
                    "employeeName": r[3],
                    "employeeEmail": r[4],
                    "date": str(r[5]),
                    "section": r[6],
                    "workSchedule": r[7] or "-",
                    "submissionWindow": r[8] or "-",
                    "scheduleName": r[9] or (f"Work Update 0{r[6]}" if r[6] else "-"),
                    "update": r[10],
                    "submittedAt": sub_at_iso,
                    "submittedTime": sub_disp,
                })
            db.close()
        except Exception as e:
            logger.warning(f"Error querying PostgreSQL work_updates: {e}")

    # 3. Apply memory filters (search, section)
    filtered = updates
    if search:
        s_low = search.strip().lower()
        filtered = [
            u for u in filtered
            if s_low in u["employeeName"].lower() or s_low in (u["employeeEmail"] or "").lower()
        ]
    if section and section.upper() != "ALL":
        try:
            s_num = int(section)
            filtered = [u for u in filtered if u.get("section") == s_num]
        except Exception:
            pass

    # Sort descending by submittedAt
    filtered.sort(key=lambda u: (str(u.get("date", "")), str(u.get("submittedAt", ""))), reverse=True)
    return filtered


# =====================================================================
# ADMIN: DELETE SINGLE WORK UPDATE (Screenshots 1 & 2)
# =====================================================================

@router.delete("/{doc_id}")
def delete_work_update(
    doc_id: str,
    path: Optional[str] = Query(None),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Delete an individual employee work update from Firestore and PostgreSQL.
    Requires Admin authentication.
    """
    client = get_firestore_client()
    deleted = False

    # 1. If explicit Firestore path is supplied, delete directly
    if client and path and path.startswith("workUpdates/"):
        try:
            client.document(path).delete()
            deleted = True
        except Exception as e:
            logger.warning(f"Failed to delete Firestore document at path {path}: {e}")

    # 2. Search collectionGroup if path was not provided or failed
    if client and not deleted:
        try:
            for doc in client.collection_group("dailyUpdates").stream():
                if doc.id == doc_id:
                    doc.reference.delete()
                    deleted = True
                    break
        except Exception as e:
            logger.warning(f"Error searching doc {doc_id} to delete in collectionGroup: {e}")

    # 3. Delete from PostgreSQL
    try:
        db.execute(
            text("DELETE FROM work_updates WHERE update_code = :doc_id OR firestore_path = :path OR id::text = :doc_id"),
            {"doc_id": doc_id, "path": path or ""}
        )
        db.commit()
    except Exception as e:
        logger.warning(f"Error deleting from PostgreSQL work_updates: {e}")
        db.rollback()

    return {"success": True, "message": "Work update deleted successfully."}


# =====================================================================
# ADMIN: DELETE ALL UPDATES (BULK)
# =====================================================================

@router.delete("")
def delete_all_work_updates(
    date: Optional[str] = Query(None),
    all_dates: bool = Query(False, alias="all"),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Permanently delete work updates in bulk.
    If 'date' is provided, deletes all updates for that date.
    If 'all=true' is provided, deletes all updates across all dates.
    Requires Admin privileges.
    """
    if not date and not all_dates:
        raise HTTPException(
            status_code=400,
            detail="Specify ?date=YYYY-MM-DD or ?all=true to confirm bulk deletion scope."
        )

    client = get_firestore_client()
    deleted_count = 0

    if client:
        try:
            all_docs = list(client.collection_group("dailyUpdates").stream())
            docs = [d for d in all_docs if (not date or all_dates or d.to_dict().get("date") == date)]
            # Batch delete in chunks of 400 (Firestore limit is 500)
            for i in range(0, len(docs), 400):
                batch = client.batch()
                chunk = docs[i:i+400]
                for d in chunk:
                    batch.delete(d.reference)
                batch.commit()
                deleted_count += len(chunk)
        except Exception as e:
            logger.error(f"Error during bulk deletion in Firestore: {e}")
            raise HTTPException(status_code=500, detail=f"Failed bulk deletion: {str(e)}")

    # Delete from PostgreSQL
    try:
        if date and not all_dates:
            db.execute(text("DELETE FROM work_updates WHERE date = :dt"), {"dt": date})
        else:
            db.execute(text("DELETE FROM work_updates"))
        db.commit()
    except Exception as e:
        logger.warning(f"Error deleting PostgreSQL work_updates: {e}")
        db.rollback()

    scope_str = f"for date {date}" if (date and not all_dates) else "across all dates"
    return {
        "success": True,
        "deletedCount": deleted_count,
        "message": f"Successfully deleted {deleted_count} work updates {scope_str}.",
    }


# =====================================================================
# WORK SCHEDULE MANAGEMENT ENDPOINTS
# =====================================================================

@schedules_router.get("", response_model=List[dict])
def list_work_schedules(current_user=Depends(get_current_user)):
    """Retrieve all work update schedules configured by admin."""
    return get_all_schedules_from_db()


@schedules_router.post("", status_code=status.HTTP_201_CREATED)
def create_work_schedule(
    data: WorkScheduleCreate,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin: create a new work update schedule."""
    schedules = get_all_schedules_from_db()
    existing_sections = [int(s.get("section", 0)) for s in schedules]
    if data.section in existing_sections:
        raise HTTPException(status_code=400, detail=f"A schedule for Section {data.section} already exists.")

    sch_id = f"SCH-{data.section:02d}"
    now_iso = datetime.now(timezone.utc).isoformat()

    w_start_min = time_to_minutes(data.work_start)
    w_end_min = time_to_minutes(data.work_end)
    sub_start_min = time_to_minutes(data.window_start)
    sub_end_min = time_to_minutes(data.window_end)

    if w_start_min >= w_end_min:
        raise HTTPException(status_code=400, detail="Work start time must be before work end time.")
    if sub_start_min >= sub_end_min:
        raise HTTPException(status_code=400, detail="Submission window start must be before window end.")

    w_start_disp = format_minutes_to_display(w_start_min)
    w_end_disp = format_minutes_to_display(w_end_min)
    sub_start_disp = format_minutes_to_display(sub_start_min)
    sub_end_disp = format_minutes_to_display(sub_end_min)

    doc_data = {
        "schedule_id": sch_id,
        "name": data.name.strip(),
        "section": data.section,
        "work_start": data.work_start,
        "work_end": data.work_end,
        "work_start_display": w_start_disp,
        "work_end_display": w_end_disp,
        "work_schedule_str": f"{w_start_disp} - {w_end_disp}",
        "window_start": data.window_start,
        "window_end": data.window_end,
        "window_start_display": sub_start_disp,
        "window_end_display": sub_end_disp,
        "submission_window_str": f"{sub_start_disp} - {sub_end_disp}",
        "recurrence": data.recurrence or "Daily",
        "applicable_to": data.applicable_to or "All",
        "is_active": data.is_active if data.is_active is not None else True,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    doc_data["id"] = sch_id
    firestore_service.create_document("work_schedules", doc_data)

    # Sync to PostgreSQL
    try:
        from app.models.work_schedule import WorkSchedule as PgWorkSchedule
        pg_sch = PgWorkSchedule(
            schedule_id=sch_id,
            name=doc_data["name"],
            section=doc_data["section"],
            work_start=doc_data["work_start"],
            work_end=doc_data["work_end"],
            work_start_display=doc_data["work_start_display"],
            work_end_display=doc_data["work_end_display"],
            work_schedule_str=doc_data["work_schedule_str"],
            window_start=doc_data["window_start"],
            window_end=doc_data["window_end"],
            window_start_display=doc_data["window_start_display"],
            window_end_display=doc_data["window_end_display"],
            submission_window_str=doc_data["submission_window_str"],
            recurrence=doc_data["recurrence"],
            applicable_to=doc_data["applicable_to"],
            is_active=doc_data["is_active"],
        )
        db.add(pg_sch)
        db.commit()
    except Exception as e:
        logger.warning(f"Error syncing schedule to PostgreSQL: {e}")
        db.rollback()

    return doc_data


@schedules_router.put("/{schedule_id}")
def update_work_schedule(
    schedule_id: str,
    data: WorkScheduleUpdate,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin: update an existing work update schedule."""
    existing = firestore_service.get_document("work_schedules", schedule_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found.")

    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    now_iso = datetime.now(timezone.utc).isoformat()
    update_dict["updated_at"] = now_iso

    # Recompute display strings if times change
    w_start = update_dict.get("work_start", existing.get("work_start"))
    w_end = update_dict.get("work_end", existing.get("work_end"))
    if w_start and w_end:
        w_start_disp = format_minutes_to_display(time_to_minutes(w_start))
        w_end_disp = format_minutes_to_display(time_to_minutes(w_end))
        update_dict["work_start_display"] = w_start_disp
        update_dict["work_end_display"] = w_end_disp
        update_dict["work_schedule_str"] = f"{w_start_disp} - {w_end_disp}"

    sub_start = update_dict.get("window_start", existing.get("window_start"))
    sub_end = update_dict.get("window_end", existing.get("window_end"))
    if sub_start and sub_end:
        sub_start_disp = format_minutes_to_display(time_to_minutes(sub_start))
        sub_end_disp = format_minutes_to_display(time_to_minutes(sub_end))
        update_dict["window_start_display"] = sub_start_disp
        update_dict["window_end_display"] = sub_end_disp
        update_dict["submission_window_str"] = f"{sub_start_disp} - {sub_end_disp}"

    firestore_service.update_document("work_schedules", schedule_id, update_dict)

    # Sync to PostgreSQL
    try:
        from app.models.work_schedule import WorkSchedule as PgWorkSchedule
        pg_sch = db.query(PgWorkSchedule).filter(PgWorkSchedule.schedule_id == schedule_id).first()
        if pg_sch:
            for k, v in update_dict.items():
                if hasattr(pg_sch, k):
                    setattr(pg_sch, k, v)
            db.commit()
    except Exception as e:
        logger.warning(f"Error updating PostgreSQL schedule: {e}")
        db.rollback()

    existing.update(update_dict)
    return existing


@schedules_router.delete("/{schedule_id}")
def delete_work_schedule(
    schedule_id: str,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin: delete a work schedule."""
    firestore_service.delete_document("work_schedules", schedule_id)
    try:
        from app.models.work_schedule import WorkSchedule as PgWorkSchedule
        db.query(PgWorkSchedule).filter(PgWorkSchedule.schedule_id == schedule_id).delete()
        db.commit()
    except Exception as e:
        logger.warning(f"Error deleting PostgreSQL schedule: {e}")
        db.rollback()

    return {"success": True, "message": "Work schedule deleted successfully."}

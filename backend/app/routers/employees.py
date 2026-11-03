from typing import List, Optional, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.config import settings
from app.db.session import get_db
from app.models.employee import Employee
from app.models.user import User
from app.models.attendance import Attendance
from app.core.security import get_password_hash
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse
from app.dependencies.auth import get_current_user, get_current_admin, get_current_employee
from app.services.firestore_service import FirestoreService

router = APIRouter(prefix="/employees", tags=["Employees"])


def format_employee_response(emp: Any, db: Optional[Session] = None) -> dict:
    """Format employee record from dict (Firestore) or ORM model (PostgreSQL)."""
    if isinstance(emp, dict):
        emp_id = emp.get("employee_id") or emp.get("employeeId") or str(emp.get("id"))
        full_name = emp.get("full_name") or emp.get("fullName") or emp.get("name") or "Employee"
        email = emp.get("email") or ""
        phone = emp.get("phone") or "--"
        desig = emp.get("designation") or emp.get("role") or "Team Member"
        dept = emp.get("department") or emp.get("dept") or "Operations"
        status_val = emp.get("status") or "Active"
        joining = str(emp.get("joining_date") or emp.get("joining") or "")
        shift = emp.get("shift") or "General (09:30 AM - 06:30 PM)"
        location = emp.get("location") or "HQ Office"
        pct = emp.get("attendance_percentage") or emp.get("attendancePercentage")
        bank_name = emp.get("bank_name") or emp.get("bankName") or ""
        acct_no = emp.get("account_number") or emp.get("accountNumber") or emp.get("bank_account_no") or ""
        pan_no = emp.get("pan_number") or emp.get("panNumber") or emp.get("pan") or ""
        uan_no = emp.get("uan_number") or emp.get("uanNumber") or emp.get("uan") or emp.get("pf_number") or ""
        photo = emp.get("profile_photo") or emp.get("profilePhoto") or emp.get("photo_url") or emp.get("avatar") or ""

        return {
            "id": emp_id,
            "employeeId": emp_id,
            "name": full_name,
            "fullName": full_name,
            "email": email,
            "phone": phone,
            "role": desig,
            "designation": desig,
            "dept": dept,
            "department": dept,
            "status": status_val,
            "joining": joining,
            "shift": shift,
            "location": location,
            "attendancePercentage": pct,
            "bank_name": bank_name,
            "bankName": bank_name,
            "account_number": acct_no,
            "accountNumber": acct_no,
            "pan_number": pan_no,
            "panNumber": pan_no,
            "pan": pan_no,
            "uan_number": uan_no,
            "uanNumber": uan_no,
            "uan": uan_no,
            "pf_number": uan_no,
            "profile_photo": photo,
            "profilePhoto": photo,
        }

    # SQLAlchemy model
    total_att = db.query(Attendance).filter(Attendance.employee_id == emp.employee_id).count() if db else 0
    present_att = (
        db.query(Attendance)
        .filter(Attendance.employee_id == emp.employee_id, Attendance.status.in_(["Present", "Late", "Completed"]))
        .count()
    ) if db else 0
    pct = round((present_att / total_att) * 100, 1) if total_att > 0 else None

    bank_name = getattr(emp, "bank_name", None) or ""
    acct_no = getattr(emp, "account_number", None) or ""
    pan_no = getattr(emp, "pan_number", None) or ""
    uan_no = getattr(emp, "uan_number", None) or ""
    photo = getattr(emp, "profile_photo", None) or ""

    return {
        "id": emp.employee_id,
        "employeeId": emp.employee_id,
        "name": emp.full_name,
        "fullName": emp.full_name,
        "email": emp.email,
        "phone": emp.phone or "--",
        "role": emp.designation,
        "designation": emp.designation,
        "dept": emp.department,
        "department": emp.department,
        "status": emp.status,
        "joining": emp.joining_date.isoformat() if emp.joining_date else "",
        "shift": emp.shift or "General (09:30 AM - 06:30 PM)",
        "location": emp.location or "HQ Office",
        "attendancePercentage": pct if emp.attendance_percentage is None else emp.attendance_percentage,
        "bank_name": bank_name,
        "bankName": bank_name,
        "account_number": acct_no,
        "accountNumber": acct_no,
        "pan_number": pan_no,
        "panNumber": pan_no,
        "pan": pan_no,
        "uan_number": uan_no,
        "uanNumber": uan_no,
        "uan": uan_no,
        "pf_number": uan_no,
        "profile_photo": photo,
        "profilePhoto": photo,
    }


@router.get("", response_model=List[dict])
def list_employees(
    search: Optional[str] = Query(None, description="Search term for name, ID, or email"),
    dept: Optional[str] = Query(None, description="Department filter"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Retrieve roster of employees with optional filtering (excludes admin accounts from employee directory)."""
    if settings.DATABASE_BACKEND == "firebase":
        raw_emps = FirestoreService.list_all("employees")
        filtered = []
        for e in raw_emps:
            emp_id = str(e.get("employee_id") or e.get("employeeId") or "")
            desig = str(e.get("designation") or e.get("role") or "")
            if desig == "Administrator" or emp_id.startswith("ADM-"):
                continue

            name = str(e.get("full_name") or e.get("fullName") or "")
            email = str(e.get("email") or "")
            department = str(e.get("department") or e.get("dept") or "")

            if search:
                s = search.strip().lower()
                if not (s in name.lower() or s in emp_id.lower() or s in email.lower() or s in desig.lower()):
                    continue

            if dept and dept.upper() != "ALL":
                if department.strip().lower() != dept.strip().lower():
                    continue

            filtered.append(format_employee_response(e))

        filtered.sort(key=lambda x: str(x.get("name", "")).lower())
        return filtered

    # PostgreSQL fallback
    query = db.query(Employee).filter(
        Employee.designation != "Administrator",
        ~Employee.employee_id.ilike("ADM-%"),
    )
    if search:
        s = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                Employee.full_name.ilike(s),
                Employee.employee_id.ilike(s),
                Employee.email.ilike(s),
                Employee.designation.ilike(s),
            )
        )
    if dept and dept.upper() != "ALL":
        query = query.filter(Employee.department.ilike(dept.strip()))

    employees = query.order_by(Employee.full_name.asc()).all()
    return [format_employee_response(e, db) for e in employees]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=dict)
def create_employee(
    emp_data: EmployeeCreate,
    db: Session = Depends(get_db),
    admin_user=Depends(get_current_admin),
):
    """Add a new employee record (Admin only)."""
    raw_id = emp_data.employeeId or emp_data.id
    if not raw_id or not raw_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee ID is required (e.g. AFI-001)",
        )

    clean_id = raw_id.strip().upper()
    clean_email = emp_data.email.lower().strip()
    full_name = (emp_data.fullName or emp_data.name or "").strip()

    if not full_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee full name is required",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    admin_email = getattr(admin_user, "email", "admin@arshith.com")

    if settings.DATABASE_BACKEND == "firebase":
        # Check duplicate
        existing_id = FirestoreService.get_by_id("employees", clean_id)
        if existing_id:
            raise HTTPException(status_code=409, detail=f"An employee with ID '{clean_id}' already exists.")

        existing_email = FirestoreService.query("employees", {"email": clean_email})
        if existing_email:
            raise HTTPException(status_code=409, detail=f"An employee with email '{clean_email}' already exists.")

        user_id = int(datetime.now(timezone.utc).timestamp() * 1000)
        # Create linked user if not existing
        existing_users = FirestoreService.query("users", {"email": clean_email})
        if not existing_users:
            user_doc = {
                "id": user_id,
                "email": clean_email,
                "hashed_password": get_password_hash("Welcome@123"),
                "role": "employee",
                "is_active": True,
                "approval_status": "APPROVED",
                "created_at": now_iso,
                "updated_at": now_iso,
            }
            FirestoreService.save("users", user_id, user_doc)
        else:
            user_id = existing_users[0].get("id") or user_id

        emp_doc = {
            "id": user_id,
            "employee_id": clean_id,
            "user_id": user_id,
            "full_name": full_name,
            "email": clean_email,
            "phone": emp_data.phone.strip() if emp_data.phone else "--",
            "department": emp_data.department or emp_data.dept or "Operations",
            "designation": emp_data.designation or emp_data.role or "Team Member",
            "status": emp_data.status or "Active",
            "shift": emp_data.shift or "General (09:30 AM - 06:30 PM)",
            "location": emp_data.location or "HQ Office",
            "bank_name": (emp_data.bank_name or emp_data.bankName or "").strip(),
            "bankName": (emp_data.bank_name or emp_data.bankName or "").strip(),
            "account_number": (emp_data.account_number or emp_data.accountNumber or "").strip(),
            "accountNumber": (emp_data.account_number or emp_data.accountNumber or "").strip(),
            "pan_number": (emp_data.pan_number or emp_data.panNumber or emp_data.pan or "").strip().upper(),
            "panNumber": (emp_data.pan_number or emp_data.panNumber or emp_data.pan or "").strip().upper(),
            "uan_number": (emp_data.uan_number or emp_data.uanNumber or emp_data.uan or emp_data.pf_number or "").strip(),
            "uanNumber": (emp_data.uan_number or emp_data.uanNumber or emp_data.uan or emp_data.pf_number or "").strip(),
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        FirestoreService.save("employees", clean_id, emp_doc)

        FirestoreService.add_audit_log(
            actor_uid=admin_email,
            action="EMPLOYEE_CREATED",
            target_record=clean_id,
            metadata={"email": clean_email, "name": full_name},
        )
        return format_employee_response(emp_doc)

    # PostgreSQL fallback
    if db.query(Employee).filter(Employee.employee_id == clean_id).first():
        raise HTTPException(status_code=409, detail=f"An employee with ID '{clean_id}' already exists.")

    if db.query(Employee).filter(Employee.email == clean_email).first():
        raise HTTPException(status_code=409, detail=f"An employee with email '{clean_email}' already exists.")

    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        user = User(
            email=clean_email,
            hashed_password=get_password_hash("Welcome@123"),
            role="employee",
            is_active=True,
        )
        db.add(user)
        db.flush()

    new_emp = Employee(
        employee_id=clean_id,
        user_id=user.id,
        full_name=full_name,
        email=clean_email,
        phone=emp_data.phone.strip() if emp_data.phone else "--",
        department=emp_data.department or emp_data.dept or "Operations",
        designation=emp_data.designation or emp_data.role or "Team Member",
        status=emp_data.status or "Active",
        shift=emp_data.shift or "General (09:30 AM - 06:30 PM)",
        location=emp_data.location or "HQ Office",
        bank_name=(emp_data.bank_name or emp_data.bankName or None),
        account_number=(emp_data.account_number or emp_data.accountNumber or None),
        pan_number=(emp_data.pan_number or emp_data.panNumber or emp_data.pan or None),
        uan_number=(emp_data.uan_number or emp_data.uanNumber or emp_data.uan or emp_data.pf_number or None),
    )
    db.add(new_emp)
    db.commit()
    db.refresh(new_emp)
    return format_employee_response(new_emp, db)


@router.get("/me", response_model=dict)
def get_my_profile(
    db: Session = Depends(get_db),
    employee=Depends(get_current_employee),
):
    """Retrieve currently authenticated employee's profile."""
    if isinstance(employee, dict):
        return format_employee_response(employee)
    if hasattr(employee, "to_dict"):
        return format_employee_response(employee.to_dict())
    return format_employee_response(employee, db)


@router.patch("/me", response_model=dict)
def update_my_profile(
    data: EmployeeUpdate,
    db: Session = Depends(get_db),
    employee=Depends(get_current_employee),
):
    """Update permitted personal details for currently authenticated employee."""
    emp_id = getattr(employee, "employee_id", None) or getattr(employee, "employeeId", None)
    emp_uid = getattr(employee, "uid", None) or getattr(employee, "id", None)

    if settings.DATABASE_BACKEND == "firebase":
        emp = FirestoreService.get_by_id("employees", emp_id) if emp_id else None
        if not emp and emp_uid:
            emp = FirestoreService.get_by_id("employees", str(emp_uid))
        if not emp:
            matches = FirestoreService.query("employees", {"email": str(getattr(employee, "email", "")).lower().strip()})
            if matches:
                emp = matches[0]
        if not emp:
            raise HTTPException(status_code=404, detail="Employee profile not found.")
        target_doc_id = emp.get("_firestore_id") or emp.get("id") or emp_id or emp_uid
        updates = {}
        if data.phone is not None:
            updates["phone"] = data.phone.strip()
        if data.fullName or data.name:
            updates["full_name"] = (data.fullName or data.name).strip()
            updates["name"] = (data.fullName or data.name).strip()
        if data.role or data.designation:
            updates["designation"] = (data.role or data.designation).strip()
            updates["role"] = (data.role or data.designation).strip()
        if data.bank_name is not None or data.bankName is not None:
            val = (data.bank_name if data.bank_name is not None else data.bankName).strip()
            updates["bank_name"] = val
            updates["bankName"] = val
        if data.account_number is not None or data.accountNumber is not None:
            val = (data.account_number if data.account_number is not None else data.accountNumber).strip()
            updates["account_number"] = val
            updates["accountNumber"] = val
            updates["bank_account_no"] = val
        if data.pan_number is not None or data.panNumber is not None or data.pan is not None:
            val = (data.pan_number if data.pan_number is not None else (data.panNumber if data.panNumber is not None else data.pan)).strip().upper()
            updates["pan_number"] = val
            updates["panNumber"] = val
            updates["pan"] = val
        if data.uan_number is not None or data.uanNumber is not None or data.uan is not None or data.pf_number is not None:
            val = (data.uan_number if data.uan_number is not None else (data.uanNumber if data.uanNumber is not None else (data.uan if data.uan is not None else data.pf_number))).strip()
            updates["uan_number"] = val
            updates["uanNumber"] = val
            updates["uan"] = val
            updates["pf_number"] = val
        if data.profile_photo is not None or data.profilePhoto is not None:
            photo_val = data.profile_photo if data.profile_photo is not None else data.profilePhoto
            updates["profile_photo"] = photo_val
            updates["profilePhoto"] = photo_val
            updates["photoUrl"] = photo_val
            updates["photo_url"] = photo_val

        FirestoreService.update("employees", str(target_doc_id), updates)
        emp.update(updates)

        try:
            from app.routers.chat import notify_profile_updated
            emp_canonical = emp.get("employee_id") or emp.get("employeeId") or str(target_doc_id)
            updated_name = emp.get("full_name") or emp.get("name")
            updated_photo = updates.get("profile_photo") or emp.get("profile_photo") or emp.get("photoUrl")
            notify_profile_updated(str(target_doc_id), emp_canonical, updated_photo, updated_name)
        except Exception:
            pass

        return format_employee_response(emp)

    # PostgreSQL fallback
    if data.phone is not None:
        employee.phone = data.phone.strip()
    if data.fullName or data.name:
        employee.full_name = (data.fullName or data.name).strip()
    if data.role or data.designation:
        employee.designation = (data.role or data.designation).strip()
    if data.bank_name is not None or data.bankName is not None:
        employee.bank_name = (data.bank_name if data.bank_name is not None else data.bankName).strip()
    if data.account_number is not None or data.accountNumber is not None:
        employee.account_number = (data.account_number if data.account_number is not None else data.accountNumber).strip()
    if data.pan_number is not None or data.panNumber is not None or data.pan is not None:
        employee.pan_number = (data.pan_number if data.pan_number is not None else (data.panNumber if data.panNumber is not None else data.pan)).strip().upper()
    if data.uan_number is not None or data.uanNumber is not None or data.uan is not None or data.pf_number is not None:
        employee.uan_number = (data.uan_number if data.uan_number is not None else (data.uanNumber if data.uanNumber is not None else (data.uan if data.uan is not None else data.pf_number))).strip()
    if data.profile_photo is not None or data.profilePhoto is not None:
        employee.profile_photo = data.profile_photo if data.profile_photo is not None else data.profilePhoto

    db.commit()
    db.refresh(employee)

    try:
        from app.routers.chat import notify_profile_updated
        notify_profile_updated(str(employee.id), employee.employee_id, employee.profile_photo, employee.full_name)
    except Exception:
        pass

    return format_employee_response(employee, db)


@router.get("/{employee_id}", response_model=dict)
def get_employee(
    employee_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get single employee by ID."""
    if settings.DATABASE_BACKEND == "firebase":
        emp = FirestoreService.get_by_id("employees", employee_id)
        if not emp:
            matches = FirestoreService.query("employees", {"email": employee_id.lower().strip()})
            if matches:
                emp = matches[0]
        if not emp:
            raise HTTPException(status_code=404, detail=f"Employee '{employee_id}' not found.")
        return format_employee_response(emp)

    # PostgreSQL fallback
    emp = (
        db.query(Employee)
        .filter(or_(Employee.employee_id == employee_id, Employee.email == employee_id))
        .first()
    )
    if not emp:
        raise HTTPException(status_code=404, detail=f"Employee '{employee_id}' not found.")
    return format_employee_response(emp, db)


@router.patch("/{employee_id}", response_model=dict)
def update_employee(
    employee_id: str,
    data: EmployeeUpdate,
    db: Session = Depends(get_db),
    admin_user=Depends(get_current_admin),
):
    """Update employee information (Admin only)."""
    admin_email = getattr(admin_user, "email", "admin@arshith.com")

    if settings.DATABASE_BACKEND == "firebase":
        emp = FirestoreService.get_by_id("employees", employee_id)
        if not emp:
            matches = FirestoreService.query("employees", {"email": employee_id.lower().strip()})
            if matches:
                emp = matches[0]
        if not emp:
            raise HTTPException(status_code=404, detail=f"Employee '{employee_id}' not found.")

        doc_key = emp.get("employee_id") or employee_id
        updates = {}
        if data.name or data.fullName:
            updates["full_name"] = (data.name or data.fullName).strip()
        if data.phone is not None:
            updates["phone"] = data.phone.strip()
        if data.role or data.designation:
            updates["designation"] = (data.role or data.designation).strip()
        if data.dept or data.department:
            updates["department"] = (data.dept or data.department).strip()
        if data.status is not None:
            updates["status"] = data.status.strip()
        if data.shift is not None:
            updates["shift"] = data.shift.strip()
        if data.location is not None:
            updates["location"] = data.location.strip()
        if data.bank_name is not None or data.bankName is not None:
            val = (data.bank_name if data.bank_name is not None else data.bankName).strip()
            updates["bank_name"] = val
            updates["bankName"] = val
        if data.account_number is not None or data.accountNumber is not None:
            val = (data.account_number if data.account_number is not None else data.accountNumber).strip()
            updates["account_number"] = val
            updates["accountNumber"] = val
            updates["bank_account_no"] = val
        if data.pan_number is not None or data.panNumber is not None or data.pan is not None:
            val = (data.pan_number if data.pan_number is not None else (data.panNumber if data.panNumber is not None else data.pan)).strip().upper()
            updates["pan_number"] = val
            updates["panNumber"] = val
            updates["pan"] = val
        if data.uan_number is not None or data.uanNumber is not None or data.uan is not None or data.pf_number is not None:
            val = (data.uan_number if data.uan_number is not None else (data.uanNumber if data.uanNumber is not None else (data.uan if data.uan is not None else data.pf_number))).strip()
            updates["uan_number"] = val
            updates["uanNumber"] = val
            updates["uan"] = val
            updates["pf_number"] = val
        if data.profile_photo is not None or data.profilePhoto is not None:
            photo_val = data.profile_photo if data.profile_photo is not None else data.profilePhoto
            updates["profile_photo"] = photo_val
            updates["profilePhoto"] = photo_val

        FirestoreService.update("employees", doc_key, updates)
        emp.update(updates)

        FirestoreService.add_audit_log(
            actor_uid=admin_email,
            action="EMPLOYEE_UPDATED",
            target_record=doc_key,
            metadata=updates,
        )
        return format_employee_response(emp)

    # PostgreSQL fallback
    emp = (
        db.query(Employee)
        .filter(or_(Employee.employee_id == employee_id, Employee.email == employee_id))
        .first()
    )
    if not emp:
        raise HTTPException(status_code=404, detail=f"Employee '{employee_id}' not found.")

    if data.name or data.fullName:
        emp.full_name = (data.name or data.fullName).strip()
    if data.phone is not None:
        emp.phone = data.phone.strip()
    if data.role or data.designation:
        emp.designation = (data.role or data.designation).strip()
    if data.dept or data.department:
        emp.department = (data.dept or data.department).strip()
    if data.status is not None:
        emp.status = data.status.strip()
    if data.shift is not None:
        emp.shift = data.shift.strip()
    if data.location is not None:
        emp.location = data.location.strip()
    if data.bank_name is not None or data.bankName is not None:
        emp.bank_name = (data.bank_name if data.bank_name is not None else data.bankName).strip()
    if data.account_number is not None or data.accountNumber is not None:
        emp.account_number = (data.account_number if data.account_number is not None else data.accountNumber).strip()
    if data.pan_number is not None or data.panNumber is not None or data.pan is not None:
        emp.pan_number = (data.pan_number if data.pan_number is not None else (data.panNumber if data.panNumber is not None else data.pan)).strip().upper()
    if data.uan_number is not None or data.uanNumber is not None or data.uan is not None or data.pf_number is not None:
        emp.uan_number = (data.uan_number if data.uan_number is not None else (data.uanNumber if data.uanNumber is not None else (data.uan if data.uan is not None else data.pf_number))).strip()
    if data.profile_photo is not None or data.profilePhoto is not None:
        emp.profile_photo = data.profile_photo if data.profile_photo is not None else data.profilePhoto

    db.commit()
    db.refresh(emp)
    return format_employee_response(emp, db)


@router.delete("/{employee_id}", status_code=status.HTTP_200_OK)
def delete_employee(
    employee_id: str,
    db: Session = Depends(get_db),
    admin_user=Depends(get_current_admin),
):
    """Delete an employee and cascade related user records (Admin only)."""
    admin_email = getattr(admin_user, "email", "admin@arshith.com")

    if settings.DATABASE_BACKEND == "firebase":
        emp = FirestoreService.get_by_id("employees", employee_id)
        if not emp:
            raise HTTPException(status_code=404, detail=f"Employee '{employee_id}' not found.")

        doc_key = emp.get("employee_id") or employee_id
        user_id = emp.get("user_id")
        FirestoreService.delete("employees", doc_key)
        if user_id:
            FirestoreService.delete("users", user_id)

        FirestoreService.add_audit_log(
            actor_uid=admin_email,
            action="EMPLOYEE_DELETED",
            target_record=doc_key,
        )
        return {"success": True, "message": f"Employee '{employee_id}' removed successfully."}

    # PostgreSQL fallback
    emp = (
        db.query(Employee)
        .filter(or_(Employee.employee_id == employee_id, Employee.email == employee_id))
        .first()
    )
    if not emp:
        raise HTTPException(status_code=404, detail=f"Employee '{employee_id}' not found.")

    user_id = emp.user_id
    db.delete(emp)
    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
        if user and user.role != "admin":
            db.delete(user)

    db.commit()
    return {"success": True, "message": f"Employee '{employee_id}' removed successfully."}

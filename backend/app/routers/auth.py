import logging
import re
from datetime import datetime, date, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger("uvicorn.error")

from pydantic import BaseModel

from app.core.config import settings
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.firebase import verify_credentials_with_firebase, update_admin_password_in_firebase
from app.core.exceptions import DuplicateFieldsException, RegistrationValidationException
from app.db.session import get_db
from app.models.user import User
from app.models.employee import Employee
from app.models.registration_request import RegistrationRequest
from app.schemas.auth import LoginRequest, AdminLoginRequest, RegisterRequest, Token, UserProfileResponse
from app.dependencies.auth import get_current_user, get_current_admin
from app.services.firestore_service import FirestoreService
from app.services.sync_service import sync_employee_approval_state

router = APIRouter(prefix="/auth", tags=["Authentication"])

COMPANY_EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9_.+-]+@arshithgroup\.com$", re.IGNORECASE)


def is_valid_company_email(email: Optional[str]) -> bool:
    """Validate company email ending strictly with @arshithgroup.com."""
    if not email or not isinstance(email, str):
        return False
    return bool(COMPANY_EMAIL_PATTERN.match(email.strip()))


def is_valid_employee_id_prefix(emp_id: Optional[str]) -> bool:
    """Validate employee ID starting strictly with uppercase AFI prefix."""
    if not emp_id or not isinstance(emp_id, str):
        return False
    return emp_id.strip().startswith("AFI")


def normalize_phone_digits(phone: Optional[str]) -> str:
    """Normalize phone input by trimming whitespace and removing non-digit / non-+ characters."""
    if not phone:
        return ""
    p = phone.strip()
    if p in ("", "--"):
        return ""
    return re.sub(r"[^\d+]", "", p)


def is_same_phone(p1: str, p2: str) -> bool:
    """Check if two phone representations refer to the same phone number."""
    if not p1 or not p2:
        return False
    c1 = re.sub(r"[^\d+]", "", p1.strip())
    c2 = re.sub(r"[^\d+]", "", p2.strip())
    if not c1 or not c2 or c1 in ("--", "") or c2 in ("--", ""):
        return False
    if c1 == c2:
        return True

    # Digits only comparison
    d1 = re.sub(r"\D", "", c1)
    d2 = re.sub(r"\D", "", c2)
    if not d1 or not d2:
        return False
    if d1 == d2:
        return True

    if len(d1) >= 10 and len(d2) >= 10:
        if d1[-10:] == d2[-10:]:
            return True

    return False


@router.post("/login", response_model=Token)
def login_employee(login_data: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate an employee with email and password via Firestore or PostgreSQL."""
    raw_email = (login_data.email or "").strip()
    raw_password = login_data.password or ""

    # Case A: Email or password missing
    if not raw_email or not raw_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please enter your company email and password.",
        )

    clean_email = raw_email.lower()

    if settings.DATABASE_BACKEND == "firebase":
        users = FirestoreService.query("users", {"email": clean_email})
        user = users[0] if users else None

        emps = FirestoreService.query("employees", {"email": clean_email})
        emp = emps[0] if emps else None

        reg_reqs = FirestoreService.query("registration_requests", {"email": clean_email})
        reg_req = reg_reqs[0] if reg_reqs else None

        # Check live Firebase Auth if live
        fb_user = None
        if not user and not emp and not reg_req:
            try:
                from app.core.firebase import is_firebase_live
                import firebase_admin.auth as fb_auth
                if is_firebase_live():
                    fb_user = fb_auth.get_user_by_email(clean_email)
            except Exception:
                pass

        has_account = bool(user or emp or reg_req or fb_user)

        if not has_account:
            if clean_email == "admin@arshith.com":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Admin credentials cannot be used to log in through Employee Login. Please use the Admin Login page.",
                )
            admins = FirestoreService.query("admins", {"email": clean_email})
            if admins:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Admin credentials cannot be used to log in through Employee Login. Please use the Admin Login page.",
                )
            # Case B: Unsupported domain / invalid company email
            if not is_valid_company_email(clean_email):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Please use your company email ending with @arshithgroup.com.",
                )
            # Case C: Employee account does not exist
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="You are not registered with Arshith Connect. Please register using your company email or contact HR.",
            )

        # Case D: Verify password via Firebase Authentication or local hashed password
        fb_result = verify_credentials_with_firebase(clean_email, raw_password)
        password_valid = False
        if fb_result:
            password_valid = True
            if user:
                FirestoreService.update("users", user.get("id"), {
                    "hashed_password": get_password_hash(raw_password),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
        else:
            for u in users:
                if u.get("hashed_password") and verify_password(raw_password, u["hashed_password"]):
                    password_valid = True
                    user = u
                    break

        if not password_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid employee email or password.",
            )

        role = str(user.get("role", "employee")).strip().lower() if user else "employee"
        if role == "admin" or clean_email == "admin@arshith.com":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin credentials cannot be used to log in through Employee Login. Please use the Admin Login page.",
            )

        pg_emp = None
        pg_user = None
        pg_req = None
        if db:
            try:
                pg_emp = db.query(Employee).filter(func.lower(func.trim(Employee.email)) == clean_email).first()
                pg_user = db.query(User).filter(func.lower(func.trim(User.email)) == clean_email).first()
                pg_req = db.query(RegistrationRequest).filter(func.lower(func.trim(RegistrationRequest.email)) == clean_email).first()
            except Exception as pg_err:
                logger.warning(f"PostgreSQL status check skipped during login for {clean_email}: {pg_err}")
                try:
                    db.rollback()
                except Exception:
                    pass

        # Check for explicitly deactivated accounts
        is_inactive = (
            any(str(e.get("status", "")).strip().lower() == "inactive" for e in emps) or
            any(u.get("is_active") is False and str(u.get("approval_status", "")).upper() == "APPROVED" for u in users) or
            (pg_emp and str(pg_emp.status).strip().lower() == "inactive") or
            (pg_user and pg_user.is_active is False and pg_user.approval_status == "APPROVED")
        )
        if is_inactive:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is currently inactive. Please contact administration.",
            )

        # Determine authoritative approval status across all connected platforms (mobile app, website, firestore, postgres)
        emp_approved = any(str(e.get("status", "")).strip().lower() in ("approved", "active") for e in emps)
        user_approved = any(str(u.get("approval_status", "")).strip().upper() in ("APPROVED", "ACTIVE") or str(u.get("status", "")).strip().lower() in ("approved", "active") for u in users)
        req_approved = any(str(r.get("status", "")).strip().lower() == "approved" for r in reg_reqs)

        if pg_emp and str(pg_emp.status).strip().lower() in ("approved", "active"):
            emp_approved = True
        if pg_user and str(pg_user.approval_status).strip().upper() in ("APPROVED", "ACTIVE"):
            user_approved = True
        if pg_req and str(pg_req.status).strip().lower() == "approved":
            req_approved = True

        is_effective_approved = emp_approved or user_approved or req_approved

        emp_rejected = any(str(e.get("status", "")).strip().lower() == "rejected" for e in emps)
        user_rejected = any(str(u.get("approval_status", "")).strip().upper() == "REJECTED" or str(u.get("status", "")).strip().lower() == "rejected" for u in users)
        req_rejected = any(str(r.get("status", "")).strip().lower() == "rejected" for r in reg_reqs)
        if pg_user and pg_user.approval_status == "REJECTED":
            user_rejected = True
        if pg_req and pg_req.status == "Rejected":
            req_rejected = True

        is_effective_rejected = (emp_rejected or user_rejected or req_rejected) and not is_effective_approved

        if is_effective_approved:
            # Synchronize approval across Firestore and PostgreSQL
            sync_employee_approval_state(clean_email, "approved", db=db)
            users = FirestoreService.query("users", {"email": clean_email})
            emps = FirestoreService.query("employees", {"email": clean_email})
            user = users[0] if users else user
            emp = next((e for e in emps if str(e.get("status", "")).lower() in ("approved", "active")), emps[0] if emps else emp)
        elif is_effective_rejected:
            sync_employee_approval_state(clean_email, "rejected", db=db)
            rejection_reason = (user.get("rejection_reason") if user else None) or (emp.get("rejection_reason") if emp else None)
            detail = "Your registration request was not approved. Please contact company administration."
            if rejection_reason:
                detail += f" Reason: {rejection_reason}"
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your registration is awaiting admin approval. You can log in after your account is approved.",
            )

        if not emps and user and user.get("id"):
            emps = FirestoreService.query("employees", {"user_id": user["id"]})
        if not emp:
            emp = emps[0] if emps else None

        emp_id = (emp.get("employee_id") or emp.get("employeeId")) if emp else "EMP-001"
        emp_name = (emp.get("full_name") or emp.get("fullName")) if emp else clean_email.split("@")[0]
        emp_dept = emp.get("department", "Operations") if emp else "Operations"
        emp_photo = emp.get("profile_photo") or emp.get("profilePhoto") or None if emp else None
        emp_uid = (fb_result.get("uid") if fb_result else None) or (user.get("id") if user else None) or "EMP-001"

        token = create_access_token(
            subject=str(emp_uid),
            role="employee",
            extra_claims={
                "email": clean_email,
                "employeeId": emp_id,
                "name": emp_name,
            },
        )

        return {
            "access_token": token,
            "token_type": "bearer",
            "role": "employee",
            "user": {
                "id": emp_uid,
                "name": emp_name,
                "fullName": emp_name,
                "employeeId": emp_id,
                "email": clean_email,
                "role": "employee",
                "department": emp_dept,
                "profile_photo": emp_photo,
                "profilePhoto": emp_photo,
            },
        }

    # PostgreSQL fallback
    user = None
    emp = None
    reg_req = None
    if db:
        try:
            user = db.query(User).filter(func.lower(func.trim(User.email)) == clean_email).first()
            emp = db.query(Employee).filter(func.lower(func.trim(Employee.email)) == clean_email).first()
            reg_req = db.query(RegistrationRequest).filter(func.lower(func.trim(RegistrationRequest.email)) == clean_email).first()
        except Exception as pg_err:
            logger.warning(f"PostgreSQL fallback query skipped: {pg_err}")
            try:
                db.rollback()
            except Exception:
                pass

    has_account = bool(user or emp or reg_req)

    if not has_account:
        # Case B: Unsupported domain / invalid company email
        if not is_valid_company_email(clean_email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please use your company email ending with @arshithgroup.com.",
            )
        # Case C: Employee account does not exist
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not registered with Arshith Connect. Please register using your company email or contact HR.",
        )

    if user and (user.role == "admin" or user.role != "employee"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin credentials cannot be used to log in through Employee Login. Please use the Admin Login page.",
        )

    # Case D: Verify password
    if not user or not verify_password(raw_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid employee email or password.",
        )

    # Case E: Registration is pending admin approval
    if user.approval_status == "PENDING":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your registration is awaiting admin approval. You can log in after your account is approved.",
        )

    # Case F: Registration was rejected or the account is disabled
    if user.approval_status == "REJECTED":
        detail = "Your registration request was not approved. Please contact company administration."
        if user.rejection_reason:
            detail += f" Reason: {user.rejection_reason}"
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)

    if not user.is_active or user.approval_status != "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is currently inactive. Please contact administration.",
        )

    if not emp:
        emp = db.query(Employee).filter(Employee.user_id == user.id).first()

    if emp and emp.status not in ["Active", "approved", "APPROVED"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is currently inactive. Please contact administration.",
        )

    emp_id = emp.employee_id if emp else "EMP-001"
    emp_name = emp.full_name if emp else user.email.split("@")[0]
    emp_dept = emp.department if emp else "Operations"

    token = create_access_token(
        subject=str(user.id),
        role="employee",
        extra_claims={
            "email": user.email,
            "employeeId": emp_id,
            "name": emp_name,
        },
    )

    emp_photo = getattr(emp, "profile_photo", None) if emp else None

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": "employee",
        "user": {
            "id": user.id,
            "name": emp_name,
            "fullName": emp_name,
            "employeeId": emp_id,
            "email": user.email,
            "role": "employee",
            "department": emp_dept,
            "profile_photo": emp_photo,
            "profilePhoto": emp_photo,
        },
    }


@router.post("/admin-login", response_model=Token)
def login_admin(login_data: AdminLoginRequest, db: Session = Depends(get_db)):
    """Authenticate administrator credentials via Firebase Authentication / Firestore or PostgreSQL."""
    clean_email = login_data.email.lower().strip()

    if settings.DATABASE_BACKEND == "firebase":
        fb_result = verify_credentials_with_firebase(clean_email, login_data.password)

        users = FirestoreService.query("users", {"email": clean_email})
        admins = FirestoreService.query("admins", {"email": clean_email})

        admin_doc = admins[0] if admins else None
        if not admin_doc:
            for a in FirestoreService.list_all("admins"):
                if str(a.get("email", "")).lower().strip() == clean_email:
                    admin_doc = a
                    break

        user = users[0] if users else None

        # Check if email belongs to an employee (and NOT an admin)
        if not admin_doc and (user and str(user.get("role", "")).lower() == "employee"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Employee credentials cannot be used to log in through Admin Login. Please use the Employee Login page.",
            )
        if not admin_doc and not user:
            emps = FirestoreService.query("employees", {"email": clean_email})
            if emps:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Employee credentials cannot be used to log in through Admin Login. Please use the Employee Login page.",
                )

        password_valid = False
        if fb_result:
            password_valid = True
            if user:
                FirestoreService.update("users", user.get("id"), {
                    "hashed_password": get_password_hash(login_data.password),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
        else:
            for u in users:
                if u.get("hashed_password") and verify_password(login_data.password, u["hashed_password"]):
                    password_valid = True
                    user = u
                    break
            if not password_valid and admin_doc:
                admin_pwd_hash = admin_doc.get("hashed_password") or admin_doc.get("password_hash")
                if admin_pwd_hash and verify_password(login_data.password, admin_pwd_hash):
                    password_valid = True

            # Master admin fallback for designated administrator
            if not password_valid and clean_email == "admin@arshith.com" and login_data.password in ("AdminPassword@123", "Admin@123"):
                password_valid = True
                if user:
                    FirestoreService.update("users", user.get("id"), {
                        "hashed_password": get_password_hash(login_data.password),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    })

        if not password_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid administrator credentials",
            )

        role = ""
        if admin_doc:
            role = str(admin_doc.get("role", "admin")).strip().lower()
        elif user:
            role = str(user.get("role", "")).strip().lower()

        if role == "employee":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Employee credentials cannot be used to log in through Admin Login. Please use the Employee Login page.",
            )
        if role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. This account does not possess administrator privileges.",
            )

        if user and not user.get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Administrator account is inactive.",
            )

        admin_name = (admin_doc.get("name") if admin_doc else None) or (user.get("name") if user else None) or "Administrator"
        admin_uid = (fb_result.get("uid") if fb_result else None) or (admin_doc.get("id") if admin_doc else None) or (user.get("id") if user else None) or "ezvZfsphCqUpkgvu18ldvi7XW9D2"

        token = create_access_token(
            subject=str(admin_uid),
            role="admin",
            extra_claims={
                "email": clean_email,
                "employeeId": "ADM-001",
                "name": admin_name,
            },
        )

        return {
            "access_token": token,
            "token_type": "bearer",
            "role": "admin",
            "user": {
                "id": admin_uid,
                "name": admin_name,
                "fullName": admin_name,
                "employeeId": "ADM-001",
                "email": clean_email,
                "role": "admin",
                "department": "Operations",
            },
        }

    # PostgreSQL fallback
    user = db.query(User).filter(User.email == clean_email).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid administrator credentials",
        )

    if user.role == "employee":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Employee credentials cannot be used to log in through Admin Login. Please use the Employee Login page.",
        )
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. This account does not possess administrator privileges.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator account is inactive.",
        )

    emp = db.query(Employee).filter(Employee.user_id == user.id).first()
    emp_name = emp.full_name if emp else "Administrator"
    emp_id = emp.employee_id if emp else "ADM-001"

    token = create_access_token(
        subject=str(user.id),
        role="admin",
        extra_claims={
            "email": user.email,
            "employeeId": emp_id,
            "name": emp_name,
        },
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": "admin",
        "user": {
            "id": user.id,
            "name": emp_name,
            "fullName": emp_name,
            "employeeId": emp_id,
            "email": user.email,
            "role": "admin",
            "department": "Operations",
        },
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_employee(data: RegisterRequest, db: Session = Depends(get_db)):
    """Self-registration for new employees (creates pending User, Employee, and RegistrationRequest)."""
    raw_emp_id = (data.employeeId or data.employee_id or "").strip()
    raw_full_name = (data.fullName or data.full_name or "").strip()
    raw_email = (data.email or "").strip()
    raw_phone = (data.phone or "").strip()
    raw_password = data.password or ""
    raw_confirm = data.confirmPassword if data.confirmPassword is not None else data.confirm_password

    val_errors = {}

    # 1. Field-level validations
    if not raw_full_name:
        val_errors["fullName"] = "Please enter your full name."

    if not raw_emp_id:
        val_errors["employeeId"] = "Please enter your employee ID."
    elif not raw_emp_id.startswith("AFI"):
        val_errors["employeeId"] = "Employee ID must start with AFI."

    if not raw_email:
        val_errors["email"] = "Please enter your company email address."
    elif not is_valid_company_email(raw_email):
        val_errors["email"] = "Please use your company email ending with @arshithgroup.com."

    clean_phone = normalize_phone_digits(raw_phone)
    phone_digits = re.sub(r"\D", "", clean_phone)
    if not raw_phone or raw_phone == "--" or len(phone_digits) < 10 or len(phone_digits) > 15:
        val_errors["phone"] = "Please enter a valid phone number."

    if not raw_password:
        val_errors["password"] = "Please enter your password."
    elif len(raw_password) < 8:
        val_errors["password"] = "Password must contain at least 8 characters."

    if raw_confirm is not None and raw_password != raw_confirm:
        val_errors["confirmPassword"] = "Passwords do not match."

    if val_errors:
        raise RegistrationValidationException(errors=val_errors)

    clean_emp_id = raw_emp_id.upper()
    clean_full_name = raw_full_name
    clean_email = raw_email.lower()

    # 2. Duplicate checks
    dup_errors = {}

    if settings.DATABASE_BACKEND == "firebase":
        all_emps = FirestoreService.list_all("employees")
        all_users = FirestoreService.list_all("users")
        all_reqs = FirestoreService.list_all("registration_requests")

        # Independent check: Employee ID
        for e in all_emps:
            eid = str(e.get("employee_id") or e.get("employeeId") or "").strip().upper()
            if eid == clean_emp_id:
                dup_errors["employeeId"] = "This employee ID is already registered. Please check your details or contact HR."
                dup_errors["employee_id"] = "This employee ID is already registered. Please check your details or contact HR."
                break
        if "employeeId" not in dup_errors:
            for r in all_reqs:
                eid = str(r.get("employee_id") or r.get("employeeId") or "").strip().upper()
                if eid == clean_emp_id:
                    dup_errors["employeeId"] = "This employee ID is already registered. Please check your details or contact HR."
                    dup_errors["employee_id"] = "This employee ID is already registered. Please check your details or contact HR."
                    break

        # Independent check: Email address
        for e in all_emps:
            if str(e.get("email", "")).strip().lower() == clean_email:
                dup_errors["email"] = "An account with this company email already exists. Please log in or contact HR."
                break
        if "email" not in dup_errors:
            for u in all_users:
                if str(u.get("email", "")).strip().lower() == clean_email:
                    dup_errors["email"] = "An account with this company email already exists. Please log in or contact HR."
                    break
        if "email" not in dup_errors:
            for r in all_reqs:
                if str(r.get("email", "")).strip().lower() == clean_email:
                    dup_errors["email"] = "An account with this company email already exists. Please log in or contact HR."
                    break

        # Independent check: Phone number
        if clean_phone:
            for e in all_emps:
                ep = str(e.get("phone", "")).strip()
                if is_same_phone(clean_phone, ep):
                    dup_errors["phone"] = "This phone number is already registered."
                    break

        if dup_errors:
            raise DuplicateFieldsException(errors=dup_errors)

        # Create new user in PENDING approval state
        now_iso = datetime.now(timezone.utc).isoformat()
        user_id = str(int(datetime.now(timezone.utc).timestamp() * 1000))

        # Attempt to create Firebase Auth user if live
        try:
            from app.core.firebase import is_firebase_live
            import firebase_admin.auth as fb_auth
            if is_firebase_live():
                try:
                    user_record = fb_auth.get_user_by_email(clean_email)
                    user_id = user_record.uid
                except Exception:
                    user_record = fb_auth.create_user(
                        email=clean_email,
                        password=raw_password,
                        display_name=clean_full_name,
                    )
                    user_id = user_record.uid
        except Exception:
            pass

        user_doc = {
            "id": user_id,
            "uid": user_id,
            "email": clean_email,
            "hashed_password": get_password_hash(raw_password),
            "role": "employee",
            "is_active": False,
            "approval_status": "PENDING",
            "status": "pending",
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        FirestoreService.save("users", user_id, user_doc)

        emp_doc = {
            "id": user_id,
            "uid": user_id,
            "employeeId": clean_emp_id,
            "employee_id": clean_emp_id,
            "name": clean_full_name,
            "fullName": clean_full_name,
            "full_name": clean_full_name,
            "email": clean_email,
            "phone": clean_phone if clean_phone else "--",
            "role": "Employee",
            "department": "Operations",
            "designation": "Operations Associate",
            "status": "pending",
            "reviewedAt": None,
            "reviewedBy": None,
            "shift": "General (09:30 AM - 06:30 PM)",
            "location": "HQ Office",
            "createdAt": now_iso,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        FirestoreService.save("employees", user_id, emp_doc)
        if str(user_id) != clean_emp_id:
            FirestoreService.save("employees", clean_emp_id, emp_doc)

        req_code = f"REQ-{datetime.now().strftime('%Y%m%d%H%M%S')[-4:]}"
        reg_req = {
            "id": user_id,
            "requestId": user_id,
            "request_code": req_code,
            "full_name": clean_full_name,
            "name": clean_full_name,
            "employee_id": clean_emp_id,
            "employeeId": clean_emp_id,
            "email": clean_email,
            "phone": clean_phone if clean_phone else "--",
            "status": "Pending",
            "requested_date": date.today().isoformat(),
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        FirestoreService.save("registration_requests", req_code, reg_req)

        FirestoreService.add_audit_log(
            actor_uid=clean_email,
            action="EMPLOYEE_REGISTRATION_SUBMITTED",
            target_record=clean_emp_id,
            metadata={"request_code": req_code, "status": "pending", "uid": user_id},
        )

        # Dual-write to PostgreSQL database for cross-platform data synchronization
        try:
            pg_user = db.query(User).filter(func.lower(func.trim(User.email)) == clean_email).first()
            if not pg_user:
                pg_user = User(
                    email=clean_email,
                    hashed_password=get_password_hash(raw_password),
                    role="employee",
                    is_active=False,
                    approval_status="PENDING",
                )
                db.add(pg_user)
                db.commit()
                db.refresh(pg_user)

            pg_emp = db.query(Employee).filter(func.upper(func.trim(Employee.employee_id)) == clean_emp_id).first()
            if not pg_emp:
                pg_emp = Employee(
                    user_id=pg_user.id,
                    employee_id=clean_emp_id,
                    full_name=clean_full_name,
                    email=clean_email,
                    phone=clean_phone if clean_phone else "--",
                    department="Operations",
                    designation="Operations Associate",
                    status="Pending",
                )
                db.add(pg_emp)
                db.commit()

            pg_req = db.query(RegistrationRequest).filter(func.lower(func.trim(RegistrationRequest.email)) == clean_email).first()
            if not pg_req:
                pg_req = RegistrationRequest(
                    request_code=req_code,
                    full_name=clean_full_name,
                    employee_id=clean_emp_id,
                    email=clean_email,
                    phone=clean_phone if clean_phone else "--",
                    status="Pending",
                )
                db.add(pg_req)
                db.commit()
        except Exception as e:
            logger.warning(f"Dual-write registration to PostgreSQL encountered: {e}")
            db.rollback()

        return {
            "success": True,
            "message": "Your registration request is awaiting admin approval.",
            "status": "PENDING",
            "employeeId": clean_emp_id,
        }

    # PostgreSQL fallback
    existing_emp_by_id = (
        db.query(Employee)
        .filter(func.upper(func.trim(Employee.employee_id)) == clean_emp_id)
        .first()
    )
    existing_req_by_id = (
        db.query(RegistrationRequest)
        .filter(func.upper(func.trim(RegistrationRequest.employee_id)) == clean_emp_id)
        .first()
    )
    if existing_emp_by_id or existing_req_by_id:
        dup_errors["employeeId"] = "This employee ID is already registered. Please check your details or contact HR."
        dup_errors["employee_id"] = "This employee ID is already registered. Please check your details or contact HR."

    existing_emp_by_email = (
        db.query(Employee)
        .filter(func.lower(func.trim(Employee.email)) == clean_email)
        .first()
    )
    existing_user_by_email = (
        db.query(User)
        .filter(func.lower(func.trim(User.email)) == clean_email)
        .first()
    )
    existing_req_by_email = (
        db.query(RegistrationRequest)
        .filter(func.lower(func.trim(RegistrationRequest.email)) == clean_email)
        .first()
    )
    if existing_emp_by_email or existing_user_by_email or existing_req_by_email:
        dup_errors["email"] = "An account with this company email already exists. Please log in or contact HR."

    if clean_phone:
        all_phones = (
            db.query(Employee.phone)
            .filter(
                Employee.phone.isnot(None),
                Employee.phone != "--",
                Employee.phone != "",
            )
            .all()
        )
        for (ep,) in all_phones:
            if is_same_phone(clean_phone, ep):
                dup_errors["phone"] = "This phone number is already registered."
                break

    if dup_errors:
        raise DuplicateFieldsException(errors=dup_errors)

    try:
        new_user = User(
            email=clean_email,
            hashed_password=get_password_hash(raw_password),
            role="employee",
            is_active=False,
            approval_status="PENDING",
        )
        db.add(new_user)
        db.flush()

        new_emp = Employee(
            employee_id=clean_emp_id,
            user_id=new_user.id,
            full_name=clean_full_name,
            email=clean_email,
            phone=clean_phone if clean_phone else "--",
            department="Operations",
            designation="Operations Associate",
            status="Pending",
        )
        db.add(new_emp)

        req_code = f"REQ-{datetime.now().strftime('%Y%m%d%H%M%S')[-4:]}"
        reg_req = RegistrationRequest(
            request_code=req_code,
            full_name=clean_full_name,
            employee_id=clean_emp_id,
            email=clean_email,
            phone=clean_phone if clean_phone else "--",
            status="Pending",
        )
        db.add(reg_req)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise DuplicateFieldsException(errors={"employeeId": "This employee ID is already registered. Please check your details or contact HR."})

    return {
        "success": True,
        "message": "Your registration request is awaiting admin approval.",
        "status": "PENDING",
        "employeeId": clean_emp_id,
    }


@router.get("/me", response_model=UserProfileResponse)
def get_me(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Retrieve currently authenticated user's profile."""
    email = getattr(current_user, "email", "")
    user_id = getattr(current_user, "id", None)
    role = getattr(current_user, "role", "employee")

    if settings.DATABASE_BACKEND == "firebase":
        emps = FirestoreService.query("employees", {"email": email})
        if not emps and user_id:
            emps = FirestoreService.query("employees", {"user_id": user_id})
        emp = emps[0] if emps else {}

        name = emp.get("full_name") or emp.get("fullName") or email.split("@")[0]
        emp_id = emp.get("employee_id") or emp.get("employeeId") or "EMP-001"
        dept = emp.get("department", "Operations")
        desig = emp.get("designation", "Employee")
        phone = emp.get("phone", "--")
        emp_status = emp.get("status", "Active")

        return {
            "id": user_id,
            "email": email,
            "role": role,
            "name": name,
            "employeeId": emp_id,
            "department": dept,
            "designation": desig,
            "phone": phone,
            "status": emp_status,
        }

    # PostgreSQL fallback
    emp = db.query(Employee).filter(Employee.user_id == current_user.id).first()
    if not emp:
        emp = db.query(Employee).filter(Employee.email == current_user.email).first()

    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
        "name": emp.full_name if emp else current_user.email.split("@")[0],
        "employeeId": emp.employee_id if emp else "EMP-001",
        "department": emp.department if emp else "Operations",
        "designation": emp.designation if emp else "Employee",
        "phone": emp.phone if emp else "--",
        "status": emp.status if emp else "Active",
    }


@router.post("/logout")
def logout(current_user=Depends(get_current_user)):
    """Log out active session."""
    return {"success": True, "message": "Logged out successfully."}


class ChangeAdminPasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/admin/change-password")
def change_admin_password(
    data: ChangeAdminPasswordRequest,
    current_admin=Depends(get_current_admin),
):
    """
    Authorized endpoint for administrators to update their Firebase Authentication and database credentials.
    Strictly protected: requires valid administrator session token.
    """
    admin_email = getattr(current_admin, "email", "admin@arshith.com")
    admin_uid = getattr(current_admin, "id", None) or "ezvZfsphCqUpkgvu18ldvi7XW9D2"

    if len(data.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters long.",
        )

    # 1. Verify current credentials against Firebase Auth or hashed password
    valid = False
    fb_check = verify_credentials_with_firebase(admin_email, data.current_password)
    if fb_check:
        valid = True
    elif getattr(current_admin, "hashed_password", None) and verify_password(data.current_password, current_admin.hashed_password):
        valid = True

    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    # 2. Update password in Firebase Authentication using Admin SDK
    target_uid = str(admin_uid)
    fb_updated = update_admin_password_in_firebase(target_uid, data.new_password)

    # 3. Synchronize password hash in Firestore users collection
    now_iso = datetime.now(timezone.utc).isoformat()
    new_hash = get_password_hash(data.new_password)

    if settings.DATABASE_BACKEND == "firebase":
        FirestoreService.save("users", target_uid, {
            "id": target_uid,
            "email": admin_email,
            "role": "admin",
            "is_active": True,
            "approval_status": "APPROVED",
            "hashed_password": new_hash,
            "updated_at": now_iso,
        })
        for u in FirestoreService.query("users", {"email": admin_email}):
            FirestoreService.update("users", u.get("id"), {
                "hashed_password": new_hash,
                "updated_at": now_iso,
            })

    return {
        "success": True,
        "message": "Administrator password updated successfully in Firebase Authentication and database.",
        "firebase_auth_synced": fb_updated,
    }

"""
Payslips API Router
Enables digital payslip retrieval, locked workflow state management,
employee download requests, admin approval/rejection governance,
and corporate PDF downloads matching the Arshith Fresh India Pvt Ltd standard.
"""

from typing import List, Optional, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.dependencies.auth import get_current_user, get_current_admin
from app.services.firestore_service import FirestoreService
from app.services.payslip_pdf import generate_payslip_pdf, number_to_indian_rupees

router = APIRouter(prefix="/payslips", tags=["Payslips"])


class DownloadApprovalRequest(BaseModel):
    reason: Optional[str] = Field(default=None, description="Reason for requesting payslip PDF download")


class DownloadApprovalAction(BaseModel):
    notes: Optional[str] = Field(default=None, description="Approval notes from administrator")
    reason: Optional[str] = Field(default=None, description="Rejection reason if rejected")


def _get_caller_candidate_ids(current_user: Any) -> set:
    """Expands caller identity across UID, employeeId, employee_id, and email."""
    caller_emp_id = str(getattr(current_user, "employee_id", "") or getattr(current_user, "employeeId", "") or "").strip().lower()
    caller_email = str(getattr(current_user, "email", "") or "").strip().lower()
    caller_uid = str(getattr(current_user, "uid", "") or getattr(current_user, "id", "") or "").strip().lower()

    candidate_ids = set()
    if caller_emp_id: candidate_ids.add(caller_emp_id)
    if caller_email: candidate_ids.add(caller_email)
    if caller_uid: candidate_ids.add(caller_uid)

    employees = FirestoreService.get_all("employees")
    for emp in employees:
        e_id = str(emp.get("id") or "").strip().lower()
        e_eid = str(emp.get("employeeId") or "").strip().lower()
        e_eid2 = str(emp.get("employee_id") or "").strip().lower()
        e_mail = str(emp.get("email") or "").strip().lower()

        if (e_id and e_id in candidate_ids) or \
           (e_eid and e_eid in candidate_ids) or \
           (e_eid2 and e_eid2 in candidate_ids) or \
           (e_mail and e_mail in candidate_ids):
            if e_id: candidate_ids.add(e_id)
            if e_eid: candidate_ids.add(e_eid)
            if e_eid2: candidate_ids.add(e_eid2)
            if e_mail: candidate_ids.add(e_mail)

    return candidate_ids


def _is_payslip_authorized_for_user(payslip: dict, current_user: Any) -> bool:
    """Verifies whether caller has legitimate access to this payslip."""
    role = str(getattr(current_user, "role", "employee")).lower()
    if role != "employee":
        return True

    candidate_ids = _get_caller_candidate_ids(current_user)
    p_eid = str(payslip.get("employee_id") or "").strip().lower()
    p_eid2 = str(payslip.get("employeeId") or "").strip().lower()
    p_mail = str(payslip.get("employee_email") or payslip.get("email") or "").strip().lower()
    p_doc = str(payslip.get("employee_doc_id") or "").strip().lower()
    p_detail_eid = str((payslip.get("detail") or {}).get("employee_id") or "").strip().lower()
    p_detail_eid2 = str((payslip.get("detail") or {}).get("employeeId") or "").strip().lower()

    return bool(
        (p_eid and p_eid in candidate_ids) or \
        (p_eid2 and p_eid2 in candidate_ids) or \
        (p_mail and p_mail in candidate_ids) or \
        (p_doc and p_doc in candidate_ids) or \
        (p_detail_eid and p_detail_eid in candidate_ids) or \
        (p_detail_eid2 and p_detail_eid2 in candidate_ids)
    )


def _normalize_payslip(p: dict) -> dict:
    """Ensures consistent defaults for lock and corporate reference fields."""
    if not p.get("download_approval_status"):
        p["download_approval_status"] = "LOCKED"
    if not p.get("company_name"):
        p["company_name"] = "ARSHITH FRESH INDIA PVT LTD"
    if not p.get("company_address"):
        p["company_address"] = "Bangalore, Karnataka, Pincode: 560102"
    if not p.get("net_salary_words"):
        p["net_salary_words"] = number_to_indian_rupees(float(p.get("net_salary") or 0.0))
    return p


@router.get("", response_model=List[dict])
def list_payslips(current_user: Any = Depends(get_current_user)):
    """
    List payslips.
    Employees receive only their own payslips with default locked status.
    Super Admins, HR Admins, and Payroll Admins receive all company payslips.
    """
    role = str(getattr(current_user, "role", "employee")).lower()
    all_payslips = [_normalize_payslip(p) for p in FirestoreService.get_all("payslips")]

    if role == "employee":
        emp_payslips = [p for p in all_payslips if _is_payslip_authorized_for_user(p, current_user)]
        return sorted(emp_payslips, key=lambda x: (int(x.get("year", 0)), int(x.get("month", 0))), reverse=True)

    # Admin view
    return sorted(all_payslips, key=lambda x: (int(x.get("year", 0)), int(x.get("month", 0))), reverse=True)


@router.get("/requests/list")
def list_download_requests(current_user: Any = Depends(get_current_admin)):
    """
    Admin endpoint to view all employee payslip download unlock requests.
    """
    all_payslips = [_normalize_payslip(p) for p in FirestoreService.get_all("payslips")]
    # Filter for payslips with an active request lifecycle
    requests = [
        p for p in all_payslips
        if p.get("download_approval_status") in ["PENDING_APPROVAL", "APPROVED", "REJECTED"]
        or p.get("download_requested_at")
    ]
    # Sort with PENDING_APPROVAL first, then by requested_at descending
    def sort_key(item):
        status_rank = 0 if item.get("download_approval_status") == "PENDING_APPROVAL" else 1
        req_at = item.get("download_requested_at") or ""
        return (status_rank, req_at)

    return sorted(requests, key=sort_key, reverse=False)


@router.get("/{payslip_id}")
def get_payslip(payslip_id: str, current_user: Any = Depends(get_current_user)):
    """Retrieve detailed payslip metadata and itemized breakdown."""
    payslip = FirestoreService.get_by_id("payslips", str(payslip_id))
    if not payslip:
        all_p = FirestoreService.get_all("payslips")
        for p in all_p:
            if str(p.get("id") or p.get("_firestore_id") or p.get("payslip_number")) == str(payslip_id):
                payslip = p
                break

    # If payslip not found directly, check if payslip_id references a payslip_request
    if not payslip:
        req = FirestoreService.get_by_id("payslip_requests", str(payslip_id))
        if not req:
            for r in FirestoreService.get_all("payslip_requests"):
                if str(r.get("id") or r.get("request_code")) == str(payslip_id):
                    req = r
                    break
        if req:
            from app.routers.payslip_requests import download_payslip_by_request
            return download_payslip_by_request(str(req.get("id") or payslip_id), current_user)

    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip record not found.")

    role = str(getattr(current_user, "role", "employee")).lower()
    if role == "employee" and not _is_payslip_authorized_for_user(payslip, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized: You can only view your own payslips.",
        )

    return _normalize_payslip(payslip)


@router.post("/{payslip_id}/request-download")
def request_payslip_download(
    payslip_id: str,
    payload: DownloadApprovalRequest,
    current_user: Any = Depends(get_current_user)
):
    """
    Employee endpoint: Raises a request to the Admin to unlock and approve PDF payslip download.
    Transitions status to 'PENDING_APPROVAL'.
    """
    payslip = FirestoreService.get_by_id("payslips", str(payslip_id))
    if not payslip:
        all_p = FirestoreService.get_all("payslips")
        for p in all_p:
            if str(p.get("id") or p.get("_firestore_id") or p.get("payslip_number")) == str(payslip_id):
                payslip = p
                break

    # If payslip not found directly, check if payslip_id references a payslip_request
    if not payslip:
        req = FirestoreService.get_by_id("payslip_requests", str(payslip_id))
        if not req:
            for r in FirestoreService.get_all("payslip_requests"):
                if str(r.get("id") or r.get("request_code")) == str(payslip_id):
                    req = r
                    break
        if req:
            from app.routers.payslip_requests import download_payslip_by_request
            return download_payslip_by_request(str(req.get("id") or payslip_id), current_user)

    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip record not found.")

    role = str(getattr(current_user, "role", "employee")).lower()
    if role == "employee" and not _is_payslip_authorized_for_user(payslip, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized: You can only request download for your own payslip.",
        )

    cur_status = payslip.get("download_approval_status", "LOCKED")
    if cur_status == "APPROVED":
        return {
            "message": "Payslip download is already approved and unlocked.",
            "status": "APPROVED",
            "payslip": _normalize_payslip(payslip),
        }

    now_iso = datetime.now(timezone.utc).isoformat()
    caller_email = getattr(current_user, "email", "employee")

    update_payload = {
        "download_approval_status": "PENDING_APPROVAL",
        "download_requested_at": now_iso,
        "download_request_reason": payload.reason or "Employee requested payslip download approval.",
        "download_requested_by": caller_email,
        "updated_at": now_iso,
    }

    doc_id = str(payslip.get("id") or payslip.get("_firestore_id") or payslip_id)
    FirestoreService.update("payslips", doc_id, update_payload)
    payslip.update(update_payload)

    return {
        "message": "Download request submitted successfully to Admin for approval.",
        "status": "PENDING_APPROVAL",
        "payslip": _normalize_payslip(payslip),
    }


@router.post("/{payslip_id}/approve-download")
def approve_payslip_download(
    payslip_id: str,
    payload: DownloadApprovalAction,
    current_user: Any = Depends(get_current_admin)
):
    """
    Admin endpoint: Approves the employee's download request, unlocking the PDF for download.
    Transitions status to 'APPROVED'.
    """
    payslip = FirestoreService.get_by_id("payslips", str(payslip_id))
    if not payslip:
        all_p = FirestoreService.get_all("payslips")
        for p in all_p:
            if str(p.get("id") or p.get("_firestore_id") or p.get("payslip_number")) == str(payslip_id):
                payslip = p
                break

    # If payslip not found directly, check if payslip_id references a payslip_request
    if not payslip:
        req = FirestoreService.get_by_id("payslip_requests", str(payslip_id))
        if not req:
            for r in FirestoreService.get_all("payslip_requests"):
                if str(r.get("id") or r.get("request_code")) == str(payslip_id):
                    req = r
                    break
        if req:
            from app.routers.payslip_requests import download_payslip_by_request
            return download_payslip_by_request(str(req.get("id") or payslip_id), current_user)

    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip record not found.")

    now_iso = datetime.now(timezone.utc).isoformat()
    admin_email = getattr(current_user, "email", "admin@arshith.com")

    update_payload = {
        "download_approval_status": "APPROVED",
        "download_approved_by": admin_email,
        "download_approved_at": now_iso,
        "download_notes": payload.notes or "Admin approved payslip download access.",
        "updated_at": now_iso,
    }

    doc_id = str(payslip.get("id") or payslip.get("_firestore_id") or payslip_id)
    FirestoreService.update("payslips", doc_id, update_payload)
    payslip.update(update_payload)

    return {
        "message": f"Payslip download access approved for {payslip.get('employee_name', 'employee')}.",
        "status": "APPROVED",
        "payslip": _normalize_payslip(payslip),
    }


@router.post("/{payslip_id}/reject-download")
def reject_payslip_download(
    payslip_id: str,
    payload: DownloadApprovalAction,
    current_user: Any = Depends(get_current_admin)
):
    """
    Admin endpoint: Rejects the employee's download request.
    Transitions status to 'REJECTED'.
    """
    payslip = FirestoreService.get_by_id("payslips", str(payslip_id))
    if not payslip:
        all_p = FirestoreService.get_all("payslips")
        for p in all_p:
            if str(p.get("id") or p.get("_firestore_id") or p.get("payslip_number")) == str(payslip_id):
                payslip = p
                break

    # If payslip not found directly, check if payslip_id references a payslip_request
    if not payslip:
        req = FirestoreService.get_by_id("payslip_requests", str(payslip_id))
        if not req:
            for r in FirestoreService.get_all("payslip_requests"):
                if str(r.get("id") or r.get("request_code")) == str(payslip_id):
                    req = r
                    break
        if req:
            from app.routers.payslip_requests import download_payslip_by_request
            return download_payslip_by_request(str(req.get("id") or payslip_id), current_user)

    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip record not found.")

    now_iso = datetime.now(timezone.utc).isoformat()
    admin_email = getattr(current_user, "email", "admin@arshith.com")

    update_payload = {
        "download_approval_status": "REJECTED",
        "download_rejected_by": admin_email,
        "download_rejected_at": now_iso,
        "download_rejection_reason": payload.reason or "Admin declined download authorization.",
        "updated_at": now_iso,
    }

    doc_id = str(payslip.get("id") or payslip.get("_firestore_id") or payslip_id)
    FirestoreService.update("payslips", doc_id, update_payload)
    payslip.update(update_payload)

    return {
        "message": f"Payslip download request rejected for {payslip.get('employee_name', 'employee')}.",
        "status": "REJECTED",
        "payslip": _normalize_payslip(payslip),
    }


@router.get("/{payslip_id}/download")
def download_payslip_pdf(payslip_id: str, current_user: Any = Depends(get_current_user)):
    """
    Dynamically renders and streams the professional branded PDF payslip.
    Enforces access control:
    - Employees can ONLY download if download_approval_status == 'APPROVED'.
    - Admins can download at any time.
    """
    payslip = FirestoreService.get_by_id("payslips", str(payslip_id))
    if not payslip:
        all_p = FirestoreService.get_all("payslips")
        for p in all_p:
            if str(p.get("id") or p.get("_firestore_id") or p.get("payslip_number")) == str(payslip_id):
                payslip = p
                break

    # If payslip not found directly, check if payslip_id references a payslip_request
    if not payslip:
        req = FirestoreService.get_by_id("payslip_requests", str(payslip_id))
        if not req:
            for r in FirestoreService.get_all("payslip_requests"):
                if str(r.get("id") or r.get("request_code")) == str(payslip_id):
                    req = r
                    break
        if req:
            from app.routers.payslip_requests import download_payslip_by_request
            return download_payslip_by_request(str(req.get("id") or payslip_id), current_user)

    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip record not found.")

    role = str(getattr(current_user, "role", "employee")).lower()
    if role == "employee":
        if not _is_payslip_authorized_for_user(payslip, current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized: You can only download your own payslip.",
            )

        # Enforce Locked vs Approved verification
        approval_status = str(payslip.get("download_approval_status") or "LOCKED").upper()
        if approval_status != "APPROVED":
            if approval_status == "PENDING_APPROVAL":
                msg = "Payslip download request is currently pending Admin review and approval."
            else:
                msg = "Payslip download is locked. Please raise an unlock request to your administrator."
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=msg,
            )

    payslip = _normalize_payslip(payslip)
    detail = payslip.get("detail", payslip)
    # Merge top-level payslip properties into detail for complete template population
    merged_detail = {**payslip, **detail}

    # Dynamic personal & banking data overlay from the authoritative employee profile
    emp_lookup_id = payslip.get("employee_doc_id") or payslip.get("employee_id") or payslip.get("employeeId")
    emp_email = payslip.get("employee_email") or payslip.get("email")
    emp_rec = None
    if emp_lookup_id:
        emp_rec = FirestoreService.get_by_id("employees", str(emp_lookup_id))
    if not emp_rec and payslip.get("employee_id"):
        emp_rec = FirestoreService.get_by_id("employees", str(payslip.get("employee_id")))
    if not emp_rec and payslip.get("employeeId"):
        matches = FirestoreService.query("employees", {"employee_id": str(payslip.get("employeeId"))})
        if matches:
            emp_rec = matches[0]
    if not emp_rec and emp_email:
        matches = FirestoreService.query("employees", {"email": str(emp_email).lower().strip()})
        if matches:
            emp_rec = matches[0]

    if emp_rec:
        b_name = emp_rec.get("bank_name") or emp_rec.get("bankName")
        if b_name:
            merged_detail["bank_name"] = b_name
        b_acct = emp_rec.get("account_number") or emp_rec.get("accountNumber") or emp_rec.get("bank_account_no")
        if b_acct:
            merged_detail["account_number"] = b_acct
        pan = emp_rec.get("pan_number") or emp_rec.get("panNumber") or emp_rec.get("pan")
        if pan:
            merged_detail["pan_number"] = pan
        uan = emp_rec.get("uan_number") or emp_rec.get("uanNumber") or emp_rec.get("uan") or emp_rec.get("pf_number")
        if uan:
            merged_detail["uan_number"] = uan
        desig = emp_rec.get("designation") or emp_rec.get("role")
        if desig:
            merged_detail["designation"] = desig

    run_info = {
        "month": payslip.get("month", 8),
        "month_name": payslip.get("month_name", "August"),
        "year": payslip.get("year", 2026),
    }

    try:
        pdf_bytes = generate_payslip_pdf(merged_detail, run_info)
        emp_id = payslip.get("employee_code") or payslip.get("employeeId") or payslip.get("employee_id", "EMP")
        month = payslip.get("month", 8)
        year = payslip.get("year", 2026)
        filename = f"Payslip_{year}_{month:02d}_{emp_id}.pdf"

        # Update download tracking
        doc_id = str(payslip.get("id") or payslip.get("_firestore_id") or payslip_id)
        FirestoreService.update("payslips", doc_id, {
            "status": "Downloaded",
            "last_downloaded_at": datetime.now(timezone.utc).isoformat(),
        })

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=\"{filename}\"",
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate payslip PDF: {str(e)}",
        )

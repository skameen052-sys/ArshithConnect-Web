"""
Payroll API Router
Manages automated monthly payroll batch calculations, exception reviews,
multi-stage approvals, finalization locks, and immutability controls.
"""

from typing import List, Optional, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.dependencies.auth import get_current_user, get_current_admin
from app.services.firestore_service import FirestoreService
from app.services.payroll_engine import PayrollEngine, round_curr

router = APIRouter(prefix="/payroll", tags=["Payroll Engine"])


class CalculatePayrollRequest(BaseModel):
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2020, le=2050)
    custom_payroll_days: Optional[int] = Field(default=None, ge=20, le=31)
    notes: Optional[str] = None


class PayrollActionRequest(BaseModel):
    notes: Optional[str] = None


@router.get("/runs", response_model=List[dict])
def list_payroll_runs(current_user: Any = Depends(get_current_admin)):
    """List all monthly payroll calculation batches."""
    runs = FirestoreService.get_all("payroll_runs")
    # Sort descending by year and month
    def sort_key(r):
        return (int(r.get("year", 0)), int(r.get("month", 0)))
    sorted_runs = sorted(runs, key=sort_key, reverse=True)
    return sorted_runs


@router.get("/runs/{run_id}")
def get_payroll_run(run_id: str, current_user: Any = Depends(get_current_admin)):
    """Retrieve full payroll batch details including all employee line items."""
    run = FirestoreService.get_by_id("payroll_runs", str(run_id))
    if not run:
        # Try finding in list by string or int id
        all_runs = FirestoreService.get_all("payroll_runs")
        for r in all_runs:
            if str(r.get("id") or r.get("_firestore_id")) == str(run_id):
                run = r
                break

    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payroll batch '{run_id}' was not found.",
        )

    return run


@router.post("/calculate", status_code=status.HTTP_201_CREATED)
def calculate_monthly_payroll(payload: CalculatePayrollRequest, current_user: Any = Depends(get_current_admin)):
    """
    Executes automated attendance-driven payroll calculation engine for the designated month/year.
    Validates attendance punches, approved leaves, LOP, statutory PF/ESI, and active loan deductions.
    """
    admin_id = str(getattr(current_user, "id", None) or getattr(current_user, "uid", "admin"))
    admin_email = getattr(current_user, "email", "admin@arshith.com")

    try:
        run = PayrollEngine.process_monthly_payroll_run(
            year=payload.year,
            month=payload.month,
            user_id=admin_id,
            user_email=admin_email,
            notes=payload.notes or "",
            custom_payroll_days=payload.custom_payroll_days,
        )
        return {
            "message": f"Payroll calculation completed for {payload.month:02d}/{payload.year}.",
            "run": run,
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Calculation engine encountered an error: {str(e)}",
        )


@router.post("/runs/{run_id}/review")
def review_payroll_run(run_id: str, payload: PayrollActionRequest, current_user: Any = Depends(get_current_admin)):
    """Transitions payroll run from CALCULATED to UNDER_REVIEW."""
    run = FirestoreService.get_by_id("payroll_runs", str(run_id))
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found.")

    cur_status = str(run.get("status", "")).upper()
    if cur_status not in ["CALCULATED", "DRAFT"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot move run in status '{cur_status}' to UNDER_REVIEW."
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    reviewer = getattr(current_user, "email", "admin")
    update_data = {
        "status": "UNDER_REVIEW",
        "reviewed_by": reviewer,
        "reviewed_at": now_iso,
        "review_notes": payload.notes,
        "updated_at": now_iso,
    }
    FirestoreService.update("payroll_runs", str(run_id), update_data)
    run.update(update_data)
    return {"message": "Payroll run moved to UNDER_REVIEW status.", "run": run}


@router.post("/runs/{run_id}/approve")
def approve_payroll_run(run_id: str, payload: PayrollActionRequest, current_user: Any = Depends(get_current_admin)):
    """Authorized approval transitioning payroll run to APPROVED."""
    run = FirestoreService.get_by_id("payroll_runs", str(run_id))
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found.")

    cur_status = str(run.get("status", "")).upper()
    if cur_status not in ["CALCULATED", "UNDER_REVIEW"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve payroll run in status '{cur_status}'. Must be CALCULATED or UNDER_REVIEW."
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    approver = getattr(current_user, "email", "admin")
    update_data = {
        "status": "APPROVED",
        "approved_by": approver,
        "approved_at": now_iso,
        "approval_notes": payload.notes,
        "updated_at": now_iso,
    }
    FirestoreService.update("payroll_runs", str(run_id), update_data)
    run.update(update_data)
    return {"message": "Payroll run approved successfully.", "run": run}


@router.post("/runs/{run_id}/finalize")
def finalize_payroll_run(run_id: str, payload: PayrollActionRequest, current_user: Any = Depends(get_current_admin)):
    """
    Finalizes and locks the payroll run.
    1. Sets status to FINALIZED (immutable).
    2. Generates individual digital payslip records.
    3. Decrements outstanding balances on employee loans.
    4. Generates salary payment disbursement queue.
    """
    run = FirestoreService.get_by_id("payroll_runs", str(run_id))
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found.")

    cur_status = str(run.get("status", "")).upper()
    if cur_status not in ["APPROVED", "CALCULATED", "UNDER_REVIEW"]:
        raise HTTPException(
            status_code=400,
            detail=f"Only APPROVED or CALCULATED payroll runs can be finalized. Current status is '{cur_status}'."
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    finalizer = getattr(current_user, "email", "admin")
    details = run.get("details", [])

    # Clean up any existing payslips for this run to avoid duplicates
    existing_payslips = FirestoreService.get_all("payslips")
    for ep in existing_payslips:
        if str(ep.get("payroll_run_id")) == str(run_id):
            ep_id = ep.get("id") or ep.get("_firestore_id")
            if ep_id:
                try:
                    FirestoreService.delete("payslips", str(ep_id))
                except Exception:
                    pass

    # 1. Generate payslips in collection with rich employee identifiers and statutory breakdowns
    month = run.get("month", 1)
    year = run.get("year", 2026)
    month_name = run.get("month_name", "Month")

    for d in details:
        emp_id = str(d.get("employee_id"))
        emp_code = str(d.get("employeeId") or emp_id)
        emp_email = str(d.get("employee_email") or "")
        emp_doc_id = str(d.get("employee_doc_id") or "")
        ps_num = f"PS-{year}{month:02d}-{emp_code or emp_id}"

        # Fetch latest employee profile to pick up personal/banking/statutory info kept by employee
        latest_emp = None
        if emp_doc_id:
            latest_emp = FirestoreService.get_by_id("employees", emp_doc_id)
        if not latest_emp and emp_code:
            matches = FirestoreService.query("employees", {"employee_id": emp_code})
            if matches:
                latest_emp = matches[0]
        if not latest_emp and emp_id:
            latest_emp = FirestoreService.get_by_id("employees", emp_id)
        if not latest_emp and emp_email:
            matches = FirestoreService.query("employees", {"email": emp_email})
            if matches:
                latest_emp = matches[0]

        final_bank_name = (latest_emp.get("bank_name") or latest_emp.get("bankName") if latest_emp else None) or d.get("bank_name") or "—"
        final_acct_no = (latest_emp.get("account_number") or latest_emp.get("accountNumber") or latest_emp.get("bank_account_no") if latest_emp else None) or d.get("account_number") or "—"
        final_pan_no = (latest_emp.get("pan_number") or latest_emp.get("panNumber") or latest_emp.get("pan") if latest_emp else None) or d.get("pan_number") or "—"
        final_uan_no = (latest_emp.get("uan_number") or latest_emp.get("uanNumber") or latest_emp.get("uan") or latest_emp.get("pf_number") if latest_emp else None) or d.get("uan_number") or "—"
        final_desig = (latest_emp.get("designation") or latest_emp.get("role") if latest_emp else None) or d.get("designation") or "Operations Associate"

        # Update detail payload
        d["bank_name"] = final_bank_name
        d["account_number"] = final_acct_no
        d["pan_number"] = final_pan_no
        d["uan_number"] = final_uan_no
        d["designation"] = final_desig
        
        payslip_doc = {
            "payslip_number": ps_num,
            "payroll_run_id": str(run_id),
            "employee_id": emp_id,
            "employeeId": emp_code,
            "employee_email": emp_email,
            "employee_doc_id": emp_doc_id,
            "employee_name": d.get("employee_name"),
            "department": d.get("department"),
            "designation": final_desig,
            "month": month,
            "year": year,
            "month_name": month_name,
            "total_days": d.get("total_days", 30),
            "payable_days": d.get("payable_days", 30),
            "unpaid_days": d.get("unpaid_days", 0),
            "sundays": d.get("sundays", 4),
            "weekly_offs": d.get("sundays", 4),
            "holidays": d.get("holidays", 0),
            "holiday_names": d.get("holiday_names", []),
            "present_days": d.get("present_days", 0.0),
            "approved_leave_days": d.get("approved_leave_days", 0.0),
            "basic_salary": d.get("basic_salary", 0.0),
            "hra": d.get("hra", 0.0),
            "other_allowances": d.get("other_allowances", 0.0),
            "gross_salary": d.get("gross_salary", 0.0),
            "loss_of_pay": d.get("loss_of_pay", 0.0),
            "adjusted_gross": d.get("adjusted_gross", 0.0),
            "pf_wage_base": d.get("pf_wage_base", 0.0),
            "employee_pf": d.get("employee_pf", 0.0),
            "employer_pf": d.get("employer_pf", 0.0),
            "employee_esi": d.get("employee_esi", 0.0),
            "professional_tax": d.get("professional_tax", 0.0),
            "income_tax_tds": d.get("income_tax_tds", 0.0),
            "loan_deduction": d.get("loan_deduction", 0.0),
            "total_deductions": d.get("total_deductions", 0.0),
            "net_salary": d.get("net_salary", 0.0),
            "bank_name": final_bank_name,
            "account_number": final_acct_no,
            "pan_number": final_pan_no,
            "uan_number": final_uan_no,
            "company_name": "ARSHITH FRESH INDIA PVT LTD",
            "company_address": "Bangalore, Karnataka, Pincode: 560102",
            "date_of_joining": d.get("date_of_joining", "16-Jan-2025"),
            "location": d.get("location", "Bangalore"),
            "gender": d.get("gender", "Male"),
            "download_approval_status": "LOCKED",
            "download_requested_at": None,
            "download_request_reason": None,
            "download_approved_by": None,
            "download_approved_at": None,
            "detail": d,
            "status": "Generated",
            "generated_at": now_iso,
        }
        FirestoreService.create("payslips", payslip_doc)

        # 2. Decrement loan balance if loan deduction was made
        loan_id = d.get("loan_id")
        loan_ded = float(d.get("loan_deduction", 0.0))
        if loan_id and loan_ded > 0:
            loan_doc = FirestoreService.get_by_id("employee_loans", str(loan_id))
            if loan_doc:
                cur_bal = float(loan_doc.get("remaining_balance", 0.0))
                new_bal = max(0.0, round_curr(cur_bal - loan_ded))
                l_update = {
                    "remaining_balance": new_bal,
                    "updated_at": now_iso,
                }
                if new_bal <= 0:
                    l_update["status"] = "CLOSED"
                FirestoreService.update("employee_loans", str(loan_id), l_update)

        # 3. Create salary payment record
        payment_doc = {
            "payroll_run_id": str(run_id),
            "employee_id": emp_id,
            "employee_name": d.get("employee_name"),
            "amount": d.get("net_salary"),
            "bank_name": d.get("bank_name", "HDFC"),
            "account_number": d.get("account_number", "XXXX"),
            "payment_reference": f"PAY-{year}{month:02d}-{emp_id}",
            "payment_method": "Bank Transfer",
            "status": "Approved",
            "created_at": now_iso,
        }
        FirestoreService.create("salary_payments", payment_doc)

    update_data = {
        "status": "FINALIZED",
        "finalized_by": finalizer,
        "finalized_at": now_iso,
        "finalization_notes": payload.notes,
        "updated_at": now_iso,
    }
    FirestoreService.update("payroll_runs", str(run_id), update_data)
    run.update(update_data)

    return {
        "message": f"Payroll run finalized and locked successfully. Generated {len(details)} payslips and payment records.",
        "run": run,
    }


@router.get("/runs/{run_id}/exceptions")
def get_payroll_exceptions(run_id: str, current_user: Any = Depends(get_current_admin)):
    """Inspect attendance anomalies, high LOP instances, and missing records."""
    run = FirestoreService.get_by_id("payroll_runs", str(run_id))
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found.")

    details = run.get("details", [])
    high_lop_cases = [d for d in details if float(d.get("unpaid_days", 0)) >= 3.0]
    zero_pay_cases = [d for d in details if float(d.get("payable_days", 0)) <= 0.0]

    return {
        "run_id": run_id,
        "total_employees": len(details),
        "high_lop_cases": high_lop_cases,
        "zero_pay_cases": zero_pay_cases,
        "all_clear": len(high_lop_cases) == 0 and len(zero_pay_cases) == 0,
    }


@router.delete("/runs/{run_id}")
def delete_payroll_run(run_id: str, current_user: Any = Depends(get_current_admin)):
    """
    Deletes a preliminary DRAFT or CALCULATED payroll run.
    Guards immutability: Rejects deletion if run is FINALIZED or PAID.
    """
    run = FirestoreService.get_by_id("payroll_runs", str(run_id))
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found.")

    cur_status = str(run.get("status", "")).upper()
    if cur_status in ["FINALIZED", "PAYMENT_PROCESSING", "PAID"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Integrity Violation: Finalized or disbursed payroll runs cannot be deleted.",
        )

    FirestoreService.delete("payroll_runs", str(run_id))
    return {"message": f"Preliminary payroll batch '{run_id}' deleted successfully."}

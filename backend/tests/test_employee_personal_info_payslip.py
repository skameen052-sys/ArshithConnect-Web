"""
Test Suite: Employee Personal & Statutory Information and Dynamic Payslip Sync
Verifies:
1. Employee can save personal details (Role in office, Bank Name, Account Number, PAN, UAN/PF) via PATCH /api/employees/me.
2. GET /api/employees/me returns the updated personal & banking info.
3. Payroll calculation and finalization captures the individual employee's kept details.
4. Generated payslips and PDF downloads reflect the employee's exact personal & banking details.
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_access_token
from app.services.firestore_service import FirestoreService
from app.services.payroll_engine import PayrollEngine
from app.services.payslip_pdf import generate_payslip_pdf

client = TestClient(app)

TEST_EMP_ID = "AFI-001"
TEST_EMP_EMAIL = "employee@arshith.com"


@pytest.fixture(autouse=True)
def setup_test_employee():
    """Ensure test employee exists in Firestore / local DB with clean state."""
    emp_doc = {
        "id": TEST_EMP_ID,
        "employee_id": TEST_EMP_ID,
        "employeeId": TEST_EMP_ID,
        "name": "Arshith Staff",
        "full_name": "Arshith Staff",
        "email": TEST_EMP_EMAIL,
        "phone": "9876543210",
        "department": "Engineering",
        "designation": "Associate Engineer",
        "role": "Associate Engineer",
        "status": "Active",
        "shift": "General (09:30 AM - 06:30 PM)",
        "location": "HQ Office",
        "bank_name": "Initial Bank",
        "account_number": "111122223333",
        "pan_number": "INITP1234A",
        "uan_number": "100111222333",
    }
    FirestoreService.save("employees", TEST_EMP_ID, emp_doc)
    user_doc = {
        "id": TEST_EMP_ID,
        "email": TEST_EMP_EMAIL,
        "role": "employee",
        "is_active": True,
        "approval_status": "APPROVED",
        "employee_id": TEST_EMP_ID,
        "employeeId": TEST_EMP_ID,
    }
    FirestoreService.save("users", TEST_EMP_ID, user_doc)


def test_employee_update_and_get_personal_information():
    """Employee updates role, bank name, account number, pan card, and uan number."""
    token = create_access_token(
        subject=TEST_EMP_ID,
        role="employee",
        extra_claims={
            "email": TEST_EMP_EMAIL,
            "employeeId": TEST_EMP_ID,
            "name": "Rohan Kumar",
        },
    )

    update_payload = {
        "fullName": "Rohan Kumar",
        "role": "Lead Systems Architect",
        "phone": "9876501234",
        "bankName": "Kotak Mahindra Bank",
        "accountNumber": "98765432101234",
        "panNumber": "ABCDE1234F",
        "uanNumber": "100987654321",
    }

    # 1. Update personal information
    patch_res = client.patch(
        "/api/employees/me",
        headers={"Authorization": f"Bearer {token}"},
        json=update_payload,
    )
    assert patch_res.status_code == 200, patch_res.text
    data = patch_res.json()
    assert data["name"] == "Rohan Kumar"
    assert data["role"] == "Lead Systems Architect"
    assert data["designation"] == "Lead Systems Architect"
    assert data["bank_name"] == "Kotak Mahindra Bank"
    assert data["account_number"] == "98765432101234"
    assert data["pan_number"] == "ABCDE1234F"
    assert data["uan_number"] == "100987654321"

    # 2. Retrieve personal information
    get_res = client.get(
        "/api/employees/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert get_res.status_code == 200
    retrieved = get_res.json()
    assert retrieved["name"] == "Rohan Kumar"
    assert retrieved["designation"] == "Lead Systems Architect"
    assert retrieved["bank_name"] == "Kotak Mahindra Bank"
    assert retrieved["account_number"] == "98765432101234"
    assert retrieved["pan_number"] == "ABCDE1234F"
    assert retrieved["uan_number"] == "100987654321"


def test_payroll_and_payslip_generation_with_employee_kept_details():
    """Verify that when admin calculates & finalizes payroll, the payslip contains employee's details."""
    admin_token = create_access_token(
        subject="ADM-001",
        role="admin",
        extra_claims={"email": "admin@arshith.com"},
    )

    # Set custom personal information for employee
    custom_emp = {
        "id": TEST_EMP_ID,
        "employee_id": TEST_EMP_ID,
        "employeeId": TEST_EMP_ID,
        "name": "Rohan Kumar",
        "full_name": "Rohan Kumar",
        "email": TEST_EMP_EMAIL,
        "phone": "9876501234",
        "department": "Engineering",
        "designation": "Principal Cloud Engineer",
        "role": "Principal Cloud Engineer",
        "status": "Active",
        "shift": "General (09:30 AM - 06:30 PM)",
        "location": "HQ Office",
        "bank_name": "Axis Bank Ltd",
        "account_number": "918010045678901",
        "pan_number": "XYZAB5678C",
        "uan_number": "100555666777",
    }
    FirestoreService.save("employees", TEST_EMP_ID, custom_emp)

    # Setup active salary structure
    salary_doc = {
        "employee_id": TEST_EMP_ID,
        "employeeId": TEST_EMP_ID,
        "basic_salary": 25000.0,
        "hra": 10000.0,
        "other_allowances": 5000.0,
        "pf_applicable": True,
        "pf_wage_base": 15000.0,
        "esi_applicable": False,
        "professional_tax": 200.0,
        "is_active": True,
    }
    FirestoreService.save("salary_structures", f"struct_{TEST_EMP_ID}", salary_doc)

    # Calculate payroll
    calc_res = client.post(
        "/api/payroll/calculate",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"month": 11, "year": 2026, "notes": "Personal info sync test"},
    )
    assert calc_res.status_code == 201, calc_res.text
    run_data = calc_res.json()["run"]
    run_id = str(run_data["id"])

    # Find the detail item for this employee
    emp_detail = next((d for d in run_data["details"] if str(d.get("employee_id")) == TEST_EMP_ID), None)
    assert emp_detail is not None
    assert emp_detail["designation"] == "Principal Cloud Engineer"
    assert emp_detail["bank_name"] == "Axis Bank Ltd"
    assert emp_detail["account_number"] == "918010045678901"
    assert emp_detail["pan_number"] == "XYZAB5678C"
    assert emp_detail["uan_number"] == "100555666777"

    # Finalize the payroll run to generate payslips
    fin_res = client.post(
        f"/api/payroll/runs/{run_id}/finalize",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"notes": "Finalize for payslip check"},
    )
    assert fin_res.status_code == 200, fin_res.text

    # Verify generated payslip has the employee's individual details
    all_payslips = FirestoreService.get_all("payslips")
    emp_payslip = next((p for p in all_payslips if str(p.get("employee_id")) == TEST_EMP_ID and str(p.get("payroll_run_id")) == run_id), None)
    assert emp_payslip is not None
    assert emp_payslip["bank_name"] == "Axis Bank Ltd"
    assert emp_payslip["account_number"] == "918010045678901"
    assert emp_payslip["pan_number"] == "XYZAB5678C"
    assert emp_payslip["uan_number"] == "100555666777"
    assert emp_payslip["designation"] == "Principal Cloud Engineer"

    # Verify PDF generation with these exact details
    run_info = {"month": 11, "month_name": "November", "year": 2026}
    pdf_bytes = generate_payslip_pdf(emp_payslip, run_info)
    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 1000


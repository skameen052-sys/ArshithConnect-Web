"""
Payroll Engine Service
Automated, attendance-driven payroll calculation engine implementing decimal-safe financial calculations,
statutory deductions (EPF, ESIC, PT, TDS), loss of pay (LOP) proration, loan deductions, and immutable lifecycle governance.
"""

from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone, date
import calendar
from typing import List, Dict, Any, Optional

from app.services.firestore_service import FirestoreService


def round_curr(val: float | Decimal | int) -> float:
    """Round to 2 decimal places using standard ROUND_HALF_UP."""
    d = Decimal(str(val))
    return float(d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


class PayrollEngine:
    """
    Dedicated payroll calculation engine complying with the 14-page specification.
    """

    @staticmethod
    def calculate_employee_payroll(
        salary_structure: Dict[str, Any],
        total_period_days: int,
        payable_days: float,
        overtime_hours: float = 0.0,
        bonus: float = 0.0,
        loan_deductions: float = 0.0,
        custom_pf_wage_base: Optional[float] = None,
        custom_daily_rate_denominator: Optional[int] = None,
        pf_ceiling: float = 15000.0,
        pf_rate: float = 0.12,
        sundays_count: int = 4,
        festival_holiday_count: int = 0,
        festival_holiday_names: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Calculates itemized monthly compensation for a single employee based on attendance,
        4 Sundays, festival holidays, and statutory EPF/ESIC ceilings.
        """
        basic = float(salary_structure.get("basic_salary", 0.0) or salary_structure.get("basic", 0.0))
        hra = float(salary_structure.get("hra", 0.0))
        other_allowances = float(
            salary_structure.get("other_allowances", 0.0)
            or salary_structure.get("allowances", 0.0)
            or salary_structure.get("special_allowance", 0.0)
        )

        gross_salary = round_curr(basic + hra + other_allowances)

        # Denominator for daily rate (e.g. 26 working days or total period days)
        denominator = custom_daily_rate_denominator or 26
        if denominator <= 0:
            denominator = 26

        unpaid_days = max(0.0, float(total_period_days) - float(payable_days))

        # Loss of Pay (LOP)
        # LOP = (Gross / Denominator) * Unpaid Days
        daily_rate = Decimal(str(gross_salary)) / Decimal(str(denominator))
        lop_amount_dec = daily_rate * Decimal(str(unpaid_days))
        lop_amount = float(lop_amount_dec.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

        # Overtime calculation (1.5x hourly rate based on 8hr workday)
        hourly_rate = (gross_salary / (denominator * 8)) if denominator > 0 else 0
        overtime_pay = round_curr(overtime_hours * hourly_rate * 1.5) if overtime_hours > 0 else 0.0

        # Adjusted Gross Earnings
        adjusted_gross = round_curr(gross_salary - lop_amount + overtime_pay + bonus)

        # Statutory Deductions
        # 1. Employee Provident Fund (EPF)
        # 12% on PF wage base, capped at statutory wage ceiling (e.g. ₹15,000)
        pf_applicable = salary_structure.get("pf_applicable", True)
        if pf_applicable:
            if custom_pf_wage_base is not None:
                pf_wage = custom_pf_wage_base
            else:
                # Earned basic after LOP proration
                if unpaid_days > 0 and denominator > 0:
                    basic_daily_rate = Decimal(str(basic)) / Decimal(str(denominator))
                    basic_lop = float((basic_daily_rate * Decimal(str(unpaid_days))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
                    earned_basic = max(0.0, round_curr(basic - basic_lop))
                else:
                    earned_basic = basic

                # Statutory EPF mandatory wage ceiling (default ₹15,000)
                configured_pf_base = salary_structure.get("pf_wage_base")
                target_ceiling = float(configured_pf_base) if configured_pf_base else pf_ceiling
                pf_wage = min(earned_basic, target_ceiling)
            
            effective_pf_rate = float(salary_structure.get("pf_rate") or pf_rate or 0.12)
            emp_pf = round_curr(pf_wage * effective_pf_rate)
            employer_pf = round_curr(pf_wage * effective_pf_rate)
        else:
            pf_wage = 0.0
            effective_pf_rate = 0.0
            emp_pf = 0.0
            employer_pf = 0.0

        # 2. Employee State Insurance (ESIC)
        # ESIC is applicable if gross_salary <= 21000
        esi_applicable = salary_structure.get("esi_applicable", (gross_salary <= 21000 and gross_salary > 0))
        if esi_applicable:
            emp_esi = round_curr(adjusted_gross * 0.0075)  # 0.75%
            employer_esi = round_curr(adjusted_gross * 0.0325)  # 3.25%
        else:
            emp_esi = 0.0
            employer_esi = 0.0

        # 3. Professional Tax (PT)
        pt_val = salary_structure.get("professional_tax")
        if pt_val is not None:
            pt = float(pt_val)
        else:
            pt = 200.0 if adjusted_gross > 15000 else 0.0

        # 4. Income Tax Withholding (TDS)
        tds = float(salary_structure.get("tds_monthly", 0.0) or salary_structure.get("tds", 0.0))

        # 5. Loan deductions
        loan_emi = round_curr(loan_deductions)

        total_deductions = round_curr(emp_pf + emp_esi + pt + tds + loan_emi)
        net_salary = round_curr(adjusted_gross - total_deductions)

        # Employer Cost (CTC component)
        total_employer_contributions = round_curr(employer_pf + employer_esi)
        employer_cost = round_curr(adjusted_gross + total_employer_contributions)

        return {
            "gross_salary": gross_salary,
            "basic_salary": basic,
            "hra": hra,
            "other_allowances": other_allowances,
            "total_days": total_period_days,
            "payable_days": round(payable_days, 2),
            "unpaid_days": round(unpaid_days, 2),
            "daily_rate": round(float(daily_rate), 4),
            "loss_of_pay": lop_amount,
            "overtime_hours": overtime_hours,
            "overtime_pay": overtime_pay,
            "bonus": bonus,
            "adjusted_gross": adjusted_gross,
            "pf_wage_base": pf_wage,
            "pf_rate": effective_pf_rate,
            "pf_wage_ceiling": pf_ceiling,
            "sundays": sundays_count,
            "weekly_offs": sundays_count,
            "holidays": festival_holiday_count,
            "festival_holidays": festival_holiday_count,
            "festival_holiday_names": festival_holiday_names or [],
            "employee_pf": emp_pf,
            "employee_esi": emp_esi,
            "professional_tax": pt,
            "income_tax_tds": tds,
            "loan_deduction": loan_emi,
            "total_deductions": total_deductions,
            "net_salary": net_salary,
            "employer_pf": employer_pf,
            "employer_esi": employer_esi,
            "total_employer_contributions": total_employer_contributions,
            "employer_cost": employer_cost,
        }

    @classmethod
    def calculate_attendance_payable_days(
        cls,
        employee_id: str,
        year: int,
        month: int,
        total_period_days: int,
    ) -> Dict[str, Any]:
        """
        Inspects employee's punch logs and approved leaves for the given month.
        Returns payable days, overtime hours, and attendance breakdown.
        """
        start_date_str = f"{year:04d}-{month:02d}-01"
        end_date_str = f"{year:04d}-{month:02d}-{total_period_days:02d}"

        # Fetch attendance logs
        attendance_logs = FirestoreService.get_all("attendance")
        emp_att = [
            a for a in attendance_logs
            if (str(a.get("employee_id") or a.get("employeeId")) == str(employee_id))
            and (start_date_str <= str(a.get("date", "")) <= end_date_str)
        ]

        # Fetch approved leaves
        leaves_all = FirestoreService.get_all("leaves")
        emp_leaves = [
            l for l in leaves_all
            if (str(l.get("employee_id") or l.get("employeeId")) == str(employee_id))
            and (str(l.get("status", "")).upper() == "APPROVED")
        ]

        # Fetch holidays
        holidays_all = FirestoreService.get_all("holidays")
        month_holidays = [
            h for h in holidays_all
            if start_date_str <= str(h.get("date", "")) <= end_date_str
        ]
        holiday_count = len(month_holidays)

        # Calculate weekend days (Standard 4 Sundays as per company policy)
        sunday_dates = set()
        for d in range(1, total_period_days + 1):
            try:
                dt = date(year, month, d)
                if dt.weekday() == 6:  # Sunday
                    sunday_dates.add(dt.strftime("%Y-%m-%d"))
            except ValueError:
                pass
        sundays = max(4, len(sunday_dates))

        # Fetch holidays and deduplicate by calendar date, excluding Sundays
        holidays_all = FirestoreService.get_all("holidays")
        month_holidays_map = {}
        for h in holidays_all:
            h_date = str(h.get("date", "")).strip()
            if start_date_str <= h_date <= end_date_str:
                if h_date not in sunday_dates:
                    month_holidays_map[h_date] = str(h.get("name") or "Festival Holiday").strip()
        holiday_count = len(month_holidays_map)
        holiday_names = list(month_holidays_map.values())

        present_days = 0.0
        overtime_hours = 0.0
        logged_dates = set()

        for a in emp_att:
            status = str(a.get("status", "")).strip().capitalize()
            att_date = str(a.get("date", ""))
            logged_dates.add(att_date)

            if status in ["Present", "Completed"]:
                present_days += 1.0
            elif status == "Late":
                present_days += 1.0
            elif status == "Half-day" or status == "Halfday":
                present_days += 0.5
            
            # Add overtime if recorded
            ot = float(a.get("overtime_hours", 0.0) or 0.0)
            overtime_hours += ot

        # Count approved leave days overlapping with this month
        approved_leave_days = 0.0
        for l in emp_leaves:
            l_start = str(l.get("start_date") or l.get("startDate") or "")
            l_end = str(l.get("end_date") or l.get("endDate") or l_start)
            l_type = str(l.get("leave_type") or l.get("type") or "Casual").lower()

            if l_start and l_end:
                # Only count paid leaves (Casual, Sick, Earned)
                if "unpaid" not in l_type and "lop" not in l_type:
                    # Overlap with current month
                    cur_d = max(l_start, start_date_str)
                    max_d = min(l_end, end_date_str)
                    if cur_d <= max_d:
                        try:
                            d1 = datetime.strptime(cur_d, "%Y-%m-%d").date()
                            d2 = datetime.strptime(max_d, "%Y-%m-%d").date()
                            days_count = (d2 - d1).days + 1
                            approved_leave_days += days_count
                        except Exception:
                            approved_leave_days += 1.0

        # 4 Sundays and Festival Holidays are counted as fully paid non-working days:
        # Payable Days = Present Days + Half-days + Approved Paid Leaves + 4 Sundays + Festival Holidays
        if len(emp_att) > 0:
            # Cap payable days at total_period_days
            payable_days = min(float(total_period_days), present_days + approved_leave_days + sundays + holiday_count)
        else:
            # If no attendance records yet, default payable days to total_period_days (unless marked unpaid)
            payable_days = float(total_period_days)

        unpaid_days = max(0.0, float(total_period_days) - payable_days)

        return {
            "total_period_days": total_period_days,
            "payable_days": round(payable_days, 2),
            "unpaid_days": round(unpaid_days, 2),
            "present_days": present_days,
            "approved_leave_days": approved_leave_days,
            "weekly_offs": sundays,
            "sundays": sundays,
            "holidays": holiday_count,
            "holiday_names": holiday_names,
            "overtime_hours": overtime_hours,
        }

    @classmethod
    def process_monthly_payroll_run(
        cls,
        year: int,
        month: int,
        user_id: str,
        user_email: str,
        notes: str = "",
        custom_payroll_days: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Processes a full monthly payroll run for all active employees.
        Enforces duplicate prevention: rejects if run for (year, month) already exists.
        """
        # 1. Duplicate check
        existing_runs = FirestoreService.get_all("payroll_runs")
        for r in existing_runs:
            if int(r.get("year", 0)) == year and int(r.get("month", 0)) == month:
                if str(r.get("status", "")).upper() in ["APPROVED", "FINALIZED", "PAID"]:
                    raise ValueError(f"Payroll for {month:02d}/{year} is already {r.get('status')} and locked.")
                elif str(r.get("status", "")).upper() in ["CALCULATED", "UNDER_REVIEW", "DRAFT"]:
                    # Can recalculate if in preliminary state
                    pass

        # Fetch company payroll configuration
        comp_settings = FirestoreService.get_by_id("settings", "company_settings") or {}
        configured_denominator = int(comp_settings.get("daily_rate_denominator") or 26)
        configured_pf_ceiling = float(comp_settings.get("pf_wage_ceiling") or 15000.0)
        configured_pf_rate = float(comp_settings.get("pf_rate") or 0.12)

        # Total days in month
        _, days_in_month = calendar.monthrange(year, month)
        payroll_days = custom_payroll_days or days_in_month

        # Fetch employees
        all_employees = FirestoreService.get_all("employees")
        seen_keys = set()
        active_employees = []
        for e in all_employees:
            if str(e.get("status", "Active")).lower() not in ["active", "approved", "probation", "confirmed"]:
                continue
            email_key = str(e.get("email") or "").strip().lower()
            emp_code_key = str(e.get("employee_id") or e.get("employeeId") or "").strip().upper()
            dedup_key = email_key or emp_code_key or str(e.get("id"))
            if dedup_key in seen_keys:
                continue
            seen_keys.add(dedup_key)
            active_employees.append(e)

        if not active_employees:
            raise ValueError("No active employees found to process payroll.")

        # Fetch salary structures
        all_structures = FirestoreService.get_all("salary_structures")
        structures_by_emp = {}
        for s in all_structures:
            eid = str(s.get("employee_id") or s.get("employeeId", ""))
            if eid and s.get("is_active", True):
                structures_by_emp[eid] = s

        # Fetch active employee loans
        all_loans = FirestoreService.get_all("employee_loans")
        active_loans_by_emp = {}
        for ln in all_loans:
            eid = str(ln.get("employee_id") or ln.get("employeeId", ""))
            if str(ln.get("status", "")).upper() in ["ACTIVE", "APPROVED"] and float(ln.get("remaining_balance", 0)) > 0:
                active_loans_by_emp[eid] = ln

        payroll_details = []
        tot_gross = 0.0
        tot_lop = 0.0
        tot_deductions = 0.0
        tot_net = 0.0
        tot_employer_cost = 0.0

        for emp in active_employees:
            emp_id = str(emp.get("employee_id") or emp.get("employeeId") or emp.get("id"))
            emp_name = str(emp.get("name") or emp.get("full_name") or emp.get("fullName") or "Employee")
            emp_dept = str(emp.get("department") or emp.get("dept") or "Operations")
            emp_desig = str(emp.get("designation") or emp.get("role") or "Staff")

            # Get or synthesize salary structure
            struct = structures_by_emp.get(emp_id)
            if not struct:
                # Default standard structure based on department / defaults
                base_sal = 25000.0
                struct = {
                    "employee_id": emp_id,
                    "basic_salary": round_curr(base_sal * 0.5),
                    "hra": round_curr(base_sal * 0.3),
                    "other_allowances": round_curr(base_sal * 0.2),
                    "gross_salary": base_sal,
                    "pf_applicable": True,
                    "pf_wage_base": configured_pf_ceiling,
                    "pf_rate": configured_pf_rate,
                    "esi_applicable": base_sal <= 21000.0,
                    "professional_tax": 200.0,
                    "tds_monthly": 0.0,
                    "is_active": True,
                }

            # Check attendance records (incorporating 4 Sundays and festival holidays)
            att_breakdown = cls.calculate_attendance_payable_days(emp_id, year, month, payroll_days)
            payable_days = att_breakdown["payable_days"]
            overtime_hrs = att_breakdown["overtime_hours"]

            # Loan EMI deduction
            loan_emi = 0.0
            loan_info = active_loans_by_emp.get(emp_id)
            if loan_info:
                loan_emi = min(
                    float(loan_info.get("monthly_installment", 0.0)),
                    float(loan_info.get("remaining_balance", 0.0))
                )

            # Compute employee compensation using 26 working days basis and statutory PF ceiling
            calc = cls.calculate_employee_payroll(
                salary_structure=struct,
                total_period_days=payroll_days,
                payable_days=payable_days,
                overtime_hours=overtime_hrs,
                bonus=0.0,
                loan_deductions=loan_emi,
                custom_daily_rate_denominator=configured_denominator,
                pf_ceiling=configured_pf_ceiling,
                pf_rate=configured_pf_rate,
                sundays_count=att_breakdown.get("sundays", 4),
                festival_holiday_count=att_breakdown.get("holidays", 0),
                festival_holiday_names=att_breakdown.get("holiday_names", []),
            )

            detail_item = {
                "employee_id": emp_id,
                "employeeId": str(emp.get("employeeId") or emp.get("employee_id") or emp_id),
                "employee_doc_id": str(emp.get("id") or ""),
                "employee_email": str(emp.get("email") or ""),
                "employee_name": emp_name,
                "department": emp_dept,
                "designation": emp_desig,
                "date_of_joining": str(emp.get("date_of_joining") or emp.get("joining_date") or emp.get("created_at", "16-Jan-2025")[:10]),
                "location": str(emp.get("location") or "Bangalore"),
                "gender": str(emp.get("gender") or "Male"),
                "bank_name": emp.get("bank_name") or emp.get("bankName") or "—",
                "account_number": emp.get("account_number") or emp.get("accountNumber") or emp.get("bank_account_no") or "—",
                "pan_number": emp.get("pan_number") or emp.get("panNumber") or emp.get("pan") or "—",
                "uan_number": emp.get("uan_number") or emp.get("uanNumber") or emp.get("uan") or emp.get("pf_number") or "—",
                "loan_id": loan_info.get("id") if loan_info else None,
                "sundays": att_breakdown.get("sundays", 4),
                "holidays": att_breakdown.get("holidays", 0),
                "holiday_names": att_breakdown.get("holiday_names", []),
                "present_days": att_breakdown.get("present_days", 0.0),
                "approved_leave_days": att_breakdown.get("approved_leave_days", 0.0),
                **calc,
            }

            payroll_details.append(detail_item)
            tot_gross += calc["gross_salary"]
            tot_lop += calc["loss_of_pay"]
            tot_deductions += calc["total_deductions"]
            tot_net += calc["net_salary"]
            tot_employer_cost += calc["employer_cost"]

        # Formulate Run Record
        month_name = calendar.month_name[month]
        run_record = {
            "title": f"{month_name} {year} Payroll Batch",
            "month": month,
            "year": year,
            "month_name": month_name,
            "payroll_days": payroll_days,
            "daily_rate_denominator": configured_denominator,
            "pf_wage_ceiling": configured_pf_ceiling,
            "employee_count": len(payroll_details),
            "total_gross": round_curr(tot_gross),
            "total_loss_of_pay": round_curr(tot_lop),
            "total_deductions": round_curr(tot_deductions),
            "total_net_disbursed": round_curr(tot_net),
            "total_employer_cost": round_curr(tot_employer_cost),
            "status": "CALCULATED",
            "created_by": user_email,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "notes": notes or f"Automated calculation executed for {len(payroll_details)} employees (26 Working Days basis, 4 Sundays & Festival Holidays included).",
            "details": payroll_details,
        }

        # Check if an existing draft/calculated run can be updated
        existing_run_id = None
        for r in existing_runs:
            if int(r.get("year", 0)) == year and int(r.get("month", 0)) == month:
                existing_run_id = r.get("id") or r.get("_firestore_id")
                break

        if existing_run_id:
            run_record["id"] = str(existing_run_id)
            FirestoreService.update("payroll_runs", str(existing_run_id), run_record)
            created_run = run_record
        else:
            created_run = FirestoreService.create("payroll_runs", run_record)

        return created_run

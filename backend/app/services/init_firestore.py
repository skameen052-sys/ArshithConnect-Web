from datetime import datetime, timezone
import logging
from app.services.firestore_service import firestore_service
from app.core.security import get_password_hash

logger = logging.getLogger("uvicorn.error")


def init_firestore_seed():
    """Ensure default admin and office timings exist in Firestore."""
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Ensure Default Admin User exists
    admin_email = "admin@arshith.com"
    existing_users = firestore_service.list_documents("users", [("email", "==", admin_email)])
    if not existing_users:
        logger.info(f"Seeding default administrator ({admin_email}) in Firestore...")
        user_id = firestore_service.create_document("users", {
            "email": admin_email,
            "hashed_password": get_password_hash("AdminPassword@123"),
            "role": "admin",
            "is_active": True,
            "approval_status": "APPROVED",
            "created_at": now_iso,
            "updated_at": now_iso,
        })

        # Check corresponding employee
        existing_emp = firestore_service.list_documents("employees", [("employee_id", "==", "ADM-001")])
        if not existing_emp:
            firestore_service.create_document("employees", {
                "employee_id": "ADM-001",
                "user_id": user_id,
                "full_name": "Administrator",
                "email": admin_email,
                "phone": "--",
                "department": "Operations",
                "designation": "Administrator",
                "status": "Active",
                "shift": "General (09:30 AM - 06:30 PM)",
                "location": "HQ Office",
                "created_at": now_iso,
                "updated_at": now_iso,
            })

    # 2. Ensure Regular Office Timing exists
    timings = firestore_service.list_documents("office_timings", [("timing_type", "==", "REGULAR")])
    if not timings:
        logger.info("Seeding default regular office timing in Firestore...")
        firestore_service.create_document("office_timings", {
            "timing_type": "REGULAR",
            "start_time": "09:30",
            "end_time": "18:30",
            "grace_minutes": 2,
            "created_at": now_iso,
            "updated_at": now_iso,
        })

    # 3. Seed canonical PDF Employee (EMP-1001) and salary structure if missing
    from app.services.firestore_service import FirestoreService
    emp_1001 = FirestoreService.query("employees", {"employee_id": "EMP-1001"})
    if not emp_1001:
        logger.info("Seeding canonical PDF benchmark employee EMP-1001...")
        FirestoreService.create("employees", {
            "employee_id": "EMP-1001",
            "name": "Arshith Developer",
            "full_name": "Arshith Developer",
            "email": "employee@arshith.com",
            "phone": "+91 98765 43210",
            "department": "Engineering",
            "designation": "Full-Stack Software Engineer",
            "joining_date": "2024-01-15",
            "employment_type": "Full-time",
            "status": "Active",
            "location": "HQ Office",
            "bank_name": "HDFC Bank",
            "account_number": "50100456789123",
            "pan_number": "ABCDE1234F",
            "uan_number": "100987654321",
            "created_at": now_iso,
            "updated_at": now_iso,
        }, doc_id="EMP-1001")

    # Ensure EMP-1001 has canonical salary structure (Basic 20k, HRA 8k, Other 4k = Gross 32k)
    structs = FirestoreService.query("salary_structures", {"employee_id": "EMP-1001"})
    if not structs:
        logger.info("Seeding canonical salary structure for EMP-1001...")
        FirestoreService.create("salary_structures", {
            "employee_id": "EMP-1001",
            "basic_salary": 20000.0,
            "hra": 8000.0,
            "other_allowances": 4000.0,
            "gross_salary": 32000.0,
            "pf_applicable": True,
            "pf_wage_base": 18000.0,
            "esi_applicable": False,
            "professional_tax": 200.0,
            "tds_monthly": 0.0,
            "effective_date": "2026-01-01",
            "is_active": True,
            "created_at": now_iso,
        })

    # 4. Seed sample performance appraisal review for EMP-1001 if missing
    reviews = FirestoreService.query("performance_reviews", {"employee_id": "EMP-1001"})
    if not reviews:
        logger.info("Seeding canonical performance appraisal for EMP-1001...")
        FirestoreService.create("performance_reviews", {
            "employee_id": "EMP-1001",
            "review_period": "Annual Review 2026",
            "rating": 4.8,
            "strengths": "Outstanding software architecture, high attention to detail in payroll calculations, and exceptional full-stack problem solving skills.",
            "areas_for_improvement": "Continue mentoring newer team members and expanding technical design documentation.",
            "manager_feedback": "Arshith has demonstrated stellar technical ownership in architecting the automated payroll and HRMS suite. Recommended for leadership fast-track.",
            "recommended_increment_pct": 15.0,
            "evaluated_by": "admin@arshith.com",
            "evaluated_at": now_iso,
            "created_at": now_iso,
            "updated_at": now_iso,
        })

    # 5. Seed performance goals for EMP-1001 if missing
    goals = FirestoreService.query("performance_goals", {"employee_id": "EMP-1001"})
    if not goals:
        logger.info("Seeding canonical performance goals for EMP-1001...")
        FirestoreService.create("performance_goals", {
            "employee_id": "EMP-1001",
            "title": "Automated Attendance-Driven Payroll Engine",
            "description": "Achieve 100% mathematical precision on attendance-driven LOP, PF, ESI and corporate payment file exports.",
            "target_date": "2026-11-30",
            "weightage": 40.0,
            "progress": 95.0,
            "status": "IN_PROGRESS",
            "created_by": "admin@arshith.com",
            "created_at": now_iso,
            "updated_at": now_iso,
        })
        FirestoreService.create("performance_goals", {
            "employee_id": "EMP-1001",
            "title": "Pixel-Perfect ReportLab Payslip & Statement Generator",
            "description": "Implement branded high-fidelity PDF payslips and Full-and-Final settlement statements.",
            "target_date": "2026-12-15",
            "weightage": 30.0,
            "progress": 100.0,
            "status": "COMPLETED",
            "created_by": "admin@arshith.com",
            "created_at": now_iso,
            "updated_at": now_iso,
        })
        FirestoreService.create("performance_goals", {
            "employee_id": "EMP-1001",
            "title": "Employee Self-Service & Appraisal Transparency",
            "description": "Provide employees with direct transparency into their appraisal ratings, manager feedback, and payslips.",
            "target_date": "2026-12-31",
            "weightage": 30.0,
            "progress": 90.0,
            "status": "IN_PROGRESS",
            "created_by": "admin@arshith.com",
            "created_at": now_iso,
            "updated_at": now_iso,
        })

    # 6. Seed Default Teams & Welcome Chat Message for Microsoft Teams experience
    existing_teams = firestore_service.list_documents("teams")
    if not existing_teams:
        logger.info("Seeding default enterprise teams for collaborative chat...")
        all_emps = firestore_service.list_documents("employees")
        emp_names = [e.get("full_name") or e.get("name") for e in all_emps if e.get("full_name") or e.get("name")]
        sample_members = emp_names[:8] if emp_names else ["Administrator"]

        team_general_id = firestore_service.create_document("teams", {
            "name": "General & Company-Wide",
            "teamName": "General & Company-Wide",
            "department": "Company",
            "description": "Company-wide general discussions, announcements, and open chatter.",
            "leader": "Administrator",
            "members": emp_names if emp_names else ["Administrator"],
            "created_at": now_iso,
            "updated_at": now_iso,
        })

        team_ops_id = firestore_service.create_document("teams", {
            "name": "Operations Core",
            "teamName": "Operations Core",
            "department": "Operations",
            "description": "Field operations, daily shifts, attendance, and dispatch coordination.",
            "leader": "Farook",
            "members": sample_members,
            "created_at": now_iso,
            "updated_at": now_iso,
        })

        team_eng_id = firestore_service.create_document("teams", {
            "name": "Engineering & Tech",
            "teamName": "Engineering & Tech",
            "department": "Engineering",
            "description": "Technical architecture, system workflows, and sprint updates.",
            "leader": "Arshith Developer",
            "members": ["Arshith Developer", "Farook"],
            "created_at": now_iso,
            "updated_at": now_iso,
        })

        # Seed initial welcome message in General team
        existing_msgs = firestore_service.list_documents("chat_messages")
        if not existing_msgs:
            firestore_service.create_document("chat_messages", {
                "chat_type": "team",
                "target_id": str(team_general_id),
                "team_id": str(team_general_id),
                "team_name": "General & Company-Wide",
                "sender_id": "ADM-001",
                "sender_name": "Administrator",
                "sender_role": "admin",
                "sender_avatar": "A",
                "receiver_id": str(team_general_id),
                "content": "👋 Welcome to **Arshith Connect Teams Chat**! You can chat directly with any individual employee or collaborate seamlessly in team channels.",
                "attachments": [],
                "reactions": {"🎉": ["ADM-001"]},
                "is_pinned": True,
                "read_by": ["ADM-001"],
                "created_at": now_iso,
                "updated_at": now_iso,
            })

    # 6. Ensure Default Daily Work Update Schedules exist in Firestore
    existing_schedules = firestore_service.list_documents("work_schedules")
    if not existing_schedules:
        logger.info("Seeding default daily work update schedules in Firestore...")
        default_schedules = [
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
                "created_at": now_iso,
                "updated_at": now_iso,
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
                "created_at": now_iso,
                "updated_at": now_iso,
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
                "created_at": now_iso,
                "updated_at": now_iso,
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
                "created_at": now_iso,
                "updated_at": now_iso,
            },
        ]
        for sch in default_schedules:
            sch["id"] = sch["schedule_id"]
            firestore_service.create_document("work_schedules", sch)



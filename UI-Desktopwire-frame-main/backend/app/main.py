from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, EmailStr, Field

BASE_DIR = Path(__file__).resolve().parent.parent
DB_DIR = BASE_DIR / "data"
DB_PATH = DB_DIR / "clinic.db"

app = FastAPI(title="Clinic Admin API", version="1.0.0")


def _csv_env(name: str, default: str) -> list[str]:
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


allowed_origins = _csv_env("ALLOWED_ORIGINS", "*")
allowed_hosts = _csv_env("ALLOWED_HOSTS", "*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*", "Authorization", "Content-Type"],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str, salt: Optional[str] = None) -> str:
    salt_val = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_val.encode("utf-8"), 120_000)
    return f"{salt_val}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    if "$" not in stored:
        return False
    salt, existing = stored.split("$", 1)
    candidate = hash_password(password, salt).split("$", 1)[1]
    return hmac.compare_digest(candidate, existing)


def get_conn() -> sqlite3.Connection:
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def seed_state() -> Dict[str, Any]:
    return {
        "staff": [
            {"id": "S-001", "name": "Lara Santos", "category": "Physical Therapists", "department": "Orthopedic Rehabilitation", "role": "Senior Physical Therapist", "credentials": "PTRP", "active": True},
            {"id": "S-002", "name": "Jamie Cruz", "category": "PT Assistants", "department": "Sports Rehabilitation", "role": "PT Assistant", "credentials": "BSPT", "active": True},
            {"id": "S-003", "name": "Rosa Santos", "category": "Front Desk/Admin", "department": "Admin", "role": "Front Desk Officer", "credentials": "BS Admin", "active": True},
            {"id": "S-004", "name": "Ben Lim", "category": "Rehab Aides", "department": "Neurological Rehabilitation", "role": "Rehab Aide", "credentials": "Rehab Aide NC II", "active": False},
        ],
        "attendance": [
            {"staffId": "S-001", "name": "Lara Santos", "department": "Orthopedic Rehabilitation", "date": "2025-11-22", "timeIn": "08:03", "timeOut": "16:40", "hours": 8.6, "ot": 0.2, "onCall": 0.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-002", "name": "Jamie Cruz", "department": "Sports Rehabilitation", "date": "2025-11-22", "timeIn": "08:12", "timeOut": "16:05", "hours": 7.9, "ot": 0.0, "onCall": 0.0, "leave": 0.0, "status": "Late"},
            {"staffId": "S-003", "name": "Rosa Santos", "department": "Admin", "date": "2025-11-22", "timeIn": "08:00", "timeOut": "16:00", "hours": 8.0, "ot": 0.0, "onCall": 0.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-004", "name": "Ben Lim", "department": "Neurological Rehabilitation", "date": "2025-11-22", "timeIn": "08:08", "timeOut": "16:00", "hours": 7.9, "ot": 0.0, "onCall": 0.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-001", "name": "Lara Santos", "department": "Orthopedic Rehabilitation", "date": "2026-01-18", "timeIn": "07:58", "timeOut": "17:10", "hours": 9.2, "ot": 1.1, "onCall": 0.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-002", "name": "Jamie Cruz", "department": "Sports Rehabilitation", "date": "2026-01-18", "timeIn": "08:10", "timeOut": "16:10", "hours": 8.0, "ot": 0.2, "onCall": 0.0, "leave": 0.0, "status": "Late"},
            {"staffId": "S-003", "name": "Rosa Santos", "department": "Admin", "date": "2026-01-18", "timeIn": "08:02", "timeOut": "16:05", "hours": 8.1, "ot": 0.1, "onCall": 0.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-004", "name": "Ben Lim", "department": "Neurological Rehabilitation", "date": "2026-01-18", "timeIn": "08:15", "timeOut": "15:55", "hours": 7.7, "ot": 0.0, "onCall": 0.0, "leave": 0.0, "status": "Late"},
            {"staffId": "S-001", "name": "Lara Santos", "department": "Orthopedic Rehabilitation", "date": "2026-02-07", "timeIn": "07:50", "timeOut": "17:00", "hours": 9.2, "ot": 1.0, "onCall": 0.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-002", "name": "Jamie Cruz", "department": "Sports Rehabilitation", "date": "2026-02-07", "timeIn": "08:09", "timeOut": "16:02", "hours": 7.9, "ot": 0.1, "onCall": 0.0, "leave": 0.0, "status": "Late"},
            {"staffId": "S-003", "name": "Rosa Santos", "department": "Admin", "date": "2026-02-07", "timeIn": "08:01", "timeOut": "16:00", "hours": 8.0, "ot": 0.0, "onCall": 0.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-004", "name": "Ben Lim", "department": "Neurological Rehabilitation", "date": "2026-02-07", "timeIn": "—", "timeOut": "—", "hours": 0.0, "ot": 0.0, "onCall": 0.0, "leave": 1.0, "status": "On Leave"},
            {"staffId": "S-001", "name": "Lara Santos", "department": "Orthopedic Rehabilitation", "date": "2026-02-14", "timeIn": "07:56", "timeOut": "16:45", "hours": 8.8, "ot": 0.4, "onCall": 0.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-002", "name": "Jamie Cruz", "department": "Sports Rehabilitation", "date": "2026-02-14", "timeIn": "08:05", "timeOut": "16:05", "hours": 8.0, "ot": 0.0, "onCall": 0.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-003", "name": "Rosa Santos", "department": "Admin", "date": "2026-02-14", "timeIn": "08:00", "timeOut": "16:00", "hours": 8.0, "ot": 0.0, "onCall": 0.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-004", "name": "Ben Lim", "department": "Neurological Rehabilitation", "date": "2026-02-14", "timeIn": "08:20", "timeOut": "16:00", "hours": 7.7, "ot": 0.0, "onCall": 0.0, "leave": 0.0, "status": "Late"},
            {"staffId": "S-001", "name": "Lara Santos", "department": "Orthopedic Rehabilitation", "date": "2026-02-21", "timeIn": "07:57", "timeOut": "17:25", "hours": 9.5, "ot": 1.5, "onCall": 1.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-002", "name": "Jamie Cruz", "department": "Sports Rehabilitation", "date": "2026-02-21", "timeIn": "08:14", "timeOut": "16:10", "hours": 8.0, "ot": 0.2, "onCall": 0.0, "leave": 0.0, "status": "Late"},
            {"staffId": "S-003", "name": "Rosa Santos", "department": "Admin", "date": "2026-02-21", "timeIn": "08:00", "timeOut": "16:05", "hours": 8.1, "ot": 0.1, "onCall": 0.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-004", "name": "Ben Lim", "department": "Neurological Rehabilitation", "date": "2026-02-21", "timeIn": "08:07", "timeOut": "16:00", "hours": 7.9, "ot": 0.0, "onCall": 0.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-001", "name": "Lara Santos", "department": "Orthopedic Rehabilitation", "date": "2026-02-28", "timeIn": "07:55", "timeOut": "17:20", "hours": 9.4, "ot": 1.4, "onCall": 0.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-002", "name": "Jamie Cruz", "department": "Sports Rehabilitation", "date": "2026-02-28", "timeIn": "08:10", "timeOut": "16:00", "hours": 7.8, "ot": 0.0, "onCall": 0.0, "leave": 0.0, "status": "Late"},
            {"staffId": "S-003", "name": "Rosa Santos", "department": "Admin", "date": "2026-02-28", "timeIn": "08:00", "timeOut": "16:00", "hours": 8.0, "ot": 0.0, "onCall": 0.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-004", "name": "Ben Lim", "department": "Neurological Rehabilitation", "date": "2026-02-28", "timeIn": "—", "timeOut": "—", "hours": 0.0, "ot": 0.0, "onCall": 0.0, "leave": 1.0, "status": "On Leave"},
        ],
        "requests": [
            {"id": "REQ-001", "type": "Leave", "employee": "Jamie Cruz", "details": "Mar 02-03", "reason": "Family commitment", "status": "Pending", "requestedBy": "Staff", "decidedBy": "", "log": ""},
            {"id": "REQ-002", "type": "OT", "employee": "Lara Santos", "details": "4 hours", "reason": "Extended therapy sessions", "status": "Pending", "requestedBy": "Staff", "decidedBy": "", "log": ""},
            {"id": "REQ-003", "type": "Shift Change", "employee": "Ben Lim", "details": "Morning → Afternoon", "reason": "Medical checkup", "status": "Pending", "requestedBy": "Staff", "decidedBy": "", "log": ""},
            {"id": "REQ-004", "type": "Clinic Workflow Change", "employee": "HR Admin", "details": "Update treatment note sign-off flow", "reason": "Process update", "status": "Pending", "requestedBy": "Admin", "decidedBy": "", "log": ""},
        ],
        "reports": [
            {"id": "RPT-001", "category": "Therapy Reports", "title": "Patient Progress Summary", "submittedBy": "Lara Santos", "status": "Pending Manager Review", "managerSign": "", "finalSign": "", "comments": ""},
            {"id": "RPT-002", "category": "Operations Reports", "title": "Weekly Therapy Outcomes", "submittedBy": "Jamie Cruz", "status": "Pending Manager Review", "managerSign": "", "finalSign": "", "comments": ""},
            {"id": "RPT-003", "category": "Financial Reports", "title": "Monthly Revenue Snapshot", "submittedBy": "Finance Officer", "status": "Pending Final Approval", "managerSign": "Manager User", "finalSign": "", "comments": ""},
            {"id": "RPT-004", "category": "Audit Reports", "title": "System Access Audit", "submittedBy": "System", "status": "Pending Final Approval", "managerSign": "Manager User", "finalSign": "", "comments": ""},
        ],
        "payrollRuns": [],
        "generatedHospitalReports": [],
        "adminChangeRequests": [],
        "staffStatusLogs": [],
        "auditLogs": [],
    }


def init_db() -> None:
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              email TEXT UNIQUE NOT NULL,
              full_name TEXT NOT NULL,
              designation TEXT NOT NULL DEFAULT '',
                            staff_id TEXT NOT NULL DEFAULT '',
              role TEXT NOT NULL,
              password_hash TEXT NOT NULL,
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL
            )
            """
        )
        try:
            conn.execute("ALTER TABLE users ADD COLUMN designation TEXT NOT NULL DEFAULT ''")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE users ADD COLUMN staff_id TEXT NOT NULL DEFAULT ''")
        except sqlite3.OperationalError:
            pass
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
              token TEXT PRIMARY KEY,
              user_id INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_state (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              data_json TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )

        users = [
            ("hradmin@summit.ph", "HR Admin User", "HR Admin", "hradmin", "Hr@123"),
            ("supervisor@summit.ph", "Supervisor User", "Supervisor", "supervisor", "Sup@123"),
            ("manager@summit.ph", "Manager User", "Clinic Manager", "manager", "Mgr@123"),
            ("superadmin@summit.ph", "Super Admin User", "Super Admin", "superadmin", "Sa@123"),
        ]

        for email, full_name, designation, role, plain in users:
            exists = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
            if exists:
                conn.execute(
                    "UPDATE users SET designation = ? WHERE email = ? AND (designation IS NULL OR designation = '')",
                    (designation, email),
                )
                continue
            conn.execute(
                "INSERT INTO users (email, full_name, designation, role, password_hash, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
                (email, full_name, designation, role, hash_password(plain), utc_now()),
            )

        state_exists = conn.execute("SELECT id FROM app_state WHERE id = 1").fetchone()
        if not state_exists:
            conn.execute(
                "INSERT INTO app_state (id, data_json, updated_at) VALUES (1, ?, ?)",
                (json.dumps(seed_state()), utc_now()),
            )


@app.on_event("startup")
def startup_event() -> None:
    init_db()


def load_state(conn: sqlite3.Connection) -> Dict[str, Any]:
    row = conn.execute("SELECT data_json FROM app_state WHERE id = 1").fetchone()
    if not row:
        state = seed_state()
        conn.execute("INSERT INTO app_state (id, data_json, updated_at) VALUES (1, ?, ?)", (json.dumps(state), utc_now()))
        return state
    return json.loads(row["data_json"])


def save_state(conn: sqlite3.Connection, state: Dict[str, Any]) -> None:
    conn.execute("UPDATE app_state SET data_json = ?, updated_at = ? WHERE id = 1", (json.dumps(state), utc_now()))


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=4)


class RequestDecisionIn(BaseModel):
    decision: str
    reason: Optional[str] = None


class ReportCommentIn(BaseModel):
    comments: Optional[str] = ""


class ReportGenerateIn(BaseModel):
    report_name: str = Field(min_length=3)
    report_type: str = Field(min_length=2)
    department: str = Field(min_length=2)
    period_start: str
    period_end: str
    notes: Optional[str] = ""


class CutoffIn(BaseModel):
    cutoff: str
    period_mode: Optional[str] = "semi-monthly"
    year: Optional[int] = None
    month: Optional[int] = None


class StaffPayrollUpdateIn(BaseModel):
    staff_id: str
    hours: Optional[float] = None
    ot: Optional[float] = None
    onCall: Optional[float] = None
    leave: Optional[float] = None


class StaffCreateIn(BaseModel):
    name: str
    category: str
    department: str
    role: str
    credentials: str


class StaffUpdateIn(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None
    credentials: Optional[str] = None


class UserCreateIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2)
    designation: Optional[str] = None
    staff_id: Optional[str] = None
    role: str
    password: str = Field(min_length=4)


class UserUpdateIn(BaseModel):
    full_name: Optional[str] = None
    designation: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


class AuthUser(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    staff_id: str = ""


ROLE_PERMS: Dict[str, set[str]] = {
    "hradmin": {"generatePayroll", "manageStaff"},
    "supervisor": {"approveRequests", "viewAttendance"},
    "manager": {"managerReportApproval", "viewAttendance", "viewSummaries"},
    "ptstaff": set(),
    "superadmin": {
        "generatePayroll",
        "manageStaff",
        "approveRequests",
        "managerReportApproval",
        "superReportApproval",
        "fullSystemControl",
        "viewAllData",
        "generateHospitalReports",
        "viewAttendance",
        "viewSummaries",
    },
}


def list_users(conn: sqlite3.Connection) -> list[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, email, full_name, designation, staff_id, role, is_active, created_at
        FROM users
        ORDER BY id ASC
        """
    ).fetchall()
    return [
        {
            "id": row["id"],
            "email": row["email"],
            "full_name": row["full_name"],
            "designation": row["designation"] or "",
            "staff_id": row["staff_id"] or "",
            "role": row["role"],
            "is_active": row["is_active"] == 1,
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def get_current_user(authorization: Optional[str] = Header(default=None)) -> AuthUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1].strip()
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT u.id, u.email, u.full_name, u.role, u.staff_id, u.is_active
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
    if not row or row["is_active"] != 1:
        raise HTTPException(status_code=401, detail="Invalid session")
    return AuthUser(
        id=row["id"],
        email=row["email"],
        full_name=row["full_name"],
        role=row["role"],
        staff_id=row["staff_id"] or "",
    )


def require_perm(user: AuthUser, perm: str) -> None:
    if perm in ROLE_PERMS.get(user.role, set()):
        return
    raise HTTPException(status_code=403, detail="Forbidden for this role")


def add_audit(state: Dict[str, Any], msg: str) -> None:
    state["auditLogs"].insert(0, f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} · {msg}")
    state["auditLogs"] = state["auditLogs"][:150]


def add_staff_status_log(
    state: Dict[str, Any],
    actor: str,
    staff_id: str,
    staff_name: str,
    new_status: str,
    action: str,
) -> None:
    state.setdefault("staffStatusLogs", []).insert(
        0,
        {
            "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "by": actor,
            "staffId": staff_id,
            "staffName": staff_name,
            "status": new_status,
            "action": action,
        },
    )
    state["staffStatusLogs"] = state["staffStatusLogs"][:250]


def next_admin_change_id() -> str:
    return f"ACR-{int(datetime.now().timestamp() * 1000)}"


def queue_admin_change(
    state: Dict[str, Any],
    requested_by: AuthUser,
    action: str,
    payload: Dict[str, Any],
    summary: str,
) -> Dict[str, Any]:
    item = {
        "id": next_admin_change_id(),
        "action": action,
        "payload": payload,
        "summary": summary,
        "requestedBy": requested_by.full_name,
        "requestedRole": requested_by.role,
        "status": "Notified",
        "appliedBy": requested_by.full_name,
        "appliedAt": utc_now(),
        "createdAt": utc_now(),
    }
    state.setdefault("adminChangeRequests", []).insert(0, item)
    state["adminChangeRequests"] = state["adminChangeRequests"][:200]
    add_audit(state, f"{requested_by.full_name} changed data ({action}); Super Admin notified via {item['id']}")
    return item


def payroll_rates_for_designation(designation: str) -> Dict[str, float]:
    text = (designation or "").lower()
    if "senior physical therapist" in text:
        return {"regular": 460.0, "ot": 210.0, "onCall": 160.0, "deductionRate": 0.12}
    if "physical therapist" in text or "pt" in text:
        return {"regular": 420.0, "ot": 190.0, "onCall": 145.0, "deductionRate": 0.12}
    if "assistant" in text:
        return {"regular": 320.0, "ot": 145.0, "onCall": 110.0, "deductionRate": 0.10}
    if "rehab aide" in text or "aide" in text:
        return {"regular": 260.0, "ot": 120.0, "onCall": 90.0, "deductionRate": 0.08}
    if "front desk" in text or "admin" in text:
        return {"regular": 280.0, "ot": 120.0, "onCall": 90.0, "deductionRate": 0.09}
    return {"regular": 300.0, "ot": 120.0, "onCall": 90.0, "deductionRate": 0.10}


def filter_attendance_records(
    attendance: list[Dict[str, Any]],
    period_mode: str,
    year: int,
    month: int,
    cutoff: str,
) -> list[Dict[str, Any]]:
    mode = (period_mode or "semi-monthly").strip().lower()
    result: list[Dict[str, Any]] = []
    for record in attendance:
        date_val = str(record.get("date", ""))
        if len(date_val) < 10:
            continue
        try:
            dt = datetime.strptime(date_val[:10], "%Y-%m-%d")
        except ValueError:
            continue

        if mode == "yearly":
            if dt.year == year:
                result.append(record)
            continue

        if mode == "monthly":
            if dt.year == year and dt.month == month:
                result.append(record)
            continue

        if dt.year == year and dt.month == month:
            if cutoff == "15th" and dt.day <= 15:
                result.append(record)
            elif cutoff != "15th" and dt.day >= 16:
                result.append(record)
    return result


def apply_payroll_run(
    state: Dict[str, Any],
    cutoff: str,
    actor: str,
    period_mode: str,
    year: int,
    month: int,
) -> Dict[str, Any]:
    attendance = filter_attendance_records(state["attendance"], period_mode, year, month, cutoff)
    staff_index = {x["id"]: x for x in state.get("staff", [])}

    attendance_hours = 0.0
    approved_ot = 0.0
    on_call_hours = 0.0
    approved_leave = 0.0
    regular_pay = 0.0
    ot_pay = 0.0
    on_call_pay = 0.0
    deductions = 0.0
    staff_details: list[Dict[str, Any]] = []

    for record in attendance:
        staff_meta = staff_index.get(record["staffId"], {})
        designation = staff_meta.get("role") or staff_meta.get("category") or "General Staff"
        rates = payroll_rates_for_designation(designation)

        hours = float(record.get("hours", 0) or 0)
        ot_hours = float(record.get("ot", 0) or 0)
        on_call = float(record.get("onCall", 0) or 0)
        leave_days = float(record.get("leave", 0) or 0)

        row_regular = hours * rates["regular"]
        row_ot = ot_hours * rates["ot"]
        row_on_call = on_call * rates["onCall"]
        row_deduction = row_regular * rates["deductionRate"]
        row_gross = row_regular + row_ot + row_on_call - row_deduction

        attendance_hours += hours
        approved_ot += ot_hours
        on_call_hours += on_call
        approved_leave += leave_days
        regular_pay += row_regular
        ot_pay += row_ot
        on_call_pay += row_on_call
        deductions += row_deduction

        staff_details.append(
            {
                "staffId": record["staffId"],
                "name": record.get("name", ""),
                "department": record.get("department", ""),
                "designation": designation,
                "hours": round(hours, 2),
                "ot": round(ot_hours, 2),
                "onCall": round(on_call, 2),
                "leave": round(leave_days, 2),
                "regularRate": rates["regular"],
                "otRate": rates["ot"],
                "onCallRate": rates["onCall"],
                "deductionRate": rates["deductionRate"],
                "regularPay": round(row_regular, 2),
                "otPay": round(row_ot, 2),
                "onCallPay": round(row_on_call, 2),
                "deductions": round(row_deduction, 2),
                "grossPay": round(row_gross, 2),
            }
        )

    gross_pay = regular_pay + ot_pay + on_call_pay - deductions

    item = {
        "id": f"PAY-{int(datetime.now().timestamp())}",
        "cutoff": cutoff,
        "periodMode": period_mode,
        "year": year,
        "month": month,
        "attendanceHours": round(attendance_hours, 2),
        "approvedOt": round(approved_ot, 2),
        "onCallHours": round(on_call_hours, 2),
        "approvedLeave": round(approved_leave, 2),
        "regularPay": round(regular_pay, 2),
        "otPay": round(ot_pay, 2),
        "onCallPay": round(on_call_pay, 2),
        "deductions": round(deductions, 2),
        "grossPay": round(gross_pay, 2),
        "staffPayrollDetails": staff_details,
        "calculationModel": "designation-based",
        "status": "Calculated",
        "by": actor,
        "createdAt": utc_now(),
    }
    state["payrollRuns"].insert(0, item)
    return item


def apply_staff_payroll_update(state: Dict[str, Any], payload: Dict[str, Any], actor: str) -> Dict[str, Any]:
    attendance_item = next((x for x in state["attendance"] if x["staffId"] == payload["staff_id"]), None)
    if not attendance_item:
        raise HTTPException(status_code=404, detail="Staff attendance record not found")

    for key in ["hours", "ot", "onCall", "leave"]:
        if key in payload and payload[key] is not None:
            value = float(payload[key])
            if value < 0:
                raise HTTPException(status_code=400, detail=f"{key} must be non-negative")
            attendance_item[key] = value

    add_audit(state, f"{actor} updated payroll input for {attendance_item['staffId']}")
    return attendance_item


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/")
def root() -> Dict[str, str]:
    return {
        "service": "Clinic Admin API",
        "status": "ok",
        "health": "/api/health",
    }


@app.get("/favicon.ico")
def favicon() -> Response:
    return Response(status_code=204)


@app.post("/api/auth/login")
def login(payload: LoginIn) -> Dict[str, Any]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, email, full_name, role, password_hash, is_active FROM users WHERE email = ?",
            (payload.email.lower(),),
        ).fetchone()

        if not row or row["is_active"] != 1 or not verify_password(payload.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        token = secrets.token_urlsafe(42)
        conn.execute("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", (token, row["id"], utc_now()))

    return {
        "token": token,
        "user": {
            "email": row["email"],
            "name": row["full_name"],
            "role": row["role"],
        },
    }


@app.post("/api/auth/logout")
def logout(current: AuthUser = Depends(get_current_user), authorization: Optional[str] = Header(default=None)) -> Dict[str, str]:
    token = authorization.split(" ", 1)[1].strip()
    with get_conn() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    return {"status": "logged_out"}


@app.get("/api/auth/me")
def me(current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    return {
        "user": {
            "email": current.email,
            "name": current.full_name,
            "role": current.role,
            "staff_id": current.staff_id,
        }
    }


@app.get("/api/data")
def get_data(current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    with get_conn() as conn:
        state = load_state(conn)
        if current.role == "ptstaff":
            staff_id = (current.staff_id or "").strip()
            staff_item = next((x for x in state.get("staff", []) if x.get("id") == staff_id), None)
            effective_name = (staff_item or {}).get("name") or current.full_name

            scoped_data = {
                "staff": [staff_item] if staff_item else [],
                "attendance": [
                    x for x in state.get("attendance", [])
                    if (staff_id and x.get("staffId") == staff_id)
                    or (not staff_id and str(x.get("name", "")).strip().lower() == effective_name.strip().lower())
                ],
                "requests": [
                    x for x in state.get("requests", [])
                    if str(x.get("employee", "")).strip().lower() == effective_name.strip().lower()
                ],
                "reports": [
                    x for x in state.get("reports", [])
                    if str(x.get("submittedBy", "")).strip().lower() == effective_name.strip().lower()
                ],
                "payrollRuns": [],
                "generatedHospitalReports": [],
                "adminChangeRequests": [],
                "staffStatusLogs": [],
                "auditLogs": [],
            }
            return {
                "data": scoped_data,
                "users": [],
                "role": current.role,
                "name": current.full_name,
                "staff_id": staff_id,
            }
        users = list_users(conn)
    return {"data": state, "users": users, "role": current.role, "name": current.full_name}


@app.post("/api/users")
def create_user(payload: UserCreateIn, current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    if current.role == "superadmin":
        require_perm(current, "fullSystemControl")
    elif current.role == "hradmin":
        require_perm(current, "manageStaff")
    else:
        raise HTTPException(status_code=403, detail="Forbidden for this role")

    role = payload.role.strip().lower()
    if role not in ROLE_PERMS:
        raise HTTPException(status_code=400, detail="Invalid role")

    if current.role == "hradmin" and role != "ptstaff":
        raise HTTPException(status_code=403, detail="HR Admin can only create PT Staff user accounts")

    designation = (payload.designation or "").strip()
    if role == "ptstaff" and not designation:
        raise HTTPException(status_code=400, detail="Designation is required for PT Staff accounts")
    if not designation:
        designation = {
            "hradmin": "HR Admin",
            "supervisor": "Supervisor",
            "manager": "Clinic Manager",
            "ptstaff": "PT Staff",
            "superadmin": "Super Admin",
        }.get(role, role.title())

    email = payload.email.lower().strip()
    with get_conn() as conn:
        state = load_state(conn)

        staff_id = (payload.staff_id or "").strip()
        if role == "ptstaff":
            if not staff_id:
                raise HTTPException(status_code=400, detail="staff_id is required for PT Staff accounts")
            linked_staff = next((x for x in state.get("staff", []) if x.get("id") == staff_id), None)
            if not linked_staff:
                raise HTTPException(status_code=404, detail="Linked staff record not found")
        else:
            staff_id = ""

        exists = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if exists:
            raise HTTPException(status_code=409, detail="User email already exists")

        conn.execute(
            "INSERT INTO users (email, full_name, designation, staff_id, role, password_hash, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
            (email, payload.full_name.strip(), designation, staff_id, role, hash_password(payload.password), utc_now()),
        )

        if current.role != "superadmin":
            queue_admin_change(
                state,
                current,
                "user_create",
                {
                    "email": email,
                    "full_name": payload.full_name.strip(),
                    "designation": designation,
                    "staff_id": staff_id,
                    "role": role,
                },
                f"Created user {email} ({role})",
            )
        add_audit(state, f"{current.full_name} created user {email} ({role})")
        save_state(conn, state)
        users = list_users(conn)

    return {"status": "created", "users": users}


@app.post("/api/users/{user_id}/toggle")
def toggle_user(user_id: int, current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "fullSystemControl")
    with get_conn() as conn:
        row = conn.execute("SELECT id, email, role, is_active FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        if row["id"] == current.id:
            raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

        new_active = 0 if row["is_active"] == 1 else 1
        conn.execute("UPDATE users SET is_active = ? WHERE id = ?", (new_active, user_id))
        if new_active == 0:
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))

        state = load_state(conn)
        action = "activated" if new_active == 1 else "deactivated"
        add_audit(state, f"{current.full_name} {action} user {row['email']}")
        save_state(conn, state)
        users = list_users(conn)

    return {"status": "updated", "users": users}


@app.patch("/api/users/{user_id}")
def update_user(user_id: int, payload: UserUpdateIn, current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "fullSystemControl")
    with get_conn() as conn:
        row = conn.execute("SELECT id, email, role, is_active FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        updates: list[str] = []
        values: list[Any] = []

        if payload.full_name is not None:
            updates.append("full_name = ?")
            values.append(payload.full_name.strip())

        if payload.designation is not None:
            updates.append("designation = ?")
            values.append(payload.designation.strip())

        if payload.role is not None:
            role = payload.role.strip().lower()
            if role not in ROLE_PERMS:
                raise HTTPException(status_code=400, detail="Invalid role")
            updates.append("role = ?")
            values.append(role)

        if payload.password is not None and payload.password != "":
            updates.append("password_hash = ?")
            values.append(hash_password(payload.password))

        if payload.is_active is not None:
            if row["id"] == current.id and payload.is_active is False:
                raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
            updates.append("is_active = ?")
            values.append(1 if payload.is_active else 0)

        if not updates:
            raise HTTPException(status_code=400, detail="No changes provided")

        values.append(user_id)
        conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", tuple(values))

        if payload.is_active is False:
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))

        state = load_state(conn)
        add_audit(state, f"{current.full_name} updated user {row['email']}")
        save_state(conn, state)
        users = list_users(conn)

    return {"status": "updated", "users": users}


@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "fullSystemControl")
    with get_conn() as conn:
        row = conn.execute("SELECT id, email, role FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        if row["id"] == current.id:
            raise HTTPException(status_code=400, detail="Cannot delete your own account")

        if row["role"] == "superadmin":
            active_superadmins = conn.execute(
                "SELECT COUNT(*) AS c FROM users WHERE role = 'superadmin' AND is_active = 1"
            ).fetchone()["c"]
            if active_superadmins <= 1:
                raise HTTPException(status_code=400, detail="At least one active Super Admin is required")

        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))

        state = load_state(conn)
        add_audit(state, f"{current.full_name} deleted user {row['email']}")
        save_state(conn, state)
        users = list_users(conn)

    return {"status": "deleted", "users": users}


@app.post("/api/payroll/run")
def payroll_run(payload: CutoffIn, current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "generatePayroll")
    with get_conn() as conn:
        state = load_state(conn)
        now = datetime.now()
        period_mode = (payload.period_mode or "semi-monthly").strip().lower()
        year = int(payload.year or now.year)
        month = int(payload.month or now.month)
        item = apply_payroll_run(state, payload.cutoff, current.full_name, period_mode, year, month)
        if current.role != "superadmin":
            queue_admin_change(
                state,
                current,
                "payroll_run",
                {"cutoff": payload.cutoff, "period_mode": period_mode, "year": year, "month": month},
                f"Ran payroll ({period_mode}) for {year}-{month:02d} cutoff {payload.cutoff}",
            )
        add_audit(state, f"{current.full_name} calculated payroll ({period_mode} {year}-{month:02d} {payload.cutoff})")
        save_state(conn, state)
        return {"payroll": item}


@app.post("/api/payroll/staff-update")
def payroll_staff_update(payload: StaffPayrollUpdateIn, current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "generatePayroll")
    with get_conn() as conn:
        state = load_state(conn)
        payload_data = payload.model_dump()
        item = apply_staff_payroll_update(state, payload_data, current.full_name)
        if current.role != "superadmin":
            queue_admin_change(
                state,
                current,
                "staff_payroll_update",
                payload_data,
                f"Updated payroll inputs for staff {payload.staff_id}",
            )
        save_state(conn, state)
        return {"attendance": item}


@app.post("/api/payroll/save-latest")
def payroll_save(current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "generatePayroll")
    with get_conn() as conn:
        state = load_state(conn)
        if not state["payrollRuns"]:
            raise HTTPException(status_code=400, detail="No payroll run")
        state["payrollRuns"][0]["status"] = "Saved"
        if current.role != "superadmin":
            queue_admin_change(state, current, "payroll_save_latest", {}, "Saved latest payroll run")
        add_audit(state, f"{current.full_name} saved payroll {state['payrollRuns'][0]['id']}")
        save_state(conn, state)
        return {"status": "saved", "payroll": state["payrollRuns"][0]}


@app.post("/api/staff/register")
def staff_register(payload: StaffCreateIn, current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "manageStaff")
    with get_conn() as conn:
        state = load_state(conn)
        item = {
            "id": f"S-{str(int(datetime.now().timestamp()))[-3:]}",
            "name": payload.name,
            "category": payload.category,
            "department": payload.department,
            "role": payload.role,
            "credentials": payload.credentials,
            "active": True,
        }
        state["staff"].insert(0, item)
        add_staff_status_log(state, current.full_name, item["id"], item["name"], "Active", "Registered")
        if current.role != "superadmin":
            queue_admin_change(state, current, "staff_register", payload.model_dump(), f"Registered staff {payload.name}")
        add_audit(state, f"{current.full_name} registered staff {payload.name}")
        save_state(conn, state)
        return {"staff": item}


@app.post("/api/staff/{staff_id}/toggle")
def staff_toggle(staff_id: str, current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "manageStaff")
    with get_conn() as conn:
        state = load_state(conn)
        item = next((x for x in state["staff"] if x["id"] == staff_id), None)
        if not item:
            raise HTTPException(status_code=404, detail="Staff not found")
        item["active"] = not item["active"]
        new_status = "Active" if item["active"] else "Inactive"
        add_staff_status_log(state, current.full_name, item["id"], item["name"], new_status, "Status Updated")
        if current.role != "superadmin":
            queue_admin_change(state, current, "staff_toggle", {"staff_id": staff_id}, f"Toggled staff status for {staff_id}")
        add_audit(state, f"{current.full_name} {'activated' if item['active'] else 'deactivated'} {staff_id}")
        save_state(conn, state)
        return {"staff": item}


@app.patch("/api/staff/{staff_id}")
def staff_update(staff_id: str, payload: StaffUpdateIn, current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "manageStaff")
    with get_conn() as conn:
        state = load_state(conn)
        item = next((x for x in state["staff"] if x["id"] == staff_id), None)
        if not item:
            raise HTTPException(status_code=404, detail="Staff not found")

        changed = False
        for key in ["name", "category", "department", "role", "credentials"]:
            value = getattr(payload, key)
            if value is not None:
                new_val = value.strip()
                if new_val != "" and item.get(key) != new_val:
                    item[key] = new_val
                    changed = True

        if not changed:
            raise HTTPException(status_code=400, detail="No changes provided")

        current_status = "Active" if item.get("active") else "Inactive"
        add_staff_status_log(state, current.full_name, item["id"], item["name"], current_status, "Details Updated")
        if current.role != "superadmin":
            queue_admin_change(state, current, "staff_update", payload.model_dump(), f"Updated staff details for {staff_id}")
        add_audit(state, f"{current.full_name} updated staff details {staff_id}")
        save_state(conn, state)
        return {"staff": item}


@app.delete("/api/staff/{staff_id}")
def staff_delete(staff_id: str, current: AuthUser = Depends(get_current_user)) -> Dict[str, str]:
    require_perm(current, "manageStaff")
    with get_conn() as conn:
        state = load_state(conn)
        existing = next((x for x in state["staff"] if x["id"] == staff_id), None)
        before = len(state["staff"])
        state["staff"] = [x for x in state["staff"] if x["id"] != staff_id]
        if len(state["staff"]) == before:
            raise HTTPException(status_code=404, detail="Staff not found")
        if existing:
            add_staff_status_log(state, current.full_name, existing["id"], existing["name"], "Removed", "Deleted")
        if current.role != "superadmin":
            queue_admin_change(state, current, "staff_delete", {"staff_id": staff_id}, f"Deleted staff {staff_id}")
        add_audit(state, f"{current.full_name} deleted staff {staff_id}")
        save_state(conn, state)
        return {"status": "deleted"}


@app.post("/api/requests/{request_id}/decision")
def request_decision(request_id: str, payload: RequestDecisionIn, current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "approveRequests")
    if payload.decision not in {"Approved", "Rejected"}:
        raise HTTPException(status_code=400, detail="Invalid decision")
    with get_conn() as conn:
        state = load_state(conn)
        item = next((x for x in state["requests"] if x["id"] == request_id), None)
        if not item:
            raise HTTPException(status_code=404, detail="Request not found")
        if item["status"] != "Pending":
            raise HTTPException(status_code=400, detail="Request already decided")
        item["status"] = payload.decision
        item["decidedBy"] = current.full_name
        item["log"] = payload.reason or ("Approved and requestor notified" if payload.decision == "Approved" else "Rejected")
        if current.role != "superadmin":
            queue_admin_change(
                state,
                current,
                "request_decision",
                {"request_id": request_id, "decision": payload.decision, "reason": payload.reason},
                f"{payload.decision} request {request_id}",
            )
        add_audit(state, f"{current.full_name} {payload.decision.lower()} request {request_id}")
        save_state(conn, state)
        return {"request": item}


@app.post("/api/reports/{report_id}/manager-approve")
def report_manager_approve(report_id: str, current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "managerReportApproval")
    with get_conn() as conn:
        state = load_state(conn)
        rpt = next((x for x in state["reports"] if x["id"] == report_id), None)
        if not rpt:
            raise HTTPException(status_code=404, detail="Report not found")
        if rpt["status"] != "Pending Manager Review":
            raise HTTPException(status_code=400, detail="Report not in manager queue")
        rpt["status"] = "Pending Final Approval"
        rpt["managerSign"] = current.full_name
        rpt["comments"] = "Approved by manager"
        if current.role != "superadmin":
            queue_admin_change(state, current, "report_manager_approve", {"report_id": report_id}, f"Manager approved report {report_id}")
        add_audit(state, f"{current.full_name} manager-approved report {report_id}")
        save_state(conn, state)
        return {"report": rpt}


@app.post("/api/reports/{report_id}/manager-return")
def report_manager_return(report_id: str, payload: ReportCommentIn, current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "managerReportApproval")
    with get_conn() as conn:
        state = load_state(conn)
        rpt = next((x for x in state["reports"] if x["id"] == report_id), None)
        if not rpt:
            raise HTTPException(status_code=404, detail="Report not found")
        if rpt["status"] != "Pending Manager Review":
            raise HTTPException(status_code=400, detail="Report not in manager queue")
        rpt["status"] = "Returned for Revision"
        rpt["comments"] = payload.comments or "Returned by manager"
        if current.role != "superadmin":
            queue_admin_change(state, current, "report_manager_return", {"report_id": report_id, "comments": payload.comments}, f"Manager returned report {report_id}")
        add_audit(state, f"{current.full_name} returned report {report_id}")
        save_state(conn, state)
        return {"report": rpt}


@app.post("/api/reports/{report_id}/final-approve")
def report_final_approve(report_id: str, current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "superReportApproval")
    with get_conn() as conn:
        state = load_state(conn)
        rpt = next((x for x in state["reports"] if x["id"] == report_id), None)
        if not rpt:
            raise HTTPException(status_code=404, detail="Report not found")
        if rpt["status"] != "Pending Final Approval":
            raise HTTPException(status_code=400, detail="Report not in final queue")
        rpt["status"] = "Final Approved"
        rpt["finalSign"] = current.full_name
        rpt["comments"] = "Final approval and archived"
        add_audit(state, f"{current.full_name} final-approved report {report_id}")
        save_state(conn, state)
        return {"report": rpt}


@app.post("/api/reports/generate-comprehensive")
def report_generate(payload: ReportGenerateIn, current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "generateHospitalReports")
    with get_conn() as conn:
        state = load_state(conn)
        item = {
            "id": f"GEN-{int(datetime.now().timestamp())}",
            "name": payload.report_name.strip(),
            "reportType": payload.report_type.strip(),
            "department": payload.department.strip(),
            "periodStart": payload.period_start,
            "periodEnd": payload.period_end,
            "notes": payload.notes or "",
            "generatedBy": current.full_name,
            "createdAt": utc_now(),
        }
        state["generatedHospitalReports"].insert(0, item)
        add_audit(state, f"{current.full_name} generated comprehensive report bundle {item['id']} ({item['name']})")
        save_state(conn, state)
        return {"generated": item}


@app.delete("/api/reports/generated/{generated_id}")
def report_generated_delete(generated_id: str, current: AuthUser = Depends(get_current_user)) -> Dict[str, str]:
    require_perm(current, "generateHospitalReports")
    with get_conn() as conn:
        state = load_state(conn)
        before = len(state["generatedHospitalReports"])
        state["generatedHospitalReports"] = [
            x for x in state["generatedHospitalReports"] if x["id"] != generated_id
        ]
        if len(state["generatedHospitalReports"]) == before:
            raise HTTPException(status_code=404, detail="Generated report not found")
        add_audit(state, f"{current.full_name} deleted generated report {generated_id}")
        save_state(conn, state)
        return {"status": "deleted"}


@app.post("/api/system/reset")
def system_reset(current: AuthUser = Depends(get_current_user)) -> Dict[str, str]:
    require_perm(current, "fullSystemControl")
    with get_conn() as conn:
        state = seed_state()
        add_audit(state, f"{current.full_name} reset system state")
        save_state(conn, state)
    return {"status": "reset"}

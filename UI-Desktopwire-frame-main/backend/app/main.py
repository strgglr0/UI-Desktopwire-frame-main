from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

BASE_DIR = Path(__file__).resolve().parent.parent
DB_DIR = BASE_DIR / "data"
DB_PATH = DB_DIR / "clinic.db"

app = FastAPI(title="Clinic Admin API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5500", "http://127.0.0.1:5500", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
            {"id": "S-001", "name": "Dr. Marco Santos", "category": "Doctors", "department": "Manual Therapy", "role": "Doctor", "credentials": "MD, PTRP", "active": True},
            {"id": "S-002", "name": "Nurse Jamie Cruz", "category": "Nurses", "department": "Sports Rehab", "role": "Nurse", "credentials": "RN", "active": True},
            {"id": "S-003", "name": "Rosa Santos", "category": "Admin Staff", "department": "Admin", "role": "Admin Officer", "credentials": "BS Admin", "active": True},
            {"id": "S-004", "name": "Ben Lim", "category": "Nurses", "department": "Neurological PT", "role": "Nurse", "credentials": "RN", "active": False},
        ],
        "attendance": [
            {"staffId": "S-001", "name": "Dr. Marco Santos", "department": "Manual Therapy", "date": "2026-02-28", "timeIn": "07:55", "timeOut": "17:20", "hours": 9.4, "ot": 1.4, "onCall": 0.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-002", "name": "Nurse Jamie Cruz", "department": "Sports Rehab", "date": "2026-02-28", "timeIn": "08:10", "timeOut": "16:00", "hours": 7.8, "ot": 0.0, "onCall": 0.0, "leave": 0.0, "status": "Late"},
            {"staffId": "S-003", "name": "Rosa Santos", "department": "Admin", "date": "2026-02-28", "timeIn": "08:00", "timeOut": "16:00", "hours": 8.0, "ot": 0.0, "onCall": 0.0, "leave": 0.0, "status": "Present"},
            {"staffId": "S-004", "name": "Ben Lim", "department": "Neurological PT", "date": "2026-02-28", "timeIn": "—", "timeOut": "—", "hours": 0.0, "ot": 0.0, "onCall": 0.0, "leave": 1.0, "status": "On Leave"},
        ],
        "requests": [
            {"id": "REQ-001", "type": "Leave", "employee": "Nurse Jamie Cruz", "details": "Mar 02-03", "reason": "Family commitment", "status": "Pending", "requestedBy": "Staff", "decidedBy": "", "log": ""},
            {"id": "REQ-002", "type": "OT", "employee": "Dr. Marco Santos", "details": "4 hours", "reason": "Emergency case", "status": "Pending", "requestedBy": "Staff", "decidedBy": "", "log": ""},
            {"id": "REQ-003", "type": "Shift Change", "employee": "Ben Lim", "details": "Morning → Afternoon", "reason": "Medical checkup", "status": "Pending", "requestedBy": "Staff", "decidedBy": "", "log": ""},
            {"id": "REQ-004", "type": "System Change", "employee": "HR Admin", "details": "Add role permission", "reason": "Process update", "status": "Pending", "requestedBy": "Admin", "decidedBy": "", "log": ""},
        ],
        "reports": [
            {"id": "RPT-001", "category": "Medical Reports", "title": "Patient Discharge Summary", "submittedBy": "Dr. Marco Santos", "status": "Pending Manager Review", "managerSign": "", "finalSign": "", "comments": ""},
            {"id": "RPT-002", "category": "Clinical Reports", "title": "Weekly Clinical Outcomes", "submittedBy": "Nurse Jamie Cruz", "status": "Pending Manager Review", "managerSign": "", "finalSign": "", "comments": ""},
            {"id": "RPT-003", "category": "Financial Reports", "title": "Monthly Revenue Snapshot", "submittedBy": "Finance Officer", "status": "Pending Final Approval", "managerSign": "Manager User", "finalSign": "", "comments": ""},
            {"id": "RPT-004", "category": "Audit Reports", "title": "System Access Audit", "submittedBy": "System", "status": "Pending Final Approval", "managerSign": "Manager User", "finalSign": "", "comments": ""},
        ],
        "payrollRuns": [],
        "generatedHospitalReports": [],
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
              role TEXT NOT NULL,
              password_hash TEXT NOT NULL,
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL
            )
            """
        )
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
            ("hradmin@summit.ph", "HR Admin User", "hradmin", "Hr@123"),
            ("supervisor@summit.ph", "Supervisor User", "supervisor", "Sup@123"),
            ("manager@summit.ph", "Manager User", "manager", "Mgr@123"),
            ("superadmin@summit.ph", "Super Admin User", "superadmin", "Sa@123"),
        ]

        for email, full_name, role, plain in users:
            exists = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
            if exists:
                continue
            conn.execute(
                "INSERT INTO users (email, full_name, role, password_hash, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                (email, full_name, role, hash_password(plain), utc_now()),
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


class CutoffIn(BaseModel):
    cutoff: str


class StaffCreateIn(BaseModel):
    name: str
    category: str
    department: str
    role: str
    credentials: str


class AuthUser(BaseModel):
    id: int
    email: str
    full_name: str
    role: str


ROLE_PERMS: Dict[str, set[str]] = {
    "hradmin": {"generatePayroll", "manageStaff"},
    "supervisor": {"approveRequests", "viewAttendance"},
    "manager": {"managerReportApproval", "viewAttendance", "viewSummaries"},
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


def get_current_user(authorization: Optional[str] = Header(default=None)) -> AuthUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1].strip()
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT u.id, u.email, u.full_name, u.role, u.is_active
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
    if not row or row["is_active"] != 1:
        raise HTTPException(status_code=401, detail="Invalid session")
    return AuthUser(id=row["id"], email=row["email"], full_name=row["full_name"], role=row["role"])


def require_perm(user: AuthUser, perm: str) -> None:
    if perm in ROLE_PERMS.get(user.role, set()):
        return
    raise HTTPException(status_code=403, detail="Forbidden for this role")


def add_audit(state: Dict[str, Any], msg: str) -> None:
    state["auditLogs"].insert(0, f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} · {msg}")
    state["auditLogs"] = state["auditLogs"][:150]


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


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
    return {"user": {"email": current.email, "name": current.full_name, "role": current.role}}


@app.get("/api/data")
def get_data(current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    with get_conn() as conn:
        state = load_state(conn)
    return {"data": state, "role": current.role, "name": current.full_name}


@app.post("/api/payroll/run")
def payroll_run(payload: CutoffIn, current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "generatePayroll")
    with get_conn() as conn:
        state = load_state(conn)
        attendance = state["attendance"]
        attendance_hours = sum(float(x["hours"]) for x in attendance)
        approved_ot = sum(float(x["ot"]) for x in attendance)
        on_call_hours = sum(float(x.get("onCall", 0)) for x in attendance)
        approved_leave = sum(float(x.get("leave", 0)) for x in attendance)

        regular_pay = attendance_hours * 300
        ot_pay = approved_ot * 120
        on_call_pay = on_call_hours * 90
        deductions = regular_pay * 0.12
        gross_pay = regular_pay + ot_pay + on_call_pay - deductions

        item = {
            "id": f"PAY-{int(datetime.now().timestamp())}",
            "cutoff": payload.cutoff,
            "attendanceHours": attendance_hours,
            "approvedOt": approved_ot,
            "onCallHours": on_call_hours,
            "approvedLeave": approved_leave,
            "regularPay": round(regular_pay, 2),
            "otPay": round(ot_pay, 2),
            "onCallPay": round(on_call_pay, 2),
            "deductions": round(deductions, 2),
            "grossPay": round(gross_pay, 2),
            "status": "Calculated",
            "by": current.full_name,
            "createdAt": utc_now(),
        }
        state["payrollRuns"].insert(0, item)
        add_audit(state, f"{current.full_name} calculated payroll ({payload.cutoff})")
        save_state(conn, state)
        return {"payroll": item}


@app.post("/api/payroll/save-latest")
def payroll_save(current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "generatePayroll")
    with get_conn() as conn:
        state = load_state(conn)
        if not state["payrollRuns"]:
            raise HTTPException(status_code=400, detail="No payroll run")
        state["payrollRuns"][0]["status"] = "Saved"
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
        add_audit(state, f"{current.full_name} {'activated' if item['active'] else 'deactivated'} {staff_id}")
        save_state(conn, state)
        return {"staff": item}


@app.delete("/api/staff/{staff_id}")
def staff_delete(staff_id: str, current: AuthUser = Depends(get_current_user)) -> Dict[str, str]:
    require_perm(current, "fullSystemControl")
    with get_conn() as conn:
        state = load_state(conn)
        before = len(state["staff"])
        state["staff"] = [x for x in state["staff"] if x["id"] != staff_id]
        if len(state["staff"]) == before:
            raise HTTPException(status_code=404, detail="Staff not found")
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
def report_generate(current: AuthUser = Depends(get_current_user)) -> Dict[str, Any]:
    require_perm(current, "generateHospitalReports")
    with get_conn() as conn:
        state = load_state(conn)
        item = {
            "id": f"GEN-{int(datetime.now().timestamp())}",
            "name": f"Hospital Bundle {datetime.now().strftime('%Y-%m-%d')}",
            "generatedBy": current.full_name,
            "createdAt": utc_now(),
        }
        state["generatedHospitalReports"].insert(0, item)
        add_audit(state, f"{current.full_name} generated comprehensive report bundle")
        save_state(conn, state)
        return {"generated": item}


@app.post("/api/system/reset")
def system_reset(current: AuthUser = Depends(get_current_user)) -> Dict[str, str]:
    require_perm(current, "fullSystemControl")
    with get_conn() as conn:
        state = seed_state()
        add_audit(state, f"{current.full_name} reset system state")
        save_state(conn, state)
    return {"status": "reset"}

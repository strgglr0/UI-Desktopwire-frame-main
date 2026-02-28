# Clinic Admin System

Production-oriented split architecture for a hospital/clinic admin system.

## Structure

- [frontend/index.html](frontend/index.html) — login and role-based admin UI
- [frontend/styles.css](frontend/styles.css) — UI styling
- [frontend/app.js](frontend/app.js) — frontend logic + backend API calls
- [backend/app/main.py](backend/app/main.py) — FastAPI backend with auth, role permissions, and workflow APIs
- [backend/requirements.txt](backend/requirements.txt) — backend dependencies

## Authentication Model

- Login uses backend credentials only (no frontend role selector)
- Backend resolves user role from stored account
- Frontend renders allowed panels based on authenticated role
- API endpoints enforce role authorization on every action
- Non-Super Admin write actions are applied immediately based on role permission
- Every non-Super Admin write action automatically creates a Super Admin notification entry

## Shared Change Workflow

- HR Admin, Supervisor, and Manager can execute their permitted actions directly
- Super Admin sees every non-Super Admin change in "Admin Change Notifications"
- All actions are applied to the same shared backend state, so all roles see consistent data

## PT Staff Login Accounts

- In "Manage Clinic System", designation input is removed from user creation/edit UI
- HR Admin can now create PT Staff login accounts directly from "PT Staff Management"
- HR-created PT Staff users are assigned to role `ptstaff` and receive PT Staff Management interface only
- HR links each PT Staff login account to an existing Medical Staff record (`staff_id`) during account creation
- PT Staff account creation by HR includes designation so staff can still be classified correctly
- PT Staff designation options now exclude admin roles (HR/Supervisor/Manager/Super Admin)
- PT Staff interface is now separated from admin interfaces (dedicated PT Staff dashboard/workspace)

## Integration Recommendation (Admin + Employee Split)

- Best setup: keep this repository focused on Admin modules (HR/Supervisor/Manager/Super Admin) and let the employee/PT Staff team own a separate frontend app
- Shared contract should be the backend API + auth token, not shared frontend components
- PT Staff handoff is already supported in frontend:
	- if `localStorage['ptstaff-app-url']` is set, PT Staff login is redirected to that URL with `?token=<session_token>`
	- if not set, PT Staff stays on the local placeholder workspace in this app
- Super Admin can configure this directly in UI: `Manage Clinic System` → `PT Staff App Integration`
- Teammate integration flow:
	1) Teammate shares PT Staff app URL
	2) Super Admin saves that URL in the integration box
	3) PT Staff users login in this system and are redirected automatically
	4) Teammate app reads `token` from URL query and uses it as `Authorization: Bearer <token>` for API calls
- This allows both teams to work independently, then combine by pointing PT Staff users to the teammate app
- Recommended merge order:
	1) Agree on API endpoints and payloads
	2) Keep role/permission checks in backend as single source of truth
	3) Integrate PT Staff frontend last via the handoff URL

## Employee App API Contract (for teammate)

- Auth validation: `GET /api/auth/me`
	- returns logged-in user info (includes `role` and `staff_id`)
- Main data source: `GET /api/data`
	- for `ptstaff` role, backend now returns **scoped personal data only**:
		- own attendance records
		- own requests
		- own reports
		- linked staff record
	- admin/global datasets are not included for `ptstaff`
- This keeps role restriction enforced in backend while allowing employee frontend to reuse the same API base

## Medical Staff Account Status

- HR and Super Admin can Activate/Deactivate medical staff accounts
- Medical staff account details are editable (name, category, department, role/designation, credentials)
- Medical staff accounts can also be removed/deleted
- Status updates are applied immediately and reflected across shared role views
- Every account status change is logged with timestamp, actor, staff ID/name, action, and updated status

## Payroll Editing

- In "Generate PT Staff Payroll", HR Admin chooses cut-off (15th/30th) and selects a specific staff member to view payroll calculation details
- HR Admin now has direct attendance visibility connected to the same shared attendance source used by Supervisor/Manager views
- Selected staff payroll details are calculated from attendance records within the selected cut-off window
- Attendance screens now focus on today attendance in-table view
- Attendance tables now include per-staff buttons beside each name:
	- Month Log
	- Year Log
	where Month Log shows daily attendance entries for the month, and Year Log shows simplified month-by-month totals for the year
- HR payroll module explicitly shows:
	- Retrieve Attendance Data (Attendance Hours, Approved OT, On-Call Hours, Approved Leave)
	- Calculate Payroll by job/designation (Regular Pay, OT Pay, On-Call Pay, Deductions)
	- Generated Payroll Report list with Gross Pay display
- Payroll Breakdown and selected-staff payroll panels now follow selected cut-off:
	- `15th` = first-half attendance (days 1-15)
	- `30th` = second-half attendance (days 16-end)
	with pay recomputed by designation-based rates for the selected cut-off period
- Payroll preview now aggregates attendance exactly by cut-off window (not just a single/today entry), and still shows each staff breakdown on both cut-off options (zero values when no records exist in that window)
- HR Payroll now shows a visible active period label (month/year + day window) and refreshes selectable staff per cut-off to reduce input mistakes
- The active period label now also shows how many attendance records were used for the selected cut-off computation
- Payroll breakdown panels are displayed only after pressing `Run Payroll Calculation` (selecting staff/cut-off alone does not auto-render payroll results)
- Changing selected staff or cut-off requires pressing `Run Payroll Calculation` again before payroll panels are shown
- Payroll run now computes per-staff pay using retrieved attendance + staff designation rates
- In HR Payroll, changing the selected staff now updates Payroll Breakdown, Retrieve Attendance Data, Calculate Payroll (By Designation), and Staff Pay Calculation Details in real time

## Demo Data Note

- To load richer month/year attendance examples (including both 1st-half and 2nd-half records), use `Manage Clinic System` → `Reset Demo Data`

## Comprehensive Reports

- Super Admin can now enter detailed report metadata before generating a report bundle:
	- report name
	- report type
	- department
	- period start/end
	- notes
- Accidentally generated report bundles can be deleted from the generated reports table

## Run Backend

From project root:

`pip install -r backend/requirements.txt`

`uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000`

Production/domain environment variables (example):

`ALLOWED_ORIGINS=https://clinic.example.com,https://www.clinic.example.com`

`ALLOWED_HOSTS=clinic.example.com,www.clinic.example.com`

## Run Both (One Command)

From project root:

`bash run_local.sh`

This starts:
- backend on `:8000`
- frontend proxy on `:5500`

Stop both with:

`bash stop_local.sh`

## Run Frontend

From project root:

`cd frontend && python3 dev_server.py`

Open:

`http://localhost:5500/index.html`

This frontend server proxies `/api/*` to backend `127.0.0.1:8000`, so the browser only needs port `5500`.

## GitHub Pages Notes

- Repository root now redirects to `frontend/index.html`, so project Pages URL should open the app shell.
- GitHub Pages only hosts static frontend files; backend API is **not** hosted there by default.
- To make login/API work on Pages, host backend separately and set valid CORS/host envs (`ALLOWED_ORIGINS`, `ALLOWED_HOSTS`) for your Pages domain.

## Custom Domain Deployment

- Use the Nginx template at [deploy/nginx-clinic.conf](deploy/nginx-clinic.conf)
- Replace `clinic.example.com` with your domain
- Point DNS `A` record(s) to your server IP
- Run backend and frontend services:
	- backend on `127.0.0.1:8000`
	- frontend proxy on `127.0.0.1:5500`
- Enable site + TLS (example):
	- `sudo ln -s /path/to/deploy/nginx-clinic.conf /etc/nginx/sites-enabled/clinic`
	- `sudo nginx -t && sudo systemctl reload nginx`
	- `sudo certbot --nginx -d clinic.example.com -d www.clinic.example.com`

## Default Accounts

- HR Admin: `hradmin@summit.ph` / `Hr@123`
- Supervisor: `supervisor@summit.ph` / `Sup@123`
- Manager: `manager@summit.ph` / `Mgr@123`
- Super Admin: `superadmin@summit.ph` / `Sa@123`
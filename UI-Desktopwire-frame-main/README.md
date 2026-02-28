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

## Run Backend

From project root:

`pip install -r backend/requirements.txt`

`uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000`

## Run Frontend

From project root:

`cd frontend && python3 dev_server.py`

Open:

`http://localhost:5500/index.html`

This frontend server proxies `/api/*` to backend `127.0.0.1:8000`, so the browser only needs port `5500`.

## Default Accounts

- HR Admin: `hradmin@summit.ph` / `Hr@123`
- Supervisor: `supervisor@summit.ph` / `Sup@123`
- Manager: `manager@summit.ph` / `Mgr@123`
- Super Admin: `superadmin@summit.ph` / `Sa@123`
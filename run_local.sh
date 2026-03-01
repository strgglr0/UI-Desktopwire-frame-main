#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_ACTIVATE="${ROOT_DIR}/.venv/bin/activate"
PID_DIR="${ROOT_DIR}/.run"
BACKEND_PID_FILE="${PID_DIR}/backend.pid"
FRONTEND_PID_FILE="${PID_DIR}/frontend.pid"
BACKEND_LOG="${PID_DIR}/backend.log"
FRONTEND_LOG="${PID_DIR}/frontend.log"

mkdir -p "${PID_DIR}"

if [[ ! -f "${VENV_ACTIVATE}" ]]; then
  echo "Missing virtual environment at ${VENV_ACTIVATE}"
  echo "Create it with: python3 -m venv .venv"
  exit 1
fi

source "${VENV_ACTIVATE}"

if [[ -f "${BACKEND_PID_FILE}" ]] && kill -0 "$(cat "${BACKEND_PID_FILE}")" 2>/dev/null; then
  echo "Backend already running (PID $(cat "${BACKEND_PID_FILE}"))"
else
  pip install -q -r "${ROOT_DIR}/backend/requirements.txt"
  nohup uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload >"${BACKEND_LOG}" 2>&1 &
  echo $! >"${BACKEND_PID_FILE}"
  echo "Started backend on :8000 (PID $(cat "${BACKEND_PID_FILE}"))"
fi

if [[ -f "${FRONTEND_PID_FILE}" ]] && kill -0 "$(cat "${FRONTEND_PID_FILE}")" 2>/dev/null; then
  echo "Frontend already running (PID $(cat "${FRONTEND_PID_FILE}"))"
else
  nohup python3 "${ROOT_DIR}/frontend/dev_server.py" >"${FRONTEND_LOG}" 2>&1 &
  echo $! >"${FRONTEND_PID_FILE}"
  echo "Started frontend on :5500 (PID $(cat "${FRONTEND_PID_FILE}"))"
fi

echo
echo "Open: http://localhost:5500/index.html"
echo "Logs: ${BACKEND_LOG} and ${FRONTEND_LOG}"
echo "Stop with: ${ROOT_DIR}/stop_local.sh"
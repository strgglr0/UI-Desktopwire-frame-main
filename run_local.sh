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

is_pid_running() {
  local pid="$1"
  kill -0 "${pid}" 2>/dev/null
}

pid_matches() {
  local pid="$1"
  local expected="$2"
  ps -p "${pid}" -o args= 2>/dev/null | grep -q "${expected}"
}

if [[ ! -f "${VENV_ACTIVATE}" ]]; then
  echo "Missing virtual environment at ${VENV_ACTIVATE}"
  echo "Create it with: python3 -m venv .venv"
  exit 1
fi

source "${VENV_ACTIVATE}"

if [[ -f "${BACKEND_PID_FILE}" ]] && is_pid_running "$(cat "${BACKEND_PID_FILE}")"; then
  BACKEND_PID="$(cat "${BACKEND_PID_FILE}")"
  if pid_matches "${BACKEND_PID}" "uvicorn backend.app.main:app"; then
    echo "Backend already running (PID ${BACKEND_PID})"
  else
    echo "Backend PID ${BACKEND_PID} is not uvicorn backend service. Restarting backend..."
    kill "${BACKEND_PID}" 2>/dev/null || true
    rm -f "${BACKEND_PID_FILE}"
    pip install -q -r "${ROOT_DIR}/backend/requirements.txt"
    nohup uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload >"${BACKEND_LOG}" 2>&1 &
    echo $! >"${BACKEND_PID_FILE}"
    echo "Started backend on :8000 (PID $(cat "${BACKEND_PID_FILE}"))"
  fi
else
  pip install -q -r "${ROOT_DIR}/backend/requirements.txt"
  nohup uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload >"${BACKEND_LOG}" 2>&1 &
  echo $! >"${BACKEND_PID_FILE}"
  echo "Started backend on :8000 (PID $(cat "${BACKEND_PID_FILE}"))"
fi

if [[ -f "${FRONTEND_PID_FILE}" ]] && is_pid_running "$(cat "${FRONTEND_PID_FILE}")"; then
  FRONTEND_PID="$(cat "${FRONTEND_PID_FILE}")"
  if pid_matches "${FRONTEND_PID}" "vite"; then
    echo "Frontend already running (PID ${FRONTEND_PID})"
  else
    echo "Frontend PID ${FRONTEND_PID} is not Vite. Restarting frontend..."
    kill "${FRONTEND_PID}" 2>/dev/null || true
    rm -f "${FRONTEND_PID_FILE}"
    if [[ ! -d "${ROOT_DIR}/frontend/node_modules" ]]; then
      (cd "${ROOT_DIR}/frontend" && npm install)
    fi
    nohup bash -lc "cd '${ROOT_DIR}/frontend' && npm run dev -- --host 0.0.0.0 --port 5500" >"${FRONTEND_LOG}" 2>&1 &
    echo $! >"${FRONTEND_PID_FILE}"
    echo "Started frontend on :5500 (PID $(cat "${FRONTEND_PID_FILE}"))"
  fi
else
  if [[ ! -d "${ROOT_DIR}/frontend/node_modules" ]]; then
    (cd "${ROOT_DIR}/frontend" && npm install)
  fi
  nohup bash -lc "cd '${ROOT_DIR}/frontend' && npm run dev -- --host 0.0.0.0 --port 5500" >"${FRONTEND_LOG}" 2>&1 &
  echo $! >"${FRONTEND_PID_FILE}"
  echo "Started frontend on :5500 (PID $(cat "${FRONTEND_PID_FILE}"))"
fi

echo
echo "Open: http://localhost:5500/index.html"
echo "Logs: ${BACKEND_LOG} and ${FRONTEND_LOG}"
echo "Stop with: ${ROOT_DIR}/stop_local.sh"
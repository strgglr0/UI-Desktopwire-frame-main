#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="${ROOT_DIR}/.run"
BACKEND_PID_FILE="${PID_DIR}/backend.pid"
FRONTEND_PID_FILE="${PID_DIR}/frontend.pid"

stop_service() {
  local pid_file="$1"
  local name="$2"

  if [[ ! -f "${pid_file}" ]]; then
    echo "${name}: not running"
    return
  fi

  local pid
  pid="$(cat "${pid_file}")"
  if kill -0 "${pid}" 2>/dev/null; then
    kill "${pid}" || true
    echo "${name}: stopped (PID ${pid})"
  else
    echo "${name}: stale PID file removed"
  fi

  rm -f "${pid_file}"
}

stop_service "${FRONTEND_PID_FILE}" "Frontend"
stop_service "${BACKEND_PID_FILE}" "Backend"
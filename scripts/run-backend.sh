#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/john/development/jarvis"
WINDOWS_HOST="$(ip route show default | awk '/default/ { print $3; exit }')"

if [[ -z "${WINDOWS_HOST}" ]]; then
  echo "Unable to determine the Windows host address." >&2
  exit 1
fi

export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://${WINDOWS_HOST}:11434}"
export KOKORO_TTS_URL="${KOKORO_TTS_URL:-http://${WINDOWS_HOST}:8880}"

cd "${ROOT}"
exec "${ROOT}/.venv/bin/python" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

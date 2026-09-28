#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

HOST="${SCANNER_HOST:-127.0.0.1}"
PORT="${SCANNER_PORT:-7891}"
WORKERS="${SCANNER_WORKERS:-1}"

if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

exec uvicorn app:app \
    --host "$HOST" \
    --port "$PORT" \
    --workers "$WORKERS" \
    --log-level "${LOG_LEVEL:-info}" \
    --no-access-log

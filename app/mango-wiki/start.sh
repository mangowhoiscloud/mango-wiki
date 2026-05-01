#!/usr/bin/env bash
# mango-wiki — dev server launcher with live vault reload
#
# Starts Next.js dev server on port 4012 with cache disabled so vault edits
# surface on next request without restart. Logs to /tmp/mango-wiki-dev.log.
#
# Usage:
#   ./start.sh         # foreground
#   ./start.sh bg      # background (disowned, log → /tmp/mango-wiki-dev.log)
#   ./start.sh stop    # kill running instance
#   ./start.sh status  # check if running

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/mango-wiki-dev.log"
PIDFILE="/tmp/mango-wiki-dev.pid"
PORT="${MANGO_WIKI_PORT:-4012}"
URL="http://localhost:${PORT}"

cmd_start_fg() {
  cd "$APP_DIR"
  echo "[mango-wiki] starting at ${URL} (foreground)"
  exec pnpm dev
}

cmd_start_bg() {
  if cmd_status >/dev/null 2>&1; then
    echo "[mango-wiki] already running (PID $(cat "$PIDFILE")). Use './start.sh stop' first."
    exit 1
  fi
  cd "$APP_DIR"
  nohup pnpm dev > "$LOG" 2>&1 &
  echo $! > "$PIDFILE"
  disown
  echo "[mango-wiki] started in background (PID $(cat "$PIDFILE"))"
  echo "[mango-wiki] log: $LOG"
  echo "[mango-wiki] URL: ${URL}"
  sleep 3
  if curl -s -o /dev/null -w "%{http_code}" "${URL}/" 2>/dev/null | grep -q "200"; then
    echo "[mango-wiki] ✓ HTTP 200 on ${URL}"
  else
    echo "[mango-wiki] still booting — check log: tail -f $LOG"
  fi
}

cmd_stop() {
  if [[ -f "$PIDFILE" ]]; then
    PID=$(cat "$PIDFILE")
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID" && echo "[mango-wiki] stopped (PID $PID)"
    fi
    rm -f "$PIDFILE"
  fi
  # Belt-and-suspenders: kill any orphan next dev on this port
  pkill -f "next dev -p $PORT" 2>/dev/null || true
}

cmd_status() {
  if [[ -f "$PIDFILE" ]]; then
    PID=$(cat "$PIDFILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "[mango-wiki] running (PID $PID, port $PORT)"
      return 0
    fi
  fi
  echo "[mango-wiki] not running"
  return 1
}

case "${1:-fg}" in
  fg|foreground|"") cmd_start_fg ;;
  bg|background)    cmd_start_bg ;;
  stop|kill)        cmd_stop ;;
  status)           cmd_status ;;
  restart)          cmd_stop; sleep 1; cmd_start_bg ;;
  *)
    echo "Usage: $0 [fg|bg|stop|status|restart]"
    exit 1
    ;;
esac

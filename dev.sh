#!/usr/bin/env bash

ROOT="$(cd "$(dirname "$0")" && pwd)"
SERVER="$ROOT/server"
CLIENT="$ROOT/client"

# ── colour helpers ──────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[dev]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
error() { echo -e "${RED}[error]${NC} $*"; exit 1; }

# ── preflight ───────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || error "node not found — run: nvm use 20"
command -v npm  >/dev/null 2>&1 || error "npm not found"

NODE_MAJOR=$(node -e "process.stdout.write(process.version.split('.')[0].slice(1))")
[ "$NODE_MAJOR" -ge 20 ] || warn "Node $NODE_MAJOR detected — Node 20+ recommended"

if [ ! -f "$SERVER/.env" ]; then
  warn "server/.env not found — copying from server/.env.example"
  cp "$SERVER/.env.example" "$SERVER/.env"
  warn "Fill in BETTER_AUTH_SECRET (32+ chars), DATABASE_URL, then re-run."
  exit 1
fi

# ── install deps ─────────────────────────────────────────────────────────────
info "Installing server dependencies..."
npm install --prefix "$SERVER"

info "Installing client dependencies..."
npm install --prefix "$CLIENT" --legacy-peer-deps

# ── cleanup on exit ──────────────────────────────────────────────────────────
PIDS=()
cleanup() {
  echo ""
  info "Shutting down..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

# ── clear any stale process on port 3001 ────────────────────────────────────
if fuser 3001/tcp > /dev/null 2>&1; then
  warn "Port 3001 already in use — killing stale process"
  fuser -k 3001/tcp 2>/dev/null
  sleep 2
fi

# ── start backend ────────────────────────────────────────────────────────────
info "Starting backend  →  http://localhost:3001"
(cd "$SERVER" && npm run dev 2>&1 | sed $'s/^/\033[36m[server]\033[0m /') &
PIDS+=($!)

# Wait until the backend is actually accepting connections (up to 30s)
info "Waiting for backend to be ready..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/api/auth/get-session > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# ── start frontend ───────────────────────────────────────────────────────────
info "Starting frontend →  http://localhost:3000"
(cd "$CLIENT" && BROWSER=none npm start 2>&1 | sed $'s/^/\033[35m[client]\033[0m /') &
PIDS+=($!)

info "Both processes running. Ctrl+C to stop."
wait

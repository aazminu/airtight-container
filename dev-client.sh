#!/usr/bin/env bash

ROOT="$(cd "$(dirname "$0")" && pwd)"
CLIENT="$ROOT/client"

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[dev]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*"; exit 1; }

[ -d "$CLIENT/node_modules" ] || error "client/node_modules not found — run ./dev.sh once first to install deps"

cleanup() { echo ""; info "Shutting down..."; kill "$CLIENT_PID" 2>/dev/null; wait 2>/dev/null; }
trap cleanup EXIT INT TERM

info "Starting frontend →  http://localhost:3000"
(cd "$CLIENT" && BROWSER=none npm start 2>&1 | sed $'s/^/\033[35m[client]\033[0m /') &
CLIENT_PID=$!

wait

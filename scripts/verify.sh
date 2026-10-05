#!/bin/bash
# One-shot verification: start dev server, run E2E suite, then clean up.
set -u
cd /home/z/my-project

export DATABASE_URL="${DATABASE_URL:?Set DATABASE_URL before running}"

# Cleanup any stale server
pkill -f "next-server" 2>/dev/null; pkill -f "next dev" 2>/dev/null; sleep 1

# Start fresh
bun run dev > /dev/null 2>&1 &
SERVER_BG=$!

# Wait for readiness
for i in $(seq 1 40); do
  if curl -s --max-time 3 http://localhost:3000/api/health | rg -q '"ok":true'; then
    echo "=== SERVER READY (attempt $i) ==="
    break
  fi
  sleep 1
done

if ! curl -s --max-time 5 http://localhost:3000/api/health | rg -q '"ok":true'; then
  echo "=== SERVER FAILED TO START ==="
  kill $SERVER_BG 2>/dev/null
  exit 1
fi

# Run the E2E suite
python3 scripts/e2e_test.py
E2E_EXIT=$?

echo ""
echo "=== E2E EXIT CODE: $E2E_EXIT ==="

# Leave cleanup to caller; print server PID for reuse within same call
echo "SERVER_PID_BG=$SERVER_BG"
exit $E2E_EXIT

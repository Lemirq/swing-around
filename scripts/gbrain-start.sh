#!/usr/bin/env bash
# Start gbrain HTTP server + named Cloudflare tunnel.
# Permanent URL: https://gbrain-api.vihaan.ca
# Usage: npm run gbrain

set -euo pipefail

PORT=${1:-8009}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load OPENAI_API_KEY from .env.local if not already set
if [ -z "${OPENAI_API_KEY:-}" ] && [ -f "$SCRIPT_DIR/../.env.local" ]; then
  export OPENAI_API_KEY=$(grep OPENAI_API_KEY "$SCRIPT_DIR/../.env.local" | cut -d= -f2-)
fi

cleanup() {
  echo ""
  echo "Shutting down gbrain..."
  kill "$SERVER_PID" 2>/dev/null || true
  kill "${TUNNEL_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Clear stale PGLite lock if present
LOCK_FILE="$HOME/.gbrain/brain.pglite/.gbrain-lock/lock"
if [ -f "$LOCK_FILE" ]; then
  echo "Clearing stale PGLite lock..."
  rm -f "$LOCK_FILE"
fi

# Start gbrain HTTP server
echo "Starting gbrain HTTP server on port $PORT..."
bun run "$SCRIPT_DIR/gbrain-http.ts" &
SERVER_PID=$!
sleep 2

# Verify server is running
if ! curl -s "http://localhost:$PORT/query" -X POST -H "Content-Type: application/json" -d '{"query":"ping","limit":1}' > /dev/null 2>&1; then
  echo "ERROR: gbrain server failed to start"
  exit 1
fi
echo "✓ gbrain server running on port $PORT"

# Start named Cloudflare tunnel (permanent URL)
echo "Starting Cloudflare tunnel..."
cloudflared tunnel --config /Users/vs/.cloudflared/config-gbrain.yml run gbrain > /tmp/cloudflared-gbrain.log 2>&1 &
TUNNEL_PID=$!
sleep 3

echo ""
echo "════════════════════════════════════════════════════"
echo "  gbrain live at: https://gbrain-api.vihaan.ca"
echo "  Press Ctrl+C to stop"
echo "════════════════════════════════════════════════════"
echo ""

wait "$TUNNEL_PID"

#!/usr/bin/env bash
# Start gbrain HTTP server + Cloudflare tunnel, then auto-set GBRAIN_URL in Convex.
# Usage: npm run gbrain (or ./scripts/gbrain-start.sh)

set -euo pipefail

PORT=${1:-8009}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  echo ""
  echo "Shutting down gbrain..."
  kill "$SERVER_PID" 2>/dev/null || true
  kill "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

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
echo "✓ gbrain server running"

# Start Cloudflare tunnel and capture URL
echo "Starting Cloudflare tunnel..."
cloudflared tunnel --url "http://localhost:$PORT" > /tmp/cloudflared-gbrain.log 2>&1 &
TUNNEL_PID=$!

# Wait for tunnel URL to appear in logs
TUNNEL_URL=""
for i in {1..20}; do
  TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cloudflared-gbrain.log 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "ERROR: Could not get tunnel URL after 20 seconds"
  cat /tmp/cloudflared-gbrain.log
  exit 1
fi

echo "✓ Tunnel live at: $TUNNEL_URL"

# Set GBRAIN_URL on both Convex deployments
echo "Setting GBRAIN_URL in Convex..."
npx convex env set GBRAIN_URL "$TUNNEL_URL" 2>/dev/null && echo "  ✓ dev"
npx convex env set GBRAIN_URL "$TUNNEL_URL" --prod 2>/dev/null && echo "  ✓ prod"

echo ""
echo "════════════════════════════════════════════════════"
echo "  gbrain is live at: $TUNNEL_URL"
echo "  GBRAIN_URL set on dev + prod Convex deployments"
echo "  Press Ctrl+C to stop"
echo "════════════════════════════════════════════════════"
echo ""

wait "$TUNNEL_PID"

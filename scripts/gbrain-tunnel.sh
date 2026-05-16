#!/usr/bin/env bash
# Expose local gbrain as a simple REST API via Cloudflare Tunnel.
# Convex actions POST to <tunnel-url>/put/:slug, /tag/:slug/:tag, /query.
#
# Usage: ./scripts/gbrain-tunnel.sh [port]
# Default port: 8009

set -euo pipefail

PORT=${1:-8009}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill "$SERVER_PID" 2>/dev/null || true
  kill "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting gbrain HTTP server on port $PORT..."
bun run "$SCRIPT_DIR/gbrain-http.ts" &
SERVER_PID=$!

sleep 2

echo "Starting Cloudflare tunnel..."
cloudflared tunnel --url "http://localhost:$PORT" 2>&1 &
TUNNEL_PID=$!

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  Watch above for your Cloudflare URL, then:                   ║"
echo "║                                                                ║"
echo "║  bunx convex env set GBRAIN_URL https://<url>                 ║"
echo "║                                                                ║"
echo "║  Press Ctrl+C to stop                                          ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

wait "$TUNNEL_PID"

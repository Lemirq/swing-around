#!/usr/bin/env bash
# Expose local gbrain (PGLite) as a public MCP server via Cloudflare Tunnel.
#
# Usage: ./scripts/gbrain-tunnel.sh [port]
# Default port: 8008
#
# Others connect using the printed URL as an MCP streamable-HTTP endpoint.

set -euo pipefail

PORT=${1:-8008}

# Trap to kill background jobs on exit
cleanup() {
  echo ""
  echo "Shutting down..."
  kill "$GATEWAY_PID" 2>/dev/null || true
  kill "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting gbrain MCP → HTTP bridge on port $PORT..."
npx -y supergateway \
  --stdio "gbrain serve" \
  --port "$PORT" \
  --outputTransport streamableHttp \
  --logLevel none &
GATEWAY_PID=$!

# Give supergateway a moment to bind the port
sleep 2

echo "Starting Cloudflare tunnel..."
cloudflared tunnel --url "http://localhost:$PORT" 2>&1 &
TUNNEL_PID=$!

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  gbrain tunnel is starting — watch for the URL above  ║"
echo "║  Others connect to: <tunnel-url>/mcp                  ║"
echo "║  Press Ctrl+C to stop                                  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Wait for either process to exit
wait "$TUNNEL_PID"

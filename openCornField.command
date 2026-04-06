#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_URL="http://127.0.0.1:${PORT:-4300}"

cd "$SCRIPT_DIR"

mkdir -p data data/thumbnails

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found on this Mac."
  echo "Install Node.js first, then run this launcher again."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found on this Mac."
  echo "Install Node.js first, then run this launcher again."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting CornField..."
npm run start &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

READY=0
for _ in $(seq 1 60); do
  if curl -fsS "$APP_URL" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "$READY" -eq 1 ]; then
  open "$APP_URL"
  echo "CornField is running at $APP_URL"
else
  echo "CornField is still starting. Open $APP_URL manually in your browser."
fi

echo "Keep this terminal open while using the app."
wait $SERVER_PID

#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting local video player..."
npm run start &
SERVER_PID=$!

sleep 2
open "http://127.0.0.1:4300"

echo "Video player is running. Keep this terminal open while using the app."
wait $SERVER_PID

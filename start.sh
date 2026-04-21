#!/bin/bash
# Flow Studio - One-Click Start Script

set -e

cleanup_port() {
    local port="$1"
    local pids=""

    if command -v lsof >/dev/null 2>&1; then
        pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    elif command -v fuser >/dev/null 2>&1; then
        pids=$(fuser "$port"/tcp 2>/dev/null || true)
    fi

    if [ -n "$pids" ]; then
        for pid in $pids; do
            kill -9 "$pid" 2>/dev/null || true
            echo "  Killed port $port (PID: $pid)"
        done
    fi
}

echo ""
echo "  ========================================"
echo "       Flow Studio - Starting..."
echo "  ========================================"
echo ""

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "  [ERROR] Node.js not found. Install: https://nodejs.org"
    exit 1
fi

# Install frontend deps
if [ ! -d "node_modules" ]; then
    echo "  [1/3] Installing frontend deps..."
    npm install
    echo "  [1/3] Frontend deps installed"
    echo ""
else
    echo "  [1/3] Frontend deps OK"
fi

# Install backend deps
if [ ! -d "backend/node_modules" ]; then
    echo "  [2/3] Installing backend deps..."
    (
        cd backend
        npm install
    )
    echo "  [2/3] Backend deps installed"
    echo ""
else
    echo "  [2/3] Backend deps OK"
fi

# Create storage dirs
mkdir -p backend/storage/workflows
mkdir -p backend/storage/outputs
mkdir -p backend/storage/uploads

# Clean old processes
echo "  [3/3] Cleaning old processes..."
cleanup_port 3001
cleanup_port 5173
sleep 1

echo ""
echo "  ----------------------------------------"
echo "   Frontend:  http://localhost:5173"
echo "   Backend:   http://localhost:3001"
echo "  ----------------------------------------"
echo ""
echo "  Press Ctrl+C to stop"
echo ""

# Start backend in background
(
    cd backend
    node server.js
) &
BACKEND_PID=$!

cleanup() {
    kill "$BACKEND_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

# Wait a moment for backend to start
sleep 2

# Start frontend (blocking - keeps terminal open)
npx vite --host

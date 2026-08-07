#!/bin/bash
# Linux launcher

cd "$(dirname "$0")"

echo
echo "============================================================"
echo "  Personal Color Analyzer - Starting"
echo "============================================================"
echo

if ! command -v node &> /dev/null; then
  echo "[ERROR] Node.js is not installed."
  echo
  echo "Install via:  sudo apt install nodejs npm   (Ubuntu/Debian)"
  echo "         or:  https://nodejs.org"
  echo
  exit 1
fi

echo "[OK] Node.js detected: $(node --version)"
echo

if [ ! -d node_modules ]; then
  echo "[INFO] First run - installing dependencies..."
  npm install || { echo "[ERROR] npm install failed"; exit 1; }
  echo "[OK] Dependencies installed."
fi

echo "[INFO] Opening browser in 3 seconds..."
(sleep 3 && (xdg-open http://localhost:5000/laptop.html 2>/dev/null || echo "[INFO] Open manually: http://localhost:5000/laptop.html")) &

echo "[INFO] Starting server (Ctrl+C to stop)..."
echo
echo "============================================================"
echo
exec node server.js

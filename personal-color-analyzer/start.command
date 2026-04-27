#!/bin/bash
# macOS launcher — double-click this file in Finder to run

cd "$(dirname "$0")"

echo
echo "============================================================"
echo "  Personal Color Analyzer - Starting"
echo "============================================================"
echo

# ── 1. Node.js installation check ──
if ! command -v node &> /dev/null; then
  echo "[ERROR] Node.js is not installed."
  echo
  echo "Install via Homebrew:  brew install node"
  echo "Or download from:      https://nodejs.org"
  echo
  open https://nodejs.org
  read -n 1 -s -r -p "Press any key to exit..."
  exit 1
fi

echo "[OK] Node.js detected: $(node --version)"
echo

# ── 2. Install dependencies on first run ──
if [ ! -d node_modules ]; then
  echo "[INFO] First run detected - installing dependencies (1-2 minutes)..."
  echo
  npm install
  if [ $? -ne 0 ]; then
    echo
    echo "[ERROR] Dependency installation failed. Please check your internet connection."
    read -n 1 -s -r -p "Press any key to exit..."
    exit 1
  fi
  echo
  echo "[OK] Dependencies installed."
  echo
fi

# ── 3. Open browser after 3 seconds (background) ──
echo "[INFO] Browser will open automatically in 3 seconds..."
(sleep 3 && open http://localhost:5000/laptop.html) &

# ── 4. Start server in foreground ──
echo "[INFO] Starting server..."
echo "       (Press Ctrl+C to stop)"
echo
echo "============================================================"
echo
node server.js

echo
echo "============================================================"
echo "Server stopped."
read -n 1 -s -r -p "Press any key to close..."

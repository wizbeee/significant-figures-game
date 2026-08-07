@echo off
chcp 65001 >nul
title Personal Color Analyzer

cd /d "%~dp0"

echo.
echo ============================================================
echo   Personal Color Analyzer - Starting
echo ============================================================
echo.

REM ── 1. Node.js installation check ──
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed.
  echo.
  echo Install one of the following ways:
  echo   1. Run: winget install OpenJS.NodeJS.LTS
  echo   2. Download LTS from: https://nodejs.org
  echo.
  echo After installing Node.js, please double-click start.bat again.
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node --version') do set NODEVER=%%v
echo [OK] Node.js detected: %NODEVER%
echo.

REM ── 2. Install dependencies on first run ──
if not exist node_modules\ (
  echo [INFO] First run detected - installing dependencies (1-2 minutes)...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] Dependency installation failed. Please check your internet connection.
    pause
    exit /b 1
  )
  echo.
  echo [OK] Dependencies installed.
  echo.
)

REM ── 3. Open browser after 3 seconds (in background) ──
echo [INFO] Browser will open automatically in 3 seconds...
start "" /B cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:5000/laptop.html"

REM ── 4. Start server in foreground ──
echo [INFO] Starting server...
echo        (Press Ctrl+C to stop)
echo.
echo ============================================================
echo.
node server.js

REM Pause when server exits so user can read errors
echo.
echo ============================================================
echo Server stopped.
pause

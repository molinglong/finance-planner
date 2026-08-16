@echo off
title Finance Planner - Dev Server

cd /d "%~dp0"

echo.
echo ========================================
echo   Finance Planner Dev Server
echo ========================================
echo.

echo [1/3] Checking Node.js...
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
echo OK: Node.js detected
echo.

echo [2/3] Checking dependencies...
if not exist "node_modules" (
    echo Installing npm packages...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Dependency installation failed
        pause
        exit /b 1
    )
    echo OK: Dependencies installed
) else (
    echo OK: Dependencies ready
)
echo.

echo [3/3] Starting servers (backend:3001 + frontend:5173)...
echo.
echo Backend API:  http://localhost:3001
echo Web UI:        http://localhost:5173
echo Press Ctrl+C to stop all servers
echo ========================================
echo.

call npm run dev:all

@echo off
cd /d "%~dp0"
echo 🚀 STARTING SAFE-HER UNIFIED SYSTEM...
echo.

echo [1/1] Starting Merged Server (Port 5000)...
echo 🔗 Link: http://127.0.0.1:5000
echo.

node api/server.js
if %errorlevel% neq 0 (
    echo.
    echo ❌ ERROR: Server failed to start!
    echo Check if Node.js is installed or if port 5000 is busy.
)
pause

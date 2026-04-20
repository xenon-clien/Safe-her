@echo off
echo 🚀 STARTING SAFE-HER CORE SYSTEM...
echo.
echo [1/2] Starting Backend API (Port 5000)...
start "Safe-Her Backend" cmd /c "npm run dev"
echo.
echo [2/2] Starting Frontend Server (Port 3300)...
start "Safe-Her Frontend" cmd /c "node serve.js"
echo.
echo ✅ ALL SYSTEMS INITIALIZING.
echo 🔗 Open: http://localhost:3300
echo.
echo ⚠️ PLEASE CHECK FOR TWO NEW BLACK WINDOWS IN YOUR TASKBAR.
echo.
pause

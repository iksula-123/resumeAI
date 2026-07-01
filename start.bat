@echo off
echo Starting ResumeAI Pro...
echo.
echo [1/2] Starting Backend on http://localhost:8000
start "Backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\activate && set PYTHONDONTWRITEBYTECODE=1 && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

echo [2/2] Starting Frontend on http://localhost:3000
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both services starting in separate windows.
echo Backend: http://localhost:8000/docs
echo Frontend: http://localhost:3000
echo.
pause

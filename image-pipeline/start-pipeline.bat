@echo off
echo [Image Pipeline Server] Starting on port 8200...
cd /d "%~dp0"
python -m uvicorn server:app --host 0.0.0.0 --port 8200 --reload
pause

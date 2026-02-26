@echo off
:: YOLO 수학 시험지 문제 감지 서버 자동 시작
:: Windows 시작 시 자동 실행됨

cd /d "D:\과사람 수학프로그램\yolo-server"

:: 이미 실행 중인지 확인
netstat -ano | findstr ":8100 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [YOLO] 이미 포트 8100에서 실행 중입니다.
    exit /b 0
)

echo [YOLO] 서버 시작 중... (localhost:8100)
start /B python -m uvicorn server:app --host 0.0.0.0 --port 8100 >> yolo-server.log 2>&1
echo [YOLO] 서버가 백그라운드에서 시작되었습니다.

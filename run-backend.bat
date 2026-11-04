@echo off
title Arshith Connect - Backend API Server
echo ====================================================================
echo   Starting Arshith Connect FastAPI Backend (http://127.0.0.1:8000)
echo ====================================================================
cd /d "%~dp0backend"

if exist "venv\Scripts\python.exe" (
    echo Using backend/venv...
    venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload
) else if exist ".venv\Scripts\python.exe" (
    echo Using backend/.venv...
    .venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload
) else (
    echo ERROR: Python virtual environment not found in backend\venv!
    echo Please run:
    echo   cd backend
    echo   python -m venv venv
    echo   .\venv\Scripts\pip install -r requirements.txt
    pause
)


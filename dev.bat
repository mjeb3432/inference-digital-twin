@echo off
:: Dev-mode launcher: runs Vite dev server (hot reload) + FastAPI
:: in parallel. Vite :5173 proxies API calls to FastAPI :8000.
:: Open http://127.0.0.1:5173/ in a browser — PyQt shell is NOT
:: used in this mode (skip the desktop wrapper while iterating).
title Forge Dev
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    python -m venv .venv
    .venv\Scripts\python.exe -m pip install -e ".[desktop]" --quiet
)

:: Start FastAPI in a new window
start "FastAPI :8000" cmd /k ".venv\Scripts\python.exe run.py"

:: Start Vite dev server in this window
cd frontend
if not exist "node_modules" call npm install
call npm run dev

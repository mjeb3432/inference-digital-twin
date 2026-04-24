@echo off
title Inference Digital Twin
cd /d "%~dp0"

:: ---------------------------------------------------------------
:: Python / FastAPI setup
:: ---------------------------------------------------------------
if not exist ".venv\Scripts\python.exe" (
    echo [setup] Creating virtual environment...
    python -m venv .venv
    .venv\Scripts\python.exe -m pip install -e ".[desktop]" --quiet
)

:: ---------------------------------------------------------------
:: Frontend build — only runs if the SPA hasn't been built yet
:: or if package.json changed since last build.
:: ---------------------------------------------------------------
if not exist "app\static\dist\index.html" (
    echo [setup] Frontend build not found, running npm install + build...
    pushd frontend
    if not exist "node_modules" (
        call npm install
        if errorlevel 1 (
            echo [warn] npm install failed — app will fall back to legacy Jinja frontend.
            popd
            goto :run
        )
    )
    call npm run build
    if errorlevel 1 (
        echo [warn] npm build failed — app will fall back to legacy Jinja frontend.
    )
    popd
)

:run
echo [run] Starting Inference Digital Twin...
.venv\Scripts\python.exe -m desktop.desktop_main

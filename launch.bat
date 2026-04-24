@echo off
title Inference Digital Twin
cd /d "%~dp0"

:: ---------------------------------------------------------------
:: Sanity check: is Python on PATH?
:: ---------------------------------------------------------------
where python >nul 2>nul
if errorlevel 1 (
    echo.
    echo [FATAL] Python is not on your PATH.
    echo   Install Python 3.11 from https://www.python.org/downloads/
    echo   and tick "Add python.exe to PATH" during install.
    echo.
    pause
    exit /b 1
)

:: ---------------------------------------------------------------
:: Python / FastAPI setup
:: ---------------------------------------------------------------
if not exist ".venv\Scripts\python.exe" (
    echo [setup] Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo [FATAL] venv creation failed. See error above.
        pause
        exit /b 1
    )
    echo [setup] Installing project ^(this is a one-time step, takes ~2 min^)...
    .venv\Scripts\python.exe -m pip install --upgrade pip
    .venv\Scripts\python.exe -m pip install -e ".[desktop]"
    if errorlevel 1 (
        echo [FATAL] pip install failed. See error above.
        pause
        exit /b 1
    )
)

:: ---------------------------------------------------------------
:: Frontend build — only runs if the SPA hasn't been built yet.
:: If npm is blocked on this machine, we fall through to the
:: Jinja / vanilla-JS legacy frontend, which is still fully wired.
:: ---------------------------------------------------------------
if not exist "app\static\dist\index.html" (
    where npm >nul 2>nul
    if errorlevel 1 (
        echo [info] npm not on PATH — skipping frontend build.
        echo [info] The app will use the legacy Jinja frontend instead.
        goto :run
    )
    echo [setup] Frontend build not found, running npm install + build...
    pushd frontend
    if not exist "node_modules" (
        call npm install
        if errorlevel 1 (
            echo [warn] npm install failed — falling back to Jinja frontend.
            popd
            goto :run
        )
    )
    call npm run build
    if errorlevel 1 (
        echo [warn] npm build failed — falling back to Jinja frontend.
    )
    popd
)

:run
echo.
echo [run] Starting Inference Digital Twin...
echo.
.venv\Scripts\python.exe -m desktop.desktop_main
if errorlevel 1 (
    echo.
    echo [error] The app exited with an error. Scroll up to see what happened.
    pause
)

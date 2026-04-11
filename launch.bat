@echo off
title Inference Digital Twin
cd /d "%~dp0"

:: Check for virtual environment
if exist ".venv\Scripts\python.exe" (
    echo Starting Inference Digital Twin...
    .venv\Scripts\python.exe -m desktop.desktop_main
) else (
    echo Setting up for first run...
    python -m venv .venv
    .venv\Scripts\python.exe -m pip install -e ".[desktop]" --quiet
    echo.
    echo Starting Inference Digital Twin...
    .venv\Scripts\python.exe -m desktop.desktop_main
)

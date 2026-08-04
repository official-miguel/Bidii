@echo off
:: ============================================================================
:: Timetable Solver - Quick Start
:: ============================================================================
:: Double-click this file to start the timetable solver
:: ============================================================================

color 0A
echo.
echo =====================================
echo   Timetable Solver - Quick Start
echo =====================================
echo.

:: Check if Python is installed
py --version >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python not found!
    echo Please install Python 3.11+ from https://python.org
    pause
    exit /b 1
)

:: Check if virtual environment exists
if not exist ".venv" (
    echo Creating virtual environment...
    py -m venv .venv
    echo.
)

:: Activate virtual environment
call .venv\Scripts\activate.bat

:: Install dependencies
echo Installing dependencies...
pip install -r requirements.txt
echo.

:: Start the solver
echo.
echo =====================================
echo   Starting Solver Server...
echo =====================================
echo.
echo Solver API: http://localhost:8080
echo Health check: http://localhost:8080/health
echo.
echo Press Ctrl+C to stop
echo.

py solver.py

pause

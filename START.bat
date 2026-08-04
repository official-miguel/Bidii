@echo off
:: ============================================================================
:: Bidii System - Quick Start
:: ============================================================================
:: Double-click this file to start the development server
:: ============================================================================

color 0B
echo.
echo =====================================
echo   Bidii System - Quick Start
echo =====================================
echo.

:: Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js/npm not found!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: Check if .env exists
if not exist ".env" (
    echo Creating .env file from template...
    copy ".env.example" ".env"
    echo.
    echo IMPORTANT: Please edit .env and set your DATABASE_URL
    echo Location: %CD%\.env
    echo.
    pause
)

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

:: Generate Prisma client
echo Generating Prisma Client...
call npx prisma generate
echo.

:: Start dev server
echo.
echo =====================================
echo   Starting Development Server...
echo =====================================
echo.
echo Your app will be available at:
echo   http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo.

call npm run dev

pause

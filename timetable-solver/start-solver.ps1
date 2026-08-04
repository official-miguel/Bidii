# ============================================================================
# Timetable Solver - Local Runner
# ============================================================================
# This script starts the CP-SAT timetable solver on port 8080
# ============================================================================

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Timetable Solver - Starting..." -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if Python is installed
try {
    $pythonVersion = py --version 2>&1
    Write-Host "✅ Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Python not found!" -ForegroundColor Red
    Write-Host "   Please install Python 3.11+ from https://python.org" -ForegroundColor Yellow
    pause
    exit 1
}

# Check if virtual environment exists
if (!(Test-Path ".venv")) {
    Write-Host ""
    Write-Host "📦 Creating virtual environment..." -ForegroundColor Yellow
    py -m venv .venv
    Write-Host "✅ Virtual environment created!" -ForegroundColor Green
}

# Activate virtual environment
Write-Host ""
Write-Host "🔧 Activating virtual environment..." -ForegroundColor Yellow
& .\.venv\Scripts\Activate.ps1

# Install dependencies
Write-Host ""
Write-Host "📥 Installing dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt

# Start the solver
Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "  🚀 Starting Solver Server" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "📍 Solver API will be available at:" -ForegroundColor Cyan
Write-Host "   http://localhost:8080" -ForegroundColor White
Write-Host ""
Write-Host "📍 Health check:" -ForegroundColor Cyan
Write-Host "   http://localhost:8080/health" -ForegroundColor White
Write-Host ""
Write-Host "⌨️  Press Ctrl+C to stop the solver" -ForegroundColor Gray
Write-Host ""

py solver.py

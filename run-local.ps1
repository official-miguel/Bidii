# ============================================================================
# Bidii System - Local Development Runner
# ============================================================================
# This script helps you run the Bidii School Management System locally
# ============================================================================

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Bidii System - Local Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env file exists
if (!(Test-Path ".env")) {
    Write-Host "❌ ERROR: .env file not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "📝 Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✅ .env file created!" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠️  IMPORTANT: Edit the .env file and set your DATABASE_URL" -ForegroundColor Yellow
    Write-Host "   Location: $(Get-Location)\.env" -ForegroundColor Gray
    Write-Host ""
    pause
}

# Check if node_modules exists
if (!(Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    Write-Host ""
    npm install
    Write-Host ""
    Write-Host "✅ Dependencies installed!" -ForegroundColor Green
    Write-Host ""
}

# Check if Prisma client is generated
Write-Host "🔧 Generating Prisma Client..." -ForegroundColor Yellow
npx prisma generate
Write-Host ""

# Check database connection
Write-Host "🔍 Checking database connection..." -ForegroundColor Yellow
$dbCheck = npx prisma db pull --schema=./prisma/schema.prisma 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Database connection failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please check your DATABASE_URL in .env file" -ForegroundColor Yellow
    Write-Host ""
    pause
    exit 1
}
Write-Host "✅ Database connected!" -ForegroundColor Green
Write-Host ""

# Ask if user wants to run migrations
Write-Host "🔄 Do you want to run database migrations? (Y/N)" -ForegroundColor Cyan
$runMigrations = Read-Host
if ($runMigrations -eq "Y" -or $runMigrations -eq "y") {
    Write-Host ""
    Write-Host "📊 Running database migrations..." -ForegroundColor Yellow
    npx prisma migrate deploy
    Write-Host ""
    Write-Host "✅ Migrations completed!" -ForegroundColor Green
    Write-Host ""
}

# Start the development server
Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "  🚀 Starting Development Server" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "📍 Your app will be available at:" -ForegroundColor Cyan
Write-Host "   http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "⌨️  Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host ""

npm run dev

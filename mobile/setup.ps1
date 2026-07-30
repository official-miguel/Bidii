# Bidii Mobile Library - Setup Script (PowerShell)
# This script helps set up the development environment on Windows

$ErrorActionPreference = "Stop"

Write-Host "🚀 Bidii Mobile Library - Setup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js version
Write-Host "📦 Checking Node.js version..." -ForegroundColor Yellow
try {
    $nodeVersion = node -v
    $nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($nodeMajor -lt 18) {
        Write-Host "❌ Error: Node.js 18+ required. Current version: $nodeVersion" -ForegroundColor Red
        Write-Host "   Please upgrade Node.js: https://nodejs.org/" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Node.js $nodeVersion detected" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: Node.js not found" -ForegroundColor Red
    Write-Host "   Please install Node.js: https://nodejs.org/" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Check npm
Write-Host "📦 Checking npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm -v
    Write-Host "✅ npm $npmVersion detected" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: npm not found" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Install dependencies
Write-Host "📥 Installing dependencies..." -ForegroundColor Yellow
try {
    npm install
    Write-Host "✅ Dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "❌ Error installing dependencies" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Setup environment file
if (-not (Test-Path .env)) {
    Write-Host "🔧 Setting up .env file..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "✅ Created .env file from .env.example" -ForegroundColor Green
    Write-Host "⚠️  Please edit .env and set your API_BASE_URL" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "✅ .env file already exists" -ForegroundColor Green
    Write-Host ""
}

# Check for Expo CLI
Write-Host "📱 Checking Expo CLI..." -ForegroundColor Yellow
try {
    $expoGlobal = npm list -g expo-cli 2>$null
    Write-Host "✅ Expo CLI installed globally" -ForegroundColor Green
} catch {
    Write-Host "ℹ️  Expo CLI not installed globally (not required - will use npx)" -ForegroundColor Cyan
}
Write-Host ""

# Check for EAS CLI (optional for builds)
Write-Host "🔨 Checking EAS CLI (optional for production builds)..." -ForegroundColor Yellow
try {
    $easVersion = eas --version 2>$null
    Write-Host "✅ EAS CLI installed: $easVersion" -ForegroundColor Green
} catch {
    Write-Host "ℹ️  EAS CLI not installed" -ForegroundColor Cyan
    Write-Host "   To install for production builds: npm install -g eas-cli" -ForegroundColor Cyan
}
Write-Host ""

# Verify project structure
Write-Host "📂 Verifying project structure..." -ForegroundColor Yellow
$requiredDirs = @("app", "components", "constants", "database", "hooks", "lib", "services", "types")
$allExist = $true

foreach ($dir in $requiredDirs) {
    if (Test-Path $dir) {
        Write-Host "  ✅ $dir/" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $dir/ missing" -ForegroundColor Red
        $allExist = $false
    }
}

if (-not $allExist) {
    Write-Host ""
    Write-Host "❌ Project structure incomplete. Ensure you're in the mobile/ directory." -ForegroundColor Red
    exit 1
}
Write-Host ""

# Check for Android Studio / Xcode (optional)
Write-Host "🔍 Checking for platform tools (optional)..." -ForegroundColor Yellow
try {
    $adb = Get-Command adb -ErrorAction SilentlyContinue
    if ($adb) {
        Write-Host "  ✅ Android ADB detected (Android Studio installed)" -ForegroundColor Green
    } else {
        Write-Host "  ℹ️  Android Studio not detected (optional - can test with Expo Go)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "  ℹ️  Android Studio not detected (optional - can test with Expo Go)" -ForegroundColor Cyan
}
Write-Host ""

# Type check
Write-Host "🔍 Running TypeScript type check..." -ForegroundColor Yellow
try {
    npx tsc --noEmit
    Write-Host "✅ No TypeScript errors" -ForegroundColor Green
} catch {
    Write-Host "⚠️  TypeScript errors found (see above)" -ForegroundColor Yellow
    Write-Host "   The app may still run, but fix these before production" -ForegroundColor Yellow
}
Write-Host ""

# Final instructions
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Edit .env file with your API URL:" -ForegroundColor White
Write-Host "   notepad .env  # or use your preferred editor" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Start development server:" -ForegroundColor White
Write-Host "   npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Test on device:" -ForegroundColor White
Write-Host "   - Install 'Expo Go' app from App Store / Play Store" -ForegroundColor Gray
Write-Host "   - Scan QR code shown in terminal" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Read the guides:" -ForegroundColor White
Write-Host "   - TESTING_GUIDE.md - Comprehensive testing checklist" -ForegroundColor Gray
Write-Host "   - TROUBLESHOOTING.md - Common issues and solutions" -ForegroundColor Gray
Write-Host "   - DEPLOYMENT_CHECKLIST.md - Production deployment steps" -ForegroundColor Gray
Write-Host ""
Write-Host "🎉 Happy coding!" -ForegroundColor Cyan

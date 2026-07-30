#!/bin/bash

# Bidii Mobile Library - Setup Script
# This script helps set up the development environment

set -e  # Exit on error

echo "🚀 Bidii Mobile Library - Setup Script"
echo "========================================"
echo ""

# Check Node.js version
echo "📦 Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Error: Node.js 18+ required. Current version: $(node -v)"
  echo "   Please upgrade Node.js: https://nodejs.org/"
  exit 1
fi
echo "✅ Node.js $(node -v) detected"
echo ""

# Check npm
echo "📦 Checking npm..."
if ! command -v npm &> /dev/null; then
  echo "❌ Error: npm not found"
  exit 1
fi
echo "✅ npm $(npm -v) detected"
echo ""

# Install dependencies
echo "📥 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Setup environment file
if [ ! -f .env ]; then
  echo "🔧 Setting up .env file..."
  cp .env.example .env
  echo "✅ Created .env file from .env.example"
  echo "⚠️  Please edit .env and set your API_BASE_URL"
  echo ""
else
  echo "✅ .env file already exists"
  echo ""
fi

# Check for Expo CLI
echo "📱 Checking Expo CLI..."
if npm list -g expo-cli &> /dev/null; then
  echo "✅ Expo CLI installed globally"
else
  echo "ℹ️  Expo CLI not installed globally (not required - will use npx)"
fi
echo ""

# Check for EAS CLI (optional for builds)
echo "🔨 Checking EAS CLI (optional for production builds)..."
if command -v eas &> /dev/null; then
  echo "✅ EAS CLI installed: $(eas --version)"
else
  echo "ℹ️  EAS CLI not installed"
  echo "   To install for production builds: npm install -g eas-cli"
fi
echo ""

# Verify project structure
echo "📂 Verifying project structure..."
REQUIRED_DIRS=("app" "components" "constants" "database" "hooks" "lib" "services" "types")
ALL_EXIST=true

for DIR in "${REQUIRED_DIRS[@]}"; do
  if [ -d "$DIR" ]; then
    echo "  ✅ $DIR/"
  else
    echo "  ❌ $DIR/ missing"
    ALL_EXIST=false
  fi
done

if [ "$ALL_EXIST" = false ]; then
  echo ""
  echo "❌ Project structure incomplete. Ensure you're in the mobile/ directory."
  exit 1
fi
echo ""

# Check for Android Studio / Xcode (optional)
echo "🔍 Checking for platform tools (optional)..."
if command -v adb &> /dev/null; then
  echo "  ✅ Android ADB detected (Android Studio installed)"
else
  echo "  ℹ️  Android Studio not detected (optional - can test with Expo Go)"
fi

if command -v xcodebuild &> /dev/null; then
  echo "  ✅ Xcode detected"
else
  echo "  ℹ️  Xcode not detected (macOS only - optional)"
fi
echo ""

# Type check
echo "🔍 Running TypeScript type check..."
if npx tsc --noEmit; then
  echo "✅ No TypeScript errors"
else
  echo "⚠️  TypeScript errors found (see above)"
  echo "   The app may still run, but fix these before production"
fi
echo ""

# Final instructions
echo "=========================================="
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo ""
echo "1. Edit .env file with your API URL:"
echo "   nano .env  # or use your preferred editor"
echo ""
echo "2. Start development server:"
echo "   npm start"
echo ""
echo "3. Test on device:"
echo "   - Install 'Expo Go' app from App Store / Play Store"
echo "   - Scan QR code shown in terminal"
echo ""
echo "4. Read the guides:"
echo "   - TESTING_GUIDE.md - Comprehensive testing checklist"
echo "   - TROUBLESHOOTING.md - Common issues and solutions"
echo "   - DEPLOYMENT_CHECKLIST.md - Production deployment steps"
echo ""
echo "🎉 Happy coding!"

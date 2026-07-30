# Bidii Mobile - Library Management System

React Native (Expo) mobile application for the Bidii Library Management System.

## Features

- 📚 **Catalogue Management** - Two-level book structure (BookTitle → BookCopy)
- 💳 **Auto-issued Library Cards** - Student cards with photos and status
- 🔄 **Circulation** - Borrow, return, and renew books with live validation
- 📷 **QR Scanning** - Camera-based scanning for books and library cards
- 📋 **Reservations** - Queue-based book reservation system
- 💰 **Fine Management** - Real-time fine calculation with configurable rules
- 📊 **Analytics** - Comprehensive library KPIs and insights
- 🔌 **Offline-first** - WatermelonDB sync engine for uninterrupted operation
- 🎨 **Design System** - Matches web app tokens exactly (Teal brand, 8pt grid)

## Prerequisites

- Node.js 18+
- npm or yarn
- Expo Go app (for testing on device)
- Android Studio or Xcode (for emulator/simulator)

## Installation

### Quick Setup (Recommended)

**Linux/macOS:**
```bash
chmod +x setup.sh
./setup.sh
```

**Windows (PowerShell):**
```powershell
.\setup.ps1
```

### Manual Setup

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env  # Linux/macOS
# or
copy .env.example .env  # Windows

# Edit .env with your bidii API endpoint
```

## Development

```bash
# Start Expo dev server
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios

# Run on web (for quick testing)
npm run web
```

## Project Structure

```
mobile/
├── app/                    # Expo Router pages
│   ├── (auth)/            # Authentication screens
│   ├── (tabs)/            # Main app tabs (role-based)
│   ├── _layout.tsx        # Root layout
│   └── index.tsx          # Splash/routing screen
├── components/            # Reusable UI components
│   ├── ui/               # Base components (Button, Input, etc.)
│   └── library/          # Library-specific components
├── constants/            # Design tokens, theme, config
├── database/             # WatermelonDB models and schemas
├── hooks/                # Custom React hooks
├── lib/                  # Utilities and helpers
├── services/             # API client, sync engine
├── types/                # TypeScript type definitions
└── global.css           # NativeWind styles (imports web tokens)
```

## Architecture

### Offline-first with WatermelonDB

All library operations (borrow, return, scan) are saved locally first and synced to the server when online. The app remains fully functional without network connectivity.

### Design Token Inheritance

The mobile app imports design tokens from the web app's `tailwind.config.ts` to maintain visual consistency:
- **Colors**: Teal brand (#2C7F7E), semantic status colors
- **Typography**: Inter font family, 8-point scale
- **Spacing**: 8-point grid (4px base unit)
- **Shadows**: Calm, subtle elevation
- **Animations**: Shared keyframes and timing

### Role-based Navigation

Three distinct experiences:
- **Principal**: Analytics, settings, overrides
- **Librarian**: Circulation desk, reservations, student cards
- **Student**: My card, borrowed books, reservations

## Key Technologies

- **Expo Router** - File-based navigation
- **NativeWind** - Tailwind CSS for React Native
- **WatermelonDB** - Reactive offline-first database
- **Expo Camera** - QR/barcode scanning
- **Zustand** - Lightweight state management
- **TypeScript** - Full type safety

## API Integration

The mobile app connects to the existing bidii backend API:
- Authentication: `/api/auth/*`
- Students: `/api/students/*`
- Library: `/api/library/*`
- Sync: `/api/library/sync/*`

## Documentation

📖 **Comprehensive Guides:**
- **[TESTING_GUIDE.md](./TESTING_GUIDE.md)** - End-to-end testing checklist with 12 scenarios, performance optimization, and acceptance criteria
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Solutions for camera, database, auth, sync, and UI issues
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Production deployment for iOS App Store & Google Play with EAS build setup

## Testing

```bash
# Type check
npm run type-check

# Lint
npm run lint

# For comprehensive end-to-end testing, see TESTING_GUIDE.md
```

## Building for Production

```bash
# Android APK
eas build --platform android --profile preview

# iOS IPA
eas build --platform ios --profile preview
```

## Environment Variables

See `.env.example` for required configuration.

## License

Proprietary - Bidii School Management System

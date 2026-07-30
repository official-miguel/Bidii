# Library Management Mobile App - Production Deployment Checklist

## Pre-Deployment Checks

### 1. Code Quality
- [ ] All TypeScript errors resolved (`npx tsc --noEmit`)
- [ ] No ESLint warnings (if configured)
- [ ] No console.log statements in production code
- [ ] All TODO/FIXME comments addressed or documented
- [ ] Code follows consistent formatting (Prettier/ESLint)

### 2. Configuration
- [ ] `.env.production` file created with production API URL
- [ ] `app.json` version numbers updated:
  - [ ] `version` (semantic versioning, e.g., "1.0.0")
  - [ ] iOS `buildNumber` incremented
  - [ ] Android `versionCode` incremented
- [ ] Bundle identifiers set:
  - [ ] iOS: `ios.bundleIdentifier` (e.g., "com.bidii.library")
  - [ ] Android: `android.package` (e.g., "com.bidii.library")
- [ ] App name and description finalized
- [ ] Privacy policy URL added (required for App Store)
- [ ] Support URL/email added

### 3. Permissions & Privacy
- [ ] iOS: `NSCameraUsageDescription` explains why camera is needed
- [ ] Android: Only necessary permissions listed (CAMERA, INTERNET)
- [ ] Privacy policy mentions:
  - [ ] Camera usage (QR scanning)
  - [ ] Data stored locally (WatermelonDB)
  - [ ] Network requests (authentication, sync)
  - [ ] No third-party analytics (if applicable)

### 4. Assets & Branding
- [ ] App icon created for all sizes (adaptive icon for Android)
  - [ ] 1024x1024 (iOS App Store)
  - [ ] Adaptive icon foreground + background (Android)
- [ ] Splash screen configured (`splash` in app.json)
- [ ] Brand colors match bidii design tokens (teal #2C7F7E)
- [ ] Screenshots prepared (5-8 per platform, showing key features)

### 5. Testing
- [ ] Tested on physical iOS device (iPhone 8 or newer)
- [ ] Tested on physical Android device (Android 8.0 or newer)
- [ ] All 12 test scenarios from TESTING_GUIDE.md passed
- [ ] Performance acceptable (smooth scrolling, <2s screen loads)
- [ ] No memory leaks after 30-minute usage session
- [ ] Offline mode works correctly (airplane mode test)
- [ ] QR scanning works in various lighting conditions

### 6. Security
- [ ] API requests use HTTPS only (no HTTP fallbacks)
- [ ] Sensitive data not logged to console
- [ ] Auth tokens stored securely (AsyncStorage with encryption if needed)
- [ ] No hardcoded credentials or API keys
- [ ] Input validation on all user-facing forms
- [ ] SQL injection prevention (WatermelonDB handles this)

### 7. Error Handling
- [ ] Network errors show user-friendly messages
- [ ] Offline state clearly indicated (SyncStatusBar)
- [ ] Camera permission denied handled gracefully
- [ ] Invalid QR codes show helpful error messages
- [ ] API errors don't crash app (try-catch blocks)
- [ ] Toast notifications don't stack excessively

---

## EAS Build Configuration

### 1. Install EAS CLI
```bash
npm install -g eas-cli
eas login
```

### 2. Initialize EAS
```bash
cd mobile
eas build:configure
```

This creates `eas.json`:
```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      },
      "ios": {
        "simulator": true
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      },
      "ios": {
        "autoIncrement": true
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./android-service-account.json"
      },
      "ios": {
        "appleId": "your-apple-id@example.com",
        "ascAppId": "1234567890",
        "appleTeamId": "ABCD1234"
      }
    }
  }
}
```

### 3. Configure Secrets
```bash
# Set environment variables for builds
eas secret:create --scope project --name API_BASE_URL --value https://api.bidii.school
eas secret:create --scope project --name API_TIMEOUT --value 15000
```

### 4. Build Preview (Testing)
```bash
# Android APK
eas build --platform android --profile preview

# iOS Simulator build
eas build --platform ios --profile preview
```

Download and install on devices for testing.

---

## iOS Deployment (App Store)

### 1. Apple Developer Account Setup
- [ ] Enrolled in Apple Developer Program ($99/year)
- [ ] App ID created in developer portal
- [ ] Certificates and provisioning profiles configured (EAS handles this)

### 2. App Store Connect Setup
- [ ] App created in App Store Connect
- [ ] App name, bundle ID, primary language set
- [ ] Age rating completed (likely 4+ for library app)
- [ ] App categories selected (Education, Productivity)

### 3. Build for Production
```bash
eas build --platform ios --profile production
```

Wait for build to complete (~20-30 minutes).

### 4. Submit to App Store
Option A: Automatic submission via EAS
```bash
eas submit --platform ios --profile production
```

Option B: Manual submission
1. Download IPA from EAS dashboard
2. Upload via Transporter app or Xcode
3. Go to App Store Connect → My Apps → select app
4. Create new version
5. Upload build
6. Fill metadata:
   - [ ] App description
   - [ ] Keywords
   - [ ] Screenshots (5-8 required)
   - [ ] Privacy policy URL
   - [ ] Support URL
7. Submit for review

### 5. App Review Preparation
Create test account for reviewers:
- Email: `test-librarian@bidii.school`
- Password: `ReviewTest123!`
- Role: Librarian (full access)

Add demo data:
- 5-10 catalogue titles with copies
- 2-3 students with active borrows
- 1-2 overdue items

Include in review notes:
> This app requires a librarian account to access full functionality. Demo credentials provided above. The app connects to a test server with sample data. Camera permission is required for QR code scanning (book circulation feature).

---

## Android Deployment (Google Play)

### 1. Google Play Console Setup
- [ ] Developer account created ($25 one-time fee)
- [ ] App created in Play Console
- [ ] Store listing information filled

### 2. Build for Production
```bash
eas build --platform android --profile production
```

This creates an AAB (Android App Bundle) file.

### 3. Generate Service Account Key
1. Go to Google Cloud Console
2. Create service account
3. Grant "Service Account User" role
4. Download JSON key file
5. Save as `android-service-account.json` (gitignored!)

### 4. Submit to Google Play
Option A: Automatic submission via EAS
```bash
eas submit --platform android --profile production
```

Option B: Manual submission
1. Download AAB from EAS dashboard
2. Go to Play Console → select app → Production
3. Create new release
4. Upload AAB file
5. Fill release notes:
   - [ ] What's new in this version
   - [ ] Bug fixes and improvements
6. Roll out to production

### 5. Store Listing
- [ ] **App title**: "Bidii Library Management"
- [ ] **Short description** (80 chars):
  ```
  Offline-first library management with QR scanning, fines, and reservations
  ```
- [ ] **Full description** (4000 chars):
  ```
  Bidii Library Management is a comprehensive mobile solution for school libraries, designed for librarians and students.

  KEY FEATURES:
  • Offline-first architecture - work without internet, sync when connected
  • QR code scanning for quick book borrowing and returning
  • Real-time fine calculation with configurable policies
  • Reservation queue management
  • Auto-issued library cards for all students
  • Comprehensive analytics and reporting
  • Student-facing views for browsing and managing borrows

  FOR LIBRARIANS:
  • Manage catalogue with two-level structure (titles + physical copies)
  • Streamlined circulation desk workflow
  • Track overdue items and fines
  • Suspend/activate library cards
  • Configure fine rates, loan periods, and policies
  • View borrowing trends and popular titles

  FOR STUDENTS:
  • Browse catalogue and reserve books
  • View digital library card with QR code
  • Track borrowed books and due dates
  • Check fine balances

  OFFLINE SUPPORT:
  All actions (borrowing, returning, payments) work offline and automatically sync when reconnected.

  SECURITY:
  Role-based access ensures students only see their own data while librarians have full management capabilities.

  Requires a Bidii school account to use.
  ```
- [ ] **App category**: Education
- [ ] **Content rating**: Everyone (no ads, no in-app purchases)
- [ ] **Privacy policy URL**: https://bidii.school/privacy
- [ ] **Screenshots**: 8 screenshots showing:
  1. Catalogue browsing
  2. Circulation desk (borrow flow)
  3. QR code scanning
  4. Library card view
  5. Fines management
  6. Analytics dashboard
  7. Student card view
  8. Offline mode indicator

### 6. Pre-Launch Testing
Google Play offers pre-launch reports:
- [ ] Review crash reports
- [ ] Check performance metrics
- [ ] Test on multiple device types (Play Console does this automatically)

---

## Over-The-Air (OTA) Updates

For non-native changes (JS/assets), use Expo OTA updates:

### 1. Install EAS Update
```bash
npm install expo-updates
```

### 2. Configure in app.json
```json
{
  "expo": {
    "updates": {
      "url": "https://u.expo.dev/[your-project-id]"
    },
    "runtimeVersion": {
      "policy": "sdkVersion"
    }
  }
}
```

### 3. Publish Update
```bash
# Create update branch (e.g., production)
eas update --branch production --message "Fix fine calculation bug"
```

### 4. Configure Channels
Link build profiles to update branches in `eas.json`:
```json
{
  "build": {
    "production": {
      "channel": "production"
    }
  }
}
```

**Note**: OTA updates work for:
- JavaScript code changes
- Asset updates (images, fonts)
- React Native component changes

**Cannot update**:
- Native code (Java/Kotlin, Objective-C/Swift)
- Expo SDK version
- Permissions
- App icon

For these, submit new build to stores.

---

## Rollback Plan

If critical bug found after release:

### Immediate Mitigation (within 30 minutes)
1. Roll back OTA update:
   ```bash
   eas update --branch production --message "Rollback to stable"
   ```

2. If native code issue:
   - Build previous stable version
   - Submit as emergency update
   - Request expedited review (both stores offer this)

### Medium-term Fix (1-3 days)
1. Identify root cause
2. Write test to reproduce bug
3. Fix and verify locally
4. Deploy to staging environment
5. Test end-to-end
6. Build and submit new version

---

## Monitoring & Analytics

### 1. Crash Reporting (Recommended: Sentry)
```bash
npm install @sentry/react-native
```

Configure in `mobile/app/_layout.tsx`:
```typescript
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'YOUR_SENTRY_DSN',
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.2,
});
```

### 2. Analytics (Optional)
- **Expo Analytics**: Built-in, basic metrics
- **Firebase Analytics**: Comprehensive, free tier available
- **Mixpanel**: User behavior tracking

### 3. Key Metrics to Track
- [ ] Daily Active Users (DAU)
- [ ] Circulation transactions per day
- [ ] QR scan success rate
- [ ] Offline sync success rate
- [ ] Average session duration
- [ ] Top error messages
- [ ] API response times
- [ ] Crash-free users %

---

## Post-Deployment Tasks

### Week 1
- [ ] Monitor crash reports (aim for 99%+ crash-free users)
- [ ] Check Play Console / App Store Connect reviews
- [ ] Verify analytics tracking
- [ ] Test OTA update flow
- [ ] Collect feedback from pilot users

### Week 2-4
- [ ] Address critical bugs (if any)
- [ ] Respond to user reviews
- [ ] Plan feature enhancements based on usage data
- [ ] Optimize slow API endpoints (check analytics)

### Ongoing
- [ ] Monthly review of error logs
- [ ] Quarterly performance audit
- [ ] Keep Expo SDK updated (every 3-4 months)
- [ ] Respond to OS updates (new iOS/Android versions)

---

## Support Resources

### User Guides
- [ ] Create in-app tutorial for first-time users
- [ ] PDF guide for librarians (circulation workflow)
- [ ] Video tutorial for QR scanning setup

### Support Channels
- [ ] Support email: support@bidii.school
- [ ] FAQ page: https://bidii.school/library-faq
- [ ] In-app feedback button (consider Crisp or Intercom)

### Escalation Path
1. **User reports issue** → Support email
2. **Support triages** → Create GitHub issue / Jira ticket
3. **Developer investigates** → Check Sentry logs, reproduce locally
4. **Fix deployed** → OTA update or new build
5. **User notified** → Close loop

---

## Compliance & Legal

### Data Privacy (GDPR, CCPA if applicable)
- [ ] Privacy policy clearly states data collection
- [ ] Users can request data deletion
- [ ] No data sold to third parties
- [ ] Parental consent for users under 13 (COPPA in US)

### Accessibility (WCAG 2.1 Level AA)
- [ ] Text labels on all interactive elements
- [ ] Color contrast ratios meet guidelines
- [ ] Screen reader support tested (iOS VoiceOver, Android TalkBack)
- [ ] Font sizes respect system accessibility settings

### Copyright & Licensing
- [ ] All icons/images have proper licenses
- [ ] Open-source libraries comply with their licenses (MIT, Apache, etc.)
- [ ] Bidii branding approved by school administration

---

## Emergency Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| Lead Developer | [Your email] | 24/7 for P0 issues |
| School IT Admin | [IT email] | Business hours |
| Expo Support | Expo community forums | Public issues |
| Apple Developer Support | developer.apple.com/contact | Account issues |
| Google Play Support | support.google.com/googleplay/android-developer | Account issues |

---

## Success Criteria

Deployment considered successful when:
- [ ] 95%+ of users on latest version within 2 weeks
- [ ] <1% crash rate
- [ ] <5% negative reviews (aim for 4.5+ star rating)
- [ ] Zero data loss incidents
- [ ] Offline sync working for 99%+ of queued actions
- [ ] Average QR scan success rate >90%

---

**Document Version**: 1.0  
**Last Updated**: 2026-07-29  
**Next Review**: After first production deployment

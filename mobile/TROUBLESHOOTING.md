# Library Management Mobile App - Troubleshooting Guide

## Common Development Issues

### 1. Metro Bundler Errors

#### Error: "Unable to resolve module"
```
Error: Unable to resolve module @react-navigation/native
```

**Solution**:
```bash
# Clear cache and reinstall
cd mobile
rm -rf node_modules
npm install
npx expo start --clear
```

#### Error: "jest-haste-map: Haste module naming collision"
**Solution**:
```bash
# Clear watchman and metro cache
watchman watch-del-all
rm -rf $TMPDIR/metro-*
rm -rf $TMPDIR/haste-*
npx expo start --clear
```

---

### 2. TypeScript Errors

#### Error: "Cannot find module 'nativewind' or its type declarations"
**Solution**:
Check `mobile/nativewind-env.d.ts` exists:
```typescript
/// <reference types="nativewind/types" />
```

#### Error: "Property 'className' does not exist on type..."
**Solution**:
Ensure `babel.config.js` includes NativeWind plugin:
```javascript
module.exports = {
  presets: ['babel-preset-expo'],
  plugins: ['nativewind/babel'],
};
```

---

### 3. Camera/QR Scanning Issues

#### Issue: "Camera permission denied"
**iOS Solution**:
Check `app.json` has:
```json
{
  "ios": {
    "infoPlist": {
      "NSCameraUsageDescription": "This app needs camera access to scan QR codes for book borrowing."
    }
  }
}
```

**Android Solution**:
Check `app.json` has:
```json
{
  "android": {
    "permissions": ["CAMERA"]
  }
}
```

Then rebuild:
```bash
npx expo prebuild --clean
```

#### Issue: QR codes not scanning
**Checklist**:
- [ ] Camera permission granted in device settings
- [ ] Adequate lighting (try torch toggle)
- [ ] QR code is in focus and not blurred
- [ ] Code format matches `BIDII:BOOK:*`, `BIDII:STUDENT:*`, or `BIDII:LOAN:*`
- [ ] Scan cooldown (1 second) hasn't blocked duplicate scan

**Debug**:
```typescript
// In mobile/app/(tabs)/scan.tsx
onBarcodeScanned={(scanResult) => {
  console.log('Raw scan data:', scanResult.data); // Check actual string
  console.log('Scan type:', scanResult.type); // Should be QR_CODE
  // ... rest of handler
}}
```

---

### 4. WatermelonDB Issues

#### Error: "Database is locked"
**Cause**: Multiple write operations happening simultaneously without batching.

**Solution**:
Always wrap writes in `database.write()`:
```typescript
// ❌ Bad
await borrowCollection.create((borrow) => {
  borrow.studentId = studentId;
});

// ✅ Good
await database.write(async () => {
  await borrowCollection.create((borrow) => {
    borrow.studentId = studentId;
  });
});
```

#### Error: "No such table: library_catalogue"
**Cause**: Database schema not initialized.

**Solution**:
```typescript
// In mobile/database/index.ts
import { Database } from '@nativewind/watermelondb';
import SQLiteAdapter from '@nativewind/watermelondb/adapters/sqlite';
import schema from './schema';
import migrations from './migrations'; // If using migrations

const adapter = new SQLiteAdapter({
  schema,
  migrations, // Add this if you have migration files
  jsi: true, // Enable JSI for better performance
  onSetUpError: (error) => {
    console.error('Database setup error:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [
    LibraryCatalogue,
    LibraryCopy,
    LibraryCard,
    LibraryBorrow,
    LibraryReservation,
    Student,
    SyncQueue,
  ],
});
```

#### Issue: Queries returning stale data
**Cause**: Not observing reactive queries.

**Solution**:
```typescript
// ❌ Bad (one-time fetch)
const borrows = await database.collections.get('library_borrows').query().fetch();

// ✅ Good (reactive)
useEffect(() => {
  const subscription = database.collections
    .get('library_borrows')
    .query(Q.where('student_id', studentId))
    .observe()
    .subscribe((borrows) => setBorrows(borrows));

  return () => subscription.unsubscribe();
}, [studentId]);
```

---

### 5. Authentication Issues

#### Issue: "Unauthorized" errors after login
**Cause**: Token not being sent in API requests.

**Solution**:
Check `mobile/services/api.ts`:
```typescript
const token = useAuthStore.getState().token;
if (token) {
  config.headers.Authorization = `Bearer ${token}`;
}
```

#### Issue: Token expires after app restart
**Cause**: Zustand persist middleware not configured.

**Solution**:
```typescript
// In mobile/lib/auth.ts
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      // ... rest of store
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
```

---

### 6. Offline Sync Issues

#### Issue: Actions not syncing when reconnected
**Cause**: Network state not detected.

**Solution**:
Check `mobile/hooks/useNetworkState.ts`:
```typescript
import NetInfo from '@react-native-community/netinfo';

export function useNetworkState() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? false);
    });

    return () => unsubscribe();
  }, []);

  return isConnected;
}
```

#### Issue: Duplicate entries after sync
**Cause**: Same action synced multiple times.

**Solution**:
Add idempotency checks in `mobile/services/sync.ts`:
```typescript
async function syncAction(action: SyncQueueItem) {
  try {
    // Add idempotency key
    const response = await api.post(action.endpoint, {
      ...action.payload,
      idempotencyKey: action.id, // Use queue item ID
    });

    // Mark as synced only after server confirms
    if (response.status === 200 || response.status === 409) {
      await action.markAsSynced();
    }
  } catch (error) {
    // Don't mark as synced on error
    console.error('Sync failed:', error);
  }
}
```

---

### 7. Fine Calculation Issues

#### Issue: Fines calculated incorrectly when device time is wrong
**Cause**: Using device time instead of server time.

**Solution**:
Always fetch server time from API:
```typescript
// In mobile/services/fineEngine.ts
async function getServerTime(): Promise<Date> {
  try {
    const response = await api.get('/time');
    return new Date(response.data.timestamp);
  } catch (error) {
    // Fallback: use last known server time + elapsed device time
    const lastSync = await AsyncStorage.getItem('lastServerTimeSync');
    if (lastSync) {
      const { serverTime, deviceTime } = JSON.parse(lastSync);
      const elapsed = Date.now() - deviceTime;
      return new Date(new Date(serverTime).getTime() + elapsed);
    }
    // Last resort: device time (flag this in UI)
    return new Date();
  }
}
```

#### Issue: Weekend counting toggle not working
**Cause**: Logic error in business day calculation.

**Solution**:
```typescript
function countBusinessDays(startDate: Date, endDate: Date, includeWeekends: boolean): number {
  let count = 0;
  const current = new Date(startDate);

  while (current <= endDate) {
    const dayOfWeek = current.getDay(); // 0 = Sunday, 6 = Saturday
    
    if (includeWeekends || (dayOfWeek !== 0 && dayOfWeek !== 6)) {
      count++;
    }
    
    current.setDate(current.getDate() + 1);
  }

  return count;
}
```

---

### 8. UI/Styling Issues

#### Issue: NativeWind classes not applying
**Cause**: Metro bundler not processing Tailwind.

**Solution**:
1. Check `metro.config.js`:
```javascript
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
```

2. Restart Metro with cache clear:
```bash
npx expo start --clear
```

#### Issue: Platform-specific shadows not working
**Cause**: Different shadow APIs for iOS vs Android.

**Solution**:
Use the Shadows helper from theme:
```typescript
import { Shadows } from '@/constants/theme';

// In component
<View style={[
  { backgroundColor: 'white' },
  Platform.select({
    ios: Shadows.md.ios,
    android: Shadows.md.android,
  }),
]}>
```

Or use the utility function:
```typescript
import { getShadowStyle } from '@/lib/utils';

<View style={getShadowStyle('md')}>
```

---

### 9. Navigation Issues

#### Issue: "Cannot read property 'navigate' of undefined"
**Cause**: Using navigation outside of a screen component.

**Solution**:
Use `router` from expo-router instead:
```typescript
import { router } from 'expo-router';

// In any component
router.push('/catalogue/new');
router.back();
router.replace('/login');
```

#### Issue: Back button not showing on iOS
**Cause**: Not using ScreenHeader component.

**Solution**:
```typescript
import { ScreenHeader } from '@/components/ui';

export default function Screen() {
  return (
    <View>
      <ScreenHeader title="Screen Title" />
      {/* Content */}
    </View>
  );
}
```

---

### 10. Performance Issues

#### Issue: FlatList scrolling is laggy with 500+ items
**Solutions**:
1. Add `getItemLayout` (if items are fixed height):
```typescript
<FlatList
  data={items}
  renderItem={renderItem}
  getItemLayout={(data, index) => ({
    length: 80, // Item height in pixels
    offset: 80 * index,
    index,
  })}
/>
```

2. Enable `removeClippedSubviews`:
```typescript
<FlatList
  data={items}
  renderItem={renderItem}
  removeClippedSubviews={true}
/>
```

3. Reduce render batch size:
```typescript
<FlatList
  data={items}
  renderItem={renderItem}
  maxToRenderPerBatch={10}
  windowSize={5}
  initialNumToRender={10}
/>
```

#### Issue: App crashes after 30 minutes of use (memory leak)
**Cause**: Subscriptions not cleaned up.

**Solution**:
Audit all `useEffect` hooks:
```typescript
useEffect(() => {
  // ✅ Always return cleanup function
  const subscription = someObservable.subscribe(handleData);
  
  return () => {
    subscription.unsubscribe();
  };
}, [dependencies]);
```

---

## Production Build Issues

### Error: "Build failed: SDK version mismatch"
**Solution**:
```bash
# Update Expo SDK to match eas.json
cd mobile
npx expo install --fix
```

### Error: "Android build failed: Execution failed for task ':app:minifyReleaseWithR8'"
**Cause**: ProGuard/R8 removing necessary code.

**Solution**:
Add to `android/app/proguard-rules.pro`:
```
-keep class com.facebook.react.** { *; }
-keep class com.swmansion.reanimated.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }
```

### Error: "iOS build failed: Code signing error"
**Solution**:
```bash
# Configure credentials
eas credentials

# Or use automatic signing
# In app.json:
{
  "ios": {
    "buildConfiguration": "Release",
    "autoIncrement": true
  }
}
```

---

## Debugging Tools

### 1. React DevTools
```bash
npm install -g react-devtools
react-devtools
```

### 2. Flipper (for WatermelonDB inspection)
1. Install Flipper: https://fbflipper.com/
2. Enable in development build
3. View database tables in real-time

### 3. Expo DevTools
```bash
npx expo start
# Press 'm' to open more tools
# Press 'j' to open debugger
```

### 4. Network Debugging (Reactotron)
```bash
npm install --save-dev reactotron-react-native
```

Then configure in `mobile/lib/reactotron.ts`:
```typescript
import Reactotron from 'reactotron-react-native';

if (__DEV__) {
  Reactotron.configure()
    .useReactNative()
    .connect();
}
```

---

## When to Ask for Help

1. **Database corruption**: Export data, delete app, reinstall
2. **Native module conflicts**: Check for duplicate dependencies in `package.json`
3. **EAS build failures**: Check build logs in Expo dashboard
4. **Persistent crashes**: Enable crash reporting (Sentry, Bugsnag)

---

**Document Version**: 1.0  
**Last Updated**: 2026-07-29

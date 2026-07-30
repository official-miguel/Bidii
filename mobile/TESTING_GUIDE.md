# Library Management Mobile App - Testing & Deployment Guide

## Prerequisites

### Development Environment
```bash
# Install dependencies
cd mobile
npm install

# Verify Expo CLI
npx expo --version

# Start development server
npm start
```

### Required Tools
- **Expo Go** app (iOS/Android) for development testing
- **EAS CLI** for production builds: `npm install -g eas-cli`
- **Physical device** recommended for camera/QR testing
- **Android Studio** (Android) or **Xcode** (iOS) for emulators

## Testing Checklist

### 1. Type Safety & Build Verification
```bash
# TypeScript compilation check
npx tsc --noEmit

# Check for linting issues (if ESLint configured)
npm run lint

# Verify all imports resolve
npm start
# Look for any red error screens on launch
```

**Expected**: Zero TypeScript errors, clean build output.

---

### 2. Authentication Flow

#### Test Case: Librarian Login
1. Launch app → should land on `/login` screen
2. Enter credentials: `librarian@test.com` / `password123`
3. Tap "Sign In"
4. **Expected**: Navigate to tabs, see **6 tabs**: Desk, Scan, Catalogue, Cards, Reservations, Analytics

#### Test Case: Student Login
1. Logout from settings
2. Login as `student@test.com` / `password123`
3. **Expected**: Navigate to tabs, see **3 tabs**: My Card, Browse, My Borrows

#### Test Case: Invalid Credentials
1. Enter `wrong@test.com` / `wrongpass`
2. **Expected**: Red error banner appears, stays on login screen

**Edge Cases**:
- Empty email/password → disable Sign In button
- Network error → show "Unable to connect" message
- Token persistence → close/reopen app, should stay logged in

---

### 3. Catalogue Management

#### Test Case: Add New Title
1. Navigate to **Catalogue** tab
2. Tap "Add Title" (+ button, top right)
3. Fill form:
   - Title: "The Great Gatsby"
   - Author: "F. Scott Fitzgerald"
   - ISBN: "978-0-7432-7356-5"
   - Category: "Fiction"
   - Form: "Form 1"
   - Publisher: "Scribner"
   - Year: 2004
4. Tap "Save"
5. **Expected**: Redirect to catalogue list, new title appears at top

#### Test Case: Add Physical Copy
1. Tap the new title → opens detail screen
2. Scroll to "Physical Copies" section
3. Tap "Add Copy"
4. Fill form:
   - Accession: "BK-2024-001"
   - Condition: "Excellent"
   - Acquisition Date: (pick today)
   - Purchase Price: 500
5. Tap "Save"
6. **Expected**: Copy appears in list, "Available" badge, "Excellent" condition

#### Test Case: Bulk Import
1. Prepare CSV file with columns: `title,author,isbn,category,form`
2. Navigate to Catalogue → tap overflow menu → "Import"
3. Select CSV file
4. **Expected**: Preview shows first 20 rows, valid/invalid badges, confirm button enabled

**Edge Cases**:
- Duplicate ISBN → should warn or merge
- Missing required fields → show validation errors
- Offline mode → queue in SyncQueue table

---

### 4. Circulation Workflow

#### Test Case: Issue Book (Borrow)
1. Navigate to **Desk** tab
2. **Phase 1 - Find Student**:
   - Type "John" in search
   - Wait 250ms (debounce)
   - **Expected**: Students with "John" appear
3. Tap student → **Phase 2 - Card Panel**:
   - **Expected**: Shows photo, card status "Active", current borrows count, fine balance
4. Tap "Continue to Borrow" → **Phase 3 - Find Book**:
   - Search "Great Gatsby"
   - Select available copy
5. **Phase 4 - Policy Evaluation**:
   - **Expected**: Shows green checkmark if:
     - Student has not reached max books (default 3)
     - Copy is available
     - No blocking fines (default >500 KES)
   - Shows due date (14 days from today by default)
6. Tap "Confirm Borrow"
7. **Expected**: Success toast, redirect to Desk, borrow appears on student's card

#### Test Case: Return Book
1. Navigate to **Desk** tab → find student with active borrow
2. Tap student → see active borrows list
3. Tap "Return" on a borrow
4. **Expected**: Confirm modal appears, tap "Confirm Return"
5. **Expected**: Borrow removed, copy status changes to "Available"

#### Test Case: Policy Violations
1. Try to borrow when student has 3 books already
2. **Expected**: Red warning "Max books reached", require override reason
3. Try to borrow when student has 600 KES in fines
4. **Expected**: Red warning "Fines exceed block threshold", require override

**Edge Cases**:
- Offline borrow → queues in SyncQueue, syncs on reconnect
- Duplicate scan within 1 second → ignored (cooldown)
- Reserved book → only student at front of queue can borrow

---

### 5. QR Code Scanning

#### Test Case: Scan Book Copy (BIDII:BOOK:)
1. Navigate to **Scan** tab
2. Grant camera permissions if prompted
3. Generate test QR code containing: `BIDII:BOOK:BK-2024-001`
4. Point camera at QR code
5. **Expected**: 
   - Haptic feedback
   - Copy details appear (title, accession, status)
   - "Borrow" or "Return" button enabled based on status

#### Test Case: Scan Student Card (BIDII:STUDENT:)
1. Generate QR code: `BIDII:STUDENT:12345` (student ID)
2. Scan on **Scan** tab
3. **Expected**: Student card details appear, option to view full card

#### Test Case: Scan Loan Token (BIDII:LOAN:)
1. Complete a borrow → generates `BIDII:LOAN:<borrowId>`
2. Print/display QR code with loan token
3. Scan loan token on **Scan** tab
4. **Expected**: 
   - Server validates token against active borrow record
   - If valid → show "Return" button
   - If invalid/already returned → error message

#### Test Case: Invalid QR Code
1. Scan random QR code (not BIDII format)
2. **Expected**: Error banner "Invalid QR code format"

**Edge Cases**:
- Poor lighting → enable torch toggle (flashlight icon)
- No camera permission → show instructions to enable in settings
- Offline scan → queue action, show "Queued for sync"

---

### 6. Library Cards

#### Test Case: Auto-Issued Cards
1. Navigate to **Cards** tab
2. **Expected**: All registered students have cards (auto-issued on first login)
3. Tap a student → see card detail:
   - Photo
   - Card number (12-digit)
   - Status badge (Active/Suspended/Expired)
   - Current borrows count
   - Total fine balance
   - Full borrow history

#### Test Case: Suspend Card
1. Tap student card → tap "Suspend"
2. **Expected**: Confirm modal, status changes to "Suspended"
3. Try to borrow as that student
4. **Expected**: Blocked with "Card suspended" error

#### Test Case: Unsuspend Card
1. On suspended card → tap "Activate"
2. **Expected**: Status changes to "Active", student can borrow again

---

### 7. Reservations

#### Test Case: Reserve Title
1. Login as **student**
2. Navigate to **Browse** tab
3. Find title with 0 available copies
4. Tap "Reserve"
5. **Expected**: Toast "Reservation placed", title appears in "My Borrows" → Reservations tab

#### Test Case: Fulfill Reservation
1. Login as **librarian**
2. Copy becomes available (return a book)
3. Navigate to **Reservations** tab
4. **Expected**: Student at front of queue shown with "Fulfill" button
5. Tap "Fulfill" → enter accession number of available copy
6. **Expected**: Confirmation modal names the student, borrow created, reservation removed

#### Test Case: Cancel Reservation
1. Student or librarian taps "Cancel" on reservation
2. **Expected**: Confirm modal, reservation removed from queue

**Edge Cases**:
- Multiple reservations → first-in-line gets first opportunity
- Reserved book expires if not picked up in 48 hours (optional config)

---

### 8. Fines Management

#### Test Case: Overdue Calculation
1. **Setup**: Manually set due date in past in database:
   ```sql
   UPDATE LibraryBorrow SET dueDate = '2024-01-01' WHERE id = '<borrowId>';
   ```
2. Navigate to **Fines** tab (or student card)
3. **Expected**: Fine calculated as:
   - Days overdue × fine rate (default 10 KES/day)
   - Weekends counted/skipped based on settings toggle

#### Test Case: Pause Fine Clock
1. On overdue borrow → tap "Pause Clock"
2. Enter reason (e.g., "Book recalled for repair")
3. **Expected**: Status changes to "Paused", fine stops accumulating

#### Test Case: Resume Fine Clock
1. Tap "Resume Clock"
2. **Expected**: Status changes to "Overdue", fine resumes from paused amount

#### Test Case: Mark Fine Paid
1. Tap "Mark Paid" on fine
2. **Expected**: Confirm modal, fine removed from balance, borrow history updated

**Edge Cases**:
- Server timestamp sync → fetch from `/api/time` endpoint, never use device time
- Offline fine calculation → uses last synced server time + elapsed device time
- Weekend toggle → if disabled, skip Saturday/Sunday in overdue count

---

### 9. Settings Panel

#### Test Case: Update Fine Rate
1. Navigate to **Settings** tab
2. Change "Fine Rate (KES/day)" from 10 to 15
3. Tap "Save Settings"
4. **Expected**: Toast "Settings updated", new borrows use 15 KES/day

#### Test Case: Update Max Books
1. Change "Max Books Per Student" from 3 to 5
2. Save
3. **Expected**: Students can now borrow up to 5 books

#### Test Case: Toggle Weekend Counting
1. Disable "Count Weekends in Fines"
2. **Expected**: Overdue calculations skip Saturdays and Sundays

**Edge Cases**:
- Settings sync immediately to server
- Offline changes queue in SyncQueue

---

### 10. Analytics Dashboard

#### Test Case: Overview Stats
1. Navigate to **Analytics** tab
2. **Expected**: See 4 StatCards:
   - Total Titles (catalogue count)
   - Total Copies (all physical books)
   - Active Borrows (currently checked out)
   - Overdue Books (past due date)

#### Test Case: Borrow Trend Chart
1. Scroll to "Borrow Trend (7 Days)"
2. **Expected**: Mini bar chart showing daily borrow counts for past week

#### Test Case: Top Borrowers
1. Scroll to "Top 10 Borrowers"
2. **Expected**: List of students with borrow count, grade/form shown

#### Test Case: Popular Titles
1. Scroll to "Most Popular Titles"
2. **Expected**: Books sorted by borrow count (descending)

#### Test Case: Condition Distribution
1. Scroll to "Copy Condition Breakdown"
2. **Expected**: Progress bars showing % of copies in Excellent/Good/Fair/Poor/Repair

---

### 11. Offline-First Architecture

#### Test Case: Offline Borrow
1. Enable airplane mode on device
2. Navigate to **Desk** → complete borrow workflow
3. **Expected**: 
   - Operation completes immediately
   - Yellow "Offline" banner at top
   - "1 action queued" badge
4. Disable airplane mode
5. **Expected**: 
   - Auto-sync triggers
   - Toast "Sync complete"
   - Server confirms borrow exists

#### Test Case: Sync Queue Management
1. Perform 3 actions offline (borrow, return, mark paid)
2. Tap sync status bar → shows "3 actions queued"
3. Reconnect → tap "Sync Now"
4. **Expected**: Progress indicator, all 3 actions pushed to server

#### Test Case: Conflict Resolution
1. Offline borrow a copy
2. Another user returns that copy on web app
3. Sync mobile app
4. **Expected**: Server validates, if conflict detected → error toast, manual resolution required

**Edge Cases**:
- Network interruption mid-sync → retry with exponential backoff
- Long offline period → queue capped at 1000 actions (configurable)

---

### 12. Student-Facing Views

#### Test Case: My Card View
1. Login as **student**
2. Navigate to **My Card** tab
3. **Expected**: 
   - Visual card design (gradient background, QR code)
   - Current borrows with due dates
   - Fine balance (if any)
   - Borrow history

#### Test Case: Browse Catalogue
1. Navigate to **Browse** tab
2. Search "Science"
3. **Expected**: Titles filtered by keyword
4. Tap title → see details, "Reserve" button if unavailable

#### Test Case: My Borrows Tab
1. Navigate to **My Borrows** tab
2. **Expected**: 
   - Active borrows with countdown to due date
   - Reservations with queue position
   - Overdue items highlighted red

---

## Performance Optimization

### 1. FlatList Optimization
Check in these files:
- `mobile/app/(tabs)/catalogue.tsx`
- `mobile/app/(tabs)/cards.tsx`
- `mobile/app/(tabs)/circulate.tsx`

**Add**:
```typescript
<FlatList
  data={items}
  renderItem={renderItem}
  keyExtractor={(item) => item.id}
  // Performance props
  getItemLayout={(data, index) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  })}
  removeClippedSubviews={true}
  maxToRenderPerBatch={10}
  windowSize={5}
  initialNumToRender={10}
/>
```

### 2. WatermelonDB Query Optimization
Check query performance in:
- `mobile/services/api.ts`
- `mobile/database/models/*.ts`

**Add indexes** to `mobile/database/schema.ts`:
```typescript
tableSchema({
  name: 'library_borrows',
  columns: [
    // existing columns...
  ],
  // Add indexes for frequent queries
  indexes: [
    { name: 'borrow_student_id_index', columns: ['student_id'] },
    { name: 'borrow_due_date_index', columns: ['due_date'] },
    { name: 'borrow_status_index', columns: ['status'] },
  ],
}),
```

### 3. Memory Leak Checks
Look for cleanup in `useEffect` hooks:
```typescript
useEffect(() => {
  const subscription = database.collections
    .get('library_borrows')
    .query()
    .observe()
    .subscribe((borrows) => setBorrows(borrows));

  // MUST cleanup
  return () => subscription.unsubscribe();
}, []);
```

### 4. Image Optimization
For student photos in Avatar component:
- Use `resizeMode="cover"`
- Add placeholder while loading
- Consider caching with `expo-image` library (optional upgrade)

---

## Production Build

### 1. Configure EAS Build
```bash
# Login to Expo account
eas login

# Configure project
eas build:configure
```

### 2. Update app.json
```json
{
  "expo": {
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.bidii.library",
      "buildNumber": "1"
    },
    "android": {
      "package": "com.bidii.library",
      "versionCode": 1,
      "permissions": [
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE"
      ]
    }
  }
}
```

### 3. Build APK/IPA
```bash
# Android APK (for testing)
eas build --platform android --profile preview

# Android AAB (for Play Store)
eas build --platform android --profile production

# iOS IPA (for App Store)
eas build --platform ios --profile production
```

### 4. Environment Variables
Create `mobile/.env.production`:
```
API_BASE_URL=https://api.bidii.school
API_TIMEOUT=15000
SYNC_INTERVAL=60000
```

---

## Known Issues & Workarounds

### Issue: Camera not working on Android emulator
**Workaround**: Test on physical device, emulators have limited camera support.

### Issue: WatermelonDB "database locked" error
**Workaround**: Ensure all write operations use `.batch()`:
```typescript
await database.write(async () => {
  await borrowCollection.create((borrow) => {
    borrow.studentId = studentId;
    borrow.copyId = copyId;
  });
});
```

### Issue: Expo Go doesn't support custom native modules
**Workaround**: Use `npx expo run:android` or `npx expo run:ios` for development builds.

### Issue: Fine calculation drift when offline for days
**Workaround**: On reconnect, fetch server time and recalculate all overdue fines.

---

## Acceptance Criteria Checklist

- [ ] TypeScript compiles with zero errors
- [ ] All authentication flows work (librarian, student, invalid)
- [ ] CRUD operations complete on catalogue (add title, add copy, edit, delete)
- [ ] Circulation workflow completes (search student, search book, borrow, return)
- [ ] QR scanning works with all 3 token types (BOOK, STUDENT, LOAN)
- [ ] Library cards auto-issue and can be suspended/activated
- [ ] Reservations queue correctly and fulfill in FIFO order
- [ ] Fine engine calculates overdue using server timestamps (not device time)
- [ ] Offline actions queue and sync on reconnect
- [ ] Settings changes persist and apply immediately
- [ ] Analytics display correct KPIs and charts
- [ ] Student views show personalized data (my card, my borrows)
- [ ] Performance: FlatLists scroll smoothly with 500+ items
- [ ] Memory: No leaks after 30min usage (test with React DevTools)
- [ ] Build: APK/IPA installs and runs without crashes

---

## Deployment Steps

1. **Test on physical devices**: iOS and Android
2. **Run full test suite** (checklist above)
3. **Generate production builds**: `eas build --platform all --profile production`
4. **Distribute via TestFlight** (iOS) or **Internal Testing** (Android)
5. **Collect feedback** from 5-10 librarians/students
6. **Fix critical bugs** (if any)
7. **Submit to App Store / Play Store**

---

## Support & Maintenance

- **Monitoring**: Use Sentry or Bugsnag for crash reporting
- **Analytics**: Consider Expo Analytics or Firebase Analytics
- **Updates**: Use Expo OTA updates for non-native changes: `eas update`
- **Database migrations**: Plan schema changes carefully, test rollback scenarios

---

## Next Steps After Deployment

1. **Add barcode keyboard wedge support** (USB scanner hardware)
2. **Implement batch operations** (bulk borrow, bulk return)
3. **Add push notifications** (overdue reminders, reservation ready)
4. **Integrate with school SMS gateway** (fine reminders)
5. **Add print functionality** (overdue notices, library cards)
6. **Build web admin dashboard sync** (bidirectional real-time updates)

---

**Document Version**: 1.0  
**Last Updated**: 2026-07-29  
**Author**: Kiro (AI-assisted development)

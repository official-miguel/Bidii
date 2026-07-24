# Requirements Document: Messaging Module (Communication Centre)

## Introduction

The Messaging Module adds a fully integrated Communication Centre to the Bidii School Management System. It enables principals, authorised admin staff, and optionally teachers to send SMS and WhatsApp messages to any combination of recipients drawn from existing system data — students, parents, teachers, staff, and any school-defined custom group — without ever entering phone numbers manually.

The module is surfaced as a permission-gated dashboard accessible under the `COMMUNICATION` module, which is already defined in the system's `Module` enum and the `Staff Roles & Permissions` matrix. No new role-system concepts are required; the existing `requirePermission('COMMUNICATION', 'view' | 'manage')` guard governs all access.

**Scope of this document:**
- Recipient Groups (custom, user-managed)
- Message Templates with dynamic placeholders
- Message Composer (individual, class, group, school-wide)
- Live Recipient Search and multi-selection
- SMS and WhatsApp channel dispatch via existing `SchoolIntegration` provider keys
- Scheduling (send now or at a future date/time)
- Delivery status tracking (Sent, Delivered, Failed, Pending)
- Searchable message history
- Exam Results Messaging (bulk personalised result messages from published assessments)
- Offline message queue (outgoing messages queued when offline, dispatched on reconnect)
- Permission enforcement at every action boundary

**Out of scope:**
- Inbound messaging / two-way conversations
- Email channel (infrastructure hook is defined but not wired in this module)
- Push notifications
- Parent or student login access to message history

---

## Glossary

- **Message** — one outbound communication event; a single body of text (with optional attachment metadata) sent to one or more resolved recipient phone numbers at a specific channel.
- **Recipient** — a resolved phone number associated with a person in the system. For a student recipient the resolved number is `parentContact`; for a teacher or admin staff it is `phone`.
- **RecipientGroup** — a school-defined, named collection of system users or contacts that can be addressed as a single unit (e.g. "Board of Management", "PTA Committee"). Not hardcoded.
- **MessageTemplate** — a named, reusable message body that may contain placeholder tokens. Stored per school.
- **Placeholder** — a token in a template body (e.g. `/name`, `/class`) that is substituted with per-recipient data when a message is generated.
- **Composer** — the message creation UI: recipient picker + channel selector + body editor + schedule picker + send/schedule action.
- **ExamResultsMessage** — a special personalised message containing a student's published exam results, sent to the student's parent contact.
- **DeliveryStatus** — the last known state of a dispatched message: `PENDING`, `SENT`, `DELIVERED`, or `FAILED`.
- **MessageLog** — one row per resolved recipient per message, tracking channel and delivery status.
- **OfflineQueue** — client-side IndexedDB store of outgoing messages that could not be dispatched due to loss of connectivity; drained automatically on reconnect.
- **Channel** — the transport used for a message: `SMS` or `WHATSAPP`.

---

## Requirements

---

### Requirement 1: Permission Gating

**User Story:** As a principal, I want the Communication Centre to be visible and usable only by staff members I have explicitly granted access to, so that message sending cannot happen without authorisation.

#### Acceptance Criteria

1. The Communication Centre navigation entry SHALL appear in the principal's sidebar unconditionally (the principal always has full access).
2. The Communication Centre navigation entry SHALL appear in an ADMIN_STAFF user's sidebar only when their assigned staff role has `canView: true` on the `COMMUNICATION` module.
3. All API routes under `/api/messaging/` SHALL call `requirePermission('COMMUNICATION', 'view')` for read operations and `requirePermission('COMMUNICATION', 'manage')` for write/send operations, returning HTTP 401/403 for unauthorised callers.
4. The `canView` permission SHALL grant access to message history, recipient group list, and template list in read-only mode.
5. The `canManage` permission SHALL additionally grant the ability to send messages, schedule messages, create groups, edit templates, and send exam results messages.
6. The teacher role SHALL NOT have access to the Communication Centre by default; a principal may explicitly grant it to a teacher who also holds an ADMIN_STAFF account.
7. Permission checks SHALL be enforced both server-side (API route guards) and client-side (UI elements hidden/disabled when action is not permitted).

---

### Requirement 2: Module Entry Points and Navigation

**User Story:** As an authorised user, I want the Communication Centre to appear as a familiar sidebar entry that opens a clean, fast-loading page, so that I can start sending a message in under five seconds.

#### Acceptance Criteria

1. The principal's sidebar NAV array SHALL include `{ href: '/principal/communication', label: 'Communication' }`.
2. The staff portal `MODULE_ROUTES` map SHALL include `COMMUNICATION: '/staff/communication'` so that the entry appears automatically for any staff role granted the module.
3. The Communication Centre landing page SHALL load with cached data from IndexedDB before any network response arrives, so that the UI is immediately interactive even on a slow connection.
4. The landing page SHALL consist of three visible areas: a searchable message history list on the left (or top on mobile), a prominent **New Message** button, and a detail/preview pane on the right (or below on mobile).
5. The page SHALL use the `royalCardClass` card styling consistent with other principal/staff module pages.
6. A tab or sub-navigation bar SHALL provide access to: **Messages**, **Groups**, and **Templates** — each loading instantly from cached data.

---

### Requirement 3: Recipient Groups

**User Story:** As a principal or authorised staff member, I want to create and manage named recipient groups — including a "Board of Management" group — without those groups being hardcoded in the system, so that the school can organise its contacts in whatever way makes sense.

#### Acceptance Criteria

1. Any user with `canManage: true` on `COMMUNICATION` SHALL be able to create a new recipient group by providing a name and an optional description.
2. Group names SHALL be unique per school; attempting to create a duplicate SHALL return a validation error.
3. A group SHALL support two member types:
   - **System members**: staff (teachers or admin staff) selected by name or staff ID from existing Teacher records.
   - **External members**: contacts not in the system, stored as a name + phone number pair directly on the group membership row.
4. Members SHALL be addable and removable at any time without affecting sent message history.
5. Groups SHALL be listed on the **Groups** tab with member count, creation date, and a **Manage** action.
6. Deleting a group SHALL be blocked while any scheduled (pending) message targets only that group; the UI SHALL show a clear error.
7. Groups SHALL appear as selectable recipients in the Composer's recipient picker alongside system-level targets (All Parents, All Teachers, etc.).
8. A group MUST have at least one member before it can be saved.
9. The system SHALL include a `RecipientGroup` Prisma model and a `GroupMember` join model scoped to `schoolId`.

---

### Requirement 4: Message Templates

**User Story:** As an authorised user, I want to save frequently used messages as named templates so that I can compose a fee reminder, attendance notice, or meeting invitation in seconds without rewriting it each time.

#### Acceptance Criteria

1. Any user with `canManage: true` on `COMMUNICATION` SHALL be able to create, edit, and delete message templates.
2. Each template SHALL have a **name** (unique per school), a **body** (the message text), and an optional **category** label (e.g. "Fee Reminder", "Meeting Notice", "Exam Reminder", "Holiday", "Emergency", "Attendance", "Results").
3. Template bodies MAY contain the following placeholder tokens, each rendered in a distinct colour in the editor UI so authors can see them clearly:
   - `/name` → recipient's full name (student's full name or teacher/staff name depending on recipient type)
   - `/class` → name of the recipient's class (`SchoolClass.name`)
   - `/stream` → stream portion of the class name (e.g. "North", "South")
   - `/Admission` → student's admission number (`Student.admissionNumber`)
   - `/staffname` → teacher/staff member's full name (`Teacher.fullName`)
   - `/staffno` → teacher/staff ID (`Teacher.staffId`)
   - `/results` → a formatted multi-line block of the student's latest published results (used in exam results messages)
4. When a template is loaded in the Composer, each placeholder SHALL be resolved against the selected recipient's system record before the message is shown or sent. Any placeholder for which no data is available SHALL be replaced with a clearly visible `[unknown]` marker.
5. Templates SHALL be listed on the **Templates** tab with name, category, a truncated body preview, and **Edit** / **Use** actions.
6. Selecting **Use** on a template SHALL open the Composer with that template's body pre-filled.
7. Templates SHALL be stored in a `MessageTemplate` Prisma model scoped to `schoolId`.

---

### Requirement 5: Message Composer

**User Story:** As an authorised user, I want a single, clean Composer screen where I can choose recipients, write or select a message, pick a channel, and send or schedule the message — all without leaving the Communication Centre.

#### Acceptance Criteria

1. The Composer SHALL be opened by the **New Message** button or by clicking **Use** on a template.
2. The Composer SHALL present the following fields in order:
   - **To** — recipient picker (see Requirement 6)
   - **Channel** — toggle/radio: SMS | WhatsApp (both shown; unavailable channels greyed out with a "not configured" tooltip if the school has not connected the provider)
   - **Message body** — multi-line text area with a live character counter (SMS: 160-char boundary markers; WhatsApp: 4096 limit)
   - **Template** — an optional "Load template" dropdown that populates the body field
   - **Attachment** — an optional file/image picker (metadata only stored; actual file URL stored, not binary data inline)
   - **Schedule** — a toggle: Send Now | Schedule; when Schedule is selected a date-time picker appears
3. The Composer SHALL show a live **preview pane** below the body that renders the message as it will appear for the first selected recipient, with placeholders resolved.
4. Clicking **Send** (or **Schedule**) SHALL be disabled and show a tooltip when:
   - No recipient is selected.
   - The body is empty.
   - The selected channel is not configured for this school (no active integration key).
5. On successful send, the Composer SHALL close and the message SHALL appear at the top of the message history list with status `PENDING`.
6. When scheduling, the chosen date-time SHALL be stored on the `Message` record; a background job / cron-style Next.js route SHALL dispatch the message at that time.
7. The Composer SHALL be accessible as a slide-over panel (desktop) or full-screen page (mobile) without losing the history list context.

---

### Requirement 6: Recipient Picker — Live Search and Multi-Selection

**User Story:** As an authorised user composing a message, I want to search for recipients by name, class, or group and keep adding them one at a time without losing previously selected recipients, so that I can build any custom list in a few taps.

#### Acceptance Criteria

1. The recipient picker SHALL present a set of **quick-select chips** for common targets:
   - All Parents
   - All Students
   - All Teachers
   - All Staff (teachers + admin staff)
   - Entire School
   - Per-form/class targets (e.g. "Form 1", "Form 2", "Form 3", "Form 4") — derived from existing `SchoolClass` records grouped by `form` field
   - Any custom `RecipientGroup` defined for this school
2. Below the quick-select chips, the picker SHALL show a **live search input** that queries students, teachers, and admin staff by name as the user types, with results appearing within 300 ms using local IndexedDB data.
3. Each search result row SHALL show the person's name, role/class, and a checkmark when selected.
4. Selecting a result SHALL add them to the selected list AND keep the search input active and the results list open so the user can immediately search for and add another recipient.
5. The selected recipient list SHALL be displayed as dismissible chips/tags above the search input; each chip shows the person's name and a remove (×) icon.
6. Quick-select chips SHALL be mutually exclusive for "Entire School" (selecting it clears all other selections) but additive for everything else (e.g. selecting "Form 1" and then "Form 4" addresses both).
7. The picker SHALL resolve the actual phone numbers only at send time, not during selection, so the UI remains fast regardless of recipient count.
8. If a resolved recipient has no phone number on file, the system SHALL include that recipient's name in a **"No contact — skipped"** warning shown in the send confirmation dialog, without blocking the send.
9. The recipient picker state SHALL persist across template loads; loading a template SHALL not clear the selected recipients.

---

### Requirement 7: SMS and WhatsApp Dispatch

**User Story:** As an authorised user, I want to send messages via SMS or WhatsApp using the provider keys the school has already configured in Settings, so that the Communication Centre works with whatever provider the school uses.

#### Acceptance Criteria

1. The dispatch layer SHALL read the school's active integration key for the selected channel by calling `getSchoolIntegrationKey(schoolId, 'SMS' | 'WHATSAPP')` — never hardcoding a provider.
2. If no active key exists for a channel, the send action SHALL be blocked at the API level (HTTP 422) with a message explaining which integration is missing, in addition to the client-side guard (Req 5.4).
3. The dispatch service SHALL iterate over resolved recipient phone numbers and call the provider's API for each. Failures for individual numbers SHALL NOT abort the remainder of the batch.
4. After each provider API response, the corresponding `MessageLog` row's `status` field SHALL be updated: `SENT` on HTTP 2xx, `FAILED` on any error.
5. Provider-specific delivery callbacks (webhooks) are out of scope for this module version; `DELIVERED` status SHALL be set manually or via a future webhook extension point.
6. Message dispatch SHALL happen in a server-side API route (`POST /api/messaging/send`) that runs asynchronously — the client receives a `202 Accepted` immediately and polls or uses server-sent events for status updates.
7. The system SHALL support WhatsApp only for recipients whose phone numbers are in international format or have been normalised; non-normalisable numbers SHALL be logged as `FAILED` with reason "invalid number format".

---

### Requirement 8: Delivery Status and Message History

**User Story:** As an authorised user, I want to see a searchable list of all messages sent by this school, including their delivery status for each recipient, so that I can confirm messages were received and follow up when they were not.

#### Acceptance Criteria

1. The **Messages** tab SHALL display a reverse-chronological list of all messages sent by the school, showing: date/time, sender name, recipient summary (e.g. "Form 3 North — 34 recipients"), channel icon, and an aggregate status chip (all delivered / N failed / sending...).
2. Clicking a message row SHALL open a detail view showing: full body, full recipient list with per-recipient delivery status, channel, sent/scheduled time, and the sender's name.
3. Each `MessageLog` row SHALL display one of four statuses with a distinct colour: `PENDING` (grey), `SENT` (blue), `DELIVERED` (green), `FAILED` (red).
4. The message list SHALL be searchable by message body text, recipient name, sender name, and date range — search results SHALL appear within 300 ms using local cache.
5. Messages SHALL be stored indefinitely; the list SHALL paginate (20 per page) with a "Load more" pattern to maintain performance regardless of history size.
6. Failed messages SHALL be retryable: a **Retry** button SHALL appear on the detail view for any message with one or more `FAILED` log rows; retrying SHALL re-send only to the failed recipients.
7. Scheduled messages that have not yet been dispatched SHALL appear at the top of the list with a `PENDING` chip and a **Cancel** action.
8. All message history data SHALL be cached in IndexedDB and refreshed on page load; the list SHALL be immediately visible from cache before network data arrives.

---

### Requirement 9: Exam Results Messaging

**User Story:** As a principal or authorised staff member, I want to send each student's examination results directly to their parent's phone via SMS or WhatsApp with a single action, so that parents receive personalised results quickly after publication without any manual editing.

#### Acceptance Criteria

1. The Communication Centre SHALL include an **Exam Results** action accessible from the Messages tab (a dedicated button or sub-page).
2. The user SHALL be able to select any `AssessmentPeriod` that has at least one published result (`AssessmentItem` rows with a non-null value).
3. Upon selecting a period, the system SHALL show a summary: number of students with results, number of students with a valid parent contact, and number with no contact (skipped).
4. The user SHALL be able to preview the personalised message for any individual student before sending. The preview SHALL show the resolved template with all placeholders filled from that student's actual records.
5. The default results message template SHALL be auto-populated with:
   - Student name (`/name`)
   - Class (`/class`)
   - A formatted subject-by-subject results block (`/results`) — for 8-4-4: subject name, marks, grade, and remarks; for CBE: strand/sub-strand competency levels
   - Overall position if `RankingConfig` has position display enabled for the school
   - A configurable closing line (stored as a per-school setting, defaulting to "Thank you for your continued support.")
6. The user SHALL be able to edit the closing line and optionally replace the default template body before sending.
7. A **Send All Results** button SHALL trigger bulk dispatch: the system iterates through all students with valid contacts and sends each parent their child's personalised message.
8. Progress SHALL be shown in real time as a progress bar (N of M sent) updated via server-sent events or polling.
9. At completion, a summary SHALL show: total sent, total delivered, total failed, and a downloadable list of students whose parents had no contact on file.
10. Exam results dispatch SHALL be protected by `requirePermission('COMMUNICATION', 'manage')`.
11. Each parent SHALL receive only their own child's results — the system MUST NOT send cross-student data.

---

### Requirement 10: Offline Queue and Background Sync

**User Story:** As an authorised user in a school with intermittent connectivity, I want outgoing messages to be queued automatically when the internet is unavailable, and sent as soon as connectivity is restored, so that communications are never silently lost.

#### Acceptance Criteria

1. When a send action is initiated and the device has no network connectivity, the Composer SHALL save the message (body, recipients, channel, attachments) to an IndexedDB `outboxQueue` store instead of calling the API.
2. A visible indicator SHALL appear on the Communication Centre header showing the count of queued messages (e.g. "2 messages queued").
3. When connectivity is restored, the system SHALL automatically detect the reconnect (via the browser's `online` event) and flush the queue by posting each queued message to `/api/messaging/send`.
4. Successfully sent queued messages SHALL be removed from `outboxQueue` and appear in the message history list.
5. Failed queue flushes (API returned an error) SHALL leave the message in `outboxQueue` and increment a `retryCount`; after 3 failed attempts the message SHALL move to a `failedQueue` and display a manual retry option.
6. The offline queue SHALL survive page refreshes and browser restarts (IndexedDB persistence).
7. Scheduled messages SHALL bypass the offline queue — they are stored server-side and dispatched by the server regardless of the client's connectivity state.

---

### Requirement 11: Integration with Existing Modules

**User Story:** As a user composing a message, I want recipient lists to always reflect current system data — new students, changed class assignments, updated phone numbers — without any manual sync or import step.

#### Acceptance Criteria

1. "All Parents" SHALL resolve to `Student.parentContact` for every active student in the school at send time, not at selection time.
2. "All Teachers" SHALL resolve to `Teacher.phone` for every teacher record belonging to the school.
3. "All Staff" SHALL resolve to the union of `Teacher.phone` records and any ADMIN_STAFF user linked to a Teacher record.
4. Per-class targets (e.g. "Form 3 North") SHALL resolve to `Student.parentContact` for all students whose `classId` matches that class.
5. Per-form targets (e.g. "Form 2") SHALL resolve to `Student.parentContact` for all students in any class where `SchoolClass.form = 2`.
6. The Exam Results Messaging feature SHALL read results from the existing `AssessmentItem` / `AssessmentPeriod` / `Paper` models — no duplication of result data.
7. The `/class`, `/stream`, `/Admission`, `/name`, `/staffname`, and `/staffno` placeholders SHALL be resolved from `SchoolClass`, `Student`, and `Teacher` records via standard Prisma queries at message generation time.
8. The system SHALL never store resolved phone numbers in message history — only recipient descriptors (student ID, teacher ID, or group member ID) so that a phone number change is always picked up on the next send.

---

### Requirement 12: Performance and Scalability

**User Story:** As a user at a large school with thousands of students, I want the Communication Centre to load instantly and remain fully responsive regardless of the size of the school's data, so that I never experience lag when selecting recipients or searching history.

#### Acceptance Criteria

1. The message history list SHALL load from IndexedDB cache in under 100 ms and display immediately; background network sync SHALL refresh it silently.
2. Recipient search results SHALL appear within 300 ms for any query, sourcing from locally cached student/teacher data indexed by name.
3. All API endpoints SHALL scope every query to `user.schoolId` and use indexed Prisma fields; no full-table scans.
4. Bulk dispatch (e.g. "All Parents" for a school with 1 200 students) SHALL be processed in a background route and SHALL NOT block the HTTP response to the client beyond the initial `202 Accepted`.
5. The Exam Results bulk send SHALL process recipients in batches of 50 to avoid provider rate limits, with configurable batch delay.
6. IndexedDB stores SHALL be invalidated and refreshed on a per-table basis (not wiped wholesale) to minimise perceived latency on reconnect.
7. All new Prisma models SHALL carry appropriate `@@index` directives on `schoolId` and on any field used in WHERE clauses.

---

### Requirement 13: UI Consistency

**User Story:** As a user, I want the Communication Centre to look and feel identical to the other modules in the system so that I do not need to re-learn any patterns.

#### Acceptance Criteria

1. All pages SHALL use `PageHeader`, `royalCardClass`, and the existing Tailwind token set (`bg-card`, `border-line`, `text-ink`, `text-slate`, `text-royal`, `bg-royal-50`, etc.) — no new custom colour values.
2. Loading states SHALL use the same `animate-pulse` skeleton pattern used in the Library and other modules.
3. Empty states SHALL display a centred icon, a short heading, and a one-line description — consistent with the pattern used across the system.
4. All modals, slide-overs, and confirmation dialogs SHALL use the existing `<Dialog>` / overlay pattern established in other modules.
5. The mobile layout SHALL follow the existing pattern: full-width stack, bottom-nav 4-icon bar, no horizontal overflow.
6. Error and success toast/banner patterns SHALL be consistent with existing feedback patterns in the system.
7. The Composer's character counter SHALL change colour at 80 % of the SMS limit boundary (128/160) and turn red at the boundary.

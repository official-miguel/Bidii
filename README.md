# Bidii — School Management System

Multi-tenant: any number of schools can use the same deployment, each fully
isolated from the others. A Principal signs up at `/signup` with their
school's details and their own name/email/password — that one step creates
the **School** account and the Principal's own login together. From there
they add Departments, Subjects, Staff, Classes, Students, and the Timetable
— the foundational admin flows the rest of the system (results, TOD,
watchman, marking) will build on. Every login is tied to exactly one school,
so signing in always lands you inside your own school's data, never anyone
else's.

**Stack:** Next.js 14 (App Router), TypeScript, Prisma + PostgreSQL, bcrypt
for passwords, custom cookie-based sessions (no third-party auth library),
Tailwind CSS.

## 1. Install dependencies

```bash
npm install
```

## 2. Set up the database

You need a Postgres database (local Postgres, or a free one from Neon/Supabase/Railway).

```bash
cp .env.example .env
# edit .env and set DATABASE_URL to your Postgres connection string
```

Then create the schema:

```bash
npx prisma migrate dev --name init
```

This also generates the Prisma client.

> Already had this running before and just pulled schema changes? Run
> `npx prisma migrate dev --name <describe-the-change>` again — Prisma
> only asks for a name, it detects what changed in `schema.prisma` itself.

## 3. Create your school's account

```bash
npm run dev
```

Visit `http://localhost:3000/signup`. Fill in your school's name (and
optionally address/phone), then your own name, email, and password. Submitting
that form:

1. Creates a `School` row for your school.
2. Creates your own `User` row as `PRINCIPAL`, linked to that school.
3. Logs you in immediately and takes you to `/principal`.

There's no separate "admin approves your school" step — submitting the form
is the account creation. Any number of schools can sign up this way on the
same deployment; each principal only ever sees their own school's
departments, staff, classes, students, timetable, and results.

From `/principal`, add Departments → Subjects → Staff → Classes → Students →
Timetable → Exam Periods, in that order (see "What's built" below). Staff you
register can be issued their own TEACHER login from the Staff panel — those
accounts are automatically scoped to your school too.

### Optional: seed a demo school instead

If you just want to click around without filling in the signup form, there's
still a seed script for local dev:

```bash
npm run db:seed
```

This creates a demo school plus a principal login and prints the generated
email/password to the terminal — copy it now, it's only shown once. Override
the defaults with:

```bash
SEED_SCHOOL_NAME="My Demo School" SEED_PRINCIPAL_EMAIL=you@yourschool.com SEED_PRINCIPAL_PASSWORD=SomethingStrong123 npm run db:seed
```

## 4. Run it

```bash
npm run dev
```

Visit `http://localhost:3000`, sign up (or log in with a seeded account), and
you'll land on `/principal`.

## What's built

| Flow | Where | Notes |
|---|---|---|
| School signup | `/signup` | Principal enters school details + their own name/email/password; creates the `School` and their `PRINCIPAL` login in one step and signs them straight in |
| Departments | `/principal/departments` | Create departments, assign a head from registered staff |
| Subjects | `/principal/subjects` | Master subject list — name, code, Core/Elective, department, applicable forms |
| Staff | `/principal/staff` | Register teaching *or* non-teaching staff, assign subjects/TOD eligibility (teachers) or a Staff Role (everyone else), optionally issue login credentials |
| Staff Roles & Permissions | `/principal/staff/roles` | Define roles (Accountant, Deputy Principal, Secretary, Librarian, ...) and tick which modules each can View / Manage. A few sensible defaults are seeded per school the first time you open this page — rename, re-permission, or delete them freely |
| Staff portal | `/staff` (non-teaching staff log in here) | Landing page shows only the modules that role was granted; Students and Staff Directory are live read-only views today, everything else shows as "coming soon" until its screen is built |
| Settings → Integrations | `/principal/settings` | Each school adds its own API keys (Gemini today; Google Calendar/SMS/WhatsApp/Email rows are ready for when those features ship). Keys are AES-256-GCM encrypted at rest and never shown again after saving — only "configured, ending •••1234" |
| Classes | `/principal/classes` | Create classes (e.g. Form 3 North), assign a class teacher |
| Students | `/principal/students` | Register students by admission number, assign class + electives (electives are filtered to the student's form automatically) |
| Timetable | `/principal/timetable` | Weekly grid per class (Manual Mode), or an AI Timetable Generator (AI Mode) — see below. Teacher double-booking is blocked at the database level (`TimetableSlot` has a unique constraint on teacher + day + period), not just in the UI. Each class's teacher for a subject is a standing assignment (`ClassSubjectTeacher`) that both modes read and write — it stays the same until the Principal explicitly changes it, in either mode |
| AI Timetable Generator | `/principal/timetable` → AI Mode | Set school-day settings — including each school's own timetable *format* (day start time, minutes per period, break/lunch length, on top of the existing periods/day, break/lunch placement, games slot, max lessons/teacher/day) — mark teacher unavailability, manage each class's subject teachers directly, and chat instructions like "Prioritize Mathematics in the morning" (Gemini turns these into scheduling hints). Generates a conflict-free draft you can edit lesson-by-lesson (reassign a teacher or remove a lesson) before saving — see design notes below for how AI and the scheduler split responsibilities |
| Exam Periods | `/principal/exam-periods` | Create exam sittings (e.g. "Term 1 Midterm 2026") and mark one as current |
| Results entry | `/teacher/results` | Teacher-side. Subject → class pickers are limited to what's actually on that teacher's timetable; can't enter marks for a class/subject they're not assigned to (enforced server-side, not just hidden in the UI) |
| Results viewing | `/principal/results` | Filter by class, form, or subject. Implements the Section 11D subject-count validation exactly as specified — whole-class notice, per-student outlier highlighting — and lets you configure the expected-count baseline per form |
| Result slip generation | `/results/print` (linked from both dashboards) | By class, by form (principal only), or by individual student. Printable page, not a stored PDF — see note below |
| Class result slips | `/teacher/results/slips` | Same generator, scoped to the signed-in teacher's own class (visible only if they're a class teacher) |

Setup order matters, same as the doc specifies: **Departments → Subjects →
Staff → Classes → Students → Timetable → Exam Periods.** Each page nudges
you toward this where a prerequisite is missing (e.g. "Add a department
first"). A teacher can only enter results for a subject/class combination
that's actually on their timetable, so the timetable has to be built before
results entry will show anything.

## Design decisions worth knowing about

- **RBAC is additive, not a rewrite.** Existing `PRINCIPAL` and `TEACHER`
  accounts are completely unaffected — their dashboards, routes, and API
  checks are the exact same `requireRole("PRINCIPAL")` / `requireRole(...,
  "TEACHER")` calls as before. The new `ADMIN_STAFF` role is layered on top:
  every list-view API route now accepts either the original role check *or*
  `requirePermission(module, "view")`, so a Principal-defined role like
  "Accountant" can see, say, Students, without touching how Principal or
  Teacher access works. Nothing about Staff Roles & Permissions can lock a
  Principal out — `PRINCIPAL` always has full access, computed on the fly
  rather than stored as rows, so a bad permissions edit can never affect it.
- **One staff table, two kinds of people.** Rather than add a parallel
  "non-teaching staff" model, `Teacher` (already generic — staffId, name,
  email, phone) doubles as the record for *all* staff; only the
  teaching-specific fields (department, subjects, TOD eligibility) are left
  empty for an Accountant or Secretary. What differs is the linked `User`:
  a Teacher's login is `role: TEACHER` as before; a Librarian/Secretary/etc.
  login is `role: ADMIN_STAFF` with a `staffRoleId` pointing at whatever
  role the Principal assigned, and *that* role's `RolePermission` rows
  decide what they can see. Creating staff logins is still Principal-only,
  so nobody can grant themselves more access.
- **View vs. Manage.** Every module a role can be given access to has two
  independent checkboxes — View (read-only) and Manage (create/edit/delete).
  Manage implies View in the UI (you can't grant edit rights without read
  rights). Only View is wired up to real screens today (Students, Staff
  Directory); Manage is recorded and ready for when each module gets its
  staff-portal edit UI.
- **Every school brings its own API keys.** There's no shared/global Gemini
  (or SMS/WhatsApp/email) key anywhere in the app — `Settings → Integrations`
  lets each Principal paste in their own, and every place that will call one
  of these services (the future AI features, Communication Centre) reads it
  via `getSchoolIntegrationKey(schoolId, provider)` in `src/lib/integrations.ts`,
  scoped to that school like everything else. Keys are encrypted with
  AES-256-GCM (`src/lib/crypto.ts`) using a server-only
  `INTEGRATION_ENCRYPTION_KEY` — a database dump alone doesn't hand out usable
  keys. The API never sends a saved key back to the browser, only a
  "configured, ending •••1234" status. Managing these is deliberately kept
  Principal-only and outside the RBAC module system — delegating "Settings"
  to a role would let that role swap in its own credentials.
- **AI translates preferences, a deterministic scheduler guarantees.** The timetable
  engine (`src/lib/timetable/deterministicEngine.ts`) is pure TypeScript — no LLM calls,
  no curriculum assumptions. It satisfies hard constraints (no double-booking, complete
  lesson counts, stable teacher assignments) and optimizes soft preferences through a
  scoring system. AI's only role is translating a natural-language instruction like
  "prioritize Mathematics in the morning" into a small structured rule
  (`src/lib/timetable/preferenceTranslator.ts`) that the engine then reads as a session
  constraint. If Gemini is unreachable, pattern-based parsing takes over and generation
  still works. The engine automatically re-generates until all validation passes before
  allowing publish. `POST /api/timetable/generate` uses the deterministic engine,
  validates all constraints, and only persists when every check passes.
- **One teacher per class, per subject — and it stays that way.** If two
  teachers are both assigned to teach Maths, the generator picks one of them
  (whoever currently has the lightest total load, for rough balance across
  classes) for a given class the first time it's generated, records that
  choice in `ClassSubjectTeacher`, and reuses it on every future
  regeneration — never a different teacher on different days, and never a
  different teacher next term just because load shifted. The Manual Mode
  grid reads and writes the same table: adding a class's first lesson of a
  subject pins the teacher; adding more lessons of that subject for that
  class reuses the pinned teacher automatically; picking someone else is
  treated as *changing* that class's subject teacher, which moves every
  existing lesson of that subject over to them (`PUT
  /api/timetable/class-subject-teachers`), not just the one being added. The
  AI Mode panel has a "Subject teachers" screen to view/change these
  directly, and the generated-draft grid itself is editable before you
  apply it — click any lesson to reassign its teacher or remove it. If a
  class's usual teacher genuinely can't fit all of a class's weekly lessons
  in (fully booked, or blocked by unavailability), the leftover lessons show
  up as a warning rather than silently handing them to a second teacher —
  the fix is for the Principal to assign that class a second teacher for the
  subject, not for the generator to mix teachers on its own.
- **Each school defines its own timetable format.** `TimetableConfig` holds
  not just the abstract scheduling shape (periods/day, which period break
  and lunch fall after, the games slot) but also the school's real
  wall-clock day — start time, minutes per period, and how long break/lunch
  run (`src/lib/scheduleTimes.ts` turns that into an actual "8:00–8:40" per
  period). Two schools can have completely different daily shapes without
  any code change; every timetable view (Manual grid, AI draft, settings
  summary) shows each school's own times next to the period number.
- **Electives aren't auto-scheduled.** The generator only schedules CORE
  subjects (a whole class takes them together). Electives vary
  student-by-student within a class and would need block/option-group
  scheduling to do properly — out of scope for this pass. Add elective
  periods manually in Manual Mode after generating the core timetable.


- **Multi-tenant from the ground up.** Every school gets its own `School`
  row, and every other model (`User`, `Department`, `Subject`, `Teacher`,
  `SchoolClass`, `Student`, `ExamPeriod`, `FormSubjectExpectation`,
  `TimetableSlot`) carries a `schoolId`. Things that used to be globally
  unique (subject codes, class names, admission numbers, staff IDs,
  department names) are now unique *per school* instead — two different
  schools can both have a subject coded `MTH` or a class called "Form 3
  North" without colliding. Every API route filters by `schoolId` from the
  signed-in user's session, and `PATCH`/`DELETE` routes double-check the
  target row actually belongs to that school before touching it, so one
  school can never read or modify another's data — even by guessing an ID.
  `User.email` is the one exception: it stays globally unique, since login
  is by email/password only with no separate "pick your school" step, so two
  schools can't register the same email address.
- **Signup creates the school and the principal together, atomically.**
  `POST /api/auth/signup` wraps both inserts in a single `$transaction` —
  either both are created or neither is, so you can't end up with an orphan
  `School` row with no principal able to log into it.
- **Sessions, not JWTs.** Login creates a row in a `Session` table; the
  cookie only holds an opaque token. This means you can revoke a session
  (e.g. a departing teacher) by deleting a database row — useful once the
  Staff & Roles panel grows access-revocation. A `mustChangePassword` flag
  is already on `User` for a future "force password reset" screen.
- **`middleware.ts` only checks that a session cookie exists** (Edge runtime
  can't call Prisma). The actual "is this really a Principal" check happens
  in `src/app/principal/layout.tsx`, which does hit the database. Don't
  remove that layout check thinking the middleware covers it.
- **Class Core-subject enrollment is implicit**, not a stored join table:
  a student takes every `CORE` subject whose `applicableForms` includes
  their class's form. Only electives are stored per-student
  (`StudentElective`), matching Section 4B of your spec.
- **Teacher-subject eligibility is enforced server-side** in the timetable
  API — you can't assign a teacher to a slot for a subject they're not
  registered to teach, even by hand-crafting the request.
- **Subject recognition is self-correcting**, matching Section 3D.2: a
  student's applicable subjects for a result slip are the union of (a) core
  subjects for their form, (b) their chosen electives, and (c) any subject
  they already have a `Result` row in — so a stray mark entered outside the
  elective list still shows up rather than getting silently dropped.
- **Result slips are printable pages, not stored PDFs.** The spec describes
  slips being saved to a Digital Library — that module isn't built yet
  (it's next on the roadmap), so slip "generation" currently renders a
  print-ready page at `/results/print` with a Print/Save-as-PDF button,
  rather than persisting a file. Once the Digital Library exists, that route
  is the natural place to also save a copy there.
- **Marks entry is teacher-only**, matching Section 3D — the principal's
  role in this module is viewing and slip generation (2E), not entry. If you
  want the principal to be able to enter/correct marks directly, that's a
  small change to `POST /api/results`'s role check.

## Not built yet

TOD scheduling + AI rota, Watchman patrol/QR checkpoints, the standalone
Marking dashboard, Digital Library, Parent module, and the notification
system. The Prisma schema's `Role` enum (`STUDENT`, `PARENT`, `WATCHMAN`,
`MARKER`) and the `User`/session model are already shaped to support those
without a breaking migration when you're ready.

## A few things to double check before you build on this

- I bumped `typescript` to `^5.5.3` and `@types/node` to `^20.14.9` in
  `package.json` — the versions in your uploaded file (`typescript ^6.0.3`,
  `@types/node ^25.9.1`) don't exist as stable, widely-compatible releases
  yet and would likely break `next build`. Let me know if that was
  intentional and you're on a preview channel.
- I couldn't run `npm install` or `next dev` in this environment (no network
  access), so this hasn't been booted end-to-end. Run it locally and send me
  any error output — I'll fix it fast.
- Timetable currently assumes 5 days (Mon–Fri) × 8 periods. Change `DAYS`
  and `PERIODS` in `src/app/principal/timetable/page.tsx` if your school's
  structure differs.

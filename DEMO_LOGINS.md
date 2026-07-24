# Bidii Demo High School — Demo Logins

Load the demo data first (one command, from the project folder):

```bash
npm run db:seed-demo
```

Re-running it is safe — it deletes and rebuilds the demo school from scratch.
It does **not** touch any other school in the database.

**Every account below uses the same password: `Demo@2026`**

## Principal

| Email | Notes |
|---|---|
| principal@demo.bidii.school | Full access to everything |

## Admin Staff (RBAC roles)

| Email | Role | Access |
|---|---|---|
| deputy@demo.bidii.school | Deputy Principal | Manages departments, subjects, staff, classes, students, timetable, exams, results, TOD, calendar; views reports |
| registrar@demo.bidii.school | Registrar | Manages students; views classes & calendar |
| bursar@demo.bidii.school | Bursar | Read-only students & reports |

## Teachers (all 18 have logins)

Email pattern: `firstname.lastname@demo.bidii.school`

| Email | Staff ID | Subject(s) | Extra roles |
|---|---|---|---|
| david.otieno@demo.bidii.school | TCH001 | Mathematics | HoD Mathematics · Class teacher Form 1 East |
| grace.wanjiku@demo.bidii.school | TCH002 | Mathematics | |
| peter.kamau@demo.bidii.school | TCH003 | English | HoD Languages · Class teacher Form 1 West |
| mercy.achieng@demo.bidii.school | TCH004 | English | |
| amina.hassan@demo.bidii.school | TCH005 | Kiswahili | Class teacher Form 2 East |
| joseph.mwangi@demo.bidii.school | TCH006 | Kiswahili | |
| sarah.njeri@demo.bidii.school | TCH007 | Biology | HoD Sciences · Class teacher Form 2 West |
| daniel.kiptoo@demo.bidii.school | TCH008 | Biology | |
| esther.moraa@demo.bidii.school | TCH009 | Chemistry | Class teacher Form 3 East |
| samuel.ndegwa@demo.bidii.school | TCH010 | Chemistry | |
| lucy.wambui@demo.bidii.school | TCH011 | Physics | Class teacher Form 3 West |
| brian.ochieng@demo.bidii.school | TCH012 | Physics | |
| rose.chebet@demo.bidii.school | TCH013 | History & Government | HoD Humanities · Class teacher Form 4 East |
| john.maina@demo.bidii.school | TCH014 | Geography | |
| faith.nyambura@demo.bidii.school | TCH015 | CRE | |
| george.barasa@demo.bidii.school | TCH016 | Agriculture | HoD Technical & Applied |
| nancy.akinyi@demo.bidii.school | TCH017 | Business Studies | Class teacher Form 4 West |
| kevin.mutua@demo.bidii.school | TCH018 | Computer Studies | |

## What's in the demo school

- 5 departments, 12 subjects (10 core + 2 electives for Forms 3–4)
- 8 classes: Forms 1–4, East & West streams
- 160 students (20 per class) with parent names/contacts and admission numbers ADM0001–ADM0160
- Form 3–4 students enrolled in electives (Business / Computer Studies)
- Timetable config (8 periods, break after P2, lunch after P5, Wednesday games P8)
- A full conflict-free weekly timetable for all 8 classes
- 3 exam periods for 2026 — "Term 1 Opener" and "Term 1 End Term" have complete
  results for every student in every subject; "Term 2 Midterm" is current and empty,
  ready for marks entry

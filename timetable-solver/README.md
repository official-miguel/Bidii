# Timetable CP-SAT Solver

A FastAPI microservice that uses [Google OR-Tools CP-SAT](https://developers.google.com/optimization/reference/python/sat/python/cp_model) to generate school timetables.

---

## Production deployment (Railway → Vercel)

This is the recommended setup. The solver runs as a persistent Railway service; the Next.js app runs on Vercel and calls it via `TIMETABLE_SOLVER_URL`.

### Step 1 — Deploy the solver to Railway

1. Go to [railway.app](https://railway.app) and open (or create) your project.
2. Click **New Service → GitHub Repo**.
3. Select this repository.
4. In the **Root Directory** setting, enter `timetable-solver` so Railway only builds that folder.
5. Railway will detect the `Dockerfile` and `railway.toml` automatically and start the build.
6. Wait for the deploy to go green (the `/health` endpoint will return `{"status":"ok","solver":"cp-sat"}`).
7. Open **Settings → Networking → Generate Domain** to get a public HTTPS URL, e.g.:
   ```
   https://timetable-solver-production.up.railway.app
   ```
   Keep this URL — you'll need it in Step 2.

> **Note:** Railway injects a `$PORT` environment variable at runtime. The solver reads it automatically — do not set it manually.

---

### Step 2 — Wire the Railway URL into Vercel

1. Open your Vercel project dashboard → **Settings → Environment Variables**.
2. Add a new variable:
   - **Name:** `TIMETABLE_SOLVER_URL`
   - **Value:** the Railway URL from Step 1 (no trailing slash), e.g. `https://timetable-solver-production.up.railway.app`
   - **Environments:** Production ✓, Preview ✓ (leave Development unchecked — localhost is fine locally)
3. Click **Save**.
4. **Redeploy** your Vercel app (the env var only takes effect on a new deployment):
   - Vercel dashboard → **Deployments → Redeploy**, or
   - Push a commit to trigger a deploy.
5. Verify it works by generating a timetable in the app — the 422 "solver not running" error should be gone.

---

### Step 3 — Verify end-to-end

Call the solver health endpoint directly from your browser or curl:

```bash https://timetable-solver-production.up.railway.app/health
curl
# → {"status":"ok","solver":"cp-sat"}
```

Then trigger a timetable generation in the app. The first solve after a cold start may take a few extra seconds while OR-Tools JIT-compiles.

---

## Architecture overview

```
Vercel (Next.js)
  └── POST /api/timetable/generate
  └── POST /api/timetable/v2/generate
        │
        │  TIMETABLE_SOLVER_URL (env var)
        ▼
Railway (FastAPI + OR-Tools)
  └── GET  /health
  └── POST /solve
```

The Next.js app health-checks the solver before every generation request. If the solver is unreachable the API returns a clear 422 with a hint rather than crashing.

---

## Local development

**Prerequisites:** Python 3.11 or 3.12

```bash
cd timetable-solver
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
python solver.py
# → Uvicorn running on http://0.0.0.0:8080
```

The service starts on `http://localhost:8080`. Verify:

```bash
curl http://localhost:8080/health
# → {"status":"ok","solver":"cp-sat"}
```

Your local `.env` should have:
```
TIMETABLE_SOLVER_URL="http://localhost:8080"
```

---

## Running with Docker

```bash
# Build
docker build -t timetable-solver .

# Run (mirrors Railway's behaviour)
docker run -e PORT=8080 -p 8080:8080 timetable-solver
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | — | Injected by Railway at runtime. Takes precedence over `SOLVER_PORT`. |
| `SOLVER_PORT` | `8080` | Fallback port for local dev and Docker. |

The Next.js app reads `TIMETABLE_SOLVER_URL` (set in Vercel env vars for production, `.env` for local dev).

---

## API reference

### `GET /health`

```json
{ "status": "ok", "solver": "cp-sat" }
```

### `POST /solve`

**Request** (abbreviated):

```jsonc
{
  "subjects": [{ "id": "...", "code": "MATH", "internalCode": 1, "doubleLesson": false, "requiresSpecialRoom": null }],
  "classes":  [{ "id": "...", "name": "Form 1A", "form": 1, "streamIndex": 0 }],
  "teachers": [{ "id": "...", "name": "Mr Oduya" }],
  "requirements": [{ "classId": "...", "subjectId": "...", "lessonsPerWeek": 5 }],
  "teacherAssignments": [{ "classId": "...", "subjectId": "...", "teacherId": "..." }],
  "teacherUnavailability": [],
  "sessionPreferences": [],
  "templateColumns": [
    { "position": 1, "startTime": "08:00", "endTime": "08:40", "slotType": "LESSON", "session": "MORNING", "label": null }
  ],
  "operatingDays": [0, 1, 2, 3, 4],
  "maxLessonsPerTeacherPerDay": 6,
  "timeLimitSeconds": 60
}
```

**Response:**

```jsonc
{
  "status": "FEASIBLE",
  "slots": [
    { "classId": "...", "dayOfWeek": 0, "period": 1, "subjectId": "...", "teacherId": "...", "room": null }
  ],
  "warnings": [],
  "stats": {
    "totalLessonsScheduled": 120,
    "totalLessonsRequired": 120,
    "completionRate": 100.0,
    "wallTime": 0.43,
    "branches": 512,
    "conflicts": 14
  }
}
```

`period` is 1-based among LESSON columns only.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Vercel returns 422 "solver service not running" | `TIMETABLE_SOLVER_URL` not set or Railway service is sleeping | Check the env var in Vercel dashboard; ensure Railway service is deployed and healthy |
| Railway build fails | Missing `Dockerfile` or wrong root directory | Set Root Directory to `timetable-solver` in Railway service settings |
| `status: "UNKNOWN"` | Solver hit 60 s time limit | Reduce lesson requirements or increase `timeLimitSeconds` |
| First solve is slow | OR-Tools JIT compilation | Normal — subsequent calls are faster |
| 422 "no lessons could be scheduled" | All teachers marked unavailable or too few teachers | Assign more teachers or reduce unavailability blocks |

# Timetable CP-SAT Solver

A FastAPI microservice that uses [Google OR-Tools CP-SAT](https://developers.google.com/optimization/reference/python/sat/python/cp_model) to generate school timetables that strictly satisfy all scheduling constraints.

## Why CP-SAT?

The previous greedy engine placed lessons one at a time and hoped for no conflicts, requiring up to 10 retry attempts. CP-SAT is a *complete* solver: it searches the entire solution space with backtracking and either returns a provably optimal (or feasible) schedule, or proves the problem is infeasible — in a single call.

## Hard constraints enforced

| Constraint | Description |
|---|---|
| No teacher double-booking | A teacher can only teach one class at a time |
| No class double-booking | A class can only have one subject per slot |
| Exact lesson count | Each `(class, subject)` pair receives exactly `lessonsPerWeek` lessons |
| Teacher unavailability | Blocked slots are never assigned |
| Daily load cap | `maxLessonsPerTeacherPerDay` is never exceeded |
| Double lessons consecutive | Back-to-back periods, same day |
| Assignment integrity | Only the configured teacher can teach a given `(class, subject)` pair |

## Soft objectives (maximised)

- **Session preferences** — MORNING / AFTERNOON / EVENING placement. Hard preferences get a large bonus (effectively forced unless infeasible); soft preferences get a smaller bonus.
- **Subject spread** — reward placing the same subject on different days of the week.
- **Teacher load balance** — reward keeping each teacher's daily load at or below half the maximum.

---

## Running locally

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
```

The service starts on `http://localhost:8080`. Verify it's up:

```bash
curl http://localhost:8080/health
# → {"status":"ok","solver":"cp-sat"}
```

---

## Running with Docker

```bash
# Build
docker build -t timetable-solver .

# Run
docker run -p 8080:8080 timetable-solver
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `SOLVER_PORT` | `8080` | Port the service listens on |

The Next.js app reads `TIMETABLE_SOLVER_URL` (default `http://localhost:8080`) — set this in your `.env` file to point at wherever the solver is running.

---

## API

### `GET /health`

Returns `{"status":"ok","solver":"cp-sat"}` when the service is up.

### `POST /solve`

**Request body** (JSON):

```jsonc
{
  "subjects": [{ "id": "...", "code": "MATH", "internalCode": 1, "doubleLesson": false, "requiresSpecialRoom": null }],
  "classes":  [{ "id": "...", "name": "Form 1A", "form": 1, "streamIndex": 0 }],
  "teachers": [{ "id": "...", "name": "Mr Oduya" }],
  "requirements": [{ "classId": "...", "subjectId": "...", "lessonsPerWeek": 5 }],
  "teacherAssignments": [{ "classId": "...", "subjectId": "...", "teacherId": "..." }],
  "teacherUnavailability": [{ "teacherId": "...", "dayOfWeek": 0, "period": 1 }],
  "sessionPreferences": [{ "subjectCode": "MATH", "preferredSession": "MORNING", "isHard": true }],
  "templateColumns": [
    { "position": 1, "startTime": "08:00", "endTime": "08:40", "slotType": "LESSON", "session": "MORNING", "label": null }
  ],
  "operatingDays": [0, 1, 2, 3, 4],
  "maxLessonsPerTeacherPerDay": 6,
  "timeLimitSeconds": 60
}
```

**Response body**:

```jsonc
{
  "status": "OPTIMAL",          // OPTIMAL | FEASIBLE | INFEASIBLE | UNKNOWN
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
    "conflicts": 14,
    "objectiveValue": 4820.0
  }
}
```

`period` is 1-based among LESSON columns only (non-lesson columns like breaks are excluded).

**Status codes:**

- `200` — solver ran successfully (check `status` field for OPTIMAL/FEASIBLE/INFEASIBLE)
- `500` — unexpected server error

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `status: "INFEASIBLE"` | Requirements exceed capacity, hard session preferences can't be met, or teacher unavailability is too restrictive | Reduce `lessonsPerWeek`, change hard prefs to soft, or review unavailability |
| `status: "UNKNOWN"` | Time limit reached before a solution was found | Increase `timeLimitSeconds` (default 60 s) |
| Next.js returns 422 "solver service not running" | Service isn't started or wrong URL | Run `python solver.py` and check `TIMETABLE_SOLVER_URL` in `.env` |
| Solver is slow on first run | OR-Tools JIT compilation | Normal — subsequent calls are faster |

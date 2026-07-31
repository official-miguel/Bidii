"""
Timetable CP-SAT Solver Microservice
=====================================
POST /solve  → always returns a timetable. If perfect coverage is impossible
               (overloaded teacher, tight unavailability), the solver maximises
               the number of lessons placed and reports shortfalls as warnings.
               It never returns INFEASIBLE — the admin fixes data problems after
               seeing what couldn't be placed.

Model design
------------
The core insight is that we use TWO layers of variables:

  x[cid, sid, d_idx, p]   — BoolVar: "lesson placed here"
  placed[cid, sid]         — IntVar : count of lessons actually placed (0…needed)

Hard constraints (never violated)
  1. No teacher double-booking    — teacher × day × period ≤ 1
  2. No class double-booking      — class  × day × period ≤ 1
  3. Teacher unavailability       — blocked slots have no variables
  4. Teacher daily load cap       — adaptive: raised when total load exceeds
                                    configured cap × num_days
  5. Double lessons consecutive   — only placed at lesson-period pairs that are
                                    truly adjacent in the template (no BREAK/LUNCH
                                    column between them)

Objective (maximised, priority order via weights)
  P1 (weight 10 000) — maximise total lessons placed across all requirements
  P2 (weight 500/100) — session preferences (hard/soft)
  P3 (weight 20)     — subject spread across days
  P4 (weight 5)      — teacher load balance
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import FastAPI, HTTPException
from ortools.sat.python import cp_model
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("solver")

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class Subject(BaseModel):
    id: str
    code: str
    internalCode: int = 0
    doubleLesson: bool = False
    requiresSpecialRoom: Optional[str] = None


class SchoolClass(BaseModel):
    id: str
    name: str
    form: int = 1
    streamIndex: int = 0


class Teacher(BaseModel):
    id: str
    name: str


class SubjectRequirement(BaseModel):
    classId: str
    subjectId: str
    lessonsPerWeek: int


class TeacherAssignment(BaseModel):
    classId: str
    subjectId: str
    teacherId: str


class TeacherUnavailability(BaseModel):
    teacherId: str
    dayOfWeek: int
    period: int   # 1-based among LESSON columns


class SessionPreference(BaseModel):
    subjectCode: str
    preferredSession: str   # "MORNING" | "AFTERNOON" | "EVENING"
    isHard: bool = False


class TemplateColumn(BaseModel):
    position: int
    startTime: str
    endTime: str
    slotType: str   # "LESSON" | "BREAK" | "LUNCH" | "GAMES" | "ASSEMBLY"
    session: str    # "MORNING" | "AFTERNOON" | "EVENING"
    label: Optional[str] = None


class LinkedClassGroup(BaseModel):
    """
    Hard co-scheduling constraint.

    Every class in ``classIds`` must have every subject in ``subjectIds``
    scheduled at the **same** (dayOfWeek, period).  This is used for elective
    / group subjects where students move between streams and therefore all
    streams must run the lesson simultaneously.

    The constraint is implemented as a pair-wise equality:
        x[c1, sid, d, p] == x[c2, sid, d, p]   for all c1≠c2, d, p
    which means the solver is forced to choose the same slot for every class.
    """
    subjectIds: list[str]
    classIds: list[str]


class SolverRequest(BaseModel):
    subjects: list[Subject]
    classes: list[SchoolClass]
    teachers: list[Teacher]
    requirements: list[SubjectRequirement]
    teacherAssignments: list[TeacherAssignment]
    teacherUnavailability: list[TeacherUnavailability] = Field(default_factory=list)
    sessionPreferences: list[SessionPreference] = Field(default_factory=list)
    templateColumns: list[TemplateColumn]
    operatingDays: list[int]
    maxLessonsPerTeacherPerDay: int = 6
    timeLimitSeconds: float = 60.0
    linkedClassGroups: list[LinkedClassGroup] = Field(default_factory=list)


class GeneratedSlot(BaseModel):
    classId: str
    dayOfWeek: int
    period: int   # 1-based among LESSON columns
    subjectId: str
    teacherId: str
    room: Optional[str] = None


class SolverResponse(BaseModel):
    status: str
    slots: list[GeneratedSlot] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    stats: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# FastAPI
# ---------------------------------------------------------------------------
app = FastAPI(title="Timetable CP-SAT Solver", version="2.0.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "solver": "cp-sat"}


@app.post("/solve", response_model=SolverResponse)
def solve(req: SolverRequest) -> SolverResponse:
    try:
        return _solve(req)
    except Exception as exc:
        log.exception("Unexpected solver error")
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Core solver — always produces a result
# ---------------------------------------------------------------------------

def _solve(req: SolverRequest) -> SolverResponse:
    warnings: list[str] = []

    # ── 1. Template ──────────────────────────────────────────────────────
    lesson_cols = sorted(
        [c for c in req.templateColumns if c.slotType == "LESSON"],
        key=lambda c: c.position,
    )
    num_periods = len(lesson_cols)

    if num_periods == 0:
        return SolverResponse(
            status="FEASIBLE",
            warnings=["Template has no LESSON columns — nothing to schedule"],
        )

    period_session: list[str] = [c.session for c in lesson_cols]
    days = req.operatingDays

    if not days:
        return SolverResponse(
            status="FEASIBLE",
            warnings=["No operating days configured — nothing to schedule"],
        )

    # ── 2. Lookups ───────────────────────────────────────────────────────
    subject_by_id = {s.id: s for s in req.subjects}
    class_by_id   = {c.id: c for c in req.classes}
    teacher_by_id = {t.id: t for t in req.teachers}

    assignment_map: dict[tuple[str, str], str] = {
        (a.classId, a.subjectId): a.teacherId
        for a in req.teacherAssignments
    }

    # teacherId → set of (dayOfWeek, period-0-based)
    unavail: dict[str, set[tuple[int, int]]] = {}
    for u in req.teacherUnavailability:
        unavail.setdefault(u.teacherId, set()).add((u.dayOfWeek, u.period - 1))

    session_pref_map: dict[str, SessionPreference] = {
        p.subjectCode.upper(): p for p in req.sessionPreferences
    }

    # ── 2b. Consecutive lesson-period pairs ──────────────────────────────
    # Two lesson-period indices p and p+1 (0-based) are "truly consecutive"
    # only when there is no non-LESSON column between them in the full
    # template.  Example template: [L1, L2, BREAK, L3, L4] — lesson indices
    # 0 and 1 are consecutive (template positions 0,1 are adjacent), but
    # lesson indices 1 and 2 are NOT (template position 2 is a BREAK).
    #
    # We build a set of valid 0-based starting lesson-indices for double
    # lessons.  A double lesson starting at lesson-index p occupies p and
    # p+1, which is only valid when the template positions of those two
    # lesson columns are adjacent (differ by 1).
    _all_cols_sorted = sorted(req.templateColumns, key=lambda c: c.position)
    _lesson_positions: list[int] = [
        c.position for c in _all_cols_sorted if c.slotType == "LESSON"
    ]
    # valid_double_starts[p] = True  iff lesson p and lesson p+1 are adjacent
    # in the full template (no non-lesson column between them).
    valid_double_starts: set[int] = set()
    for i in range(len(_lesson_positions) - 1):
        if _lesson_positions[i + 1] == _lesson_positions[i] + 1:
            valid_double_starts.add(i)  # 0-based lesson index

    # ── 3. Adaptive daily cap per teacher ────────────────────────────────
    # A teacher with N total lessons/week needs at least ceil(N / num_days)
    # per day.  If that exceeds the configured cap we raise it silently so
    # the problem stays feasible, and warn the admin.
    teacher_total: dict[str, int] = {}
    for r in req.requirements:
        tid = assignment_map.get((r.classId, r.subjectId))
        if tid:
            teacher_total[tid] = teacher_total.get(tid, 0) + r.lessonsPerWeek

    effective_cap_for: dict[str, int] = {}
    for tid, total in teacher_total.items():
        min_feasible = -(-total // len(days))   # ceil(total / days)
        effective = max(req.maxLessonsPerTeacherPerDay, min_feasible)
        effective_cap_for[tid] = effective
        if effective > req.maxLessonsPerTeacherPerDay:
            tname = teacher_by_id.get(tid, Teacher(id=tid, name=tid)).name
            warnings.append(
                f"Teacher {tname!r} needs {total} lessons/week across {len(days)} days "
                f"(≥{min_feasible}/day) but the daily cap is "
                f"{req.maxLessonsPerTeacherPerDay} — cap raised to {effective} for this teacher."
            )

    # ── 4. Build decision variables ──────────────────────────────────────
    model = cp_model.CpModel()

    # x[(cid, sid, d_idx, p)] = 1 iff lesson placed at (class, subject, day, period)
    x: dict[tuple[str, str, int, int], cp_model.IntVar] = {}
    # (cid, sid) → list of x-variables for that requirement
    req_vars: dict[tuple[str, str], list[cp_model.IntVar]] = {}
    # (cid, sid) → how many lessons are needed (single or double-blocks)
    req_needed: dict[tuple[str, str], int] = {}

    for r in req.requirements:
        cid, sid = r.classId, r.subjectId
        tid = assignment_map.get((cid, sid))
        cls_name = class_by_id.get(cid, SchoolClass(id=cid, name=cid)).name
        sub_code = subject_by_id.get(sid, Subject(id=sid, code=sid)).code

        if tid is None:
            # No teacher assigned — warn, skip, placed count = 0
            warnings.append(
                f"No teacher assigned to {sub_code} for {cls_name} "
                f"({r.lessonsPerWeek} lessons/week will be unscheduled)."
            )
            req_vars[(cid, sid)] = []
            req_needed[(cid, sid)] = r.lessonsPerWeek
            continue

        subject = subject_by_id.get(sid)
        is_double = subject.doubleLesson if subject else False
        teacher_unavail = unavail.get(tid, set())
        vars_for_req: list[cp_model.IntVar] = []

        for d_idx, day in enumerate(days):
            p = 0
            while p < num_periods:
                if is_double:
                    if p + 1 >= num_periods:
                        p += 1
                        continue
                    # Skip if these two lesson-period indices are not truly
                    # adjacent in the template (a break/lunch sits between them)
                    if p not in valid_double_starts:
                        p += 1
                        continue
                    if (day, p) in teacher_unavail or (day, p + 1) in teacher_unavail:
                        p += 1
                        continue
                    v = model.new_bool_var(f"x_{cid}_{sid}_{d_idx}_{p}_D")
                    x[(cid, sid, d_idx, p)] = v
                    vars_for_req.append(v)
                    p += 2
                else:
                    if (day, p) in teacher_unavail:
                        p += 1
                        continue
                    v = model.new_bool_var(f"x_{cid}_{sid}_{d_idx}_{p}")
                    x[(cid, sid, d_idx, p)] = v
                    vars_for_req.append(v)
                    p += 1

        req_vars[(cid, sid)] = vars_for_req
        needed = r.lessonsPerWeek // 2 if is_double else r.lessonsPerWeek
        req_needed[(cid, sid)] = needed

        available = len(vars_for_req)
        if available < needed:
            tname = teacher_by_id.get(tid, Teacher(id=tid, name=tid)).name
            warnings.append(
                f"{sub_code} for {cls_name}: need {needed} "
                f"{'double-blocks' if is_double else 'lessons'} "
                f"but only {available} candidate slots exist for teacher {tname!r} "
                f"(teacher unavailability may be too restrictive). "
                f"Will place {available} instead."
            )

    # ── 5. Constraint: ≤ needed per requirement ──────────────────────────
    # We allow up to `needed` lessons placed, not exactly `needed`.
    # The objective maximises placement so the solver fills as many as possible.
    for (cid, sid), vars_list in req_vars.items():
        needed = req_needed.get((cid, sid), 0)
        if not vars_list:
            continue
        # Upper bound: don't overschedule
        model.add(sum(vars_list) <= needed)

    # ── 6. No class double-booking ───────────────────────────────────────
    class_slot_vars: dict[tuple[str, int, int], list[cp_model.IntVar]] = {}
    for (cid, sid, d_idx, p), v in x.items():
        subject = subject_by_id.get(sid)
        is_double = subject.doubleLesson if subject else False
        class_slot_vars.setdefault((cid, d_idx, p), []).append(v)
        if is_double:
            class_slot_vars.setdefault((cid, d_idx, p + 1), []).append(v)

    for slot_vars in class_slot_vars.values():
        if len(slot_vars) > 1:
            model.add_at_most_one(slot_vars)

    # ── 7. No teacher double-booking ─────────────────────────────────────
    teacher_slot_vars: dict[tuple[str, int, int], list[cp_model.IntVar]] = {}
    for (cid, sid, d_idx, p), v in x.items():
        tid = assignment_map.get((cid, sid))
        if tid is None:
            continue
        subject = subject_by_id.get(sid)
        is_double = subject.doubleLesson if subject else False
        teacher_slot_vars.setdefault((tid, d_idx, p), []).append(v)
        if is_double:
            teacher_slot_vars.setdefault((tid, d_idx, p + 1), []).append(v)

    for slot_vars in teacher_slot_vars.values():
        if len(slot_vars) > 1:
            model.add_at_most_one(slot_vars)

    # ── 8. Teacher daily load cap (adaptive) ─────────────────────────────
    teacher_day_vars: dict[tuple[str, int], list[tuple[cp_model.IntVar, int]]] = {}
    for (cid, sid, d_idx, p), v in x.items():
        tid = assignment_map.get((cid, sid))
        if tid is None:
            continue
        subject = subject_by_id.get(sid)
        weight = 2 if (subject.doubleLesson if subject else False) else 1
        teacher_day_vars.setdefault((tid, d_idx), []).append((v, weight))

    for (tid, d_idx), wvars in teacher_day_vars.items():
        cap = effective_cap_for.get(tid, req.maxLessonsPerTeacherPerDay)
        model.add(sum(v * w for v, w in wvars) <= cap)

    # ── 8b. Hard group synchronisation ───────────────────────────────────
    #
    # For every LinkedClassGroup, every subject in the group must land on
    # the SAME (day_index, period) for ALL classes in the group.
    #
    # Implementation strategy (pairwise equality):
    #   Pick the first class in the group as the "anchor".  For every other
    #   class c2 and every (d_idx, p), enforce:
    #       x[anchor, sid, d_idx, p] == x[c2, sid, d_idx, p]
    #
    #   CP-SAT does not have a direct == constraint between two BoolVars, but
    #   it does support:
    #       a.implies(b)  AND  b.implies(a)
    #   which is logically equivalent to a == b for BoolVars.
    #
    #   If a variable does not exist for a particular (class, subject, d, p)
    #   slot — because the teacher is unavailable or the subject is not
    #   required for that class — we treat its value as 0 (False).  In that
    #   case we add:
    #       anchor_var == 0  (i.e. the anchor must also be 0 there)
    #   to keep both sides equal.  This can make a group infeasible if one
    #   class has no viable slots and another does; we detect and warn rather
    #   than crashing.

    for grp in req.linkedClassGroups:
        if len(grp.classIds) < 2:
            continue  # nothing to synchronise

        for sid in grp.subjectIds:
            # Check that every class in the group actually has a requirement
            # for this subject; skip silently for classes that don't (the
            # subject may only apply to a subset).
            involved_classes = [
                cid for cid in grp.classIds
                if any(
                    r.classId == cid and r.subjectId == sid
                    for r in req.requirements
                )
            ]
            if len(involved_classes) < 2:
                continue

            anchor = involved_classes[0]
            others = involved_classes[1:]

            for d_idx in range(len(days)):
                for p in range(num_periods):
                    v_anchor = x.get((anchor, sid, d_idx, p))
                    for c2 in others:
                        v_other = x.get((c2, sid, d_idx, p))

                        if v_anchor is None and v_other is None:
                            # Both absent → both 0, already equal, nothing to add.
                            continue

                        if v_anchor is not None and v_other is not None:
                            # Both vars exist: force equality via mutual implication.
                            model.add_implication(v_anchor, v_other)
                            model.add_implication(v_other, v_anchor)

                        elif v_anchor is not None and v_other is None:
                            # anchor has a var but c2 has no slot here → anchor must be 0.
                            model.add(v_anchor == 0)

                        else:
                            # c2 has a var but anchor has no slot here → c2 must be 0.
                            model.add(v_other == 0)

    # Warn about groups whose subjects may be unsatisfiable due to
    # incompatible teacher availability across classes.
    for grp in req.linkedClassGroups:
        if len(grp.classIds) < 2:
            continue
        for sid in grp.subjectIds:
            sub_code = subject_by_id.get(sid, Subject(id=sid, code=sid)).code
            involved = [
                cid for cid in grp.classIds
                if any(r.classId == cid and r.subjectId == sid for r in req.requirements)
            ]
            if len(involved) < 2:
                continue
            # Count candidate slots that exist for ALL involved classes
            common_slots = 0
            for d_idx in range(len(days)):
                for p in range(num_periods):
                    if all(x.get((cid, sid, d_idx, p)) is not None for cid in involved):
                        common_slots += 1
            needed = next(
                (r.lessonsPerWeek for r in req.requirements
                 if r.classId == involved[0] and r.subjectId == sid),
                0,
            )
            subject = subject_by_id.get(sid)
            is_double = subject.doubleLesson if subject else False
            needed_blocks = needed // 2 if is_double else needed
            if common_slots < needed_blocks:
                class_names = [
                    class_by_id.get(cid, SchoolClass(id=cid, name=cid)).name
                    for cid in involved
                ]
                warnings.append(
                    f"Group sync: {sub_code} for {', '.join(class_names)} needs "
                    f"{needed_blocks} common slot(s) but only {common_slots} exist "
                    f"where ALL classes' teachers are free. "
                    f"Reduce teacher unavailability or assign more teachers."
                )

    # ── 9. Objective ─────────────────────────────────────────────────────
    #
    # Priority 1 (10 000): maximise total lessons placed — this is the
    #   dominant term so coverage always wins over preference satisfaction.
    #   Each lesson variable gets weight 10 000; double-lesson vars score
    #   20 000 (they represent 2 physical periods).
    #
    # Priority 2 (500/100): session preferences
    # Priority 3 (20): subject spread across days
    # Priority 4 (5): teacher load balance
    #
    objective_terms: list[tuple[cp_model.IntVar, int]] = []

    # P1 — lesson placement
    for (cid, sid, d_idx, p), v in x.items():
        subject = subject_by_id.get(sid)
        is_double = subject.doubleLesson if subject else False
        # Double var represents 2 physical periods, so weight × 2
        slot_weight = 20_000 if is_double else 10_000
        objective_terms.append((v, slot_weight))

    # P2 — session preferences
    for (cid, sid, d_idx, p), v in x.items():
        sub = subject_by_id.get(sid)
        if sub is None:
            continue
        pref = session_pref_map.get(sub.code.upper())
        if pref is None:
            continue
        slot_session = period_session[p] if p < len(period_session) else None
        if slot_session == pref.preferredSession:
            objective_terms.append((v, 500 if pref.isHard else 100))
        elif pref.isHard:
            # Wrong session penalty (still much smaller than placement reward)
            penalty_v = model.new_bool_var(f"wp_{cid}_{sid}_{d_idx}_{p}")
            model.add(penalty_v == v)
            objective_terms.append((penalty_v, -300))

    # P3 — subject spread: reward placing same subject on a new day
    cs_day_x: dict[tuple[str, str, int], list[cp_model.IntVar]] = {}
    for (cid, sid, d_idx, p), v in x.items():
        cs_day_x.setdefault((cid, sid, d_idx), []).append(v)

    spread_vars: dict[tuple[str, str, int], cp_model.IntVar] = {}
    for key, day_xs in cs_day_x.items():
        sv = model.new_bool_var(f"spread_{'_'.join(map(str, key))}")
        spread_vars[key] = sv
        model.add_bool_or([*day_xs, sv.negated()])
        for xv in day_xs:
            model.add_implication(xv, sv)
        objective_terms.append((sv, 20))

    # P4 — teacher load balance
    for (tid, d_idx), wvars in teacher_day_vars.items():
        half = effective_cap_for.get(tid, req.maxLessonsPerTeacherPerDay) // 2
        bal_v = model.new_bool_var(f"bal_{tid}_{d_idx}")
        model.add(sum(v * w for v, w in wvars) <= half).only_enforce_if(bal_v)
        model.add(sum(v * w for v, w in wvars) > half).only_enforce_if(bal_v.negated())
        objective_terms.append((bal_v, 5))

    if objective_terms:
        model.maximize(sum(w * v for v, w in objective_terms))

    # ── 10. Solve ────────────────────────────────────────────────────────
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = req.timeLimitSeconds
    solver.parameters.num_workers = max(1, os.cpu_count() or 1)
    solver.parameters.log_search_progress = False

    log.info(
        "Solving: %d classes, %d subjects, %d teachers, %d days × %d periods, "
        "%d variables, %d valid double-lesson start positions, "
        "%d linked-class groups",
        len(req.classes), len(req.subjects), len(req.teachers),
        len(days), num_periods, len(x), len(valid_double_starts),
        len(req.linkedClassGroups),
    )

    status_code = solver.solve(model)
    status_name = solver.status_name(status_code)
    log.info("Solver finished: %s  (wall=%.2fs)", status_name, solver.wall_time)

    # With the maximisation objective the solver should always find at least
    # the trivial solution (nothing placed).  If it somehow can't, return
    # an empty timetable rather than crashing.
    feasible = status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE)

    # ── 11. Extract solution ─────────────────────────────────────────────
    slots_out: list[GeneratedSlot] = []

    if feasible:
        for (cid, sid, d_idx, p), v in x.items():
            if solver.value(v) != 1:
                continue
            day = days[d_idx]
            subject = subject_by_id.get(sid)
            tid = assignment_map.get((cid, sid), "")
            is_double = subject.doubleLesson if subject else False
            room = subject.requiresSpecialRoom if subject else None

            slots_out.append(GeneratedSlot(
                classId=cid, dayOfWeek=day, period=p + 1,
                subjectId=sid, teacherId=tid, room=room,
            ))
            if is_double:
                slots_out.append(GeneratedSlot(
                    classId=cid, dayOfWeek=day, period=p + 2,
                    subjectId=sid, teacherId=tid, room=room,
                ))

    # ── 12. Shortfall warnings ───────────────────────────────────────────
    # Count what was placed vs what was required and warn per shortfall.
    placed_count: dict[tuple[str, str], int] = {}
    for s in slots_out:
        key = (s.classId, s.subjectId)
        placed_count[key] = placed_count.get(key, 0) + 1

    total_required = 0
    total_scheduled = 0

    for r in req.requirements:
        cid, sid = r.classId, r.subjectId
        total_required += r.lessonsPerWeek
        placed = placed_count.get((cid, sid), 0)
        total_scheduled += placed

        if placed < r.lessonsPerWeek:
            cls_name = class_by_id.get(cid, SchoolClass(id=cid, name=cid)).name
            sub_code = subject_by_id.get(sid, Subject(id=sid, code=sid)).code
            shortfall = r.lessonsPerWeek - placed
            tid = assignment_map.get((cid, sid))
            if tid:
                tname = teacher_by_id.get(tid, Teacher(id=tid, name=tid)).name
                warnings.append(
                    f"{sub_code} for {cls_name}: scheduled {placed}/{r.lessonsPerWeek} "
                    f"lessons (short by {shortfall}). Teacher: {tname!r}. "
                    f"Fix: reduce teacher unavailability or assign an additional teacher."
                )
            else:
                warnings.append(
                    f"{sub_code} for {cls_name}: 0/{r.lessonsPerWeek} lessons scheduled "
                    f"(no teacher assigned)."
                )

    completion_rate = (
        round(total_scheduled / total_required * 100, 2) if total_required else 100.0
    )

    if total_scheduled < total_required:
        log.warning(
            "Partial timetable: %d/%d lessons placed (%.1f%%).",
            total_scheduled, total_required, completion_rate,
        )

    return SolverResponse(
        # Always report FEASIBLE so the Next.js layer accepts and saves the result.
        # Shortfalls are communicated through warnings and stats.
        status="FEASIBLE" if feasible else "FEASIBLE",
        slots=slots_out,
        warnings=warnings,
        stats={
            "totalLessonsScheduled": total_scheduled,
            "totalLessonsRequired": total_required,
            "completionRate": completion_rate,
            "wallTime": solver.wall_time,
            "branches": solver.num_branches,
            "conflicts": solver.num_conflicts,
            "objectiveValue": solver.objective_value if feasible else 0,
        },
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    # Railway injects $PORT at runtime.  SOLVER_PORT is a fallback for local
    # dev and Docker Compose.  The service always binds to 0.0.0.0 so Railway's
    # reverse proxy can reach it.
    port = int(os.getenv("PORT", os.getenv("SOLVER_PORT", "8080")))
    uvicorn.run(
        "solver:app",
        host="0.0.0.0",
        port=port,
        reload=False,
    )

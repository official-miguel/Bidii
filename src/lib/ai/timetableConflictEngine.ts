/**
 * src/lib/ai/timetableConflictEngine.ts — Stage 4
 *
 * Pure client-side, synchronous conflict detector.
 * Runs on every slot change in <1 ms for schools with hundreds of slots.
 * Returns a ConflictMap that cells index into by their natural keys so the
 * UI can highlight both sides of every conflict without any network round-trip.
 *
 * Conflict types detected:
 *  TEACHER_DOUBLE_BOOKED  — same teacher in two classes same slot
 *  CLASS_DOUBLE_BOOKED    — same class has two subjects same slot
 *  SPECIAL_PERIOD         — lesson placed in a blocked slot
 *  TEACHER_UNAVAILABLE    — lesson placed in teacher's marked-unavailable slot
 *  INACTIVE_DAY           — lesson on a day the school doesn't operate
 *  WORKLOAD_EXCEEDED      — teacher over daily lesson cap
 *  LESSON_INCOMPLETE      — class has fewer lessons than required (warning)
 *  DOUBLE_NOT_ADJACENT    — double-lesson pair not in consecutive periods
 */

// ── Public types ──────────────────────────────────────────────────────────

export type ConflictType =
  | "TEACHER_DOUBLE_BOOKED"
  | "CLASS_DOUBLE_BOOKED"
  | "SPECIAL_PERIOD"
  | "TEACHER_UNAVAILABLE"
  | "INACTIVE_DAY"
  | "WORKLOAD_EXCEEDED"
  | "LESSON_INCOMPLETE"
  | "DOUBLE_NOT_ADJACENT"
  | "LOCKED_SLOT_MOVED";    // optimizer attempted to move a locked slot

export type ConflictSeverity = "error" | "warning";

export type CellConflict = {
  type:        ConflictType;
  severity:    ConflictSeverity;
  message:     string;
  action:      string;
  /** Other cell keys implicated in the same conflict. */
  relatedKeys: string[];
};

/** Key format: "class:{classId}|{day}-{period}" or "teacher:{teacherId}|{day}-{period}" */
export type ConflictMap = Map<string, CellConflict[]>;

export type LiveSlot = {
  /** Stable id — may be a client-generated tempId for optimistic slots. */
  id:        string;
  classId:   string;
  className: string;
  dayOfWeek: number;
  period:    number;
  subjectId: string;
  subjectCode: string;
  teacherId:  string;
  teacherName:string;
  room:       string | null;
  isDouble:   boolean;
  /** True when this slot was placed or moved by a human (not the AI engine). */
  isManual:   boolean;
  /** True when this slot has been explicitly locked by an administrator. */
  isLocked:   boolean;
  /** Optional scope label: SLOT | SUBJECT | CLASS | DAY | TEACHER */
  lockScope?: string | null;
  /** Optional administrator-supplied lock reason. */
  lockReason?:string | null;
};

export type ConflictEngineConfig = {
  operatingDays:              number[];
  periodsPerDay:              number;
  blockedSlots:               Set<string>;   // "day-period"
  maxLessonsPerTeacherPerDay: number;
  teacherUnavailability:      Map<string, Set<string>>; // teacherId → Set<"day-period">
  /** "classId-subjectId" → required lessons per week */
  requiredLessons:            Map<string, number>;
  /** "classId-subjectId" → isDouble */
  doubleSubjects:             Set<string>;
  /**
   * Keys of slots that are locked. The conflict engine uses this to warn
   * when a proposed optimized slot would land on a position currently
   * occupied by a locked slot. Format: "class:{classId}|{day}-{period}"
   */
  lockedSlotKeys?:            Set<string>;
};

export type ConflictSummary = {
  totalErrors:   number;
  totalWarnings: number;
  conflictMap:   ConflictMap;
  /** Ordered list for navigation (de-duplicated conflict entries). */
  conflictList:  Array<{ key: string; conflict: CellConflict }>;
};

// ── Cell key helpers ──────────────────────────────────────────────────────

export function classKey(classId: string, day: number, period: number): string {
  return `class:${classId}|${day}-${period}`;
}

export function teacherKey(teacherId: string, day: number, period: number): string {
  return `teacher:${teacherId}|${day}-${period}`;
}

// ── Main detector ─────────────────────────────────────────────────────────

export function detectLiveConflicts(
  slots:  LiveSlot[],
  config: ConflictEngineConfig,
): ConflictSummary {
  const map = new Map<string, CellConflict[]>();

  function add(key: string, conflict: CellConflict) {
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(conflict);
  }

  // ── Pass 1: Double-booking (teacher + class) ──────────────────────────
  const teacherOcc = new Map<string, LiveSlot>(); // "tid|day-p" → slot
  const classOcc   = new Map<string, LiveSlot>(); // "cid|day-p" → slot

  for (const s of slots) {
    const slotKey = `${s.dayOfWeek}-${s.period}`;
    const tk      = `${s.teacherId}|${slotKey}`;
    const ck      = `${s.classId}|${slotKey}`;

    // Teacher double-booked
    if (teacherOcc.has(tk)) {
      const other   = teacherOcc.get(tk)!;
      const keyA    = teacherKey(s.teacherId, s.dayOfWeek, s.period);
      const keyB    = classKey(s.classId,   s.dayOfWeek, s.period);
      const keyBOth = classKey(other.classId, s.dayOfWeek, s.period);
      const msg     = `${s.teacherName} is double-booked — teaching ${other.className} and ${s.className} in period ${s.period}.`;
      const action  = `Move one class to a different period, or assign ${s.subjectCode} to another teacher.`;
      add(keyA,    { type: "TEACHER_DOUBLE_BOOKED", severity: "error", message: msg, action, relatedKeys: [keyB, keyBOth] });
      add(keyB,    { type: "TEACHER_DOUBLE_BOOKED", severity: "error", message: msg, action, relatedKeys: [keyA, keyBOth] });
      add(keyBOth, { type: "TEACHER_DOUBLE_BOOKED", severity: "error", message: msg, action, relatedKeys: [keyA, keyB] });
    } else {
      teacherOcc.set(tk, s);
    }

    // Class double-booked
    if (classOcc.has(ck)) {
      const other  = classOcc.get(ck)!;
      const keyA   = classKey(s.classId,  s.dayOfWeek, s.period);
      const msg    = `${s.className} has two subjects in period ${s.period} — ${other.subjectCode} and ${s.subjectCode}.`;
      const action = `Remove one subject from ${s.className} slot (day ${s.dayOfWeek}, period ${s.period}).`;
      add(keyA, { type: "CLASS_DOUBLE_BOOKED", severity: "error", message: msg, action, relatedKeys: [] });
    } else {
      classOcc.set(ck, s);
    }
  }

  // ── Pass 2: Blocked / special slots ──────────────────────────────────
  for (const s of slots) {
    const slotKey = `${s.dayOfWeek}-${s.period}`;
    if (config.blockedSlots.has(slotKey)) {
      const key = classKey(s.classId, s.dayOfWeek, s.period);
      add(key, {
        type: "SPECIAL_PERIOD", severity: "error",
        message: `${s.className} ${s.subjectCode} is scheduled in a blocked (special) period.`,
        action: `Move ${s.subjectCode} out of the blocked period — day ${s.dayOfWeek}, period ${s.period}.`,
        relatedKeys: [],
      });
    }
  }

  // ── Pass 3: Teacher unavailability ───────────────────────────────────
  for (const s of slots) {
    const slotKey = `${s.dayOfWeek}-${s.period}`;
    if (config.teacherUnavailability.get(s.teacherId)?.has(slotKey)) {
      const ck = classKey(s.classId,   s.dayOfWeek, s.period);
      const tk = teacherKey(s.teacherId, s.dayOfWeek, s.period);
      const msg    = `${s.teacherName} is marked unavailable at day ${s.dayOfWeek} period ${s.period}.`;
      const action = `Reassign ${s.subjectCode} to another teacher, or update ${s.teacherName}'s availability in Settings.`;
      add(ck, { type: "TEACHER_UNAVAILABLE", severity: "error", message: msg, action, relatedKeys: [tk] });
      add(tk, { type: "TEACHER_UNAVAILABLE", severity: "error", message: msg, action, relatedKeys: [ck] });
    }
  }

  // ── Pass 4: Inactive day ─────────────────────────────────────────────
  const activeDaySet = new Set(config.operatingDays);
  for (const s of slots) {
    if (!activeDaySet.has(s.dayOfWeek)) {
      const key = classKey(s.classId, s.dayOfWeek, s.period);
      add(key, {
        type: "INACTIVE_DAY", severity: "error",
        message: `Day ${s.dayOfWeek} is not an active operating day.`,
        action: `Move ${s.subjectCode} to an operating day, or enable day ${s.dayOfWeek} in Settings.`,
        relatedKeys: [],
      });
    }
  }

  // ── Pass 5: Teacher daily workload ────────────────────────────────────
  const teacherDayLoad = new Map<string, Map<number, LiveSlot[]>>(); // tid → day → slots
  for (const s of slots) {
    if (!teacherDayLoad.has(s.teacherId)) teacherDayLoad.set(s.teacherId, new Map());
    const dm = teacherDayLoad.get(s.teacherId)!;
    if (!dm.has(s.dayOfWeek)) dm.set(s.dayOfWeek, []);
    dm.get(s.dayOfWeek)!.push(s);
  }
  for (const [, dayMap] of teacherDayLoad) {
    for (const [, daySlots] of dayMap) {
      if (daySlots.length > config.maxLessonsPerTeacherPerDay) {
        for (const ds of daySlots) {
          const key = teacherKey(ds.teacherId, ds.dayOfWeek, ds.period);
          add(key, {
            type: "WORKLOAD_EXCEEDED", severity: "error",
            message: `${ds.teacherName} has ${daySlots.length} lessons on day ${ds.dayOfWeek}, exceeding the ${config.maxLessonsPerTeacherPerDay}-lesson daily limit.`,
            action: `Move ${daySlots.length - config.maxLessonsPerTeacherPerDay} lesson(s) to other days or assign a co-teacher.`,
            relatedKeys: daySlots.filter((x) => x !== ds).map((x) => teacherKey(x.teacherId, x.dayOfWeek, x.period)),
          });
        }
      }
    }
  }

  // ── Pass 6: Lesson completion (warnings) ────────────────────────────
  const placed = new Map<string, number>();
  for (const s of slots) {
    const k = `${s.classId}-${s.subjectId}`;
    placed.set(k, (placed.get(k) ?? 0) + 1);
  }
  for (const [reqKey, required] of config.requiredLessons) {
    const count = placed.get(reqKey) ?? 0;
    if (count < required) {
      const [classId] = reqKey.split("-");
      // Mark all existing slots for this class-subject as warning
      const classSlots = slots.filter((s) => `${s.classId}-${s.subjectId}` === reqKey);
      const msg = `${classSlots[0]?.className ?? classId} only has ${count}/${required} ${classSlots[0]?.subjectCode ?? ""} lessons scheduled.`;
      const action = `Add ${required - count} more ${classSlots[0]?.subjectCode ?? ""} lesson(s) to complete the weekly requirement.`;
      for (const s of classSlots) {
        add(classKey(s.classId, s.dayOfWeek, s.period), {
          type: "LESSON_INCOMPLETE", severity: "warning", message: msg, action, relatedKeys: [],
        });
      }
    }
  }

  // ── Pass 7: Double-lesson adjacency ─────────────────────────────────
  const doubleGroups = new Map<string, LiveSlot[]>(); // "cid|sid|day" → slots
  for (const s of slots) {
    if (!config.doubleSubjects.has(`${s.classId}-${s.subjectId}`)) continue;
    const k = `${s.classId}|${s.subjectId}|${s.dayOfWeek}`;
    if (!doubleGroups.has(k)) doubleGroups.set(k, []);
    doubleGroups.get(k)!.push(s);
  }
  for (const [, group] of doubleGroups) {
    const ps = group.map((s) => s.period).sort((a, b) => a - b);
    for (let i = 0; i < ps.length - 1; i += 2) {
      if (ps[i + 1] !== ps[i] + 1) {
        const msg    = `Double-lesson pair for ${group[0].subjectCode} in ${group[0].className} is not consecutive (periods ${ps[i]} and ${ps[i+1]}).`;
        const action = `Move one half so the pair occupies consecutive periods ${ps[i]} and ${ps[i]+1}.`;
        for (const s of group) {
          add(classKey(s.classId, s.dayOfWeek, s.period), {
            type: "DOUBLE_NOT_ADJACENT", severity: "error", message: msg, action,
            relatedKeys: group.filter((x) => x !== s).map((x) => classKey(x.classId, x.dayOfWeek, x.period)),
          });
        }
      }
    }
  }

  // ── Pass 8: Locked-slot integrity ───────────────────────────────────────
  // Warn when a slot that is NOT locked lands in a cell that was previously
  // occupied by a locked slot (used during re-optimize preview diffs).
  if (config.lockedSlotKeys?.size) {
    for (const s of slots) {
      const ck = classKey(s.classId, s.dayOfWeek, s.period);
      if (config.lockedSlotKeys.has(ck) && !s.isLocked) {
        add(ck, {
          type: "LOCKED_SLOT_MOVED", severity: "error",
          message: `${s.className} ${s.subjectCode} is placed in a slot that was locked by an administrator.`,
          action: `Restore the locked lesson or unlock the cell before accepting this change.`,
          relatedKeys: [],
        });
      }
    }
  }

  // ── Compile summary ───────────────────────────────────────────────────
  let totalErrors = 0, totalWarnings = 0;
  const conflictList: Array<{ key: string; conflict: CellConflict }> = [];
  const seen = new Set<string>(); // de-dup by message

  for (const [key, conflicts] of map) {
    for (const c of conflicts) {
      if (c.severity === "error")   totalErrors++;
      if (c.severity === "warning") totalWarnings++;
      const dedupKey = `${c.type}|${c.message}`;
      if (!seen.has(dedupKey)) { seen.add(dedupKey); conflictList.push({ key, conflict: c }); }
    }
  }

  return { totalErrors, totalWarnings, conflictMap: map, conflictList };
}

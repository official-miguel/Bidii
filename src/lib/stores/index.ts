/**
 * src/lib/stores/index.ts
 *
 * Barrel re-export for all Zustand stores.
 */

export { useStudentsStore }    from "./studentsStore";
export { useClassesStore }     from "./classesStore";
export { useAttendanceStore }  from "./attendanceStore";
export { useAssessmentStore }  from "./assessmentStore";
export { useLibraryStore }     from "./libraryStore";
export { useCirculationStore } from "./circulationStore";
export { useTimetableStore }   from "./timetableStore";
export { useCalendarStore }    from "./calendarStore";
export { useDisciplineStore }  from "./disciplineStore";
export { useStaffStore }       from "./staffStore";
export { useStaffRolesStore }  from "./staffRolesStore";
export { useExamPeriodsStore } from "./examPeriodsStore";
export { useSyncStatusStore }  from "./syncStatusStore";

"use client";

/**
 * TeacherDashboardClient
 *
 * Wraps the teacher In-depth Analysis page with:
 *   - Two top-level tabs: "My Classes" (default) | "Full School Analysis"
 *   - My Classes tab: clickable class/subject tiles → opens DashboardCharts
 *     scoped to that tile's class/subject.
 *   - Full School Analysis tab: full DashboardCharts with no class pre-filter
 *     (mirrors the principal dashboard).
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  BookOpen,
  Users,
  ChevronRight,
  ArrowLeft,
  GraduationCap,
  School,
} from "lucide-react";

const DashboardCharts = dynamic(
  () => import("@/components/assessment/DashboardCharts"),
  { ssr: false }
);
const CbeDashboardEnhanced = dynamic(
  () => import("@/components/assessment/CbeDashboardEnhanced"),
  { ssr: false }
);

// ── Types ──────────────────────────────────────────────────────────────────────

interface ClassTile {
  classId: string;
  className: string;
  form: number;
  subjects: { id: string; name: string; code: string }[];
  frameworkType: string;
}

interface AllClassShape {
  id: string;
  name: string;
  form: number;
  frameworkType: string;
}

interface SubjectShape {
  id: string;
  name: string;
  applicableForms: number[];
}

interface TeacherDashboardClientProps {
  /** Tiles shown in "My Classes" — each class the teacher is assigned to. */
  tiles: ClassTile[];
  /** Subjects in the teacher's scope — used for tile drill-down. */
  subjects: SubjectShape[];
  /** All school subjects — used for Full School Analysis tab. */
  allSubjects: SubjectShape[];
  /** Whether this teacher has wide (school-wide) access. */
  isWideAccess: boolean;
  hasBoth: boolean;
  hasCbeOnly: boolean;
  kcseClasses: AllClassShape[];
  cbeClasses: AllClassShape[];
  cbeOnlyFlag: boolean;
}

type TopTab = "my_classes" | "full_school";
type DrillState = { classId: string; className: string; subjectId?: string; frameworkType: string } | null;

// ── Class tile card ────────────────────────────────────────────────────────────
function ClassTileCard({
  tile,
  onDrill,
}: {
  tile: ClassTile;
  onDrill: (classId: string, className: string, subjectId: string | undefined, frameworkType: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const hasManySubjects = tile.subjects.length > 1;

  return (
    <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Class header */}
      <button
        type="button"
        onClick={() => {
          if (hasManySubjects) {
            setExpanded((v) => !v);
          } else {
            onDrill(tile.classId, tile.className, tile.subjects[0]?.id, tile.frameworkType);
          }
        }}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50/60 transition-colors text-left group"
      >
        <div className="shrink-0 w-9 h-9 rounded-lg bg-royal/10 flex items-center justify-center">
          <GraduationCap className="w-4.5 h-4.5 text-royal" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink text-sm">{tile.className}</p>
          <p className="text-xs text-slate mt-0.5">
            {tile.subjects.length} subject{tile.subjects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {hasManySubjects ? (
            <span className="text-xs text-royal font-medium">
              {expanded ? "collapse" : "expand"}
            </span>
          ) : (
            <span className="text-xs text-royal font-medium flex items-center gap-0.5">
              Analyse
              <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          )}
        </div>
      </button>

      {/* Subject list (expanded or always shown for single subject) */}
      {(!hasManySubjects || expanded) && tile.subjects.length > 0 && (
        <div className="border-t border-line divide-y divide-line/50">
          {tile.subjects.map((subj) => (
            <button
              key={subj.id}
              type="button"
              onClick={() => onDrill(tile.classId, tile.className, subj.id, tile.frameworkType)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-teal-50/40 transition-colors text-left group/subj"
            >
              <div className="shrink-0 w-7 h-7 rounded-md bg-teal/10 flex items-center justify-center">
                <BookOpen className="w-3.5 h-3.5 text-teal" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink font-medium truncate">{subj.name}</p>
                {subj.code && (
                  <p className="text-[11px] text-slate">{subj.code}</p>
                )}
              </div>
              <span className="shrink-0 text-xs text-teal font-medium flex items-center gap-0.5 opacity-0 group-hover/subj:opacity-100 transition-opacity">
                View
                <ChevronRight className="w-3 h-3 transition-transform group-hover/subj:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function TeacherDashboardClient({
  tiles,
  subjects,
  allSubjects,
  isWideAccess,
  hasBoth,
  hasCbeOnly,
  kcseClasses,
  cbeClasses,
  cbeOnlyFlag,
}: TeacherDashboardClientProps) {
  const [topTab, setTopTab] = useState<TopTab>("my_classes");
  const [drill, setDrill] = useState<DrillState>(null);
  // Framework sub-tab (844 vs CBE) for "Full School" when hasBoth
  const [fwTab, setFwTab] = useState<"844" | "cbe">(hasCbeOnly ? "cbe" : "844");

  function handleDrill(classId: string, className: string, subjectId: string | undefined, frameworkType: string) {
    setDrill({ classId, className, subjectId, frameworkType });
  }

  function handleBack() {
    setDrill(null);
  }

  // ── Top tab bar ──────────────────────────────────────────────────────────────
  const topTabs = [
    { key: "my_classes" as TopTab, label: "My Classes", icon: Users },
    { key: "full_school" as TopTab, label: "Full School Analysis", icon: School },
  ];

  return (
    <div className="space-y-5">
      {/* Top-level tab bar */}
      <div className="flex gap-0.5 rounded-xl border border-line bg-paper p-1 w-fit">
        {topTabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTopTab(key);
              setDrill(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              topTab === key
                ? "bg-white shadow-sm text-ink"
                : "text-slate hover:text-ink"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* ── MY CLASSES TAB ─────────────────────────────────────────────────── */}
      {topTab === "my_classes" && (
        <>
          {drill ? (
            /* Drill-down: show full charts for the selected class/subject */
            <div className="space-y-4">
              {/* Back + breadcrumb */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1.5 text-sm text-royal hover:text-royal/80 font-medium transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to My Classes
                </button>
                <span className="text-slate text-sm">/</span>
                <span className="text-sm font-semibold text-ink">{drill.className}</span>
              </div>

              <p className="text-xs text-slate">
                Showing full analysis for{" "}
                <span className="font-medium text-ink">{drill.className}</span>
                {drill.subjectId && subjects.find((s) => s.id === drill.subjectId) && (
                  <>
                    {" — "}
                    <span className="font-medium text-ink">
                      {subjects.find((s) => s.id === drill.subjectId)?.name}
                    </span>
                  </>
                )}
              </p>

              {drill.frameworkType === "CBE" ? (
                <CbeDashboardEnhanced
                  classes={cbeClasses.map((c) => ({ id: c.id, name: c.name, frameworkType: c.frameworkType }))}
                  cbeOnly={cbeOnlyFlag}
                  defaultClassId={drill.classId}
                />
              ) : (
                <DashboardCharts
                  classes={kcseClasses.map((c) => ({ id: c.id, name: c.name, form: c.form }))}
                  subjects={subjects}
                  defaultClassId={drill.classId}
                  defaultSubjectId={drill.subjectId ?? undefined}
                />
              )}
            </div>
          ) : (
            /* Tiles grid */
            <div className="space-y-4">
              <p className="text-sm text-slate">
                Select a class or subject below to open its full analysis.
              </p>

              {tiles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center text-sm text-slate">
                  No class assignments found.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tiles.map((tile) => (
                    <ClassTileCard
                      key={tile.classId}
                      tile={tile}
                      onDrill={handleDrill}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── FULL SCHOOL ANALYSIS TAB ──────────────────────────────────────── */}
      {topTab === "full_school" && (
        <div className="space-y-4">
          <p className="text-sm text-slate">
            {isWideAccess
              ? "School-wide analytics — all classes and subjects."
              : "Full school assessment analytics for reference."}
          </p>

          {/* Framework sub-tabs when school has both 8-4-4 and CBE */}
          {hasBoth && (
            <div className="flex gap-1 border-b border-line">
              {[
                { key: "844" as const, label: `8-4-4 (${kcseClasses.length})` },
                { key: "cbe" as const, label: `CBE (${cbeClasses.length})` },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFwTab(key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    fwTab === key
                      ? "border-ink text-ink"
                      : "border-transparent text-slate hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {(fwTab === "844" || !hasBoth) && kcseClasses.length > 0 && (
            <DashboardCharts
              classes={kcseClasses.map((c) => ({ id: c.id, name: c.name, form: c.form }))}
              subjects={allSubjects}
            />
          )}

          {(fwTab === "cbe" || hasCbeOnly) && cbeClasses.length > 0 && (
            <CbeDashboardEnhanced
              classes={cbeClasses.map((c) => ({ id: c.id, name: c.name, frameworkType: c.frameworkType }))}
              cbeOnly={cbeOnlyFlag}
            />
          )}
        </div>
      )}
    </div>
  );
}

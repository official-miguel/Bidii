"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Building2,
  Users,
  BedDouble,
  TrendingUp,
  CheckCircle2,
  Wrench,
  Lock,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/ui";
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";

interface DormSummary {
  id: string;
  name: string;
  genderPolicy: "BOYS_ONLY" | "GIRLS_ONLY" | "MIXED";
  status: "ACTIVE" | "UNDER_MAINTENANCE" | "CLOSED";
  structure: "OPEN_HALL" | "CUBICLE_BASED";
  allocationPolicy: string;
  capacity: number;
  occupied: number;
  available: number;
  occupancyPct: number;
  isAlmostFull: boolean;
  boardingMasterName: string | null;
}

interface Summary {
  totalDormitories: number;
  activeDormitories: number;
  boardingStudents: number;
  totalSleepingPositions: number;
  occupiedPositions: number;
  availablePositions: number;
  occupancyPct: number;
  dormSummaries: DormSummary[];
  settings: { boardingType: string } | null;
}

const GENDER_LABEL: Record<string, string> = {
  BOYS_ONLY: "Boys",
  GIRLS_ONLY: "Girls",
  MIXED: "Mixed",
};

const GENDER_COLOR: Record<string, string> = {
  BOYS_ONLY:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
  GIRLS_ONLY:
    "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-800",
  MIXED:
    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800",
};

const STATUS_META: Record<
  string,
  { label: string; icon: typeof CheckCircle2; color: string }
> = {
  ACTIVE:            { label: "Active",      icon: CheckCircle2, color: "text-success" },
  UNDER_MAINTENANCE: { label: "Maintenance", icon: Wrench,       color: "text-warn" },
  CLOSED:            { label: "Closed",      icon: Lock,         color: "text-slate" },
};

function OccupancyBar({
  pct,
  isAlmostFull,
}: {
  pct: number;
  isAlmostFull: boolean;
}) {
  const color =
    isAlmostFull ? "bg-warn" : pct >= 100 ? "bg-danger" : "bg-teal";
  return (
    <div className="w-full h-1.5 rounded-full bg-line dark:bg-dark-border overflow-hidden mt-2">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

export default function TeacherAccommodationView({
  canManageAll,
  ownDormIds,
}: {
  canManageAll: boolean;
  ownDormIds: string[];
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/accommodation/summary");
      if (res.ok) setSummary(await res.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredDorms = (summary?.dormSummaries ?? []).filter(
    (d) => !search || d.name.toLowerCase().includes(search.toLowerCase())
  );

  const isDayOnly = summary?.settings?.boardingType === "DAY_ONLY";

  // A teacher can edit a dorm if: canManageAll OR the dorm is in their ownDormIds
  const canEditDorm = (dormId: string) =>
    canManageAll || ownDormIds.includes(dormId);

  return (
    <div>
      <PageHeader
        title="Accommodation"
        description="Boarding dormitories and occupancy overview."
        action={
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center justify-center h-10 w-10 rounded-lg border border-line bg-white text-slate hover:text-ink hover:bg-paper disabled:opacity-50 transition-all dark:bg-dark-surface dark:border-dark-border dark:text-dark-muted dark:hover:text-dark-text"
            aria-label="Refresh accommodation data"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        }
      />

      {!loading && isDayOnly && (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <Building2 className="h-10 w-10 text-slate" />
          <p className="text-ink font-medium dark:text-dark-text">
            Boarding is not enabled for this school.
          </p>
        </div>
      )}

      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-xl bg-line/40 dark:bg-dark-border/40 animate-pulse"
              />
            ))}
          </div>
        </div>
      )}

      {summary && !isDayOnly && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="rounded-xl border border-line bg-card p-5 dark:bg-dark-surface dark:border-dark-border">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-semibold text-ink dark:text-dark-text tabular-nums">
                    {summary.boardingStudents}
                  </p>
                  <p className="text-slate text-sm mt-1 dark:text-dark-muted">
                    Boarding students
                  </p>
                </div>
                <div className="rounded-lg bg-teal/10 p-2">
                  <Users className="h-5 w-5 text-teal" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-5 dark:bg-dark-surface dark:border-dark-border">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-semibold text-ink dark:text-dark-text tabular-nums">
                    {summary.totalDormitories}
                  </p>
                  <p className="text-slate text-sm mt-1 dark:text-dark-muted">
                    Dormitories
                  </p>
                  <p className="text-slate/60 text-xs dark:text-dark-muted/60">
                    {summary.activeDormitories} active
                  </p>
                </div>
                <div className="rounded-lg bg-teal/10 p-2">
                  <Building2 className="h-5 w-5 text-teal" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-5 dark:bg-dark-surface dark:border-dark-border">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-semibold text-ink dark:text-dark-text tabular-nums">
                    {summary.availablePositions}
                  </p>
                  <p className="text-slate text-sm mt-1 dark:text-dark-muted">
                    Available spaces
                  </p>
                  <p className="text-slate/60 text-xs dark:text-dark-muted/60">
                    of {summary.totalSleepingPositions} total
                  </p>
                </div>
                <div className="rounded-lg bg-teal/10 p-2">
                  <BedDouble className="h-5 w-5 text-teal" />
                </div>
              </div>
            </div>

            <div
              className={`rounded-xl border p-5 ${
                summary.occupancyPct >= 90
                  ? "border-warn/30 bg-warn-bg/40 dark:bg-warn/10"
                  : "border-line bg-card dark:bg-dark-surface dark:border-dark-border"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p
                    className={`text-2xl font-semibold tabular-nums ${
                      summary.occupancyPct >= 90
                        ? "text-warn"
                        : "text-ink dark:text-dark-text"
                    }`}
                  >
                    {summary.occupancyPct}%
                  </p>
                  <p className="text-slate text-sm mt-1 dark:text-dark-muted">
                    Occupancy rate
                  </p>
                </div>
                <div
                  className={`rounded-lg p-2 ${
                    summary.occupancyPct >= 90 ? "bg-warn/10" : "bg-teal/10"
                  }`}
                >
                  <TrendingUp
                    className={`h-5 w-5 ${
                      summary.occupancyPct >= 90 ? "text-warn" : "text-teal"
                    }`}
                  />
                </div>
              </div>
              <OccupancyBar
                pct={summary.occupancyPct}
                isAlmostFull={summary.occupancyPct >= 90}
              />
            </div>
          </div>

          {/* Dorm list header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink dark:text-dark-text">
              Dormitories
            </h2>
          </div>

          <WorkspaceToolbar>
            <WorkspaceToolbar.Search
              value={search}
              onChange={setSearch}
              placeholder="Search dormitories…"
            />
          </WorkspaceToolbar>

          {filteredDorms.length === 0 && search && (
            <p className="text-slate text-sm py-8 text-center dark:text-dark-muted">
              No dormitories match &ldquo;{search}&rdquo;
            </p>
          )}

          {filteredDorms.length === 0 && !search && (
            <p className="text-slate text-sm py-8 text-center dark:text-dark-muted">
              No dormitories have been set up yet.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
            {filteredDorms.map((dorm) => {
              const statusMeta = STATUS_META[dorm.status];
              const StatusIcon = statusMeta.icon;
              const canEdit = canEditDorm(dorm.id);

              // Dorm Masters and Matrons link to the principal dorm detail page
              // for editing. Plain teachers see the card as non-clickable.
              const dormHref = canEdit
                ? `/principal/accommodation/dormitories/${dorm.id}`
                : null;

              const cardContent = (
                <div
                  className={`rounded-xl border border-line bg-card p-5 transition-all dark:bg-dark-surface dark:border-dark-border ${
                    dormHref
                      ? "hover:border-teal/40 hover:shadow-md dark:hover:border-teal/30 group cursor-pointer"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p
                          className={`text-sm font-semibold text-ink dark:text-dark-text truncate ${
                            dormHref
                              ? "group-hover:text-teal transition-colors"
                              : ""
                          }`}
                        >
                          {dorm.name}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                            GENDER_COLOR[dorm.genderPolicy]
                          }`}
                        >
                          {GENDER_LABEL[dorm.genderPolicy]}
                        </span>
                        {ownDormIds.includes(dorm.id) && !canManageAll && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal/10 text-teal border border-teal/20">
                            My dorm
                          </span>
                        )}
                      </div>
                      {dorm.boardingMasterName && (
                        <p className="text-xs text-slate mt-0.5 dark:text-dark-muted truncate">
                          {dorm.boardingMasterName}
                        </p>
                      )}
                    </div>
                    <div
                      className={`flex items-center gap-1 shrink-0 text-xs font-medium ${statusMeta.color}`}
                    >
                      <StatusIcon className="h-3.5 w-3.5" />
                      {statusMeta.label}
                    </div>
                  </div>

                  <div className="flex items-end justify-between gap-2 mb-1">
                    <p className="text-xs text-slate dark:text-dark-muted">
                      {dorm.occupied} / {dorm.capacity} spaces
                    </p>
                    <p
                      className={`text-xs font-semibold tabular-nums ${
                        dorm.isAlmostFull
                          ? "text-warn"
                          : dorm.occupancyPct >= 100
                          ? "text-danger"
                          : "text-teal"
                      }`}
                    >
                      {dorm.occupancyPct}%
                    </p>
                  </div>
                  <OccupancyBar
                    pct={dorm.occupancyPct}
                    isAlmostFull={dorm.isAlmostFull}
                  />

                  {dormHref && (
                    <div className="flex items-center justify-end mt-3 pt-3 border-t border-line/60 dark:border-dark-border/60">
                      <ArrowRight className="h-3.5 w-3.5 text-slate group-hover:text-teal group-hover:translate-x-0.5 transition-all dark:text-dark-muted" />
                    </div>
                  )}
                </div>
              );

              return dormHref ? (
                <Link key={dorm.id} href={dormHref}>
                  {cardContent}
                </Link>
              ) : (
                <div key={dorm.id}>{cardContent}</div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

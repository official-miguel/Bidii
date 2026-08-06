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

export default function TeacherAccommodationView({
  canManageAll,
  ownDormIds,
}: {
  canManageAll: boolean;
  ownDormIds: string[];
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    
    try {
      const res = await fetch("/api/accommodation/summary");
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      } else {
        const errorText = await res.text();
        setError(`API Error ${res.status}: ${errorText || res.statusText}`);
        console.error('API Error:', res.status, res.statusText, errorText);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Network Error: ${errorMsg}`);
      console.error('Network Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="p-8">
        <PageHeader
          title="Accommodation"
          description="Boarding dormitories and occupancy overview."
        />
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Data</h2>
          <p className="text-sm text-red-700 mb-2">{error}</p>
          <button 
            onClick={() => load()}
            className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Accommodation"
          description="Boarding dormitories and occupancy overview."
          action={
            <div className="h-10 w-10 rounded-lg bg-line/40 dark:bg-dark-border/40 animate-pulse" />
          }
        />
        
        {/* Skeleton stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-line bg-card p-5 dark:bg-dark-surface dark:border-dark-border">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="h-8 w-16 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
                  <div className="h-4 w-24 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
                  <div className="h-3 w-20 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
                </div>
                <div className="w-9 h-9 bg-line/40 dark:bg-dark-border/40 rounded-lg animate-pulse" />
              </div>
            </div>
          ))}
        </div>

        {/* Skeleton dorm list header */}
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-24 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
        </div>

        {/* Skeleton search bar */}
        <div className="mb-6">
          <div className="h-10 w-80 bg-line/40 dark:bg-dark-border/40 rounded-lg animate-pulse" />
        </div>

        {/* Skeleton dorm cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl border border-line bg-card p-5 dark:bg-dark-surface dark:border-dark-border">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2 flex-1">
                    <div className="h-5 w-32 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
                    <div className="h-3 w-24 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
                  </div>
                  <div className="h-4 w-12 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <div className="h-3 w-20 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
                    <div className="h-3 w-8 bg-line/40 dark:bg-dark-border/40 rounded animate-pulse" />
                  </div>
                  <div className="w-full h-1.5 bg-line/40 dark:bg-dark-border/40 rounded-full animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isDayOnly = summary?.settings?.boardingType === "DAY_ONLY";

  return (
    <div>
      <PageHeader
        title="Accommodation"
        description="Boarding dormitories and occupancy overview."
        action={
          <button
            onClick={() => load(true)}
            className="inline-flex items-center justify-center h-10 w-10 rounded-lg border border-line bg-white text-slate hover:text-ink hover:bg-paper transition-all"
            aria-label="Refresh accommodation data"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        }
      />

      {isDayOnly ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <Building2 className="h-10 w-10 text-slate" />
          <p className="text-ink font-medium">
            Boarding is not enabled for this school.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-line bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-semibold text-ink tabular-nums">
                    {summary?.boardingStudents || 0}
                  </p>
                  <p className="text-slate text-sm mt-1">Boarding students</p>
                </div>
                <div className="rounded-lg bg-teal/10 p-2">
                  <Users className="h-5 w-5 text-teal" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-semibold text-ink tabular-nums">
                    {summary?.totalDormitories || 0}
                  </p>
                  <p className="text-slate text-sm mt-1">Dormitories</p>
                  <p className="text-slate/60 text-xs">
                    {summary?.activeDormitories || 0} active
                  </p>
                </div>
                <div className="rounded-lg bg-teal/10 p-2">
                  <Building2 className="h-5 w-5 text-teal" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-semibold text-ink tabular-nums">
                    {summary?.availablePositions || 0}
                  </p>
                  <p className="text-slate text-sm mt-1">Available spaces</p>
                  <p className="text-slate/60 text-xs">
                    of {summary?.totalSleepingPositions || 0} total
                  </p>
                </div>
                <div className="rounded-lg bg-teal/10 p-2">
                  <BedDouble className="h-5 w-5 text-teal" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-semibold text-ink tabular-nums">
                    {summary?.occupancyPct || 0}%
                  </p>
                  <p className="text-slate text-sm mt-1">Occupancy rate</p>
                </div>
                <div className="rounded-lg bg-teal/10 p-2">
                  <TrendingUp className="h-5 w-5 text-teal" />
                </div>
              </div>
            </div>
          </div>

          <div className="text-sm text-slate">
            <p>Debug Info:</p>
            <p>canManageAll: {canManageAll.toString()}</p>
            <p>ownDormIds: {JSON.stringify(ownDormIds)}</p>
            <p>Summary loaded: {summary ? 'Yes' : 'No'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

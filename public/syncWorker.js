/**
 * public/syncWorker.js
 *
 * Actual Web Worker implementation.
 * Runs off the main thread — handles heavy computation tasks sent from
 * src/lib/offline/syncWorker.ts.
 *
 * Handles:
 *   - aggregate:attendance  → compute present/absent counts for a day
 *   - aggregate:assessmentItems → compute class averages, grade distributions
 *   - index:students        → build a sorted/indexed snapshot for instant search
 *   - export:csv            → stringify arrays to CSV format
 *   - ping                  → health check
 */

/* eslint-disable no-undef */
"use strict";

self.onmessage = function (e) {
  const { id, type, payload } = e.data;

  try {
    let result;

    switch (type) {
      case "ping":
        result = { ok: true, ts: Date.now() };
        break;

      case "aggregate:attendance": {
        // payload: { records: Array<{status: string}> }
        const records = payload.records || [];
        const present = records.filter((r) => r.status === "PRESENT").length;
        const absent  = records.filter((r) => r.status === "ABSENT").length;
        const total   = records.length;
        result = {
          present,
          absent,
          total,
          presentPct: total > 0 ? Math.round((present / total) * 100) : 0,
        };
        break;
      }

      case "aggregate:assessmentItems": {
        // payload: { items: Array<{numericScore, studentId, subjectId}>, maxMarks: number }
        const items    = payload.items || [];
        const maxMarks = payload.maxMarks || 100;

        if (items.length === 0) {
          result = { mean: 0, min: 0, max: 0, distribution: {} };
          break;
        }

        const scores = items
          .filter((i) => i.numericScore != null)
          .map((i) => i.numericScore);

        const mean = scores.length
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : 0;

        // Grade distribution: A (≥75%), B (≥60%), C (≥50%), D (≥40%), E (<40%)
        const distribution = { A: 0, B: 0, C: 0, D: 0, E: 0 };
        for (const s of scores) {
          const pct = (s / maxMarks) * 100;
          if      (pct >= 75) distribution.A++;
          else if (pct >= 60) distribution.B++;
          else if (pct >= 50) distribution.C++;
          else if (pct >= 40) distribution.D++;
          else                distribution.E++;
        }

        result = {
          mean: Math.round(mean * 10) / 10,
          min: Math.min(...scores),
          max: Math.max(...scores),
          count: scores.length,
          distribution,
        };
        break;
      }

      case "index:students": {
        // payload: { students: Array<{id, fullName, admissionNumber, classId}> }
        // Build a sorted + lowercase-keyed index for O(1) prefix search
        const students = payload.students || [];
        const index = students.map((s) => ({
          id: s.id,
          fullName: s.fullName,
          admissionNumber: s.admissionNumber,
          classId: s.classId,
          _lower: `${s.fullName} ${s.admissionNumber}`.toLowerCase(),
        }));
        index.sort((a, b) => a.fullName.localeCompare(b.fullName));
        result = { index, indexedAt: Date.now() };
        break;
      }

      case "export:csv": {
        // payload: { headers: string[], rows: string[][] }
        const { headers = [], rows = [] } = payload;
        const escape = (v) => {
          const s = String(v ?? "");
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        };
        const lines = [
          headers.map(escape).join(","),
          ...rows.map((row) => row.map(escape).join(",")),
        ];
        result = { csv: lines.join("\r\n"), rowCount: rows.length };
        break;
      }

      default:
        result = null;
    }

    self.postMessage({ id, type, result });
  } catch (err) {
    self.postMessage({ id, type, error: err.message || "Worker error" });
  }
};

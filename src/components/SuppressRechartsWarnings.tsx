"use client";

/**
 * Suppresses known console warnings from recharts 2.x that are caused by
 * React deprecating defaultProps on function components. These warnings come
 * from recharts internals (XAxis, YAxis, ReferenceLine, etc.) and cannot be
 * fixed without upgrading recharts to 2.13+.
 *
 * Only active in development — production builds don't emit these warnings.
 * Mounted once at the app root so it runs before any chart renders.
 */

import { useEffect } from "react";

export default function SuppressRechartsWarnings() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const original = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      const msg = typeof args[0] === "string" ? args[0] : "";
      // Suppress recharts defaultProps deprecation warnings only
      if (
        msg.includes("Support for defaultProps will be removed") &&
        typeof args[1] === "string" &&
        /XAxis|YAxis|ZAxis|Line|Bar|Area|Pie|ReferenceLine|ReferenceArea|Tooltip|Legend|CartesianGrid/.test(args[1])
      ) {
        return;
      }
      original(...args);
    };

    return () => {
      console.error = original;
    };
  }, []);

  return null;
}

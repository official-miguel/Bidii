"use client";

/**
 * src/components/SomaAIButton.tsx
 *
 * Soma AI floating action button (FAB) — the persistent entry point to the
 * assistant, visible on every authenticated page.
 *
 * Positioning:
 *   - Desktop (md+):  fixed bottom-right, above any page scrollbar
 *                     right-6 bottom-6, no conflict with sidebar (sidebar is
 *                     left-side icon rail)
 *   - Mobile:         same bottom-right corner, slightly smaller tap target
 *                     stays above the browser chrome bottom bar via pb-safe
 *
 * States:
 *   - Default:  gradient teal button with Soma sparkle icon + "Soma AI" label
 *   - Open:     X icon, muted surface colour (panel is visible)
 *   - Streaming: pulse ring to indicate activity
 *   - Hover:    lift + shadow
 */

import { Sparkles, X } from "lucide-react";
import { useSomaAIStore } from "@/lib/soma-ai/store";

interface Props {
  /** Externally controlled open state (from TopAppBar mutual-exclusion) */
  isOpen: boolean;
  onClick: () => void;
}

export default function SomaAIButton({ isOpen, onClick }: Props) {
  const isStreaming = useSomaAIStore((s) => s.isStreaming);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isOpen ? "Close Soma AI" : "Open Soma AI"}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      className={`
        fixed z-40
        bottom-6 right-6
        sm:bottom-6 sm:right-6
        flex items-center gap-2.5
        h-12 pl-3.5 pr-4
        rounded-full
        shadow-lg hover:shadow-xl
        transition-all duration-200
        select-none
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2
        ${isOpen
          ? "bg-white border border-line text-slate hover:text-ink dark:bg-dark-surface dark:border-dark-border dark:text-dark-muted dark:hover:text-dark-text"
          : "bg-gradient-to-br from-teal to-teal-dark text-white hover:-translate-y-0.5"
        }
      `}
    >
      {/* Streaming pulse ring */}
      {isStreaming && !isOpen && (
        <span
          className="absolute inset-0 rounded-full border-2 border-teal-light animate-soma-pulse"
          aria-hidden="true"
        />
      )}

      {/* Icon */}
      <span
        className={`w-5 h-5 flex items-center justify-center shrink-0
                    transition-transform duration-200 ${isOpen ? "rotate-0" : ""}`}
      >
        {isOpen ? (
          <X className="w-4 h-4" />
        ) : (
          <Sparkles
            className={`w-4 h-4 ${isStreaming ? "animate-soma-spin" : ""}`}
          />
        )}
      </span>

      {/* Label */}
      <span className="text-sm font-semibold leading-none tracking-tight">
        {isOpen ? "Close" : "Soma AI"}
      </span>
    </button>
  );
}

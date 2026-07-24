import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ── Primary brand ───────────────────────────────────────────────
        teal: {
          DEFAULT: "#2C7F7E",
          light:   "#3A9998",
          dark:    "#1F5C5B",
          50:      "#EDF7F7",
          100:     "#D0EDED",
          900:     "#0D3333",
        },

        // ── Semantic aliases (keep old names so zero pages break) ───────
        // "ink"   → Deep Charcoal (primary text / dark surfaces)
        ink: {
          DEFAULT: "#1F2933",
          light:   "#2D3D4D",
        },
        // "paper" → Soft Warm White (page background)
        paper: "#FAFBFC",
        // "card"  → Pure White (card surfaces)
        card: "#FFFFFF",
        // "line"  → Very Light Gray (borders)
        line: "#E8EDF2",
        // "gold"  → maps to primary Teal so existing gold accent calls
        //           now render as the brand colour instead of amber
        gold: {
          DEFAULT: "#2C7F7E",
          dark:    "#1F5C5B",
        },
        // "slate" → Medium Gray (secondary text)
        slate: {
          DEFAULT: "#667085",
          light:   "#98A2B3",
        },
        // "royal" → Teal (was navy — now unified with brand primary)
        royal: {
          DEFAULT: "#2C7F7E",
          light:   "#3A9998",
          dark:    "#1F5C5B",
          50:      "#EDF7F7",
          100:     "#D0EDED",
        },

        // ── Semantic status ─────────────────────────────────────────────
        danger: {
          DEFAULT: "#F04438",
          bg:      "#FEF3F2",
        },
        "danger-bg": "#FEF3F2",

        success: {
          DEFAULT: "#17B26A",
          bg:      "#ECFDF3",
        },
        "success-bg": "#ECFDF3",

        warn: {
          DEFAULT: "#F79009",
          bg:      "#FFFAEB",
        },
        "warn-bg": "#FFFAEB",

        info: {
          DEFAULT: "#2E90FA",
          bg:      "#EFF8FF",
        },

        // ── Dark mode surfaces ──────────────────────────────────────────
        "dark-bg":      "#0D1B2A",
        "dark-surface": "#162233",
        "dark-border":  "#1E3347",
        "dark-text":    "#E8EDF2",
        "dark-muted":   "#667085",
        "dark-gold":    "#3A9998",
        "dark-sidebar": "#0A1520",
        "dark-royal":   "#3A9998",
      },

      fontFamily: {
        // Inter is the sole typeface — drop Source Serif 4
        sans:    ["Inter", "system-ui", "sans-serif"],
        display: ["Inter", "system-ui", "sans-serif"],
      },

      fontSize: {
        // 8-point type scale
        xs:   ["0.75rem",  { lineHeight: "1rem" }],
        sm:   ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem",     { lineHeight: "1.5rem" }],
        lg:   ["1.125rem", { lineHeight: "1.75rem" }],
        xl:   ["1.25rem",  { lineHeight: "1.75rem" }],
        "2xl":["1.5rem",   { lineHeight: "2rem" }],
        "3xl":["1.875rem", { lineHeight: "2.25rem" }],
        "4xl":["2.25rem",  { lineHeight: "2.5rem" }],
      },

      spacing: {
        // 8-point base grid — Tailwind's default scale already maps to this
        // (4 = 1rem = 16px), but we extend with named tokens for clarity.
        "px": "1px",
        "0.5": "0.125rem",   //  2px
        "1":   "0.25rem",    //  4px
        "1.5": "0.375rem",   //  6px
        "2":   "0.5rem",     //  8px
        "2.5": "0.625rem",   // 10px
        "3":   "0.75rem",    // 12px
        "3.5": "0.875rem",   // 14px
        "4":   "1rem",       // 16px
        "4.5": "1.125rem",   // 18px — icon sweet spot between h-4 and h-5
        "5":   "1.25rem",    // 20px
        "6":   "1.5rem",     // 24px
        "7":   "1.75rem",    // 28px
        "8":   "2rem",       // 32px
        "9":   "2.25rem",    // 36px
        "10":  "2.5rem",     // 40px
        "11":  "2.75rem",    // 44px — minimum tap target
        "12":  "3rem",       // 48px
        "14":  "3.5rem",     // 56px
        "16":  "4rem",       // 64px
        "20":  "5rem",       // 80px
        "24":  "6rem",       // 96px
        // safe area insets (CSS env() values exposed as Tailwind spacing)
        "safe-top":    "env(safe-area-inset-top, 0px)",
        "safe-bottom": "env(safe-area-inset-bottom, 0px)",
        "safe-left":   "env(safe-area-inset-left, 0px)",
        "safe-right":  "env(safe-area-inset-right, 0px)",
      },

      borderRadius: {
        none: "0",
        sm:   "6px",
        DEFAULT: "8px",
        md:   "10px",   // buttons & inputs
        lg:   "12px",   // cards
        xl:   "16px",   // dialogs
        "2xl":"20px",
        full: "9999px",
      },

      boxShadow: {
        // Calm, subtle elevation — no heavy shadows
        xs:  "0 1px 2px 0 rgba(31,41,51,0.05)",
        sm:  "0 1px 3px 0 rgba(31,41,51,0.08), 0 1px 2px -1px rgba(31,41,51,0.04)",
        DEFAULT: "0 2px 8px -2px rgba(31,41,51,0.08), 0 1px 3px -1px rgba(31,41,51,0.06)",
        md:  "0 4px 12px -2px rgba(31,41,51,0.10), 0 2px 6px -2px rgba(31,41,51,0.06)",
        lg:  "0 8px 24px -4px rgba(31,41,51,0.10), 0 4px 12px -4px rgba(31,41,51,0.06)",
        xl:  "0 16px 40px -6px rgba(31,41,51,0.12), 0 8px 20px -6px rgba(31,41,51,0.06)",
        none: "none",
      },

      transitionProperty: {
        theme: "background-color, border-color, color, fill, stroke",
      },

      transitionDuration: {
        DEFAULT: "150ms",
        fast:    "100ms",
        slow:    "300ms",
      },

      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)",
      },

      screens: {
        // xs breakpoint — narrow phones (375-475px)
        xs: "475px",
        // Tailwind defaults preserved:
        // sm: "640px", md: "768px", lg: "1024px", xl: "1280px", 2xl: "1536px"
      },

      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to:   { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        // ── Soma AI animations ──────────────────────────────────────────
        "soma-slide-in-right": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
        "soma-slide-in-up": {
          from: { opacity: "0", transform: "translateY(32px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "soma-bounce": {
          "0%, 80%, 100%": { transform: "scale(0)", opacity: "0.4" },
          "40%":           { transform: "scale(1)",   opacity: "1" },
        },
        "soma-cursor": {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0" },
        },
        "soma-pulse": {
          "0%, 100%": { opacity: "1",   transform: "scale(1)" },
          "50%":      { opacity: "0.4", transform: "scale(1.6)" },
        },
        "soma-spin": {
          from: { transform: "rotate(0deg)" },
          to:   { transform: "rotate(360deg)" },
        },
      },

      animation: {
        "fade-in":  "fade-in 200ms cubic-bezier(0.4,0,0.2,1) both",
        "scale-in": "scale-in 200ms cubic-bezier(0.4,0,0.2,1) both",
        shimmer:    "shimmer 1.5s linear infinite",
        // Soma AI
        "soma-slide-in-right": "soma-slide-in-right 240ms cubic-bezier(0.34,1.10,0.64,1) both",
        "soma-slide-in-up":    "soma-slide-in-up 260ms cubic-bezier(0.34,1.10,0.64,1) both",
        "soma-bounce":         "soma-bounce 1.2s ease-in-out infinite",
        "soma-cursor":         "soma-cursor 1s step-end infinite",
        "soma-pulse":          "soma-pulse 1.8s ease-in-out infinite",
        "soma-spin":           "soma-spin 1.5s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;

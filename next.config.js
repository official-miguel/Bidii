/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Ensure gzip / brotli compression is active for all API responses.
  compress: true,

  // ── Tree-shaking for icon libraries ──────────────────────────────
  modularizeImports: {
    "lucide-react": {
      transform: "lucide-react/dist/esm/icons/{{kebabCase member}}",
    },
  },

  // ── Package import optimisation (Next 14 built-in) ───────────────
  // NOTE: lucide-react is intentionally excluded here.
  // modularizeImports above already handles its tree-shaking, and having
  // both transforms active causes `require("lucide-react")` in
  // src/lib/utils/lucideIcon.ts to resolve to a broken module object,
  // producing a `TypeError: e[o] is not a function` at runtime.
  experimental: {
    optimizePackageImports: ["recharts"],
  },
};

module.exports = nextConfig;

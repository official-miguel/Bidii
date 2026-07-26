/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Ensure gzip / brotli compression is active for all API responses.
  compress: true,

  // ── Package import optimisation (Next 14 built-in) ───────────────
  // lucide-react v1.x ships per-icon files as .mjs, so the old
  // modularizeImports transform (which resolved to .js paths) caused
  // webpack to load a non-function module object for every icon import,
  // producing `TypeError: __webpack_modules__[moduleId] is not a function`
  // and cascading React context / hooks errors.
  // Next.js 14's optimizePackageImports handles lucide-react tree-shaking
  // correctly without that problem.
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
};

module.exports = nextConfig;

# Analytics Dashboard Frontend (UI-only)

## Step 1 — Repo/API discovery
- [ ] Inspect existing API routes that provide filter option lists (classes, streams, subjects, teachers, students, exam periods, terms, academic years).
- [ ] Confirm response shapes for those endpoints to build filter option models.

## Step 2 — Core dashboard scaffolding
- [ ] Create shared `AnalyticsDashboard` component (layout: header, breadcrumbs, filter bar, search, grid skeleton).
- [ ] Add reusable breadcrumbs + drill-down history state.

## Step 3 — Filter system (presentation + wiring)
- [ ] Implement sticky `FilterBar` with searchable combobox filters, reset individually/all, keyboard navigation, remembered selection.
- [ ] Debounced refresh on filter change to reload analytics result.

## Step 4 — Global search
- [ ] Implement debounced global search with highlight + keyboard navigation.

## Step 5 — KPI cards
- [ ] Create reusable `KpiCard` with loading skeleton, count-up, trend, tooltip, sparkline.

## Step 6 — Charts section (presentation-only adapters)
- [ ] Implement `ChartContainer` (loading/error/empty, fullscreen, download UI).
- [ ] Implement chart adapters that render from `AnalyticsSeries[]`.

## Step 7 — Analytics grid + widgets
- [ ] Implement responsive dashboard widget grid + “drag-ready” container wrapper.

## Step 8 — Summary panels
- [ ] Implement `SummaryPanel` with ranking list, quick insight, trend arrows, View Details navigation.

## Step 9 — Tables
- [ ] Implement reusable analytics table with sticky headers, sorting, pagination, column visibility, export UI.

## Step 10 — Wire into pages
- [ ] Update `src/app/principal/analytics/page.tsx` and `src/app/staff/analytics/page.tsx` to render the new dashboard UI.
- [ ] Ensure permissions/no-access redirect remains intact for staff.

## Step 11 — Final QA
- [ ] Verify loading/empty/error states for filters/cards/charts/tables/panels.
- [ ] Verify breadcrumb drill-down & back navigation.
- [ ] Run typecheck/lint.

## Added — Drill-down Analysis Pages (UI scaffolding)
## Step 12 — Analysis pages requested by user
- [x] Add reusable `src/components/analytics/AnalysisPage.tsx` (charts, statistics, trend, insights, recommendations, tables + drill-down wiring).
- [x] Create principal analysis pages:
  - [x] `/principal/analytics/school`
  - [x] `/principal/analytics/class`
  - [x] `/principal/analytics/stream`
  - [x] `/principal/analytics/subject`
  - [x] `/principal/analytics/teacher`
  - [x] `/principal/analytics/student`
- [x] Update `/principal/analytics` to link to all 6 analysis pages.

# Quickstart: validate Study Scoring View

**Feature**: [spec.md](spec.md) | **Contracts**: [bridge-messages](contracts/bridge-messages.md),
[scoring-app-ui](contracts/scoring-app-ui.md) | **Sample UIDs**: [research.md § R12](research.md#r12-sample-data-for-validation)

## Prerequisites

Tools from the root [README](../../README.md#prerequisites), an internet connection (the public
image source), and a clone with the viewer submodule initialised.

## 1. Automated checks

```bash
cd apps/scoring-form
npm ci
npm test && npm run typecheck && npm run lint && npm run build
```

```bash
cd apps/viewer
pnpm install
pnpm --filter @spsoft-mvp/extension-bridge run test:unit:ci
```

Expected: all pass. The scoring-app suite covers every acceptance scenario of US1 and US2 (see
the mapping in [plan.md](plan.md#acceptance-scenario--test-mapping)).

## 2. Run both apps

Terminal 1:

```bash
cd apps/viewer && pnpm dev          # http://localhost:3000
```

Terminal 2:

```bash
cd apps/scoring-form && npm run dev # http://localhost:5173
```

`VITE_VIEWER_URL` defaults to `http://localhost:3000`; see `apps/scoring-form/.env.example`.

## 3. Manual scenarios

| # | Do | Expect | Covers |
| --- | --- | --- | --- |
*(Scenarios 6–11 revised 2026-09-19: the host no longer adds a loading indicator, failure
message, retry button or slow-load warning over the viewer. See
[research.md § R7 (amended)](research.md#r7-slow-loads-and-a-viewer-that-stops-responding-timing-values).)*

| 1 | Open `http://localhost:5173/?StudyInstanceUIDs=1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5` | "Waiting for the study to load…" on the right, an empty (black) viewer on the left, then within ~5 s the CT images on the left and "Scoring is not available yet." on the right; no page scrollbar at 1280×800. Without prior explanation, it is clear which side is the image viewer and which is the "Scoring form" panel | US1-1, US1-3, US2-1, SC-001, SC-002, SC-004 |
| 2 | Scroll slices, zoom and pan in the viewer | Right panel does not move or change | US1-2, FR-003 |
| 3 | Reload the page | Same study reappears | US1-4, FR-009 |
| 4 | Open `http://localhost:5173/` | "No study selected", no viewer | US2-2, FR-007 |
| 5 | Open `http://localhost:5173/?StudyInstanceUIDs=abc` | "This study link is not valid", no viewer | US2-2 |
| 6 | Open `…/?StudyInstanceUIDs=1.2.3.4.5.6.7.8.9` | The right panel shows "Scoring is unavailable." within a few seconds; the viewer shows OHIF's own "One or more of the requested studies are not available at this time." message (no host-added alert or button) | US2-1 |
| 7 | Reload scenario 6's link | Same behaviour as scenario 6 (reload is the only retry, FR-009) | FR-009 |
| 8 | Scenario 1 with the network offline (DevTools → Network → Offline, *after* the viewer page has loaded, then reload) | The right panel shows "Scoring is unavailable."; the viewer shows whatever OHIF itself renders for the failed fetch (no host-added message) | US2-1 |
| 9 | Stop the viewer (Ctrl-C in terminal 1), open scenario 1's link | The right panel stays on "Waiting for the study to load…" indefinitely; no failure is ever reported | edge: viewer not running, research R7 |
| 10 | Throttle the network (DevTools → Slow 3G), open scenario 1's link | The right panel stays on "Waiting for the study to load…" until the image appears, then shows the placeholder; no warning at any point | edge: slow source, research R7 |
| 11 | Open `…/?StudyInstanceUIDs=1.3.76.13.65829.2.20130125082826.1072139.2` (ECG) | OHIF draws it as a waveform (verified 2026-09-18), so it loads normally: "Scoring is not available yet." on the right within a few seconds, same as scenario 1 | edge: no viewable images |
| 12 | Narrow the window to ~900 px | Both panels still reachable (horizontal scroll), neither hidden | edge: narrow window |
| 13 | DevTools console during 1–12 | No errors from the scoring app other than expected logged failures; no patient data in logs | Principle IV |

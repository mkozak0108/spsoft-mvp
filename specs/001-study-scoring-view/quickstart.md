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
| 1 | Open `http://localhost:5173/?StudyInstanceUIDs=1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5` | "Loading study…" and "Waiting for the study to load…", then within ~5 s the CT images on the left and "Scoring is not available yet." on the right; no page scrollbar at 1280×800 | US1-1, US1-3, US2-1, SC-001, SC-002 |
| 2 | Scroll slices, zoom and pan in the viewer | Right panel does not move or change | US1-2, FR-003 |
| 3 | Reload the page | Same study reappears | US1-4, FR-009 |
| 4 | Open `http://localhost:5173/` | "No study selected", no viewer | US2-3, FR-007 |
| 5 | Open `http://localhost:5173/?StudyInstanceUIDs=abc` | "This study link is not valid", no viewer | US2-3 |
| 6 | Open `…/?StudyInstanceUIDs=1.2.3.4.5.6.7.8.9` | "Study not found" + "Try again" within 10 s | US2-2, SC-003 |
| 7 | In scenario 6, press "Try again" | "Loading study…" again, then "Study not found" again | retry |
| 8 | Scenario 1 with the network offline (DevTools → Network → Offline, *after* the viewer page has loaded, then reload) | "Can't reach the image source", or, if the viewer page itself can't load, the slow warning after ~10 s | US2-2, SC-003 |
| 9 | Stop the viewer (Ctrl-C in terminal 1), open scenario 1's link | "Loading study…", then after ~10 s "This is taking longer than it should." with no button; no failure | US2-4, research R7 |
| 10 | Throttle the network (DevTools → Slow 3G), open scenario 1's link | After ~10 s "This is taking longer than it should."; when the image appears, the warning disappears and the placeholder shows | US2-4, edge: slow source |
| 11 | Open `…/?StudyInstanceUIDs=1.3.76.13.65829.2.20130125082826.1072139.2` (ECG) | If OHIF shows no image: the slow warning after ~10 s, no failure. Record the actual behaviour in README Known limitations | edge: no viewable images |
| 12 | Narrow the window to ~900 px | Both panels still reachable (horizontal scroll), neither hidden | edge: narrow window |
| 13 | DevTools console during 1–12 | No errors from the scoring app other than expected logged failures; no patient data in logs | Principle IV |

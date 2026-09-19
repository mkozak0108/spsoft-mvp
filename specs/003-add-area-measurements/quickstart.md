# Quickstart: validating Add Area Measurements

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

This is a manual walkthrough (no automated tests exist, per the constitution's standing pause).
It is also the place where the items marked **verify** in [research.md](research.md) are proven.

## Setup

Two terminals, from the repository root, as in the README. Feature 001's setup applies unchanged.

```bash
cd apps/viewer && pnpm install && pnpm dev
```

```bash
cd apps/scoring-form && npm ci && npm run dev
```

If the fork was already running before this feature, restart it: the config change
(`measurementTrackingMode`) is read at start.

Sample link (chest CT, 381 images, has pixel spacing so areas are in `mm²`):

```text
http://localhost:5173/?StudyInstanceUIDs=1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5
```

Keep the browser console open; the scoring app and the viewer log the transitions.

## Scenarios

| # | Do | Expect | Covers |
| --- | --- | --- | --- |
| 1 | Open the link. Before the images appear, look at the form | The waiting state; no "Add measurement" button | FR-001 edge, 001 |
| 2 | After the image appears, click **Add measurement** | A row "Measurement 1", status "Pending", **Activate** button, total "—" | US1-1, FR-001 |
| 3 | Click **Activate** | Row shows "Drawing…" and **Cancel**. The viewer toolbar highlights the ellipse tool | US1-2, FR-002 |
| 4 | Draw an ellipse on the image | Row shows a value with `mm²` (one decimal) and "Done", no control. **No "track measurements?" dialog appeared** | US1-3, FR-003, R5 |
| 5 | Left-drag on the image | It pans; no second ellipse | US1-4, FR-004, SC-005 |
| 6 | Add two more rows, activate row 3 first, draw; then row 2, draw | Each value is in the row that was activated; total = sum of the displayed values after each | US2, SC-002, SC-003 |
| 7 | Add a row and activate it, then **Cancel** | Row is "Pending"; the ellipse tool is off (drag pans); no measurement appears | US3-1 |
| 8 | Add rows A and B. Activate A, then activate B. Draw | A is "Pending", B is "Done" with the value; A is empty | US3-2, FR-005, SC-004 |
| 9 | Activate a row, then use the viewer's own toolbar to pick the ellipse tool and draw | Nothing in the form changes unless the row is `Drawing…` and was activated from it | edge case |
| 10 | While a row is "Drawing…", reload only the viewer frame (right-click inside it → reload frame) | The row returns to "Pending" once the viewer is ready again | FR-008 |
| 11 | Reload the page | The study reopens and the form has no rows | Assumptions |
| 12 | In the browser console, switch the console's context to the viewer iframe and run `parent.postMessage({ source: 'spsoft-mvp-viewer', type: 'event', version: 2, event: 'MEASUREMENT_ADDED', payload: { StudyInstanceUID: '<the study UID>', rowId: 'row-1', area: 1, unit: 'mm²' } }, 'http://localhost:5173')` while a row is "Drawing…" | Nothing changes in the form, and the scoring page logs a `warn` about an unsupported version. Repeat with `version: 1` and a `rowId` that names no row: still nothing changes, with a `warn` about the row | FR-009, FR-010, SC-006 |
| 13 | Open the link with a missing or malformed study | "Scoring is unavailable."; no measurement form | 001 unchanged |

## Checks that need the running viewer (verify)

- **R3**: the toolbar's active-tool highlight follows the commands (scenario 3 and 5).
- **R4**: the area is present when the measurement event fires: scenario 4 shows a number, not an
  empty row and an error in the console.
- **R5**: no tracking modal in scenario 4. If it appears, switch the config value to
  `'simplified'` and repeat.
- **Mixed units**: rows live in one page and one study, and a study's images normally share one
  calibration, so mixed units can be shown only on a study that mixes calibrated and uncalibrated
  images (**verify** whether the public source has one). If none is found, the mixed-units total
  stays unverified in the running app; say so in the README's known limitations.

## Delivery checks

Before merging, in each app: `npm run typecheck`, `npm run lint`, `npm run build` (scoring app),
and `npm audit --omit=dev`. There is no test command to run.

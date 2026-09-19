# Quickstart: validating Live Measurement Update

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

A manual walkthrough (no automated tests, per the constitution's standing pause). It is also
where the items marked **verify** in [research.md](research.md) are proven.

## Setup

As in [003's quickstart](../003-add-area-measurements/quickstart.md): the viewer (`pnpm dev` in
`apps/viewer`) and the scoring app (`npm run dev` in `apps/scoring-form`), then the chest CT link:

```text
http://localhost:5173/?StudyInstanceUIDs=1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5
```

Keep the browser console open. "Finish a measurement" below means 003's flow: **Add
measurement** → **Activate** → draw an ellipse → the row is "Done" with a value.

## Scenarios

| # | Do | Expect | Covers |
| --- | --- | --- | --- |
| 1 | Finish a measurement. Without pressing anything in the form, grab one of the ellipse's handles and drag it slowly for about three seconds | The handle moves (the viewer is on Pan). The row's value and the total change **while** the mouse button is held, several times a second, keeping up with the viewer's own area text | US1-1, US1-2, US1-4, FR-003, FR-006, SC-001, R1, R7 |
| 2 | Release the handle and wait a moment | The row agrees with the area next to the ellipse, at the viewer's rounding (e.g. "125 mm²" there, "124.5 mm²" in the row). The total equals the displayed row values. The row is still "Done", with no button | US1-3, US1-5, SC-002 |
| 3 | Grab the ellipse by its outline and move it without resizing | The row's value does not change | edge case, R2 |
| 4 | Drag a handle past the edge of the image, then back | While off the image: the viewer shows no area, the row shows "No area", and the total leaves it out. Back on the image: the value and the total return | FR-015, R4 |
| 5 | Draw an ellipse quickly and release at once; after a moment compare the row with the viewer | They agree: a slightly early area from the moment of release has been corrected (**verify** R3) | R3 |
| 6 | Finish three measurements. Drag a handle of the second ellipse | Only "Measurement 2" and the total change | US2-1, SC-003 |
| 7 | Add a fourth row and **Activate** it. Drag a handle of the second ellipse. Then draw a new ellipse | While dragging: row 2 follows, row 4 stays "Drawing…", no new ellipse starts. The new ellipse fills row 4 | US2-2, FR-007, SC-004, R7 |
| 8 | With no row "Drawing…", pick the ellipse tool from the viewer's own toolbar, draw an ellipse, drag its handle, then delete it (right-click → Delete measurement) | Nothing in the form changes at any step | US2-3, US3-4, FR-008, SC-005 |
| 9 | Activate a row and watch it while drawing its ellipse, before releasing | The row shows no value until the ellipse is finished | US2-4, FR-008 |
| 10 | With rows 1–3 "Done", right-click the first ellipse → **Delete measurement** | "Measurement 1" disappears; the others are still called "Measurement 2" and "Measurement 3"; the total is their sum. The scoring app logs the removal at `info` | US3-1, FR-010, SC-007, R6 |
| 11 | Click an ellipse to select it and press Backspace | Its row disappears and the total follows | R5 |
| 12 | Delete the last remaining "Done" row's ellipse | The row disappears; "Total area: —" | US3-2 |
| 13 | Finish one row A, activate row B, delete A's ellipse, then draw | A disappears, B stays "Drawing…" until the new ellipse fills it | US3-3, FR-010 |
| 14 | Finish two rows, then use the measurements panel to delete all measurements, or a group of them (whichever the panel offers) | Every row whose ellipse was deleted disappears, and the total ends on the rows that remain (**verify** R5: bulk delete) | edge case, R5 |
| 15 | After deleting an ellipse, press Ctrl+Z | The ellipse comes back in the viewer; its row does not; nothing else in the form changes | edge case, R10 |
| 16 | Drag a handle continuously for ten seconds, then click **Add measurement** right after releasing | The handle follows the pointer throughout; the new row appears at once | SC-006 |
| 17 | With rows "Done", reload only the viewer frame (right-click inside it → reload frame) | "Done" rows keep their values and are not removed; after the viewer is ready, dragging is no longer possible (the ellipses are gone) (**verify** R5: no removal on mode enter) | edge case |
| 18 | In the console, with the viewer iframe as context, and a row "Done" as `row-1` and a row "Pending" as `row-2`: post `MEASUREMENT_UPDATED` with `change: 'areaChanged'`, `area: 1`, `unit: 'mm²'`, `rowId: 'row-2'`, and the correct envelope (as in 003 scenario 12) | Nothing changes; the scoring page logs a `warn` about a row that is not done. Repeat with `change: 'resized'`: `warn` about the shape. Repeat with `version: 2`: `warn` about the version. Repeat for `row-1` and version 1: the row shows 1.0 mm² (the guard accepts a valid update) | FR-011, FR-012, SC-008 |
| 19 | Reload the page | The study reopens with no rows | Assumptions |

## Checks that need the running viewer (verify)

- **R1**: scenario 1 shows the value moving during the drag, not only after it.
- **R3**: scenario 5, the row ends on the same area as the viewer.
- **R5**: scenario 14 removes rows through a bulk delete; scenario 17 removes none.
- **R7**: scenarios 1 and 7, a handle can be dragged on Pan, and with the ellipse tool active an
  existing ellipse is edited rather than a new one started.

## Delivery checks

Before merging, in the scoring app: `npm run typecheck`, `npm run lint`, `npm run build`, and
`npm audit --omit=dev`. In the fork, the bridge builds as part of `pnpm dev` / `pnpm build`. There
is no test command to run.

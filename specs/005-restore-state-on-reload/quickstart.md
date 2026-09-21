# Quickstart: validating Restore State on Reload

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

A manual walkthrough (no automated tests, per the constitution's standing pause). It is also where
the items marked **verify** in [research.md](research.md) are proven.

## Setup

As in [004's quickstart](../004-live-measurement-update/quickstart.md): the viewer (`pnpm dev` in
`apps/viewer`) and the scoring app (`npm run dev` in `apps/scoring-form`), then the chest CT link:

```text
http://localhost:5173/?StudyInstanceUIDs=1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5
```

Keep the browser console open, and the Application (or Storage) tab ready on Local Storage for
`http://localhost:5173`. "Finish a measurement" means 003's flow: **Add measurement** →
**Activate** → draw an ellipse → the row is "Done" with a value. "Reload" means the browser's
reload button on the whole page, in the same tab.

## Scenarios

| # | Do | Expect | Covers |
| --- | --- | --- | --- |
| 1 | Finish three measurements. Note the row numbers, values and the total. Reload | The form comes back with the same three rows, same numbers, same statuses, same values and the same total. The three ellipses are back on the image, in the same places and sizes, within a moment of the study appearing (**verify** R5: the restore path; R8: the area) | US1-1, US1-2, US1-3, FR-001, FR-003, FR-005, SC-001, SC-002 |
| 2 | After scenario 1, compare each row's value with the viewer's own area text for its ellipse | They agree at the viewer's rounding, as they did before the reload: the area was recomputed from the restored shape, not read from storage | R8, SC-002 |
| 3 | After scenario 1, drag a handle of the first restored ellipse | The row's value follows the drag live and the total is recalculated, exactly as for an ellipse drawn in this session | US2-1, FR-006, SC-003 |
| 4 | Delete the second restored ellipse in the viewer, then reload again | The row is gone before the reload and does not come back after it. The remaining rows keep their numbers | US2-2, US2-3, FR-012, SC-004 |
| 5 | After scenario 4, press **Add measurement** | The new row continues the numbering (it does not reuse a removed or restored number) | US1-5, FR-004, SC-001 |
| 6 | Finish a measurement, then grab the ellipse by its outline and move it without resizing. Reload | The ellipse comes back where it was **moved to**, not where it was drawn. Its value is unchanged | FR-005, R4 |
| 7 | Press **Add measurement** twice without drawing, then reload | Both "Pending" rows come back, still "Pending" | US1-1, FR-003 |
| 8 | Press **Add measurement**, **Activate** it, and reload while it is "Drawing…" | The row comes back as "Pending", with no half-drawn ellipse on the image | FR-007, edge case |
| 9 | Drag a handle continuously for ten seconds, then press reload within half a second of releasing | The handle follows the pointer throughout and the form stays responsive (**verify** R4: the message rate). After the reload the ellipse is at its final size: the last change was written on the way out, not by the throttle (**verify** R10: the flush) | SC-004, FR-002, R4, R10 |
| 10 | Open a second study's link in the same tab (replace the `StudyInstanceUIDs` value), then go back to the first | The second study's form is empty and shows none of the first study's ellipses. The first study's link brings its own rows and ellipses back | US3-1, US3-2, FR-008, SC-005 |
| 11 | Open the first study's link in a **new tab** | The same rows and ellipses come back: every tab of the app shares the saved work | Assumptions, edge case |
| 12 | With work saved, stop the viewer (`Ctrl+C` in its terminal) and reload the scoring page | The form panel says scoring is unavailable and nothing is drawn. Start the viewer again and reload: the rows and ellipses are back | US3-3, FR-015, edge case |
| 13 | With rows "Done", reload only the viewer frame (right-click inside it → reload frame) | The ellipses come back by themselves once the viewer is ready again, and stay editable; "Drawing…" rows return to "Pending" | FR-005, R7, edge case |
| 14 | In Local Storage, edit the study's value: change `version` to `2`. Reload | The form starts empty, the console logs a `warn` naming the version reason, and the key is gone | FR-010, FR-011, SC-006 |
| 15 | Repeat with the value set to `not json`, then with a `points` array of three points instead of four | Each time: an empty form, one `warn` with its reason (`unreadable`, then `shape`), the key removed, and the app otherwise working | FR-010, FR-012, SC-006 |
| 16 | Check the stored value while three measurements are on screen | It holds only the version, the next row number, and the rows with their numbers, statuses, values and ellipse geometry. No patient name, no study description, no annotation ids. The console has logged no areas, units or geometry | FR-013, SC-008 |
| 17 | In the console, with the viewer iframe as context, post `RESTORE_MEASUREMENTS` with a valid envelope but another study's `StudyInstanceUID`, then one with 200 measurements, then one whose `ellipse` is missing `points` | Nothing is drawn in any case, and the viewer logs a `warn` each time | contract, FR-014 |
| 18 | Open the page with no study saved yet (a fresh study link) | The form starts empty, with no warning in the console, and Local Storage has no key for this study until you press **Add measurement** | US1-4, SC-006, R10 |
| 19 | Quit the browser, start it again and open the link | The work comes back: it is kept until deleted | Assumptions |
| 20 | Finish two measurements. In Local Storage, change the second row's `referencedImageId` to a well-formed but wrong value (change one character of the instance UID in it). Reload | Row 2 shows **Not restored** with its saved value and an **Activate** button; the total leaves it out; its ellipse is not drawn; row 1 and its ellipse are back as normal. The viewer logs one `warn` (**verify** R13: a wrong image fails in OHIF's mapping). **Activate** row 2 and draw: it is "Done" with the new area and the total includes it. Reload again: both rows come back as ordinary restored rows | US2-6, FR-017, SC-010, R13 |
| 21 | In the scoring page's console, count changes to this study's stored value: `k = Object.keys(localStorage).find((key) => key.startsWith('spsoft-mvp.measurements.')); n = 0; last = localStorage.getItem(k); setInterval(() => { const v = localStorage.getItem(k); if (v !== last) { n++; last = v; } }, 50)`. Drag a handle continuously for ten seconds, release, wait two seconds, then read `n` | About ten to twelve changes — one a second plus the edges — not hundreds (**verify** R10: the throttle) | FR-002, R10 |
| 22 | Finish a measurement, wait two seconds, then end the tab's process from Chrome's Task Manager (**Window → Task Manager**) and reload the crashed tab | The measurement is back: the throttle's trailing write landed without any page event | edge case (crash), R10 |

## Checks that need the running viewer (verify)

- **R5**: scenario 1 — a restored ellipse is visible, in the right place, and editable, which
  proves `addRawMeasurement` plus the render trigger.
- **R8**: scenarios 1 and 2 — the row's value after a restore comes from the viewer's own
  recomputation and agrees with what the viewer shows.
- **R4**: scenarios 6 and 9 — a move with no resize is reported and saved, and the higher message
  rate leaves both apps responsive.
- **R10**: scenario 21 (writes about once a second during a drag), scenario 9 (the flush on
  reload) and scenario 22 (a crash loses nothing older than a second).
- **R13**: scenario 20 — a saved ellipse on an image that is not in the study fails in OHIF's
  mapping, is reported, and its row is marked "Not restored" and can be drawn again.

## Delivery checks

Before merging, in the scoring app: `npm run typecheck`, `npm run lint`, `npm run build`, and
`npm audit --omit=dev`. In the fork, the bridge builds as part of `pnpm dev` / `pnpm build`. There
are no tests to run (constitution v3.0.0).

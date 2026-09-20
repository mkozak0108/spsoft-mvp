# Implementation Plan: Live Measurement Update

**Branch**: `004-live-measurement-update` | **Date**: 2026-09-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-live-measurement-update/spec.md`

## Summary

A finished row now follows its ellipse. The viewer's bridge links each ellipse it reports with
`MEASUREMENT_ADDED` to its row: OHIF's measurement uid → `rowId`, kept only in the viewer. It then
reports every later change to that ellipse, in two messages:

- `MEASUREMENT_UPDATED`, which gets a payload for the first time, with a `change` discriminant:
  - `AreaChanged { area, unit }`: from OHIF's own update event. Cornerstone recomputes the area
    about every 100 ms during a drag and once more after it, so the row moves live and ends on the
    final value (research R1). Repeats are not sent (R2).
  - `AreaUnavailable`: the ellipse is partly off the image, and the viewer has no area for it (R4).
- `MEASUREMENT_REMOVED { rowId }`: from OHIF's `MEASUREMENT_REMOVED` and `MEASUREMENTS_CLEARED`,
  and named after the viewer's own event (R5). *(Revised 2026-09-20: the event names turned out
  not to be fixed, so a removal no longer rides on `MEASUREMENT_UPDATED`.)*

The form updates, blanks or removes the `Done` row it names, and the total follows because it is
derived from the rows. Rows keep their names when one is removed (R6). The contract stays at
version 1 (R9). Nothing in OHIF's own code changes: every change in the fork is in
`extensions/bridge/`.

## Technical Context

**Language/Version**: TypeScript ~6.0 (strict) in the scoring app and the bridge; React 19.2 in
the scoring app; OHIF fork v3.14.0-beta.30, `@cornerstonejs/tools` 5.10.3 (all unchanged).

**Primary Dependencies**: none added. The bridge uses the same `measurementService` it already
subscribes to (three more events of it) and `buildEvent` / `postToHost`.

**Storage**: N/A. Rows and links live in memory; a reload starts empty (spec Assumptions).

**Testing**: none automated (constitution v3.0.0, standing pause); `tasks.md` has no test tasks.
Verification is the manual [quickstart.md](quickstart.md) plus `typecheck`, `lint` and `build`.

**Target Platform**: unchanged: current desktop browsers; viewer on `localhost:3000`, scoring app
on `localhost:5173` (`4173` for `vite preview`).

**Project Type**: two client-side web apps over `postMessage`, the contract in one file owned by
the bridge (unchanged).

**Performance Goals**: during a drag, the row trails the viewer by at most a quarter of a second
(SC-001). Cornerstone's own 100 ms stats throttle sets the pace, and deduplication (R2) keeps it
to about ten messages a second. Each one is a guard check and a small list re-render. A ten-second
drag leaves both apps responsive (SC-006).

**Constraints**:
- `version: 1` is fixed by the product owner. The event names are not: new ones may be added, and
  deletion gets `MEASUREMENT_REMOVED` (spec FR-009).
- Fork changes stay inside `extensions/bridge/` (003's one config line is untouched). They went on
  a fork branch `004-live-measurement-update`, started from the commit the submodule pinned
  (`3051b37`, fork branch `003-share-bridge-guards`), and were pushed and pinned by the submodule
  bump. The fork PR was merged on 2026-09-20, so the submodule now pins the fork's `master`
  (`f2ee4fce`).
- The bridge files have no JSX or hooks, so the fork's React Compiler gates (its
  `ohif-react-compiler` skill) do not apply.

**Scale/Scope**: one study per page, a handful of rows (SC-003 exercises five).

No unknowns remain: [research.md](research.md) R1–R11 resolve them. Four findings are proven only
by running the app and have quickstart steps: live cadence (R1), the correction after release
(R3), bulk delete and no removal on mode enter or exit (R5), and editing on Pan and with the tool
active (R7).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research gate

| Principle | Gate | Status |
| --- | --- | --- |
| I. Simplicity / YAGNI | Only the three user stories are built. No new dependencies. Abstractions have ≥ 2 call sites. Deviations go in Complexity Tracking | PASS: no dependencies; one new enum and one new message; no throttle or scheduler of our own |
| II. Security & Privacy | Every message validated at the boundary; no secrets, no HTML injection, no personal data in logs | PASS: the new payload goes through the same five host rules; `change` is checked against the enum; area and unit reuse the 003 checks |
| III. Observability | No swallowed errors; one logger; visible states | PASS: rejections `warn` with a reason; removals `info` with the row id; an ellipse that can't be measured is shown ("No area") rather than hidden |
| IV. Reviewer-Ready Delivery | Documented commands still work; decisions, cuts and limitations written down | PASS: no new setup; `ARCHITECTURE.md` gets the payload, decisions and limitations (FR-013) |
| Tech constraints | strict TS, enums for domain values, comments explain why | PASS: `MeasurementChange`, new action types and drop reasons are enums |
| Workflow | No test tasks | PASS |

### Post-design re-check

| Principle | Result after design |
| --- | --- |
| I | PASS. Bridge: one map and three subscriptions in `watchMeasurements.ts`. Two helpers, each with ≥ 2 call sites: reading the study id from the URL (3 posts) and reporting a removal (OHIF's removed and cleared handlers). Host: three reducer cases, one guard helper shared by `MEASUREMENT_ADDED` and `AreaChanged`, and a `number` field on the row. No annotation id on the wire (R3), no throttle (R1). |
| II | PASS. The host's guard accepts `MEASUREMENT_UPDATED` only with a non-empty `rowId`, a known `change`, and for `AreaChanged` a finite `area` ≥ 0 and a `unit` of at most 16 characters, and `MEASUREMENT_REMOVED` only with a non-empty `rowId`. Origin, window, version and study checks are unchanged. The viewer posts only for uids it linked itself. The value is rendered as text, and areas are never logged. `npm audit --omit=dev` at delivery. |
| III | PASS. Updates or removals for an unknown or non-`Done` row are logged at `warn` with `UnknownRow` / `NotDone`. A removal is logged at `info` with the row id. Area changes are not logged one by one: they are not transitions, and at ~10 a second they would bury the useful lines. The one failure-like state, an ellipse with no area, is visible in the row. 003's recorded deviation (no error state when a drawing can't start) is unchanged and unaffected. |
| IV | PASS. `ARCHITECTURE.md`: the flow gains the update and removal arrows; the events table gets the two new payloads and loses "reserved"; new decisions (a separate `MEASUREMENT_REMOVED`, version still 1, links kept in the viewer, fixed row names); "Left out on purpose" drops editing and deleting in the viewer; new known limitations (R10: undo does not bring a row back; a deletion mid-draw finishes the half-drawn ellipse; after a viewer reload, finished rows can no longer be edited). README unchanged: no run step changes. |

## Project Structure

### Documentation (this feature)

```text
specs/004-live-measurement-update/
├── spec.md
├── plan.md                        # this file
├── research.md                    # Phase 0
├── data-model.md                  # Phase 1: row changes, viewer links
├── quickstart.md                  # Phase 1: manual validation
├── contracts/
│   ├── bridge-messages.md         # the two new events and MeasurementChange (extends 003)
│   └── scoring-app-ui.md          # live value, "No area", removal, fixed row names (extends 003)
├── checklists/requirements.md
└── tasks.md                       # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
ARCHITECTURE.md                    # payloads, flow, decisions, limitations (FR-013)

apps/viewer/                       # the fork (submodule); fork branch 004-live-measurement-update
└── extensions/bridge/src/
    ├── messages.ts                # + MeasurementChange; MEASUREMENT_UPDATED and _REMOVED join
    │                              #   EventPayloads; "reserved" notes removed; header points to
    │                              #   004's contract too
    └── watchMeasurements.ts       # + links map; MEASUREMENT_UPDATED / _REMOVED / MEASUREMENTS_CLEARED
                                   #   subscriptions; study-id and report-removal helpers

apps/scoring-form/src/
├── lib/
│   ├── bridge.ts                  # guard: MEASUREMENT_UPDATED case; area+unit check shared with
│   │                              #   MEASUREMENT_ADDED
│   └── measurements.ts            # row.number; AreaChanged / AreaUnavailable / Removed actions;
│                                  #   NotDone drop reason; removal logging
└── components/
    └── MeasurementForm.tsx        # label from row.number; "No area" for a Done row without value
```

**Structure Decision**:
- **Viewer:** everything stays in the bridge's existing module; no new file, since the links
  belong to the same lifecycle as `pendingRowId`.
- **Scoring app:** the rules stay in the pure reducer (003 R8). The hook keeps side effects and
  logging, and the component only renders.
- **Contract:** one file, changed in the fork, reaching the scoring app with the submodule bump;
  the scoring app's `typecheck` there is the compatibility check (unchanged).
- **Order of work:** fork first (contract + bridge, pushed), then the submodule bump together with
  the scoring app changes, so `main` never pins a contract the form doesn't compile against.

## Complexity Tracking

No constitution violations to justify. 003's entries still stand, and this feature adds none.

# Implementation Plan: Restore State on Reload

**Branch**: `005-restore-state-on-reload` | **Date**: 2026-09-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-restore-state-on-reload/spec.md`

## Summary

The doctor's work stops living only in the page. The host writes it to the tab's `sessionStorage`,
one entry per study, and reads it back when the page opens (research R1); the viewer stores
nothing.

For the ellipses to come back, the host has to know where they are, so the viewer now reports the
shape along with the area. `MEASUREMENT_ADDED` and `MEASUREMENT_UPDATED` each gain an `ellipse`:
the image the ellipse is on, its frame of reference, the two orientation vectors and its four
world points — read off the measurement object the bridge already receives (R2, R3). Because a
move changes no area, the rule for sending `MEASUREMENT_UPDATED` widens from "the area or unit
changed" to "the area, the unit or the geometry changed" (R4).

Coming back is one new command. On every `VIEWER_READY` the host posts `RESTORE_MEASUREMENTS` with
the rows that have a saved ellipse; the viewer puts each one back with OHIF's own
`measurementService.addRawMeasurement`, the path its SR viewer hydrates with, and links the uid it
gets to the row id (R5, R6). A restored ellipse is then indistinguishable from one drawn in this
session: 004's live-update and removal paths carry it with no change. Its area is not read from
storage — cornerstone recomputes it from the shape and it arrives as an ordinary update (R8).

Saved data is untrusted input: the stored value carries its own version, every field is checked,
and anything that fails is dropped whole, the key removed, and the reason logged (R9). The
contract stays at version 1 (R12). Nothing in OHIF's own code changes: every fork change is in
`extensions/bridge/`.

## Technical Context

**Language/Version**: TypeScript ~6.0 (strict) in the scoring app and the bridge; React 19.2 in
the scoring app; OHIF fork v3.14.0-beta.30, `@cornerstonejs/tools` 5.10.3 (all unchanged).

**Primary Dependencies**: none added. The bridge calls `measurementService.getSource`,
`getSourceMappings` and `addRawMeasurement`, which it reaches through the `servicesManager` it
already has, plus `cornerstoneViewportService` for one render.

**Storage**: **new** — `window.sessionStorage` on the scoring app's origin, key
`spsoft-mvp.measurements.<StudyInstanceUID>`, a few kilobytes, the life of the tab. The first
thing this project stores outside memory; the contract is
[contracts/saved-state.md](contracts/saved-state.md) and the privacy reasoning is in the
Constitution Check below.

**Testing**: none automated (constitution v3.0.0, standing pause); `tasks.md` has no test tasks.
Verification is the manual [quickstart.md](quickstart.md) plus `typecheck`, `lint` and `build`.

**Target Platform**: unchanged: current desktop browsers; viewer on `localhost:3000`, scoring app
on `localhost:5173` (`4173` for `vite preview`).

**Project Type**: two client-side web apps over `postMessage`, the contract in one file owned by
the bridge (unchanged).

**Performance Goals**: the ellipses are back within two seconds of the study appearing (SC-002),
which is one `addRawMeasurement` per row and one render. During a drag the message rate rises to
one per mouse move (~60 a second, R4) and each one costs a guard, a reducer case and one
`sessionStorage` write of a few kilobytes (R10); both apps stay responsive through a ten-second
drag (quickstart 9).

**Constraints**:
- `version: 1` is fixed by the product owner; event and command names are ours to extend.
- Saved work lives for the life of the tab, not beyond it (spec Assumptions, settled 2026-09-20).
  `sessionStorage` *is* that lifetime, so there is no expiry logic of our own.
- Fork changes stay inside `extensions/bridge/`. They go on a fork branch
  `005-restore-state-on-reload`, started from the commit the submodule pins (`f2ee4fce`, the
  fork's `master` after 004's PR), and are pushed and pinned by the submodule bump.
- The bridge files have no JSX or hooks, so the fork's React Compiler gates do not apply.

**Scale/Scope**: one study per page, a handful of rows; the viewer accepts at most 100 ellipses in
one restore command.

No unknowns remain: [research.md](research.md) R1–R12 resolve them. Three findings are proven only
by running the app and have quickstart steps: the restore path and its render (R5), the area
arriving by recomputation (R8), and the message and save rate during a drag (R4, R10).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research gate

| Principle | Gate | Status |
| --- | --- | --- |
| I. Simplicity / YAGNI | Only the three user stories are built. No new dependencies. Abstractions have ≥ 2 call sites. Deviations go in Complexity Tracking | PASS: no dependencies; one new module in the host, one new command, one new type; no expiry, throttle or scheduler of our own |
| II. Security & Privacy | Every message validated at the boundary; browser storage of personal data justified here; no secrets, no HTML injection, no personal data in logs | PASS with justification below: the stored data is the minimum the feature needs, it is read back as untrusted input, and it is never logged |
| III. Observability | No swallowed errors; one logger; visible states | PARTIAL: rejections and storage failures `warn` with a reason; a failed restore has no visible state, recorded in Complexity Tracking |
| IV. Reviewer-Ready Delivery | Documented commands still work; decisions, cuts and limitations written down | PASS: no new setup; `ARCHITECTURE.md` gets the new field, the command, the storage and its limits, and loses persistence from "Left out on purpose" (FR-016) |
| Tech constraints | strict TS, enums for domain values, comments explain why | PASS: `BridgeCommand.RestoreMeasurements`, `SavedStateVersion` and the load-failure reasons are enums |
| Workflow | No test tasks | PASS |

**Principle II — why this app may now store data in the browser.** The constitution asks for
personal data kept to the minimum a feature needs, and for persistent browser storage to be
justified here.

- *What is stored*: the rows the doctor made (number, status, area, unit) and, per row, the
  ellipse's geometry (the viewer's image id, the frame of reference, two orientation vectors, four
  world points). The study identifier is the key.
- *What is not*: nothing about the patient, no study description, no annotation ids, no
  credentials. The study identifier is already in the page address, so the key adds no identifier
  the tab did not already carry.
- *Why it is needed*: restoring the doctor's work after a reload is the feature. The rows alone
  would bring back numbers the doctor can no longer correct or delete, which is the trap User
  Story 2 exists to prevent, so the geometry has to travel with them.
- *How long*: the tab. `sessionStorage` ends with it, so a shared machine keeps nothing after the
  doctor closes the tab — the reason this lifetime was chosen over a longer one.
- *How it is handled*: it never leaves the browser, it is never logged (values, units, geometry
  and the study id are all excluded), and it is narrowed field by field when it is read back,
  exactly as a bridge message is.

### Post-design re-check

| Principle | Result after design |
| --- | --- |
| I | PASS. Host: one new module (`savedState.ts`: load, save, and the guards they need), one new field on the row, one new command sent from the place that already handles `VIEWER_READY`. Viewer: one new function in the existing `watchMeasurements.ts`, because a restored ellipse belongs to the same lifecycle as `links`. One helper earns two call sites: the host's ellipse check, used by the bridge guard and by the saved-state loader, so it goes in `utils/guards.ts` next to the two that are already shared. The viewer checks an ellipse in one place (its command guard) and compares two ellipses in one place (the "did anything change?" test), so both stay named functions in the file that uses them, beside the `isSameArea` they mirror; the host's reducer compares in one place too. Neither app's copy is an abstraction over the other's: the two ship separately and already keep their own guards for that reason. No expiry, no debounce, no schema library. |
| II | PASS. The host's guard accepts `MEASUREMENT_ADDED` and `MEASUREMENT_UPDATED` only with an `ellipse` whose two strings are non-empty and bounded (512 and 64 characters) and whose vectors and points are arrays of exactly three finite numbers; origin, window, version and study checks are unchanged. The viewer accepts `RESTORE_MEASUREMENTS` only from an allowed origin and `window.parent`, with at most 100 entries, each passing the same ellipse check, and only when it names the study the viewer has open — the one command that carries a study, because it is the one that puts marks on a patient's images. Stored values go through the same narrowing plus a version check before anything is shown or drawn; a failure removes the key. Values are rendered as text. `npm audit --omit=dev` at delivery. |
| III | PARTIAL, unchanged from the pre-research gate. Storage failures (`StorageUnavailable`, `Unreadable`, `UnsupportedVersion`, `Shape`) and a restore the viewer cannot carry out are logged at `warn` with a reason enum and never the value; no `catch` swallows anything. Row transitions keep 003's `info` lines. Geometry changes are not logged one by one, for 004's reason. What has no visible state is a restore that fails: the doctor sees an empty form, which is also what a first open looks like. Recorded in Complexity Tracking. |
| IV | PASS. `ARCHITECTURE.md`: the flow gains the restore arrow; the events table gains `ellipse` and the new send rule; the commands table gains `RESTORE_MEASUREMENTS`; "Where the state lives" stops saying nothing is saved and describes the store, its key, its lifetime and its version; new decisions (the host owns the store, `sessionStorage` for the tab lifetime, geometry on the wire rather than a second store, the area recomputed rather than restored); "Left out on purpose" loses "Persistence"; the known limitation that a reloaded viewer's rows can no longer be edited goes, replaced by the narrower ones this feature leaves (an ellipse whose image is gone, a second tab starting empty). README: unchanged — no run step changes, and the storage is described where the other decisions are. |

## Project Structure

### Documentation (this feature)

```text
specs/005-restore-state-on-reload/
├── spec.md
├── plan.md                        # this file
├── research.md                    # Phase 0
├── data-model.md                  # Phase 1: the row's ellipse, the saved state, viewer links
├── quickstart.md                  # Phase 1: manual validation
├── contracts/
│   ├── bridge-messages.md         # ellipse on two events, RESTORE_MEASUREMENTS (extends 004)
│   └── saved-state.md             # the stored value: key, shape, version, reading rules
├── checklists/requirements.md
└── tasks.md                       # Phase 2 (/speckit-tasks)
```

There is no `scoring-app-ui.md` this time: the feature adds no control and no wording. The only
visible change is that the list can already have rows in it when the page opens, which
[data-model.md](data-model.md) covers.

### Source Code (repository root)

```text
ARCHITECTURE.md                    # ellipse field, RESTORE_MEASUREMENTS, the store and its
                                   #   limits; persistence leaves "Left out on purpose" (FR-016)

apps/viewer/                       # the fork (submodule); fork branch 005-restore-state-on-reload
└── extensions/bridge/src/
    ├── messages.ts                # + Point3, EllipseGeometry; ellipse on MEASUREMENT_ADDED and
    │                              #   MEASUREMENT_UPDATED; + BridgeCommand.RestoreMeasurements
    │                              #   and its payload
    └── watchMeasurements.ts       # read the geometry off the measurement; compare it in the
                                   #   "did anything change?" test; guard and handle
                                   #   RESTORE_MEASUREMENTS; restore one ellipse through
                                   #   addRawMeasurement, link it, render once

apps/scoring-form/src/
├── lib/
│   ├── bridge.ts                  # guard: the shared ellipse check on the two events
│   ├── savedState.ts              # new: load / save, the version, the field checks, the
│   │                              #   failure reasons
│   └── measurements.ts            # row.ellipse; actions carry it; geometry in the no-op test;
│                                  #   initial state from savedState.load; save on change;
│                                  #   RESTORE_MEASUREMENTS on VIEWER_READY
└── components/                    # unchanged
```

**Structure Decision**:
- **Viewer:** the restore lives next to the links it creates, in `watchMeasurements.ts`. No new
  file: a restored ellipse is the same thing as a drawn one the moment it exists.
- **Scoring app:** storage gets its own module, because it is a boundary with its own format,
  version and failure modes — the only part of this feature that is not about measurements. The
  reducer stays pure: it carries the geometry but never reads or writes storage. The hook keeps
  the side effects (the save effect next to the existing logging effect, and the restore command
  next to the existing `VIEWER_READY` handling).
- **Contract:** one file, changed in the fork, reaching the scoring app with the submodule bump;
  the scoring app's `typecheck` there is the compatibility check (unchanged).
- **Order of work:** fork first (contract + bridge, pushed), then the submodule bump together with
  the scoring app changes, so `main` never pins a contract the form doesn't compile against.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| No user-visible state when saved work cannot be read, or cannot be written. Principle III asks for visible error states in failure-prone flows; here the form silently starts empty (or silently stops saving) and only the console says why | The spec decides it (FR-010, FR-015): a reload that restores nothing must leave a working, ordinary form rather than an error screen, and the failures need storage that is damaged, blocked or full — states the doctor cannot act on from inside this app | A notice in the form panel ("earlier work in this tab could not be restored"): rejected as more than the spec asks for, and it would have to be told apart from the ordinary empty first open, which is the same screen. A blocking alert: rejected outright, it would cost the doctor the form over a convenience they may not have been using. 003 and 001 recorded the same trade-off for their own silent failures. |
| Geometry on the wire: the host learns where each ellipse is, where 004 deliberately kept the viewer's own ids inside the viewer | The host is the one store (R1), so it has to hold what the viewer needs to draw the ellipse again. No OHIF identifier crosses: only an image reference, a frame of reference, two vectors and four points, all of them checked on arrival | A second store inside the viewer: rejected in R1 — two formats, two versions, a saved copy of the links, divergence handling, and storage inside an iframe that a cross-site deployment can have partitioned or blocked. |

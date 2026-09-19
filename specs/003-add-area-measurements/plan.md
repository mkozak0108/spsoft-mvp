# Implementation Plan: Add Area Measurements

**Branch**: `003-add-area-measurements` | **Date**: 2026-09-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-add-area-measurements/spec.md`

## Summary

With a study on screen, the form panel shows a measurement form: an "Add measurement" button, a
list of rows (Pending → Drawing… → Done, with a value) and a total of the finished areas. The
form and the viewer talk over the existing bridge, which grows from viewer → host events to a
two-way, versioned contract (`version: 1` on every message):

- The host sends `ACTIVATE_TOOL { rowId, tool }`; the viewer enables the Ellipse tool
  (`EllipticalROI`) with OHIF's own tool command and remembers `rowId`.
- When the ellipse is finished, the viewer's measurement service fires `MEASUREMENT_ADDED`; the
  bridge reads the area and unit, posts `MEASUREMENT_ADDED { rowId, area, unit }` and switches to
  Pan. The host fills the row it names.
- `VIEWER_READY` (sent with `STUDY_LOADED`) gates "Activate"; `DEACTIVATE_TOOL` cancels;
  `MEASUREMENT_UPDATED` is a reserved name only.

One change lands outside the bridge: OHIF's "track measurements?" prompt is turned off in the
fork's config, or the first ellipse would stop at a dialog (research R5). Contract, rules and
the reason for the version are in [contracts/bridge-messages.md](contracts/bridge-messages.md); a
reviewer-facing copy goes in `ARCHITECTURE.md` (FR-012).

## Technical Context

**Language/Version**: TypeScript ~6.0 (strict) in the scoring app and the bridge; React 19.2 in
the scoring app; OHIF fork v3.14.0-beta.30 (unchanged from 001).

**Primary Dependencies**: none added.
- **Scoring app:** React, Vite 8 as before.
- **Viewer bridge:** `@ohif/core` (`log`), `@cornerstonejs/core` (`eventTarget`, `Enums`), both
  already its peer dependencies. The rest (measurement service, commands, tool group names) is
  reached through the `servicesManager`, `commandsManager` and `extensionManager` that OHIF
  passes to `onModeEnter`, with no new imports.

**Storage**: N/A. Rows live in memory; a reload starts empty (spec Assumptions).

**Testing**: none automated. The constitution (v3.0.0) pauses all automated testing; `tasks.md`
has no test tasks. Verification is the manual [quickstart.md](quickstart.md) plus `typecheck`,
`lint` and `build`.

**Target Platform**: unchanged: current desktop browsers; viewer on `localhost:3000`, scoring app
on `localhost:5173` (`4173` for `vite preview`).

**Project Type**: two client-side web apps over `postMessage`; the contract in one file owned by
the bridge (001 R11).

**Performance Goals**: a drawn ellipse's value appears in its row within 1 s of finishing it, and
the total updates in the same step (SC-001, SC-003). Nothing here is heavy: a message and a state
update.

**Constraints**:
- No backend; the image source is the public OHIF DICOMweb server, unmodified.
- The five message names and `version: 1` are fixed by the product owner (spec Assumptions).
- *(Amends 001)* The fork changes stay inside `extensions/bridge/`, **except one config line**,
  `measurementTrackingMode: 'none'` in `platform/app/public/config/default.js` (research R5).
- Fork changes go on a branch in the fork and are pinned by the submodule bump; the fork PR is
  merged by the user later.

**Scale/Scope**: one study per page, a handful of rows (SC-002 exercises 10).

All Technical Context unknowns are resolved in [research.md](research.md) (R1–R11). Three
findings are proven only by running the app and have a step in the quickstart: the tool
command's toolbar sync (R3), the area being present when the event fires (R4), and `'none'`
tracking keeping the measurement (R5).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research gate

| Principle | Gate | Status |
| --- | --- | --- |
| I. Simplicity / YAGNI | Only the three user stories are built. No new dependencies. Abstractions have ≥ 2 call sites. Deviations go in Complexity Tracking | PASS — no dependencies; `MEASUREMENT_UPDATED` is a reserved name only; the one config line outside the bridge is tracked below |
| II. Security & Privacy | Every message is untrusted and validated at the boundary, both ways. No secrets, no HTML injection, no personal data in logs | PASS — receiver rules for both sides are in the contract (R7); values are shown as text |
| III. Observability | No swallowed errors; one logger; visible states for failure-prone flows | PASS, with one recorded deviation (Complexity Tracking): rejected messages from the other app are logged at `warn`, other pages' traffic at `debug`; the user-visible error state for a viewer that cannot draw is not built |
| IV. Reviewer-Ready Delivery | Fresh clone works with documented commands; README updated; scope cuts stated | PASS — no new setup; README gets the new flow, decisions and limitations; `ARCHITECTURE.md` added |
| Tech constraints | Vite, strict TS, npm, enums for domain values, comments explain why | PASS — enums listed in the contract; no new tooling |
| Workflow | No test tasks (testing paused) | PASS — Testing above |

### Post-design re-check

| Principle | Result after design |
| --- | --- |
| I | PASS. The host gets one module (`lib/measurements.ts`: reducer, total, hook) and one component (`MeasurementForm`), and changes three existing ones a little. The bridge gets one module (`watchMeasurements.ts`). `postToViewer` has two call sites (activate, cancel). No state library, no generic message bus (R8, R9). No annotation id in `MEASUREMENT_ADDED`, since only the out-of-scope update needs it (R2). |
| II | PASS. Host: origin, source window, version, shape and study id checked, then the row lookup (contract, host rules 1-5); host posts only to the iframe window with the viewer's origin, never `'*'`. Viewer: allowlist origin, `window.parent`, version, shape (viewer rules). `rowId` length-capped; `unit` length-capped; `area` finite. Nothing rendered as HTML. Areas are not logged. `npm audit --omit=dev` at delivery. |
| III | PASS, with one recorded deviation (Complexity Tracking). Every ignored message is logged with a reason, never with its data: `warn` when it came from the other app, `debug` for other pages' traffic. Row transitions are logged at `info` with the row id only. The deviation: when the viewer cannot start a drawing, or finishes one with no area, the failure is logged (`warn` / `error`) but the row only keeps showing "Drawing…", with Cancel as the way out. No user-visible error state is built for it. |
| IV | PASS. The README's key decisions gain: two-way versioned contract and why, the config line, Pan as the return tool, VIEWER_READY vs STUDY_LOADED. Known limitations gain: no acknowledgement of commands, no persistence, previous tool (window/level) not restored, `MEASUREMENT_UPDATED` unimplemented, mixed-unit total unverified if no sample exists. |

## Project Structure

### Documentation (this feature)

```text
specs/003-add-area-measurements/
├── spec.md
├── plan.md                        # this file
├── research.md                    # Phase 0
├── data-model.md                  # Phase 1: row state machine, total, viewer pending state
├── quickstart.md                  # Phase 1: manual validation
├── contracts/
│   ├── bridge-messages.md         # the v1 contract, both directions
│   └── scoring-app-ui.md          # measurement form wording
├── checklists/requirements.md
└── tasks.md                       # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
ARCHITECTURE.md                    # NEW: reviewer-facing description of the two apps and the
                                   #   contract (payloads, version and why); README links to it
README.md                          # updated per Principle IV

apps/viewer/                       # the fork (submodule); changes on a fork branch
├── platform/app/public/config/
│   └── default.js                 # + measurementTrackingMode: 'none'  (R5; the only non-bridge change)
└── extensions/bridge/src/
    ├── messages.ts                # contract v1: BridgeVersion, Host/Command, new events and
    │                              #   commands, BridgeTool; STUDY_* values renamed (R1)
    ├── watchStudy.ts              # + version on messages; post VIEWER_READY after STUDY_LOADED
    ├── watchMeasurements.ts       # NEW: command guard + handlers, pending row, ellipse on/off,
    │                              #   MEASUREMENT_ADDED subscription
    ├── postToHost.ts              # HostOrigin also used for inbound checks
    └── index.ts                   # onModeEnter/onModeExit also start/stop watchMeasurements

apps/scoring-form/src/
├── lib/
│   ├── bridge.ts                  # guard: version + new events; new postToViewer
│   ├── viewerStatus.ts            # onMessage narrowed to the study events (union grew)
│   └── measurements.ts            # NEW: RowStatus, reducer, total, useMeasurements hook
├── components/
│   ├── MeasurementForm.tsx        # NEW: button, rows, total
│   ├── ScoringForm.tsx            # renders children in the loaded state, not the placeholder
│   └── StudyView.tsx              # passes <MeasurementForm/> into ScoringForm
└── App.css                        # form styles
```

**Structure Decision**:
- **Viewer:** all behaviour stays in `extensions/bridge/`; the only edit outside it is one
  supported config key, so upstream merges stay clean.
- **Scoring app:** keeps the flat `components` + `lib` layout. State rules live in one pure module,
  the hook and component are thin.
- **Contract:** stays in one file (001 R11). Both apps change in one submodule-bump commit, and the
  scoring app's `typecheck` there is the compatibility check.
- **`ARCHITECTURE.md`** is a deliverable of the task, not an extra: it carries the payload
  tables and the version rationale from the contract file, which stays the design record.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| One config line in the fork outside `extensions/bridge/` (amends 001's constraint, not a constitution principle) | OHIF's default "track measurements?" modal appears at the first measurement and blocks the flow the spec describes (R5) | Mutating `appConfig` from the bridge stays inside the extension but relies on an unverified shared object and changes global config at runtime. Leaving the prompt breaks the spec's flow. |
| No user-visible error state when the viewer cannot start a drawing (no tool group), reports a finished ellipse with no area, or never receives the command. Principle III asks for visible error states in failure-prone flows; here the failure is logged and the row stays "Drawing…" with Cancel | The agreed contract has no acknowledgement or error message, and all three cases need a broken viewer (missing tool group, empty stats) that the working sample study does not produce. Building it would add a message to a contract the product owner fixed, for a case not seen in practice (R7) | An acknowledgement / `TOOL_ERROR` message from the viewer: rejected, it grows the fixed contract. A host-side timeout that shows an error: rejected for the reason 001 rejected timeouts, since drawing takes as long as the doctor takes and slowness is not a failure. Feature 001 recorded the same trade-off for its dropped loading overlay. |
| `VIEWER_READY` is a separate message that today arrives together with `STUDY_LOADED` (R6) | The product owner's contract names it, and it means "commands work", not "a study is on screen" | Reusing `STUDY_LOADED` as the ready signal would drop a fixed name from the contract. |

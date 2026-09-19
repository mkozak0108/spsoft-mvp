# Research: Add Area Measurements

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-09-19

Paths under `apps/viewer/` refer to the OHIF fork (git submodule). Findings below were read from
that source; the ones marked **verify** are only proven by running the app, and have a step in
[quickstart.md](quickstart.md).

## R1. How the two apps are told apart and versioned: the envelope

- **Decision**: Every message, in both directions, is
  `{ source, type, version, <event | command>, payload }`.
  - `source`: `BridgeSource.Viewer` or the new `BridgeSource.Host`. A receiver only accepts the
    other side's value.
  - `type`: `BridgeMessageType.Event` (viewer → host) or the new `BridgeMessageType.Command`
    (host → viewer). The name field is `event` or `command` accordingly, so one union member
    exists per message.
  - `version`: `BridgeVersion.V1` (numeric enum, value `1`). Feature 001's two messages get it
    too (FR-009 says every message).
- **Wire names**: the five names fixed by the product owner become enum values equal to the
  names (`VIEWER_READY`, `ACTIVATE_TOOL`, `DEACTIVATE_TOOL`, `MEASUREMENT_ADDED`,
  `MEASUREMENT_UPDATED`). Feature 001's `studyLoaded` / `studyLoadFailed` values are renamed to
  `STUDY_LOADED` / `STUDY_LOAD_FAILED`: only the enum values change, since all code refers to the
  enums, and one casing style reads better than two.
- **Rationale for the version** (the defense answer): the two apps are built and shipped
  separately and share nothing but these messages. If one side changes a payload, a receiver with
  no version can only guess from the shape, and a payload that happens to look valid is
  misread silently: a wrong number in a medical form. With a version, the receiver refuses
  what it does not understand and says why in its log, so a mismatch is a visible, diagnosable
  fault and not a wrong value. It is one number, checked before anything else.
- **Rejection rule**: a message whose `version` is not exactly `BridgeVersion.V1` is dropped
  and logged at `warn` with only the fact that the version is unsupported (never the payload).
  There is no "best effort" for newer versions. Adding a field is still allowed within V1
  (receivers ignore extras); a change that would make a V1 receiver misread a message needs V2.
- **Alternatives considered**:
  - Version only in the handshake (`VIEWER_READY` announces it): rejected, since the viewer can
    be reloaded to a different build than the one that announced, and per-message checks are one
    comparison.
  - Semver strings: rejected; there is no compatibility negotiation, only equality.
  - Keeping two-level `type: 'event'` + `event: …` for 001 and inventing a third shape for
    commands: rejected; one envelope, one guard shape.

## R2. Binding a drawn ellipse to its form row

- **Decision**: the host creates a `rowId` when it adds a row (`row-1`, `row-2`, …, from a
  counter in the row state). `ACTIVATE_TOOL` carries it; the viewer remembers it as the single
  pending activation; `MEASUREMENT_ADDED` echoes it back. The host looks the row up by that
  identifier only.
- **Rationale**: the viewer cannot tell which row a drawing is for except by being told, and it
  must not guess from order (SC-002 requires out-of-order activation to work). The identifier
  is opaque to the viewer.
- **Why a counter, not `crypto.randomUUID()`**: identifiers only need to be unique within one
  page; a counter needs no secure context and stays pure inside a reducer.
- **Not added**: an annotation identifier in `MEASUREMENT_ADDED`. Only `MEASUREMENT_UPDATED`
  (starred task, out of scope) needs to find a row from an annotation, and the constitution
  says not to build for it now. That message's payload is defined when it is implemented.
- **Alternatives considered**: matching the ellipse to the oldest Drawing row (there is at most
  one, so it would work today) — rejected; the identifier is what the task asks for and it
  keeps stale or duplicate messages harmless (FR-010).

## R3. Enabling and disabling the Ellipse tool in OHIF

- **Finding**: the default tool group (`modes/basic/src/initToolGroups.ts:65,220`, which the
  longitudinal `/viewer` mode reuses) holds `EllipticalROI` as a passive tool, and `WindowLevel`
  on the primary mouse button. Cornerstone's `setToolActiveToolbar` command
  (`extensions/cornerstone/src/commandsModule.ts:1199`) activates a tool on the primary button
  in every tool group and demotes the previous primary tool to passive. It is what a toolbar
  click runs, so the toolbar highlight follows (**verify**).
- **Decision**:
  - `ACTIVATE_TOOL` → `commandsManager.runCommand('setToolActiveToolbar', { toolName: EllipticalROI })`,
    where the name comes from the cornerstone tools utility module's `toolNames`
    (`extensionManager.getModuleEntry('@ohif/extension-cornerstone.utilityModule.tools')`), not a
    string literal. The command name, its context and the module id are OHIF's identifiers and are
    named once as enums in the bridge (tasks T010), not repeated as literals.
  - After the measurement is reported, or on `DEACTIVATE_TOOL`, the same command with `Pan`.
    This is the "returns to Pan/default" of the spec: Pan becomes the primary-button tool.
- **Rationale**: the same public command a toolbar click uses; nothing in OHIF is patched.
- **Consequence**: the previously active primary tool (window/level) is not restored, so
  after a measurement, left-drag pans. Restoring it (`getPrevActivePrimaryToolName`) was
  considered and rejected: the spec says Pan, and restoring needs state the viewer would have to
  keep across commands.
- **Alternatives considered**: `toolGroup.setToolActive` directly through
  `toolGroupService` — rejected; it would skip the passive-demotion bookkeeping the command
  already does.

## R4. Detecting that the ellipse is finished, and reading its area

- **Finding**: on `ANNOTATION_ADDED` OHIF starts a measurement without announcing it; on
  `ANNOTATION_COMPLETED` it broadcasts `measurementService` `MEASUREMENT_ADDED`
  (`platform/core/src/services/MeasurementService/MeasurementService.ts:520-570`). For an ellipse
  the measurement's `data` is the annotation's `cachedStats`, keyed by target, each with `area`
  and `areaUnit` (`extensions/cornerstone/src/utils/measurementServiceMappings/EllipticalROI.ts`).
  `areaUnit` is already display-ready: `mm²` for calibrated images, `px²` when there is no
  pixel spacing (`@cornerstonejs/tools` `getCalibratedUnits`).
- **Decision**: the bridge subscribes to `measurementService.EVENTS.MEASUREMENT_ADDED`. When there
  is a pending row and `measurement.toolName` is the ellipse tool, it reads the first target
  with a finite `area`, posts `MEASUREMENT_ADDED { StudyInstanceUID, rowId, area, unit }`, clears
  the pending row and switches to Pan (R3). No pending row → ignored (FR edge case: drawing from
  the viewer's own toolbar).
- **Rationale**: the same event OHIF's own panels use; completion, not the first click, and only
  once. `unit` is passed through as text: the set of units is open (`mm²`, `px²`, calibrated
  variants), so an enum would be wrong here.
- **Risk (verify)**: `cachedStats` must already be filled when the event fires. If a drawn
  ellipse arrives with no finite area, the bridge logs an error and posts nothing: the row
  stays "Drawing…" with its Cancel control, which is a visible state and not a wrong value.
- **Alternatives considered**: cornerstone `ANNOTATION_COMPLETED` directly — rejected; the
  stats mapping happens in the measurement service, and re-deriving the area would duplicate
  OHIF. `MEASUREMENT_UPDATED` also fires for edits and hydration; it is deliberately not used.

## R5. The "track measurements?" prompt in the `/viewer` route

- **Finding**: `appInit.js:51` defaults `measurementTrackingMode` to `'standard'`. In that mode the
  first measurement on a series opens a modal over the viewport asking whether to track it
  (`extensions/measurement-tracking/.../promptBeginTracking.js`), triggered by
  `TrackedCornerstoneViewport` reacting to the same `MEASUREMENT_ADDED`. A doctor would have to
  answer a question the form knows nothing about before continuing, and the tracking panels and
  "unsaved measurements" prompts are meaningless here (nothing is saved).
- **Decision**: set `measurementTrackingMode: 'none'` in the fork's
  `platform/app/public/config/default.js`, OHIF's documented option (`AppTypes.ts:228`). With
  `'none'` the prompt resolves to "never track" and the measurement stays in the measurement
  service, so R4's event still fires (**verify**).
- **Rationale**: a supported configuration key, one line, and not a hack at runtime. It is the only
  change outside `extensions/bridge/`, so feature 001's plan constraint ("fork changes stay
  inside the bridge") is amended for it; see Complexity Tracking in the plan.
- **Alternatives considered**:
  - The bridge mutating `extensionManager.appConfig` at mode entry: keeps the change inside
    the bridge but relies on the React config context and the extension manager sharing one
    object, which is unverified, and it changes global config at runtime.
  - `'simplified'`: skips the prompt but starts tracking the series, which brings the
    tracked-measurement panels and exit prompts with it. It is the fallback if `'none'` fails
    verification.
  - Leaving the prompt and telling the doctor to click "Yes": rejected, it breaks the flow the
    spec describes.

## R6. When the viewer says `VIEWER_READY`

- **Finding**: an extension's `onModeEnter` runs before the mode's own `onModeEnter` (R2 of
  feature 001), and the tool groups are created in the mode's. So at bridge start there is
  nothing to activate a tool on yet.
- **Decision**: post `VIEWER_READY` immediately after `STUDY_LOADED`, from the same first-render
  signal: a rendered image means viewports and tool groups exist. The bridge starts listening for
  commands at mode entry, but the host only sends them after `VIEWER_READY`.
- **Rationale**: it is the earliest moment the claim "ready to accept commands" is true, and it
  reuses a signal that is already proven. Today `VIEWER_READY` and `STUDY_LOADED` arrive together;
  they are still two messages because they mean different things (a study is on screen vs. commands
  work) and the product owner fixed both the contract and the name. The host uses each for its
  own purpose: `STUDY_LOADED` for the form panel's state, `VIEWER_READY` for enabling "Activate".
- **Consequence**: after a viewer reload (a new mode entry), the new bridge posts a fresh
  `VIEWER_READY`, which is what FR-008 keys on.
- **Alternatives considered**: `VIEWER_READY` at mode entry — rejected, it would be false (no
  tool groups). Dropping `STUDY_LOADED` in favour of it — rejected, it would change the spec'd
  behaviour of feature 001 for no gain.

## R7. Receiving commands safely in the viewer

- **Decision**: the bridge accepts a command only if `event.origin` is in the same `HostOrigin`
  allowlist it posts to, `event.source === window.parent`, the data passes a runtime guard
  (`source` Host, `type` Command, `version` V1, a known `command`, payload fields of the right
  type, `rowId` a non-empty string of at most 64 characters, `tool` a known `BridgeTool`), and it
  is framed at all. Anything else is ignored. The log level depends on who sent it: `debug` for a
  wrong origin or window (other pages' traffic, silenced in production), `warn` for anything from
  the right origin and window that fails the version or shape check, since then the other app is
  at fault and it must show in production (SC-006). Only one activation is pending: a new `ACTIVATE_TOOL` replaces it, and
  `DEACTIVATE_TOOL` clears it only if its `rowId` matches (a late cancel for a row that is no
  longer pending must not switch off a newer activation).
- **Rationale**: Principle II — messages are untrusted input. The allowlist already exists for
  outbound messages; using it inbound adds no configuration.
- **Principle III deviation (recorded in the plan's Complexity Tracking)**: the three ways a drawing
  can fail silently for the doctor (no tool group, a finished ellipse with no area, a lost command)
  are logged but have no error state of their own; the row stays "Drawing…" and Cancel is the way
  out. All three need a broken viewer, which the sample study does not produce.
- **Alternatives considered**: acknowledging commands (`TOOL_ACTIVATED`): rejected, not in
  the agreed contract. Cost: if the viewer cannot activate (no tool group), the row shows
  "Drawing…" with nothing to draw, and the viewer logs it at `warn`; Cancel recovers. Recorded as a
  known limitation.

## R8. Row state and the total on the host

- **Decision**: one pure reducer in `lib/measurements.ts` holds `{ rows, viewerReady,
  nextRowNumber }`. Rows are `{ id, status, value? }`, `status ∈ RowStatus`. Actions and
  transitions are in [data-model.md](data-model.md). Side effects (posting commands, logging) stay
  in the hook, because the reducer must stay pure.
  - Single-drawing rule (FR-005) lives in the reducer: activating a row turns any other
    `Drawing` row back to `Pending` in the same transition, so SC-004 cannot be broken by
    call order. Switching sends only `ACTIVATE_TOOL`; the viewer's replace-pending rule
    (R7) makes a separate `DEACTIVATE_TOOL` for the old row unnecessary.
  - The total is derived on render from the rows, not stored: `AreaTotalKind.None` (no Done
    row), `Sum` (value + unit) or `MixedUnits`.
  - The area is rounded to one decimal when it is stored (the display precision, spec
    Assumptions), so the total is exactly the sum of the displayed values (SC-003) and only formatted
    at the end.
- **Rationale**: derived state cannot go stale; one place for rules the spec states as
  invariants.
- **Alternatives considered**: `useState` per row component — rejected, the single-drawing rule
  and the total need the whole list. A state library — rejected (Principle I).

## R9. Two subscriptions to the same window messages

- **Decision**: `useMeasurements` calls `subscribeToViewer` on its own, next to
  `useViewerStatus`'s. Each ignores the events it does not handle.
- **Rationale**: the two concerns (study state, measurements) stay independent; the cost is a
  duplicated debug line for a rejected message, which is not worth an abstraction.
- **Alternatives considered**: one shared subscription that fans out — rejected as a layer with
  one extra call site.

## R10. Testing

- **Decision**: none automated. The constitution's standing pause on tests applies (v3.0.0):
  `tasks.md` has no test tasks. Verification is manual, following [quickstart.md](quickstart.md),
  plus `typecheck`, `lint` and `build`.
- The reducer and the total are written as pure functions so tests can be added when testing
  returns, but nothing is arranged around that beyond it.

## R11. Sample data

Feature 001's sample studies apply
([001 research R12](../001-study-scoring-view/research.md)). This feature needs a study whose
images carry pixel spacing (so the area is in `mm²`); the 381-image chest CT is one. A study with
no pixel spacing, expected to report `px²`, is a candidate for the mixed-unit check: **verify** in
the quickstart, and if none is found in the public source, that scenario is skipped and recorded
as unverified.

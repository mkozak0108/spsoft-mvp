# Research: Restore State on Reload

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-09-20

Paths under `apps/viewer/` are the OHIF fork (git submodule). Shorthands: `MS` is
`platform/core/src/services/MeasurementService/MeasurementService.ts`, `IMS` is
`extensions/cornerstone/src/initMeasurementService.ts`, `ELLMAP` is
`extensions/cornerstone/src/utils/measurementServiceMappings/EllipticalROI.ts`, `CST/` is
`apps/viewer/node_modules/@cornerstonejs/tools/dist/esm/` (5.10.3). Findings were read from
source. The ones marked **verify** are only proven by running the app, and each has a step in
[quickstart.md](quickstart.md). Features 003 and 004 research stands except where this file says
otherwise.

## R1. Who keeps the saved state

- **Finding**: the two apps are separate origins (`:5173` and `:3000`), so each has its own
  storage. The host already owns the rows, the numbering and the total (`measurements.ts`); the
  viewer owns nothing but `pendingRowId` and the `links` map, both rebuilt on every mode enter.
- **Decision**: the host saves everything, in its own `sessionStorage`, under one key per study.
  The viewer stores nothing and stays a renderer that reports and obeys.
- **Rationale**: one owner means one format, one version, one validation and one failure mode. Two
  stores that have to agree would need reconciliation for every way they can diverge (host cleared
  but viewer not, and the reverse), which is more machinery than the feature is worth (Principle I).
  It also makes the viewer-reloaded-on-its-own case (spec Edge Cases) fall out of the same path as
  a full reload: the host re-sends what it has.
- **`sessionStorage`, not `localStorage`**: the spec's lifetime is the tab (spec Assumptions,
  settled with the product owner on 2026-09-20). `sessionStorage` *is* that lifetime, so no expiry
  logic of our own, and nothing is left on a shared machine after the tab closes.
- **Alternatives considered**:
  - The viewer saves its own annotations: keeps geometry off the wire, but needs a second stored
    format, a second version, a saved copy of the uid → rowId links, and divergence handling. It
    also puts the store in an iframe, where a cross-site deployment meets partitioned or blocked
    third-party storage.
  - `localStorage` with an age limit of our own: rejected with the spec's lifetime question; it
    would also need a clear control the feature does not have.
  - IndexedDB: asynchronous, and the payload is a few kilobytes. Nothing here needs it.

## R2. What has to be saved for an ellipse to come back

- **Finding**: cornerstone builds an `EllipticalROI` annotation as
  `{ annotationUID, metadata, data: { handles: { points, textBox, activeHandleIndex }, cachedStats,
  label } }`. `metadata` is `{ toolName, ...viewReference, referencedImageId, viewUp,
  cameraPosition }`, where `viewReference` carries `FrameOfReferenceUID`, `viewPlaneNormal`,
  `viewUp` and the slice (`CST/tools/base/AnnotationDisplayTool.js:45-105`). The shape itself is
  four world points — bottom, top, left, right (`CST/tools/annotation/EllipticalROITool.js:45-70`,
  `ELLMAP:76-81`). `cachedStats` is derived: it is recomputed from the points at render time
  (004 R1), so it is not part of the shape.
- **Decision**: save exactly five fields per ellipse — `referencedImageId`, `FrameOfReferenceUID`,
  `viewPlaneNormal`, `viewUp` and the four `points` — and rebuild the rest at restore.
  `toolName` is not saved: the only tool this feature draws with is `BridgeTool.EllipticalROI`.
- **Rationale**: an explicit list can be checked field by field when it is read back (Principle
  II), which an opaque annotation blob cannot. The two vectors are what tells the viewer which
  plane the ellipse belongs to; leaving them out would rely on the image reference alone.
- **Alternatives considered**: storing the whole annotation object as opaque JSON (smaller code,
  unvalidatable input, and OHIF's internals would become our stored format); storing
  `SOPInstanceUID` + frame instead of `referencedImageId` and rebuilding the image id through
  `displaySetService` (more code in the viewer for a value the viewer already has).

## R3. How the geometry reaches the host

- **Finding**: the measurement object the bridge already receives from `measurementService`
  carries the geometry: the `EllipticalROI` mapping returns `points`, `metadata`,
  `referencedImageId` and `FrameOfReferenceUID` on every `MEASUREMENT_ADDED` and
  `MEASUREMENT_UPDATED` (`ELLMAP:20-81`).
- **Decision**: the bridge reads the five fields off that same object and puts them on the
  messages it already sends: `MEASUREMENT_ADDED` and `MEASUREMENT_UPDATED` each gain an `ellipse`
  field. No new event, and no cornerstone import in the bridge.
- **Rationale**: the geometry is a property of the change the message already reports; a separate
  "the ellipse moved" event would make two messages mean one fact and could arrive out of order
  with the area.
- **Alternatives considered**: reading `annotation.state.getAnnotation(uid)` from
  `@cornerstonejs/tools` (a new dependency for data the measurement already carries); a separate
  geometry event (above).

## R4. A move changes no area, and the form has to hear about it

- **Finding**: 004 sends `MEASUREMENT_UPDATED` only when the area or unit changed (004 R2), so
  dragging a whole ellipse to another spot — same size, same area — reports nothing today. With
  the geometry saved, that silence would put the ellipse back in its old place after a reload,
  against FR-005.
- **Decision**: widen the rule the bridge already applies: send when the area, the unit **or the
  geometry** changed. The dedupe keeps doing its original job, because selection, lock and
  visibility events repeat the geometry too.
- **Consequence**: during a drag the message rate rises from cornerstone's ~10 a second (the
  area's recomputation pace) to one per mouse move (~60 a second), each about 400 bytes. The host
  work per message is unchanged — the same guard, the same reducer — plus one save (R10). **verify**
- **Alternatives considered**: sending the geometry only when a drag ends (cornerstone fires
  `ANNOTATION_COMPLETED` for a new annotation, not for an edit, so the bridge would have to infer
  the end of a drag from mouse events — new machinery in the bridge for a saving we can do
  anyway); throttling in the bridge (004 R1 rejected a throttle of our own for the same reason:
  the pace is already the pace of the thing being watched).

## R5. Putting an ellipse back

- **Finding**: `measurementService.addRawMeasurement(source, annotationType, { annotation },
  toMeasurementSchema, dataSource)` is OHIF's own path for importing serialized measurements
  (MS:390-465); the SR viewer hydrates with it (`hydrateStructuredReport.ts:201-245`). It maps the
  data through the same mapping the live tools use, stores the measurement, and broadcasts
  `RAW_MEASUREMENT_ADDED` — **not** `MEASUREMENT_ADDED` (MS:453-465). The cornerstone extension
  listens for it and adds the annotation to cornerstone's annotation manager with
  `annotationUID = measurement.uid` (IMS:458-522). The source comes from
  `measurementService.getSource('Cornerstone3DTools', '0.1')` and the mapping from
  `getSourceMappings(...)` with `annotationType === 'EllipticalROI'`
  (`extensions/cornerstone/src/enums.ts:1-2`, `hydrateStructuredReport.ts:64`).
- **Decision**: the bridge restores each saved ellipse with `addRawMeasurement`, passing an
  annotation built from the five saved fields plus `toolName`, empty `cachedStats` and no label.
- **Why it cannot be mistaken for a new measurement**: it broadcasts `RAW_MEASUREMENT_ADDED`,
  which the bridge does not subscribe to, so the "an ellipse was finished for the pending row"
  path (003) cannot fire. Nothing is posted to the host for the restore itself.
- **Render**: the RAW handler adds the annotation without triggering a render, so the bridge asks
  for one afterwards through `cornerstoneViewportService.getRenderingEngine()?.render()`, a
  service it already has on `servicesManager`. **verify**
- **Failures**: `addRawMeasurement` catches a failing mapping and returns `undefined` (MS:415-435).
  A saved ellipse whose image is not in the loaded study fails exactly there, which is the spec's
  "cannot be put back" edge case: the bridge logs it at `warn` and moves on; the row keeps its
  saved value on the host.
- **Alternatives considered**: `annotation.state.addAnnotation()` from `@cornerstonejs/tools`,
  which fires `ANNOTATION_ADDED` and lets OHIF create the measurement (IMS:330-345). It works, but
  it adds a dependency to the bridge and routes the restore through the same event a fresh drawing
  uses, which the bridge would then have to tell apart from a real one.

## R6. Linking a restored ellipse to its row

- **Finding**: `addRawMeasurement` returns the measurement uid it used (`data.uid || guid()`,
  MS:437), and that uid is the annotation's `annotationUID` (IMS:487). Later edits reach
  `updateMeasurement`, which ignores an annotation with no measurement (IMS:270-285) — not the case
  here — and reach the bridge as the `MEASUREMENT_UPDATED` it already handles.
- **Decision**: for each restored ellipse the bridge does `links.set(returnedUid, { rowId, last:
  undefined, lastEllipse: the geometry it was given })`, synchronously, before any render. From
  that moment a restored ellipse is indistinguishable from one drawn in this session: 004's update
  and removal paths need no change.
- **Rationale**: keeps the uid inside the viewer, as 004 decided, and reuses the whole live-update
  path rather than adding a second one.

## R7. When the restore runs

- **Finding**: `VIEWER_READY` means the tool groups exist and commands work, and it arrives right
  after the first image is rendered (003), which is also when the display sets the mapping needs
  are in place. The host already reacts to it by returning "Drawing…" rows to "Pending".
- **Decision**: the host posts `RESTORE_MEASUREMENTS` on every `VIEWER_READY`, carrying every row
  it has that has a saved ellipse.
- **Rationale**: one trigger for both cases the spec names — a full page reload and a viewer that
  reloaded on its own — because both end in `VIEWER_READY`. A viewer that has just announced
  itself has no annotations (OHIF clears them on mode enter, 004 R5), so re-sending cannot
  duplicate anything.
- **Alternatives considered**: restoring on `STUDY_LOADED` (earlier, but commands are not
  guaranteed to work yet); a new "the viewer wants its measurements" event from the viewer (an
  extra round trip for something `VIEWER_READY` already says).

## R8. Where a restored row's area comes from

- **Finding**: the RAW handler marks the restored annotation `invalidated: true` (IMS:487-497), so
  cornerstone recomputes `cachedStats` at the next render and fires the `ANNOTATION_MODIFIED` that
  becomes `MEASUREMENT_UPDATED` (004 R1). The mapping reads the stats, empty at first
  (`ELLMAP:85-95` returns no annotations for empty `cachedStats`, and the display text falls back
  to empty), so nothing about the area is lost by not saving it.
- **Decision**: the saved area is what the row shows until the viewer has recomputed one; the
  viewer's recomputed area then arrives as an ordinary update and replaces it.
- **Rationale**: the geometry is the truth and the area is derived from it. Restoring the area
  from storage as if it were authoritative is how the two could silently disagree.

## R9. Reading the saved state back

- **Finding**: `sessionStorage` returns a string written by an earlier version of this app, by
  another tool, or by a person with DevTools open. The constitution treats it as untrusted input
  (Principle II), like a bridge message.
- **Decision**: one `savedState.ts` module in the host with `load(studyInstanceUid)` and
  `save(studyInstanceUid, state)`. `load` parses, checks `version` against
  `SavedStateVersion.V1`, then checks every field (row id, number, status against `RowStatus`,
  optional value with a finite area ≥ 0 and a unit of at most 16 characters, and each ellipse's
  five fields with fixed-length number arrays). Anything that fails: log at `warn` with a reason
  enum, remove the key, start empty. A `Drawing` row loads as `Pending`, the same rule
  `ViewerReady` already applies, because its ellipse was never finished.
- **Rationale**: the version is checked first for the reason every bridge message carries one: a
  changed shape a newer app would misread must be refused, not guessed at. Removing the key stops
  a bad value failing every open for the life of the tab.
- **Alternatives considered**: a schema library (a dependency for nine fields, Principle I);
  keeping a damaged value in place (every open pays the same failure).

## R10. How often the host saves

- **Finding**: the saved state is the rows, their ellipses and the next row number — a few hundred
  bytes per row. `sessionStorage.setItem` is synchronous; writing ~2 KB is tens of microseconds.
  The state changes at most once per message, so at the drag rate of R4 that is about 60 writes a
  second.
- **Decision**: save whenever the saved part of the state changes, with no throttle and no
  debounce, from one effect next to the existing logging effect.
- **Rationale**: it is the rule with no timing to get wrong, and it is what makes SC-004 (a change
  in the last second before a reload comes back) true by construction. 004 made the same call
  about not throttling what is already paced by the thing being watched. A ten-second drag staying
  responsive is checked by hand. **verify**
- **Alternatives considered**: a trailing debounce (loses the last change if the reload beats the
  timer, and would need a `pagehide` write to be safe); saving on `pagehide` alone (a crash or a
  dev-server reload never gets there).

## R11. Storage that refuses to work

- **Finding**: `sessionStorage` throws on access in a browser configured to block site data, and
  `setItem` throws `QuotaExceededError` when there is no room.
- **Decision**: both `load` and `save` wrap their access in `try`/`catch`, log at `warn`, and let
  the app carry on with what it has in memory. Nothing is shown to the doctor, and the failure is
  not swallowed silently (Principle III).
- **Rationale**: the feature is a convenience on top of a working form; losing it must not cost
  the doctor the form. Spec FR-015 asks for exactly this.

## R12. The contract stays at version 1

- **Finding**: `ARCHITECTURE.md`'s rule is that a new version is needed only when a receiver could
  misread a message. This feature adds a field to two events and one new command.
- **Decision**: `BridgeVersion.V1` stands. `ellipse` is a new field on `MEASUREMENT_ADDED` and
  `MEASUREMENT_UPDATED`, which a receiver that does not know it ignores; `RESTORE_MEASUREMENTS` is
  a new name, which an older viewer rejects as an unknown command and logs.
- **Rationale**: the same reasoning 004 recorded for two new events. Both apps ship together
  through the submodule pin anyway, and the scoring app's `typecheck` is what catches a mismatch.

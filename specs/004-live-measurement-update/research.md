# Research: Live Measurement Update

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-09-19

Paths under `apps/viewer/` are the OHIF fork (git submodule). Shorthands: `CST/` is
`apps/viewer/node_modules/@cornerstonejs/tools/dist/esm/` (5.10.3), `ELL` is
`CST/tools/annotation/EllipticalROITool.js`, `MS` is
`platform/core/src/services/MeasurementService/MeasurementService.ts`. Findings were read from source.
The ones marked **verify** are only proven by running the app, and each has a step in
[quickstart.md](quickstart.md). Feature 003's research
([003 research](../003-add-area-measurements/research.md)) stands except where this file says
otherwise.

## R1. Which viewer event carries a live area

- **Finding**: the cornerstone extension maps cornerstone's `ANNOTATION_MODIFIED` to
  `measurementService` `MEASUREMENT_UPDATED`, with no debounce, once the measurement is stored
  (`extensions/cornerstone/src/initMeasurementService.ts:273-280, 334-344`). During a handle drag,
  each mouse move fires `ANNOTATION_MODIFIED` (`HandlesUpdated`) before any render, so its stats
  are the previous ones (`CST/tools/annotation/EllipticalROITool.js:219-257`). The area is
  recomputed at render time through `throttle(_calculateCachedStats, 100, { trailing: true })`
  (ELL:606), which then fires a second `ANNOTATION_MODIFIED` (`StatsUpdated`) with the fresh area
  (ELL:595-599).
- **Net effect**: `MEASUREMENT_UPDATED` arrives on every mouse move, with a new area at most
  every ~100 ms, and one trailing update with the final area after the drag stops. That meets
  SC-001 (a quarter of a second) and FR-003 (the final value always arrives) without the bridge
  scheduling anything itself.
- **Decision**: the bridge subscribes to `measurementService.EVENTS.MEASUREMENT_UPDATED`, as 003
  did for `MEASUREMENT_ADDED`, and reads the area with the same `firstArea` helper.
- **Rationale**: the measurement service is where OHIF already maps the stats to `area` and
  `areaUnit` (003 R4); the event is public, and nothing in OHIF is patched.
- **Alternatives considered**:
  - Cornerstone's `ANNOTATION_MODIFIED` filtered on `ChangeTypes.StatsUpdated`: gives only the
    fresh values, but re-derives what OHIF maps, and adds a second event source to the bridge.
    Deduplication (R2) gets the same message count.
  - A throttle in the bridge: rejected; cornerstone already limits fresh values to ~10 a second.
- **Verified 2026-09-19**: every handle drag gave an intermediate area and then the final one
  about 100 ms later (cornerstone's trailing recalculation), and the row and the total changed
  within 1 ms of each message. The browser automation cannot hold a slow drag, so "several times
  a second during a long drag" follows from that pace rather than being watched.

## R2. Sending only real changes

- **Finding**: most `MEASUREMENT_UPDATED` events repeat the previous area (the stale
  `HandlesUpdated` ones, selection, lock, visibility and colour changes; MS:210, 872-913).
- **Decision**: the viewer remembers, per linked ellipse, the last area and unit it reported, and
  posts only when either changes (or when the area becomes unavailable or available again, R4).
  The host also leaves the state untouched when the new value rounds to the one already shown,
  so React does not re-render for it.
- **Rationale**: the message says "the area changed"; sending it when nothing changed would make
  it lie, and it cuts traffic during a drag from one message per mouse move to about ten a
  second. The host check is a different one: two exact areas can round to the same one decimal.
- **Alternatives considered**: deduplicating on the host only: rejected, it keeps ~60 messages a
  second going through the guards for nothing.

## R3. Linking a finished ellipse to its row

- **Finding**: `measurement.uid` is the annotation's `annotationUID` in `MEASUREMENT_ADDED`,
  `MEASUREMENT_UPDATED` and `MEASUREMENT_REMOVED` alike (`initMeasurementService.ts:256, 280,
  321-325`; MS:533, 547), and undo/redo re-adds the same annotation with the same uid.
- **Decision**: when the bridge posts `MEASUREMENT_ADDED` for the pending row, it records
  `measurement.uid → { rowId, last reported value }` in a map that lives from `onModeEnter` to
  `onModeExit`. Updates and removals are reported only for uids in that map. A removal deletes
  the entry.
- **What this gives for free**:
  - `MEASUREMENT_UPDATED` also fires at mouse-down and throughout the first drawing of a new
    ellipse (ELL:45-70, 356-365). Its uid is not linked yet, so it is ignored (FR-008).
  - Ellipses drawn from the viewer's own toolbar are never linked (FR-008).
  - Editing an existing ellipse never fires `MEASUREMENT_ADDED` (`newAnnotation` is unset in its
    edit data), so a "Drawing…" row cannot be filled by an edit (FR-007).
- **Also fixes a 003 gap**: `MEASUREMENT_ADDED` fires on mouse-up, while the last stats
  calculation may still be waiting on the 100 ms throttle, so the area 003 reports can trail the
  final shape slightly. The trailing `MEASUREMENT_UPDATED` now corrects the row (**verify**).
- **Verified 2026-09-19**: after every drawing and every drag, the row agreed with the viewer's
  text (18724.1 / 18724, 9362.0 / 9362, 11702.6 / 11703 mm²). In these runs the area at
  `MEASUREMENT_ADDED` was already final, so the correction itself was not observed.
- **No annotation id on the wire**: the host still knows rows only by `rowId`, and the viewer
  translates. 003 R2 deferred this choice to the feature that needs it; keeping the uid in the
  viewer means no new field to validate and nothing about OHIF's ids leaks into the form.

## R4. An ellipse the viewer cannot measure

- **Finding**: when either corner of the ellipse's bounding box is off the image, the tool stores
  `cachedStats[targetId] = { Modality }` with no `area`, and its text box shows no area
  (ELL:530, 588-593).
- **Decision**: the viewer reports it as a change of its own, `AreaUnavailable`, once, when the
  area goes away. The form keeps the row "Done", clears its value, and leaves it out of the total;
  the next reported area puts it back (spec FR-015).
- **Rationale**: showing the last area would put a number in the form that the image no longer
  supports, the kind of silent wrong value the contract's version exists to avoid.
- **Alternatives considered**: keep the last area (no message): rejected for that reason. Mark
  the row with a new status: rejected; the row is finished and its ellipse still exists, only
  its value is missing.
- **Verified 2026-09-19**: dragging the top handle above the image removed the viewer's area
  text; the row showed "No area" and the total "—". Dragging it back restored both.

## R5. Deletion: which events, and how it travels

- **Finding** (`MeasurementService.ts:674-725`, the deletion paths in the fork):
  - Single deletes (right-click → "Delete measurement", Backspace on the selected ellipse, the
    panel row's Delete) end in `remove(uid)` → `MEASUREMENT_REMOVED` with payload
    `{ source, measurement: <uid string> }`.
  - Bulk deletes (a panel group's Delete, "Delete all" in the tracked or basic panel) end in
    `removeMany` / `clearMeasurements` → one `MEASUREMENTS_CLEARED { measurements: Measurement[] }`,
    and no per-item `MEASUREMENT_REMOVED`.
  - Undo right after drawing removes the new annotation → `MEASUREMENT_REMOVED`.
- **Decision**: the bridge subscribes to both events. For every uid it has linked, it posts
  `MEASUREMENT_UPDATED { change: Removed, rowId }` and forgets the link. The host removes the row.
- **Why `MEASUREMENT_UPDATED` carries it**: the product owner fixed the five event names and none
  means "removed" (spec FR-009). The payload is ours, so the message gets a discriminant,
  `change: MeasurementChange`, with `AreaChanged`, `AreaUnavailable` and `Removed`. A receiver
  that switches on `change` cannot read a removal as an area.
- **Mode exit does not remove rows**: OHIF clears all measurements on mode enter and exit
  (MS:732, `modes/basic/src/index.tsx:190`). On exit, extensions' `onModeExit` runs before the
  services' (`ExtensionManager.ts:182-202`), so the bridge has already unsubscribed. On enter,
  the new bridge has no links yet. Either way no removal is posted (**verify**).
- **Alternatives considered**:
  - A new `MEASUREMENT_REMOVED` event: rejected, the names are fixed.
  - `area: null` as the removal signal: rejected; it overloads one field with two meanings, and
    one missing check would read it as zero.

## R6. Rows keep their names when one is removed

- **Finding**: 003 labels a row "Measurement N" from its list position
  (`MeasurementForm.tsx`). Removing row 1 would rename every later row, so the doctor could not
  tell which one went.
- **Decision**: each row stores its own `number`, taken from the counter that already makes its
  id (`row-<n>`), and the label uses it. Numbers are never reused, so a removal leaves a gap.
- **Alternatives considered**: renumbering (003's behaviour): rejected for the reason above.
  Parsing the number back out of the id: rejected; it makes the id format part of the UI.

## R7. What the doctor can do in the viewer after a measurement

- **Finding**: after the bridge switches to Pan, `EllipticalROI` is **passive**
  (`commandsModule.ts:1209-1243`; `CST/store/ToolGroupManager/ToolGroup.js:225-254`), and
  mouse-down considers active and passive tools alike, so grabbing a handle resizes the ellipse
  and grabbing its outline moves it (`CST/eventDispatchers/mouseEventHandlers/mouseDown.js:24-44`).
  While the Ellipse tool is active for another row, grabbing an existing handle or outline also
  edits that ellipse rather than starting a new one; a click inside, away from the ring, starts a
  new one.
- **Decision**: no change to tools or modes. FR-006 and FR-007 hold with the tool setup 003
  already has (**verify**).
- **Verified 2026-09-19**: a handle was dragged with Pan active. With the Ellipse tool active for
  row 4, dragging row 2's handle resized row 2's ellipse, no `MEASUREMENT_ADDED` was sent, row 4
  stayed "Drawing…", and the next new ellipse filled row 4.

## R8. The total as a live region during a drag

- **Decision**: the total stays `role="status"` (003). During a drag it changes up to ~10 times a
  second; polite announcements are left to the screen reader to coalesce.
- **Rationale**: dragging a handle is a pointer task, and the value after release is what a
  screen-reader user needs; suppressing announcements would need the host to know when a drag
  ends, which the contract does not tell it.

## R9. Contract version stays 1

- **Decision**: `MEASUREMENT_UPDATED` is added under `BridgeVersion.V1`.
- **Rationale**: the rule recorded in 003 is that a new version is needed only when a V1 receiver
  could misread a message. A form built before this feature treats `MEASUREMENT_UPDATED` as an
  unknown event: its guard rejects it and logs a `warn` (`apps/scoring-form/src/lib/bridge.ts`,
  the `default` case). No existing message changes.

## R10. Edge cases found in the source, accepted

- **Undo of a deletion** restores the annotation with its old uid but fires no
  `MEASUREMENT_ADDED`, only `MEASUREMENT_UPDATED` (`CST/tools/base/AnnotationTool.js:245-303`). The
  uid is no longer linked, so the ellipse belongs to no row and the row does not return (spec edge
  case).
- **A deletion while a new ellipse is half drawn** makes OHIF finish that ellipse
  (`initMeasurementService.ts:534`, `cancelMeasurement`), which fires `MEASUREMENT_ADDED` and fills
  the "Drawing…" row with it. This is OHIF's behaviour, not the bridge's, and needs a click-move-
  click drawing interrupted by Backspace. Recorded as a known limitation.
- **The viewer's own area text is rounded by significant figures** (`roundNumber`: no decimals at
  100 and above), so the row's one decimal can differ in its last digit from the text next to the
  ellipse (spec User Story 1).

## R11. Testing

None automated: the constitution's standing pause applies (v3.0.0), and `tasks.md` has no test
tasks. Verification is [quickstart.md](quickstart.md), plus `typecheck`, `lint` and `build`.

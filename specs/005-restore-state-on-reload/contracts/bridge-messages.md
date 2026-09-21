# Contract: Bridge messages, version 1 (adds the ellipse's geometry, `RESTORE_MEASUREMENTS` and `MEASUREMENT_RESTORE_FAILED`)

Extends [004's contract](../../004-live-measurement-update/contracts/bridge-messages.md) and,
through it, [003's](../../003-add-area-measurements/contracts/bridge-messages.md). Everything not
listed here stays in force: transport, envelope, version rule, the other messages, sender rules
and receiver rules. The source of truth is still
`apps/viewer/extensions/bridge/src/messages.ts` in the fork, and `ARCHITECTURE.md` carries the
reviewer-facing copy.

## Version

Unchanged: `version: BridgeVersion.V1`. `ellipse` is a new field on two existing events, which a
receiver built before it ignores. `RESTORE_MEASUREMENTS` and `MEASUREMENT_RESTORE_FAILED` are new
names, which an older receiver rejects as unknown and logs. Neither makes a V1 receiver misread a message it already knows
(research R12).

## New type: the ellipse's geometry

```ts
export type Point3 = [number, number, number];

/** Where an ellipse is, as the viewer sees it: enough to draw the same ellipse again (R2). */
export type EllipseGeometry = {
  referencedImageId: string;
  FrameOfReferenceUID: string;
  viewPlaneNormal: Point3;
  viewUp: Point3;
  /** Bottom, top, left, right, in world coordinates. */
  points: [Point3, Point3, Point3, Point3];
};
```

It carries no area: the area is computed from the points by the viewer (R8). It carries no
annotation id: the viewer's own ids stay in the viewer, as 004 decided.

## Changed events (viewer → host)

| `event` | `payload` | Change |
| --- | --- | --- |
| `MEASUREMENT_ADDED` | `{ StudyInstanceUID, rowId, area, unit, ellipse }` | `+ ellipse` |
| `MEASUREMENT_UPDATED` | `{ StudyInstanceUID, rowId, change: AreaChanged, area, unit, ellipse }` | `+ ellipse` |
| | `{ StudyInstanceUID, rowId, change: AreaUnavailable, ellipse }` | `+ ellipse` |

**When `MEASUREMENT_UPDATED` is sent** changes with it: 004 sent it when the area or the unit
changed; it is now sent when the area, the unit **or the geometry** changed (research R4). Moving
an ellipse without resizing it reports the move with the area it already had. Events that change
nothing the host stores — selection, lock, visibility — are still not sent.

**No geometry, no message.** The viewer sends neither event for a measurement whose geometry it
cannot read in full: `ellipse` is required, and a value the form could never restore is worse than
none. It logs a `warn` instead and the row stays where it was — "Drawing…", with Cancel as the way
out, as for a finished ellipse with no area (003); or "Done" with its last value.

```ts
type MeasurementUpdate =
  | { change: MeasurementChange.AreaChanged; area: number; unit: string }
  | { change: MeasurementChange.AreaUnavailable };

[BridgeEvent.MeasurementAdded]: ForStudy<{ rowId: string; area: number; unit: string; ellipse: EllipseGeometry }>;
[BridgeEvent.MeasurementUpdated]: ForStudy<{ rowId: string; ellipse: EllipseGeometry } & MeasurementUpdate>;
```

## New event (viewer → host)

| `event` | `payload` | Sent when |
| --- | --- | --- |
| `MEASUREMENT_RESTORE_FAILED` | `{ StudyInstanceUID: string; rowId: string }` | an ellipse from `RESTORE_MEASUREMENTS` could not be put back — in practice, its image is not in the study the viewer has open (research R13) |

```ts
MeasurementRestoreFailed = 'MEASUREMENT_RESTORE_FAILED', // in BridgeEvent

[BridgeEvent.MeasurementRestoreFailed]: ForStudy<{ rowId: string }>;
```

The ellipse was never linked, so nothing more is sent for that `rowId` until the doctor activates
the row and draws again.

## New command (host → viewer)

| `command` | `payload` | Viewer does |
| --- | --- | --- |
| `RESTORE_MEASUREMENTS` | `{ StudyInstanceUID: string; measurements: { rowId: string; ellipse: EllipseGeometry }[] }` | draws each ellipse again and links it to its `rowId`, exactly as if it had been drawn for that row in this session |

```ts
export enum BridgeCommand {
  ActivateTool = 'ACTIVATE_TOOL',
  DeactivateTool = 'DEACTIVATE_TOOL',
  RestoreMeasurements = 'RESTORE_MEASUREMENTS',
}

[BridgeCommand.RestoreMeasurements]: {
  StudyInstanceUID: string;
  measurements: { rowId: string; ellipse: EllipseGeometry }[];
};
```

- Sent by the host on every `VIEWER_READY`, carrying every row it has with a saved ellipse
  (research R7). An empty list is not sent.
- It is the only command that names a study. The other two flip a tool; this one puts marks on a
  patient's images, so it is checked against the study the viewer has open, as events are.
- There is no reply to the command as a whole. Each ellipse that was put back announces itself
  the ordinary way, with the `MEASUREMENT_UPDATED` cornerstone fires once it has computed the area
  (R8). Each one that could not be is logged at `warn` in the viewer and reported with
  `MEASUREMENT_RESTORE_FAILED`.
- Restoring never touches `pendingRowId`: a row that is "Drawing…" stays so, and the next new
  ellipse still fills it.

## Receiver rules (host), additions

Rules 1–5 are unchanged. Rule 4's guard now also requires, on `MEASUREMENT_ADDED` and on both
`MEASUREMENT_UPDATED` cases, an `ellipse` that passes one shared check:

- `referencedImageId`: a non-empty string of at most 512 characters.
- `FrameOfReferenceUID`: a non-empty string of at most 64 characters.
- `viewPlaneNormal`, `viewUp`: arrays of exactly three finite numbers.
- `points`: exactly four arrays of exactly three finite numbers.

A message whose `ellipse` fails is dropped whole and logged at `warn` with the reason only, as any
other malformed message. The same ellipse check is reused when a saved state is read back
([saved-state.md](saved-state.md)), because that data comes from the same shape and is trusted no
further. `MEASUREMENT_RESTORE_FAILED` carries no ellipse and needs only a non-empty `rowId`.

Then, in the measurement state ([data-model.md](../data-model.md)): a `MEASUREMENT_RESTORE_FAILED`
whose `rowId` names no row, or a row that is not `Done`, changes nothing and is logged at `warn`
with the reason only — the same rule 004 set for updates and removals.

## Receiver rules (viewer), additions

Rules 1–3 (origin, window, version) are unchanged. Rule 4 branches on the command:

- `ACTIVATE_TOOL`, `DEACTIVATE_TOOL`: unchanged — `rowId` a non-empty string of at most 64
  characters, and for `ACTIVATE_TOOL` a known `BridgeTool`.
- `RESTORE_MEASUREMENTS`: `StudyInstanceUID` a non-empty string, `measurements` an array of at
  most 100 entries, each with a `rowId` as above and an `ellipse` passing the same check the host
  applies. A command that fails is dropped whole — no ellipse is drawn — and logged at `warn`.

Then, before drawing: `StudyInstanceUID` must be the study in the viewer's own address, or the
command is dropped and logged at `warn`. The guard is the shape; this is the address.

## Sender rules

Unchanged on both sides: the viewer posts only when framed, to each `HostOrigin`, never `'*'`; the
host posts to the viewer's exact origin. Messages are built with `buildEvent` / `buildCommand`.

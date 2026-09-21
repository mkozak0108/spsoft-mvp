# Contract: Bridge messages, version 1 (adds the ellipse's geometry and `RESTORE_MEASUREMENTS`)

Extends [004's contract](../../004-live-measurement-update/contracts/bridge-messages.md) and,
through it, [003's](../../003-add-area-measurements/contracts/bridge-messages.md). Everything not
listed here stays in force: transport, envelope, version rule, the other messages, sender rules
and receiver rules. The source of truth is still
`apps/viewer/extensions/bridge/src/messages.ts` in the fork, and `ARCHITECTURE.md` carries the
reviewer-facing copy.

## Version

Unchanged: `version: BridgeVersion.V1`. `ellipse` is a new field on two existing events, which a
receiver built before it ignores, and `RESTORE_MEASUREMENTS` is a new command name, which an older
viewer rejects as unknown and logs. Neither makes a V1 receiver misread a message it already knows
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

```ts
type MeasurementUpdate =
  | { change: MeasurementChange.AreaChanged; area: number; unit: string }
  | { change: MeasurementChange.AreaUnavailable };

[BridgeEvent.MeasurementAdded]: ForStudy<{ rowId: string; area: number; unit: string; ellipse: EllipseGeometry }>;
[BridgeEvent.MeasurementUpdated]: ForStudy<{ rowId: string; ellipse: EllipseGeometry } & MeasurementUpdate>;
```

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
- The viewer posts nothing in reply. Each restored ellipse announces itself the ordinary way, with
  the `MEASUREMENT_UPDATED` cornerstone fires once it has computed the area (R8). An ellipse that
  cannot be put back is logged at `warn` in the viewer and produces no message, so the host keeps
  the row with its saved value.
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
other malformed message. The same check is reused when a saved state is read back
([saved-state.md](saved-state.md)), because that data comes from the same shape and is trusted no
further.

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

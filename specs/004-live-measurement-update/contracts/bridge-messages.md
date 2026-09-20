# Contract: Bridge messages, version 1 (adds `MEASUREMENT_UPDATED` and `MEASUREMENT_REMOVED`)

Extends [003's contract](../../003-add-area-measurements/contracts/bridge-messages.md), which
stays in force for everything not listed here: transport, envelope, version rule, the other
messages, sender rules, and receiver rules 1–5. The source of truth is still
`apps/viewer/extensions/bridge/src/messages.ts` in the fork, and `ARCHITECTURE.md` carries the
reviewer-facing copy.

## Version

Unchanged: `version: BridgeVersion.V1`. A new event does not change how a V1 receiver reads any
existing message, and a form built before this feature rejects an unknown event and logs a `warn`
(research R9).

## New events

| `event` | `payload` | Sent when |
| --- | --- | --- |
| `MEASUREMENT_UPDATED` | `{ StudyInstanceUID: string; rowId: string; change: MeasurementChange.AreaChanged; area: number; unit: string }` | the area or unit of an ellipse linked to a row changed. During a drag, about ten times a second, and once more with the final area after it stops (research R1). Never with the same area and unit as the last one sent for that row |
| | `{ StudyInstanceUID: string; rowId: string; change: MeasurementChange.AreaUnavailable }` | a linked ellipse lost its area (part of it is off the image). Sent once; the next `AreaChanged` restores it |
| `MEASUREMENT_REMOVED` | `{ StudyInstanceUID: string; rowId: string }` | a linked ellipse was deleted, singly or as part of a bulk delete. The last message for that `rowId` |

- `rowId` is the one the host sent in `ACTIVATE_TOOL` and got back in `MEASUREMENT_ADDED`. The
  viewer keeps the link from its own annotation id; that id never goes on the wire (research R3).
- Only ellipses reported with `MEASUREMENT_ADDED` are linked. Nothing is sent for an ellipse
  still being drawn, for one drawn from the viewer's own toolbar, or for one restored by undo
  after it was deleted.
- A bulk delete is reported as one `MEASUREMENT_REMOVED` per linked row.
- `MEASUREMENT_REMOVED` carries the same name as the viewer's own removal event, so the two sides
  read the same way (research R5).

## New enum

```ts
export enum MeasurementChange {
  AreaChanged = 'areaChanged',
  AreaUnavailable = 'areaUnavailable',
}
```

`BridgeEvent.MeasurementUpdated` loses its "reserved" note, `BridgeEvent.MeasurementRemoved` is
added, and both get an entry in `EventPayloads`, so they join the `BridgeEventMessage` union:

```ts
type MeasurementUpdate =
  | { change: MeasurementChange.AreaChanged; area: number; unit: string }
  | { change: MeasurementChange.AreaUnavailable };

[BridgeEvent.MeasurementUpdated]: ForStudy<{ rowId: string } & MeasurementUpdate>;
[BridgeEvent.MeasurementRemoved]: ForStudy<{ rowId: string }>;
```

## Receiver rules (host), additions

Rules 1–5 of 003 apply unchanged. Rule 4's guard checks, for both new messages, that `rowId` is a
non-empty string; for `MEASUREMENT_UPDATED` also that `change` is a known `MeasurementChange` and,
for `AreaChanged`, that `area` and `unit` are exactly as for `MEASUREMENT_ADDED` (a finite number
≥ 0; a non-empty string of at most 16 characters). One helper checks both messages that carry an
area.

Then, in the measurement state ([data-model.md](../data-model.md)): an update or a removal whose
`rowId` names no row, or a row that is not `Done`, changes nothing and is logged at `warn` with
the reason only.

## Sender rules (viewer), additions

Unchanged: post only when framed, to each `HostOrigin`, never `'*'`, built with `buildEvent`.
No command is added, so the viewer's receiver rules are unchanged.

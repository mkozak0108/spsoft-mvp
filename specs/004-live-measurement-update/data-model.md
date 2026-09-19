# Data Model: Live Measurement Update

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Extends [003's data model](../003-add-area-measurements/data-model.md); only the changes are
listed. Nothing is persisted: everything lives in memory for the life of the page (or, in the
viewer, of the mode).

## Measurement row (scoring app)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | unchanged: `row-<number>` |
| `number` | number | **new**. The row's own number, from the same counter as `id`, used in its label "Measurement N". Never changes or is reused, so removing a row renames nothing (research R6) |
| `status` | `RowStatus` | unchanged: `Pending` \| `Drawing` \| `Done` |
| `value` | `{ area: number; unit: string }` \| absent | *(Changes 003)* present when `Done` **and** the viewer has an area. A `Done` row with no value is one whose ellipse can't be measured right now (FR-015). `area` is still rounded to one decimal when stored |

Rows are shown in creation order. *(Changes 003)* A row is removed when its ellipse is deleted in
the viewer; there is still no way to remove one from the form.

### Row state machine

```text
                 activate                  measurement added
    Pending ───────────────► Drawing ─────────────────────────► Done ──┐ area changed
       ▲                       │                                  │ ▲  │ area unavailable
       └───────────────────────┘                                  │ └──┘
   cancel · another row activated · VIEWER_READY again            │
                                                                  ▼ removed
                                                              (row gone)
```

New actions (003's are unchanged):

| Action | Allowed when | Effect |
| --- | --- | --- |
| area changed `{ rowId, area, unit }` | a row with that `id` exists and is `Done` | `value = { round1(area), unit }`. If that equals the current value, the state is returned unchanged (research R2) |
| area unavailable `{ rowId }` | same | `value` removed; status stays `Done` |
| removed `{ rowId }` | same | the row is removed from `rows` |

Any action outside its "allowed when" leaves the state untouched, and the hook logs it at `warn`
with the reason `UnknownRow` or `NotDone` (FR-011), never with the payload.

Invariants:
- At most one row is `Drawing` (003). Area changes and removals never touch a `Drawing` row,
  because they only apply to `Done` rows (FR-007, FR-010).
- `nextRowNumber` only grows, so `id` and `number` are never reused after a removal.

### Area total (derived, never stored)

Unchanged rules (003). Only `Done` rows **with a value** count, so a row whose ellipse can't be
measured drops out and comes back with its next area. Removing the last counted row gives
`Total area: —`.

## Bridge messages

The full contract is [contracts/bridge-messages.md](contracts/bridge-messages.md). This feature
adds one message:

| Message | Direction | Payload |
| --- | --- | --- |
| `MEASUREMENT_UPDATED` | viewer → host | `{ StudyInstanceUID, rowId, change: MeasurementChange, … }`: with `AreaChanged`, also `area` and `unit`; with `AreaUnavailable` or `Removed`, nothing more |

## Viewer bridge state (viewer)

| Scope | Lives from → to | Holds |
| --- | --- | --- |
| Measurements | `onModeEnter` → `onModeExit` | `pendingRowId` (003); **new**: `links: Map<measurement uid, { rowId, last }>`, where `last` is the last reported `{ area, unit }` or *unavailable*; the subscriptions to `MEASUREMENT_UPDATED`, `MEASUREMENT_REMOVED` and `MEASUREMENTS_CLEARED` |

- Posting `MEASUREMENT_ADDED` for the pending row also adds `measurement.uid → { rowId, last:
  the reported area }` to `links` (research R3).
- `MEASUREMENT_UPDATED` for a linked uid: read the area. If it differs from `last` (or its
  availability changed), post `AreaChanged` or `AreaUnavailable` and store it as `last`.
  Otherwise, or for an unlinked uid, do nothing.
- `MEASUREMENT_REMOVED` (payload: the uid) or `MEASUREMENTS_CLEARED` (payload: the measurements)
  for a linked uid: post `Removed` and delete the link.
- `onModeExit` unsubscribes and clears `links`; OHIF's own clear at mode exit comes after that,
  so it is never reported (research R5).

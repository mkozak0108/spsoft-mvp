# Data Model: Add Area Measurements

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Nothing is persisted (spec Assumptions). All of it lives in memory for the life of the page; a
reload starts with no rows.

## Measurement row (scoring app)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `row-<n>`, from a counter in the state. Sent to the viewer and echoed back; the only key for matching a result to a row (research R2) |
| `status` | `RowStatus` | `Pending` \| `Drawing` \| `Done` |
| `value` | `{ area: number; unit: string }` \| absent | present only when `Done`. `area` is rounded to one decimal when stored (research R8); `unit` is the viewer's text, e.g. `mm²` |

Rows are shown in creation order and are never removed (spec Assumptions).

## Measurement state (scoring app)

```text
{ rows: Row[], viewerReady: boolean, nextRowNumber: number }
```

`viewerReady` is false at page load and becomes true on `VIEWER_READY`.

### Row state machine

```text
                 activate                       measurement added (matching rowId)
    Pending ───────────────► Drawing ─────────────────────────────────────────► Done
       ▲                       │
       └───────────────────────┘
   cancel · another row activated · VIEWER_READY received again
```

| Action | Allowed when | Effect |
| --- | --- | --- |
| add row | always (a study is on screen, so the form is shown) | append a `Pending` row |
| activate `id` | row is `Pending` and `viewerReady` | that row → `Drawing`; any other `Drawing` row → `Pending` (FR-005) |
| cancel `id` | row is `Drawing` | row → `Pending` |
| viewer ready | always | `viewerReady = true`; any `Drawing` row → `Pending` (FR-008) |
| measurement added `{ rowId, area, unit }` | a row with that `id` exists and is `Drawing` | row → `Done` with the value (FR-003) |

Any action outside its "allowed when" leaves the state untouched. In particular a
`measurement added` for an unknown or non-`Drawing` row changes nothing (FR-010), and the hook
logs that at `warn`.

Invariant: at most one row is `Drawing` (SC-004). It holds because activating turns the previous
`Drawing` row back in the same transition.

### Area total (derived, never stored)

| Kind | When | Shown |
| --- | --- | --- |
| `AreaTotalKind.None` | no `Done` row | no value (a dash) |
| `AreaTotalKind.Sum` | ≥ 1 `Done` row, all with the same `unit` | the sum, one decimal, with the unit |
| `AreaTotalKind.MixedUnits` | `Done` rows with different `unit`s | "can't be added up: units differ" |

Only `Done` rows count. The sum is over stored (already one-decimal) values, so it equals the
sum of the displayed values.

## Bridge messages

The contract, both directions, is in [contracts/bridge-messages.md](contracts/bridge-messages.md).
The types below are what this feature adds to it.

| Message | Direction | Payload |
| --- | --- | --- |
| `VIEWER_READY` | viewer → host | `{ StudyInstanceUID }` |
| `ACTIVATE_TOOL` | host → viewer | `{ rowId, tool: BridgeTool }` |
| `DEACTIVATE_TOOL` | host → viewer | `{ rowId }` |
| `MEASUREMENT_ADDED` | viewer → host | `{ StudyInstanceUID, rowId, area, unit }` |
| `MEASUREMENT_UPDATED` | viewer → host | reserved name; no payload defined |

## Viewer bridge state (viewer)

| Scope | Lives from → to | Holds |
| --- | --- | --- |
| Measurements | `onModeEnter` → `onModeExit` | `pendingRowId: string \| undefined`, the message listener, the measurement-service subscription |

- `ACTIVATE_TOOL` sets `pendingRowId` (replacing any earlier one) and enables the Ellipse tool.
- `DEACTIVATE_TOOL` with a matching `rowId` clears it and returns to Pan; a non-matching one is
  ignored.
- A finished ellipse with `pendingRowId` set posts `MEASUREMENT_ADDED`, clears it, and returns
  to Pan. With none set, it is ignored.
- `onModeExit` clears everything; nothing is posted after that.

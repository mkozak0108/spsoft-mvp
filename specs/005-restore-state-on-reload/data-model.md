# Data Model: Restore State on Reload

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Extends [004's data model](../004-live-measurement-update/data-model.md); only the changes are
listed. The headline change: the host's rows are no longer only in memory. They are written to the
tab's `sessionStorage`, one entry per study, and read back when the page opens.

## Measurement row (scoring app)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | unchanged: `row-<number>` |
| `number` | number | unchanged |
| `status` | `RowStatus` | `Pending` \| `Drawing` \| `Done` \| **`Failed`** (new): a restored row whose ellipse the viewer could not put back, shown as "Not restored" (research R13) |
| `value` | `{ area: number; unit: string }` \| absent | unchanged |
| `ellipse` | `EllipseGeometry` \| absent | **new**. Where the row's ellipse is, as the viewer last reported it. Present on a `Done` row; absent on `Pending`, `Drawing` and `Failed` — a failed row's geometry is dropped, so a further reload does not try it again |

`EllipseGeometry` is defined once in the bridge contract (it travels on the wire) and is the same
object the host stores:

| Field | Type | Notes |
| --- | --- | --- |
| `referencedImageId` | string | the viewer's own id for the image the ellipse is on; opaque to the host |
| `FrameOfReferenceUID` | string | DICOM frame of reference |
| `viewPlaneNormal` | `[number, number, number]` | the plane the ellipse belongs to |
| `viewUp` | `[number, number, number]` | with the normal, the orientation |
| `points` | `[Point3, Point3, Point3, Point3]` | the four world points: bottom, top, left, right (research R2) |

The area is **not** part of the geometry. It is derived from the points by the viewer (R8).

### Row state machine

004's machine plus one status. A row read back from storage starts in the status it was saved in
(a `Drawing` row loads as `Pending`), and a restored ellipse arrives through the update path that
already exists.

```text
                 activate                  measurement added
    Pending ───────────────► Drawing ─────────────────────────► Done ──┐ area changed
       ▲                       │ ▲                                │ ▲  │ area unavailable
       └───────────────────────┘ │                                │ └──┘
   cancel · another row          │ activate                       │ restore failed
   activated · VIEWER_READY      │                                ▼
                                 └─────────────────────────── Failed

    Done ── removed ──► (row gone), as in 004
```

Changed actions (004's conditions are unchanged):

| Action | Change |
| --- | --- |
| measurement added `{ rowId, area, unit, ellipse }` | also stores `ellipse` on the row |
| area changed `{ rowId, area, unit, ellipse }` | also stores `ellipse`. The "nothing changed, return the same state" check now compares the geometry too, so a move with no resize is stored |
| area unavailable `{ rowId, ellipse }` | clears `value` and stores `ellipse`: an ellipse dragged off the image has still moved |
| removed `{ rowId }` | unchanged; the row goes, and its geometry with it |
| restore failed `{ rowId }` | **new**. Allowed when the row exists and is `Done`: status `Failed`, `ellipse` removed, `value` kept |
| activate `{ id }` | *(changes 003)* allowed from `Pending` **or `Failed`**; the activated row also loses its `value`, so a not-restored row starts over. A `Pending` row has no value, so for it nothing changes |

A `Failed` row is left out of the total by the existing rule: only `Done` rows with a value count.

## Saved state (scoring app, `sessionStorage`)

One entry per study, in the tab that made it.

| | |
| --- | --- |
| Key | `spsoft-mvp.measurements.<StudyInstanceUID>` |
| Value | JSON: `{ version: SavedStateVersion.V1, nextRowNumber: number, rows: SavedRow[] }` |
| Written | at most once a second while `rows` or `nextRowNumber` keep changing — at once for the first change after a quiet second, once more at the end of it — and immediately on `pagehide`, on `visibilitychange` to `hidden` and on unmount. Skipped when the value equals the last one written, so opening a study writes nothing (research R10) |
| Read | once, when the form mounts for that study |
| Ends | when the tab closes |

`SavedRow` is a `MeasurementRow` — `id`, `number`, `status`, optional `value`, optional `ellipse`.
`viewerReady` is not saved: it describes the viewer that is running, not the doctor's work.

### Reading it back

Untrusted input, so it is narrowed before use (research R9). In order:

1. The key is missing → start empty. Not a failure, and not logged as one.
2. Storage throws, or the value is not JSON → `warn`, remove the key, start empty.
3. `version` is not `SavedStateVersion.V1` → `warn`, remove the key, start empty.
4. Any field fails its check → `warn`, remove the key, start empty. Checks: `id` and `number`
   agree and are within the counter; `status` is a `RowStatus`; `value`, when present, has a finite
   `area` ≥ 0 and a `unit` of at most 16 characters; `ellipse`, when present, has two non-empty
   strings of at most 512 and 64 characters, two vectors of exactly three finite numbers, and
   exactly four points of three finite numbers.
5. It passes → the state is used, with one normalisation: a `Drawing` row becomes `Pending`,
   because its ellipse was never finished (FR-007).

There is no partial restore. A file that fails anywhere is dropped whole, so the form can never
show half of the doctor's work as if it were all of it.

| Reason (enum) | When |
| --- | --- |
| `StorageUnavailable` | reading or writing threw (private mode, blocked site data, no quota) |
| `Unreadable` | the value is not JSON, or not an object |
| `UnsupportedVersion` | `version` is missing or not `V1` |
| `Shape` | a row, a value or an ellipse failed its check |

## Bridge messages

The full contract is [contracts/bridge-messages.md](contracts/bridge-messages.md). This feature
adds one field to two events and one command:

| Message | Direction | Change |
| --- | --- | --- |
| `MEASUREMENT_ADDED` | viewer → host | `+ ellipse: EllipseGeometry` |
| `MEASUREMENT_UPDATED` | viewer → host | `+ ellipse: EllipseGeometry`, in both `change` cases. Now also sent when only the geometry changed (research R4) |
| `RESTORE_MEASUREMENTS` | host → viewer | **new**: `{ StudyInstanceUID, measurements: { rowId, ellipse }[] }` |
| `MEASUREMENT_RESTORE_FAILED` | viewer → host | **new**: `{ StudyInstanceUID, rowId }` — an ellipse from the restore could not be put back |

`RESTORE_MEASUREMENTS` is the one command that carries a study: it puts marks on a patient's
images, so it gets the same study check the events get. At most 100 ellipses are accepted in one
command.

## Viewer bridge state (viewer)

| Scope | Lives from → to | Holds |
| --- | --- | --- |
| Measurements | `onModeEnter` → `onModeExit` | `pendingRowId` (003); `links: Map<measurement uid, { rowId, last, lastEllipse }>` — `last` as in 004, **new** `lastEllipse` is the geometry last reported for that ellipse, which is what the "did anything change?" check compares against |

- Restoring one ellipse: build the annotation from the five saved fields plus
  `toolName: EllipticalROI` and empty `cachedStats`, call `measurementService.addRawMeasurement`,
  and on the uid it returns do `links.set(uid, { rowId, last: undefined, lastEllipse: the saved
  geometry })`. A call that returns nothing is logged at `warn` and reported with
  `MEASUREMENT_RESTORE_FAILED` for that row (research R5, R13).
- After the whole list, one render through `cornerstoneViewportService`.
- Nothing is posted to the host for an ellipse that was put back. Its area arrives on its own, as
  the ordinary update cornerstone fires once it has recomputed the stats (research R8).

# Contract: Saved state (scoring app ↔ the tab's storage)

New with this feature. It describes the one thing the app writes outside its own memory: the
doctor's measurement work, in the tab's `sessionStorage`. The source of truth will be
`apps/scoring-form/src/lib/savedState.ts`; this document is the reviewer-facing copy.

The viewer writes nothing. It has no storage of its own in this feature (research R1).

## Where and how long

| | |
| --- | --- |
| Store | `window.sessionStorage`, on the scoring app's origin |
| Key | `spsoft-mvp.measurements.<StudyInstanceUID>` — one per study |
| Lifetime | the browser tab. Survives reload; gone when the tab closes |
| Shared with | nobody: not other tabs, not other browsers, not other devices, and nothing leaves the browser |

The study identifier is in the key because it is what separates one study's work from another's.
It is already in the page address, so the key adds no identifier that was not there.

## Value

```ts
export enum SavedStateVersion {
  V1 = 1,
}

type SavedState = {
  version: SavedStateVersion;
  nextRowNumber: number;
  rows: MeasurementRow[]; // id, number, status, value?, ellipse?
};
```

`ellipse` is the `EllipseGeometry` from the bridge contract
([bridge-messages.md](bridge-messages.md)), stored as it arrived.

**Not stored**: anything about the patient or the study beyond the identifier in the key; the
viewer's own annotation ids (they never reach the host); whether the viewer is ready, which
describes the running viewer and not the doctor's work.

## Why the value carries a version

The same reason every bridge message does. What is in storage was written by whatever version of
the app the tab last ran, and the shape may change. A reader that could not tell versions apart
would read a changed shape as if it were this one and show a wrong number. With the version, it
refuses what it does not understand and says so.

- A reader accepts only `SavedStateVersion.V1`, and checks it before any field.
- Adding an optional field stays `V1`: a reader ignores fields it does not know. Anything that
  would make a `V1` reader misread a stored value needs `V2`.

## Reading

Stored data is untrusted input, like a bridge message (constitution, Principle II). In order:

1. The key is missing → start empty. Normal, not logged.
2. Reading throws, or the value is not JSON, or is not an object → `warn`, remove the key, start
   empty.
3. `version` is not `V1` → `warn`, remove the key, start empty.
4. Any field fails its check → `warn`, remove the key, start empty. Checks: `nextRowNumber` a
   positive integer; each row's `id` equal to `row-<number>`; `number` a positive integer below
   `nextRowNumber`; `status` a known `RowStatus`; `value`, when present, a finite `area` ≥ 0 and a
   `unit` of at most 16 characters; `ellipse`, when present, passing the bridge contract's ellipse
   check.
5. It passes → used as the form's starting state, with one change: a `Drawing` row becomes
   `Pending`. Its ellipse was never finished, so nothing can arrive for it (FR-007). A `Failed`
   row stays `Failed`, with its value and no ellipse, so the same failing ellipse is not tried
   again (FR-017).

It is all or nothing. A value that fails anywhere is dropped whole, and the key is removed so the
same failure does not repeat on every open for the life of the tab.

| Reason (logged, never the value) | When |
| --- | --- |
| `StorageUnavailable` | reading or writing threw: blocked site data, private mode, no quota |
| `Unreadable` | not JSON, or not an object |
| `UnsupportedVersion` | `version` missing or not `V1` |
| `Shape` | a row, a value or an ellipse failed its check |

## Writing

At most once a second while the state keeps changing, and immediately when the page goes away
(research R10):

| When | Writes |
| --- | --- |
| the first change after a quiet second | at once |
| further changes within that second | once, at the end of the second, with the latest state |
| `pagehide` (reload, navigation, closing the tab) | whatever is pending, at once |
| `visibilitychange` to `hidden` (another tab, minimised, before a background tab is discarded) | whatever is pending, at once |
| the form unmounting | whatever is pending, at once |
| a value equal to the last one written | nothing |

- "The state" is `rows` and `nextRowNumber`. A new row, a finished ellipse, an edited area, a
  move, a removal and a not-restored mark are all changes.
- Opening a study writes nothing: the value loaded (or, with nothing saved, the empty state) is
  treated as the last one written. So only a study the doctor has actually worked on gets a key.
- Removing the last row still writes `{ version, nextRowNumber, rows: [] }` rather than deleting the
  key, so the numbering does not restart after a reload (FR-004).
- A write that throws is logged at `warn` with `StorageUnavailable` and changes nothing else: the
  form and the viewer keep working for the rest of the session on what is in memory (FR-015).
  Nothing is shown to the doctor.
- `beforeunload` and `unload` are not used: they keep the page out of the back/forward cache and
  are not fired reliably. A crash fires nothing, so it can lose at most the last second.

## What is never logged

The value itself, any area, any unit, any geometry and the study identifier. Failures log their
reason enum and nothing else, as bridge rejections do.

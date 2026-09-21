---

description: "Task list for 005 Restore State on Reload"
---

# Tasks: Restore State on Reload

**Input**: Design documents from `specs/005-restore-state-on-reload/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: None. The constitution (v3.0.0, Development Workflow & Quality Gates) pauses all
automated testing project-wide, so this file has no test tasks. Each story ends with a manual
check against [quickstart.md](quickstart.md), plus `typecheck` and `lint`.

**Organization**: Tasks are grouped by user story. The geometry has to be on the wire and on the
row before anything can be saved, so that is the foundational phase. US1 then adds the store with
its throttled saving, the restore command and the viewer's side of it. US2 adds the "Not restored"
row; the rest of it — and all of US3 — falls out of US1 and is checked by hand.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Two apps and one contract file, from the repo root:

- **Scoring app** (npm): `apps/scoring-form/`. Run: `cd apps/scoring-form && npm run typecheck && npm run lint`.
- **Viewer bridge** (OHIF fork, git submodule, pnpm): `apps/viewer/extensions/bridge/src/`. All
  viewer work is committed **inside the submodule** on the fork branch
  `005-restore-state-on-reload` (remote `mkozak0108/Viewers`), created in T001. Nothing outside
  `extensions/bridge/` changes in the fork. The user merges the fork PR later; the parent repo
  pins the pushed branch.
- **Message contract**: `apps/viewer/extensions/bridge/src/messages.ts` is the only copy. No
  imports; the bridge imports it as `./messages`, the scoring app as `@bridge-contract`, and both
  build messages with `buildEvent` / `buildCommand` (`./buildMessages`, `@bridge-builders`). Both
  apps reference its enums and never the string values (constitution, Enums).
- While the submodule is ahead of the committed gitlink, stage parent-repo files explicitly and
  never use `git commit -a` or `git add -A`.

The stored value is fixed by [contracts/saved-state.md](contracts/saved-state.md), the messages by
[contracts/bridge-messages.md](contracts/bridge-messages.md) and the screen wording by
[contracts/scoring-app-ui.md](contracts/scoring-app-ui.md); follow them exactly. Comments
explain *why*, never *what* (constitution, Comments). Areas, units, geometry, stored values and
the study identifier are never logged.

---

## Phase 1: Setup

**Purpose**: The branches this feature's work goes on

- [X] T001 Create the fork branch: `git -C apps/viewer checkout -b 005-restore-state-on-reload` from the commit the parent repo pins today (`f2ee4fcef6`, the fork's `master` after 004's PR; check with `git submodule status`). Do not push yet. The parent repo is already on `005-restore-state-on-reload`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The ellipse's geometry travels with every measurement message and is kept on the row.
Nothing is saved yet and nothing the doctor sees changes.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 (fork) In `apps/viewer/extensions/bridge/src/messages.ts`, add the geometry and the new command, exactly as in [contracts/bridge-messages.md](contracts/bridge-messages.md). Keep the file free of imports:
  - add `export type Point3 = [number, number, number]` and `export type EllipseGeometry = { referencedImageId: string; FrameOfReferenceUID: string; viewPlaneNormal: Point3; viewUp: Point3; points: [Point3, Point3, Point3, Point3] }`, with a one-line comment saying it is what it takes to draw the same ellipse again, and that the area is not part of it because the viewer computes it from the points;
  - add `ellipse: EllipseGeometry` to `[BridgeEvent.MeasurementAdded]` and to `[BridgeEvent.MeasurementUpdated]` (outside `MeasurementUpdate`, so both `change` cases carry it);
  - add `RestoreMeasurements = 'RESTORE_MEASUREMENTS'` to `BridgeCommand` and `[BridgeCommand.RestoreMeasurements]: { StudyInstanceUID: string; measurements: { rowId: string; ellipse: EllipseGeometry }[] }` to `CommandPayloads`;
  - add `MeasurementRestoreFailed = 'MEASUREMENT_RESTORE_FAILED'` to `BridgeEvent` and `[BridgeEvent.MeasurementRestoreFailed]: ForStudy<{ rowId: string }>` to `EventPayloads`, so it joins `BridgeEventMessage`;
  - in the header comment, point to `specs/005-restore-state-on-reload/contracts/bridge-messages.md` next to the others, and say in one line why the one command that carries a study is this one
- [X] T003 (fork) In `apps/viewer/extensions/bridge/src/watchMeasurements.ts`, report the geometry with every measurement message (research R2, R3, R4). Depends on T002:
  - extend the local measurement event type: the measurement also carries `points` and `metadata` (`referencedImageId`, `FrameOfReferenceUID`, `viewPlaneNormal`, `viewUp`), which the `EllipticalROI` mapping puts there;
  - add `function ellipseOf(measurement): EllipseGeometry | undefined` that reads those five fields and returns `undefined` unless all are present and well-formed (two non-empty strings, two vectors of three numbers, exactly four points of three numbers);
  - no geometry means no message, for `MEASUREMENT_ADDED` and `MEASUREMENT_UPDATED` alike: the contract requires `ellipse`, and a value the form could never restore is worse than none. Log at `warn` and return, as the missing-area case already does, leaving the row where it was — "Drawing…" with Cancel as the way out, or "Done" with its last value;
  - put `ellipse` on the `MEASUREMENT_ADDED` payload, and store it on the link: `Link` gains `lastEllipse: EllipseGeometry`;
  - add `function isSameEllipse(a, b): boolean` next to `isSameArea`, comparing the two strings and every number;
  - in the `MEASUREMENT_UPDATED` handler, change the "nothing changed" test from `isSameArea(result, link.last)` to `isSameArea(result, link.last) && isSameEllipse(ellipse, link.lastEllipse)`, and put `ellipse` on both payload shapes; after posting, store both. Replace the comment above it: the event now means "the area, the unit or the shape changed", and a move with no resize is a real change because the form saves where the ellipse is (research R4)
- [X] T004 [P] In `apps/scoring-form/src/utils/guards.ts`, add `isEllipseGeometry(value: unknown): value is EllipseGeometry`, per [contracts/bridge-messages.md § Receiver rules (host), additions](contracts/bridge-messages.md#receiver-rules-host-additions). Depends on T002. It requires: `referencedImageId` "a non-empty string of at most 512 characters"; `FrameOfReferenceUID` "a non-empty string of at most 64 characters"; `viewPlaneNormal` and `viewUp` "arrays of exactly three finite numbers"; `points` "exactly four arrays of exactly three finite numbers". It goes here, not in `bridge.ts`, because T008 checks stored data with the same function (two call sites)
- [X] T005 In `apps/scoring-form/src/lib/bridge.ts`, update `isBridgeEventMessage`. Depends on T004:
  - `case BridgeEvent.MeasurementAdded` and `case BridgeEvent.MeasurementUpdated` also need `isEllipseGeometry(payload.ellipse)`, in both `change` cases;
  - add `case BridgeEvent.MeasurementRestoreFailed`, which needs only a non-empty `rowId`, next to `MeasurementRemoved`;
  - nothing else about the guard changes. The hook ignores the new event until T016 handles it
- [X] T006 [P] In `apps/scoring-form/src/lib/measurements.ts`, carry the geometry on the row ([data-model.md § Measurement row](data-model.md#measurement-row-scoring-app)). Depends on T002:
  - add `ellipse?: EllipseGeometry` to `MeasurementRow`, with a comment saying when it is absent (a `Pending` row, and a row restored from a save whose ellipse the viewer could not put back);
  - the `MeasurementAdded`, `MeasurementAreaChanged` and `MeasurementAreaUnavailable` actions each gain `ellipse: EllipseGeometry`, and each stores it on the row — including `MeasurementAreaUnavailable`, because an ellipse dragged off the image has still moved;
  - add a local `isSameEllipse(a, b)` next to `roundToOneDecimal` and widen the `MeasurementAreaChanged` no-op test: return the state unchanged only when the rounded area, the unit **and** the geometry all match. Comment why the geometry belongs in that test;
  - in `useMeasurements`, pass `message.payload.ellipse` through on the three dispatches. Nothing is logged about it
- [X] T007 Run `npm run typecheck && npm run lint` in `apps/scoring-form`; both must pass. Fix errors under `apps/scoring-form/src/` this phase caused
- [X] T008 Commit T002–T003 inside `apps/viewer` on `005-restore-state-on-reload` with small imperative messages. **Ask the user before pushing** the branch to `origin`, then push it, and commit in the parent repo the gitlink bump together with T004–T006's files, staged explicitly. The scoring app's `typecheck` in that commit is the compatibility check

**Checkpoint**: Measurements carry their shape end to end; the form holds it in memory and a reload still starts empty.

---

## Phase 3: User Story 1 - Reload the page and find the work still there (Priority: P1) 🎯 MVP

**Goal**: After a reload, the form shows the same rows, numbers, statuses, values and total, and the same ellipses are back on the images they were drawn on. Saving keeps up with the doctor at most a second behind, and exactly when the page goes away.

**Independent Test**: quickstart scenarios 1, 2, 7, 8, 9, 12–16, 18, 21, 22.

### Implementation for User Story 1

- [X] T009 [US1] In a new `apps/scoring-form/src/lib/savedState.ts`, put the store behind `load` and a throttled saver, exactly as in [contracts/saved-state.md](contracts/saved-state.md). No React in this module. Depends on T004, T006:
  - `export enum SavedStateVersion { V1 = 1 }` and `enum SavedStateRejected { StorageUnavailable = 'storageUnavailable', Unreadable = 'unreadable', UnsupportedVersion = 'unsupportedVersion', Shape = 'shape' }`;
  - the key is `` `spsoft-mvp.measurements.${studyInstanceUid}` ``, one per study;
  - `load(studyInstanceUid)` returns a `MeasurementState` or `undefined`: a missing key returns `undefined` with no log; anything else that fails logs `logger.warn` with its `reason` **and nothing else**, removes the key, and returns `undefined`. In order: a `localStorage` access that throws → `StorageUnavailable`; `JSON.parse` throws or the result is not an object → `Unreadable`; `version !== SavedStateVersion.V1` → `UnsupportedVersion`; then every field → `Shape`. Checks: `nextRowNumber` "a positive integer"; each row's `id` equal to `` `row-${number}` ``; `number` "a positive integer below `nextRowNumber`"; `status` a known `RowStatus`; `value`, when present, "a finite `area` ≥ 0 and a `unit` of at most 16 characters"; `ellipse`, when present, `isEllipseGeometry` (T004). All or nothing: one bad field drops the whole value;
  - on success, return `{ rows, nextRowNumber, viewerReady: false }` with every `RowStatus.Drawing` row mapped to `RowStatus.Pending` — its ellipse was never finished (FR-007) — and a comment saying so. Every other status, `Failed` included, loads as saved;
  - `createSaver(studyInstanceUid, baseline: MeasurementState)` returns `{ schedule(state), flush(), dispose() }`, a throttle with both edges and `const SAVE_INTERVAL_MS = 1000` ([research R10](research.md#r10-how-often-the-host-saves)):
    - it serialises `{ version: SavedStateVersion.V1, nextRowNumber, rows }` — never `viewerReady` — and remembers the last string written, starting from the `baseline`'s, so opening a study writes nothing (analyze finding Q1);
    - `schedule(state)` keeps `state` as pending. Outside a window it writes at once and opens a window of `SAVE_INTERVAL_MS`; inside one it only marks the window dirty. When a window ends dirty, it writes the pending state and opens another, so a long drag writes about once a second; a clean window just closes;
    - `flush()` writes the pending state at once; `dispose()` flushes and clears the timer;
    - every write is skipped when the string equals the last one written. A `setItem` that throws is caught and logged `warn` with `StorageUnavailable`, leaves the last-written string as it was so a later write retries, and the caller carries on (FR-015);
  - comment the one-second width with its reason: it bounds what a crash can lose to SC-004's "last second", while the flush, not the throttle, is what keeps every reload exact
- [X] T010 [US1] In `apps/scoring-form/src/lib/measurements.ts`, start from the saved state and keep it saved. Depends on T009:
  - `useMeasurements` gets its initial state lazily, through `useReducer`'s third argument: `savedState.load(studyInstanceUid) ?? INITIAL_MEASUREMENT_STATE`, so storage is read once per mount and never during a render;
  - one effect, keyed on `studyInstanceUid` and declared before the one below, creates the saver with `stateRef.current` as its baseline and keeps it in a ref; it adds a `pagehide` listener that calls `flush()` and a `visibilitychange` listener that calls `flush()` when `document.visibilityState === 'hidden'`. Its cleanup removes both and calls `dispose()`. Comment why these two events and not `beforeunload` / `unload` (research R10);
  - a second effect calls `saver.schedule(state)` whenever `state.rows` or `state.nextRowNumber` changes;
  - removing the last row still saves `rows: []`, so the numbering does not restart (FR-004). Do not delete the key on an empty list
- [X] T011 [US1] (fork) In `apps/viewer/extensions/bridge/src/watchMeasurements.ts`, accept `RESTORE_MEASUREMENTS` ([contracts/bridge-messages.md § Receiver rules (viewer), additions](contracts/bridge-messages.md#receiver-rules-viewer-additions)). Depends on T002:
  - `isBridgeCommandMessage` branches on `command`: the two existing commands keep the `rowId` check ("a non-empty string of at most 64 characters"); `RESTORE_MEASUREMENTS` needs a non-empty `StudyInstanceUID`, `measurements` an array of "at most 100 entries" (`MAX_RESTORED_MEASUREMENTS`), each with a `rowId` as above and an ellipse passing a local `isEllipseGeometry` with the same limits as T004. A command that fails is dropped whole and logged `warn`;
  - in `onMessage`, before restoring, compare `payload.StudyInstanceUID` with `studyInstanceUidFromAddress()` and drop it with a `warn` if they differ. Comment why this command alone is checked against the study: it puts marks on a patient's images
- [X] T012 [US1] (fork) In the same file, put the ellipses back (research R5, R6, R13, [data-model.md § Viewer bridge state](data-model.md#viewer-bridge-state-viewer)). Depends on T011:
  - add `enum OhifMeasurementSource { Name = 'Cornerstone3DTools', Version = '0.1' }` next to the other OHIF identifiers, with the same comment style (it must match the fork's `extensions/cornerstone/src/enums.ts`);
  - `const source = measurementService.getSource(OhifMeasurementSource.Name, OhifMeasurementSource.Version)` and the mapping from `measurementService.getSourceMappings(...)` whose `annotationType` is `toolNames.EllipticalROI`. Either missing → `log.warn` and return, restoring nothing;
  - per entry, build `{ metadata: { toolName: toolNames.EllipticalROI, referencedImageId, FrameOfReferenceUID, viewPlaneNormal, viewUp }, data: { handles: { points }, cachedStats: {}, label: '' } }` and call `measurementService.addRawMeasurement(source, toolNames.EllipticalROI, { annotation }, mapping.toMeasurementSchema)`. No `dataSource` argument: OHIF needs it only when the annotation has no `referencedImageId`;
  - it returns the measurement uid, or nothing when the mapping failed (in practice, the image is not in this study). On nothing: `log.warn`, then post `buildEvent(BridgeEvent.MeasurementRestoreFailed, { StudyInstanceUID, rowId })` through `postToHost`, and go on with the next entry. On a uid: `links.set(uid, { rowId, last: undefined, lastEllipse: ellipse })`, so a restored ellipse is from then on exactly a drawn one;
  - after the loop, one `servicesManager.services.cornerstoneViewportService.getRenderingEngine()?.render()`, with a comment that OHIF's own raw-measurement path adds the annotation without drawing it;
  - `pendingRowId` is not touched, and nothing is posted for an ellipse that was put back: it announces its area through the update cornerstone fires once it has recomputed the stats (research R8)
- [X] T013 [US1] In `useMeasurements` (`apps/scoring-form/src/lib/measurements.ts`), send the restore on every `VIEWER_READY` (research R7). Depends on T010 and T002:
  - in the `BridgeEvent.ViewerReady` case, collect `stateRef.current.rows` that have an `ellipse` as `{ rowId: row.id, ellipse: row.ellipse }` — only `Done` rows have one — and, when the list is not empty, `postToViewer` a `buildCommand(BridgeCommand.RestoreMeasurements, { StudyInstanceUID: studyInstanceUid, measurements })`;
  - comment why it is safe to send on every ready, not only the first: a viewer that has just announced itself has no annotations, so nothing can be duplicated (research R7)
- [X] T014 [US1] Run `npm run typecheck && npm run lint` in `apps/scoring-form`, then start both apps as in [quickstart.md § Setup](quickstart.md#setup) and run scenarios 1, 2, 7, 8, 9, 12, 13, 14, 15, 16, 18, 21 and 22. Scenario 16 is the check that the stored value holds nothing beyond what FR-013 allows. Record the **verify** outcomes for R5 (a restored ellipse is visible, in the right place and editable), R8 (the row's value comes from the viewer's own recomputation) and R10 (about one write a second during a drag; the flush on reload; a crash keeps what is older than a second) as a short "Verified 2026-…: …" line under each item in [research.md](research.md). Fix what fails in the module responsible
- [X] T015 [US1] Commit the fork changes (T011, T012) in `apps/viewer`, push `005-restore-state-on-reload`, and commit in the parent repo the gitlink bump together with `savedState.ts` and `measurements.ts`, staged explicitly

**Checkpoint**: A reload brings the form and the ellipses back; the starred task is demonstrable.

---

## Phase 4: User Story 2 - Restored measurements are still live (Priority: P2)

**Goal**: A restored ellipse edits and deletes exactly like one drawn in this session, the next reload reflects both, and a row whose ellipse could not be put back is shown as "Not restored" and can be drawn again.

**Independent Test**: quickstart scenarios 3, 4, 5, 6, 20.

### Implementation for User Story 2

Editing and deleting need no new code: T012's link makes a restored ellipse identical to a drawn one
for 004's update and removal paths, and T010's saver writes every change they cause. T003's widened
change test carries a move with no resize. What is new is the "Not restored" row (research R13).

- [X] T016 [US2] In `apps/scoring-form/src/lib/measurements.ts`, add the not-restored row ([data-model.md § Row state machine](data-model.md#row-state-machine)). Depends on T005, T010:
  - add `Failed = 'failed'` to `RowStatus`, with a comment saying it is a restored row whose ellipse the viewer could not put back;
  - add `MeasurementRestoreFailed = 'measurementRestoreFailed'` to `MeasurementActionType`, action `{ rowId }`: only when that row exists and is `RowStatus.Done`, set `status: RowStatus.Failed` and remove `ellipse`, keeping `value`; otherwise return the state unchanged. Comment why the geometry goes: a further reload must not try the same failing ellipse again;
  - `Activate` is now allowed from `RowStatus.Pending` **or** `RowStatus.Failed`, and the activated row also loses its `value`, so a not-restored row starts over. Other "Drawing…" rows still return to `Pending`. Update the same condition in the hook's `activate` callback;
  - in `useMeasurements`, add `BridgeEvent.MeasurementRestoreFailed` to the shared case with `MeasurementUpdated` and `MeasurementRemoved`: the same `Done`-row check and the same `warn` with `DroppedBecause.UnknownRow` or `DroppedBecause.NotDone`, then dispatch the new action. The existing transition log already records `done` → `failed` at `info`;
  - confirm and change nothing: `computeAreaTotals` counts only `Done` rows with a value, so a `Failed` row is left out; T009's loader accepts any known `RowStatus`; T013 sends only rows with an `ellipse`, which a `Failed` row no longer has
- [X] T017 [P] [US2] In `apps/scoring-form/src/components/MeasurementForm.tsx`, show the not-restored row exactly as in [contracts/scoring-app-ui.md § A row that could not be restored](contracts/scoring-app-ui.md#a-row-that-could-not-be-restored). Depends on T016's `RowStatus.Failed`:
  - add `[RowStatus.Failed]: 'Not restored'` to `STATUS_TEXT` (its `Record<RowStatus, string>` type makes this a compile error until it is there);
  - render **Activate** for a `Failed` row exactly as for a `Pending` one — same button, same `disabled={!viewerReady}`;
  - the saved value already renders for any row that has one, and "No area" stays for a `Done` row without a value; change neither
- [X] T018 [US2] Run `npm run typecheck && npm run lint` in `apps/scoring-form`, then [quickstart.md](quickstart.md) scenarios 3, 4, 5, 6 and 20. Record the **verify** outcomes for R4 (a move with no resize is reported and saved) and R13 (a wrong image fails in OHIF's mapping, the row is marked "Not restored", and it can be drawn again) in [research.md](research.md). Commit T016–T017 in the parent repo, staged explicitly. If an edit, a deletion or a failure report reaches the wrong row, fix it in `apps/viewer/extensions/bridge/src/watchMeasurements.ts`, record the finding in research R6 or R13, and commit and push the fork and the gitlink bump as in T015

**Checkpoint**: Restored work behaves like work made in this session, and a restore that fails for one ellipse is visible and recoverable.

---

## Phase 5: User Story 3 - Each study keeps its own work (Priority: P3)

**Goal**: Opening another study shows its own (empty) form and none of the first study's ellipses; returning to the first brings its work back.

**Independent Test**: quickstart scenarios 10, 11, 17, 19.

### Implementation for User Story 3

No new code: T009's key is per study, and T011's study check is what stops a restore meant for one
study reaching another.

- [X] T019 [US3] Run [quickstart.md](quickstart.md) scenarios 10, 11, 17 and 19. Scenario 17 posts a `RESTORE_MEASUREMENTS` naming another study, one with 200 measurements, and one with a malformed ellipse: each must draw nothing and log one `warn` in the viewer. Fix what fails in the module responsible, then commit and push as in T015

**Checkpoint**: All three stories work.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: The documentation and gates that span the stories

- [X] T020 Update `ARCHITECTURE.md` (FR-016, SC-009), keeping `messages.ts` as the stated source of truth:
  - **Flow**: add a restore diagram — page reloads → rows read from the tab's store → `VIEWER_READY` → `RESTORE_MEASUREMENTS` → ellipses redrawn and relinked → `MEASUREMENT_UPDATED` with the recomputed area; and, for one that cannot be put back, `MEASUREMENT_RESTORE_FAILED` → row "Not restored";
  - **Viewer → host table**: add `ellipse` to `MEASUREMENT_ADDED` and `MEASUREMENT_UPDATED`, change when `MEASUREMENT_UPDATED` is sent to "the area, the unit or the shape changed", and add `MEASUREMENT_RESTORE_FAILED`;
  - **Host → viewer table**: add `RESTORE_MEASUREMENTS`, its payload and its study check;
  - **Why every message carries a version**: add that the new field, the new command and the new event stayed on `V1`, and why (research R12);
  - **Receiver rules**: the host's ellipse check with its limits, and the `Done`-row rule for `MEASUREMENT_RESTORE_FAILED`; the viewer's per-command branch, the 100-entry cap and the study check;
  - **Where the state lives**: replace "Nothing is saved: reloading the page starts with no rows" with the store — `localStorage`, one key per study, what is in it, its version, that it lasts until deleted, that it is written at most once a second plus on the way out, and that the viewer still stores nothing;
  - **Key decisions**: the host is the only store and why a second store in the viewer was rejected (R1); `localStorage`, as the product owner chose for a test assignment; the geometry on the wire instead (R2, R3); the area recomputed rather than restored (R8); OHIF's own `addRawMeasurement` as the restore path (R5); the one-second throttle with a flush, and the every-change rule it replaced (R10); "Not restored" rather than a stuck or silently removed row (R13);
  - **Left out on purpose**: remove the "Persistence" item; add that there is no control to clear a study's work and none to carry it to another tab, device or user;
  - **Known limitations**: replace "after a viewer reload, finished rows keep their values but can no longer be edited" with the narrower ones this feature leaves — tabs on one study don't sync and the last save wins; another browser or device starts empty; the work has no age limit; a crash can lose up to the last second; a finished measurement whose geometry the viewer cannot read never reaches the form (the row stays "Drawing…", with Cancel); saved work that cannot be read, or cannot be written, is only visible in the console
- [X] T021 Comment and enum audit over everything this feature touched (`git diff main` in the parent repo, and `git diff f2ee4fcef6` in `apps/viewer`): remove comments that restate the code, and confirm no domain value is repeated as a string literal (the command and event names, `RowStatus.Failed`, the new action type, `SavedStateVersion`, the rejection reasons, the OHIF source name and version)
- [X] T022 Run the whole [quickstart.md](quickstart.md), scenarios 1–22 in order, from a fresh tab. Then the delivery gates: in `apps/scoring-form`, `npm run typecheck`, `npm run lint`, `npm run build` and `npm audit --omit=dev` (no high or critical); in the fork, `node_modules/.bin/tsc --noEmit --emitDeclarationOnly false -p tsconfig.json` in `apps/viewer` (the fork's `tsconfig.json` sets declaration-only emit, which `--noEmit` alone rejects with TS5053), looking only at errors under `extensions/bridge/`
- [X] T023 Final pin: the fork branch is pushed, `git submodule status` shows the pushed `005-restore-state-on-reload` commit, and the parent repo's gitlink points at it. Commit T020–T021's changes in the parent repo with small, imperative messages

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup. Blocks all stories.
- **US1 (Phase 3)**: after Foundational. The MVP.
- **US2 (Phase 4)**: after US1 — it checks US1's links and saves with several rows, and its
  "Not restored" row answers the event T012 sends.
- **US3 (Phase 5)**: after US1. Independent of US2.
- **Polish (Phase 6)**: after the stories you ship.

### Within a phase

- Phase 2: T002 (contract) before everything else. Fork chain T002 → T003; host chain T004 → T005
  and T004 → T006, which touch different files and can run alongside each other.
- Phase 3: T009 → T010 → T013 on the host; fork chain T011 → T012. The two sides meet at T014.
- Phase 4: T016 → T017 (T017 needs only T016's `RowStatus.Failed`, and touches another file).
- Each verification task needs both sides built and the viewer running.

### Parallel Opportunities

- Phase 2: the fork chain (T002 → T003) and the host work (T004 → T005, T006) are independent
  until T007.
- Phase 3: the store (T009 → T010 → T013) and the viewer's restore (T011 → T012) are independent
  until T014.

### Parallel Example: Phase 2

```text
Fork:  T002 → T003
Host:  T004 → T005
            ↘ T006
Then:  T007 → T008
```

### Parallel Example: User Story 1

```text
Host:  T009 → T010 → T013 ─┐
Fork:  T011 → T012 ────────┴→ T014 → T015
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1, then Phase 2 (the geometry on the wire, validated on arrival, kept on the row).
2. Phase 3 (US1), then **stop and validate** with quickstart scenarios 1, 2, 7, 8, 9, 12–16, 18,
   21 and 22. The **verify** items — the restore path and its render (R5), the area arriving by
   recomputation (R8), and the save throttle with its flush (R10) — are the risky part, so this is
   where surprises show up.

### Incremental delivery

1. US1 → a reload brings the form and the ellipses back (demo).
2. US2 → restored measurements edit, delete and re-save like any other; one that cannot be put
   back is "Not restored" and can be drawn again.
3. US3 → each study keeps its own work, and a misaddressed restore draws nothing.
4. Polish → `ARCHITECTURE.md`, gates, final pin.

Each story leaves the branch runnable and demonstrable.

## Notes

- **No test tasks** under constitution v3.0.0.
- Limits from the contracts are copied into the tasks that implement them (`referencedImageId`
  "at most 512 characters", `FrameOfReferenceUID` "at most 64 characters", vectors of "exactly
  three finite numbers", "exactly four" points, "at most 100 entries", `unit` "at most 16
  characters", `area` "a finite number ≥ 0", saving "at most once a second"), so they are not left
  to the implementer.
- **Revised 2026-09-21**, after `/speckit-analyze`, at the product owner's request: a row whose
  ellipse cannot be put back becomes "Not restored" (T002, T005, T012, T016–T018, T020) instead of
  staying a stuck "Done" row, and saving is throttled to once a second with a flush (T009, T010,
  T014) instead of writing on every change. The same pass folded in analyze findings C1 (scenario
  16 in T014), C2 (scenario 20), I1 (the missing-geometry rule in the contract and T020), I2 (T013's
  dependencies) and Q1 (no write on opening a study).
- The store is the first thing this project writes outside memory. Principle II's justification
  is in [plan.md § Constitution Check](plan.md#constitution-check); T009 and T019 are where it is
  kept true — the stored value never grows a field the feature does not need, and nothing about it
  is logged.
- Fork pushes are outward-facing: T008 and T015 push a branch to `mkozak0108/Viewers`, and T018
  and T019 do only if they need a fix in the bridge. Ask the user before the first push (T008).
- **Revised 2026-09-21**, after implementation: the product owner switched the store from
  `sessionStorage` to `localStorage` — the work is kept until deleted and shared by every tab.
- README is unchanged: no run step changes, and decisions live in `ARCHITECTURE.md`.

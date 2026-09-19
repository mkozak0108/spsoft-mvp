---

description: "Task list for 004 Live Measurement Update"
---

# Tasks: Live Measurement Update

**Input**: Design documents from `specs/004-live-measurement-update/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: None. The constitution (v3.0.0, Development Workflow & Quality Gates) pauses all
automated testing project-wide, so this file has no test tasks. Each story ends with a manual
check against [quickstart.md](quickstart.md), plus `typecheck` and `lint`.

**Organization**: Tasks are grouped by user story. US1 builds the link between an ellipse and its
row and the live area; US2 needs no new code (the link already confines edits to their row), only
its own manual check; US3 adds deletion. All three touch the same two modules, so they run in
order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Two apps and one contract file, from the repo root:

- **Scoring app** (npm): `apps/scoring-form/`. Run: `cd apps/scoring-form && npm run typecheck && npm run lint`.
- **Viewer bridge** (OHIF fork, git submodule, pnpm): `apps/viewer/extensions/bridge/src/`. All
  viewer work is committed **inside the submodule** on the fork branch
  `004-live-measurement-update` (remote `mkozak0108/Viewers`), created in T001. Nothing outside
  `extensions/bridge/` changes in the fork. The user merges the fork PR later; the parent repo
  pins the pushed branch.
- **Message contract**: `apps/viewer/extensions/bridge/src/messages.ts` is the only copy. No
  imports; the bridge imports it as `./messages`, the scoring app as `@bridge-contract`, and both
  build messages with `buildEvent` / `buildCommand` (`./buildMessages`, `@bridge-builders`). Both
  apps reference its enums and never the string values (constitution, Enums).
- While the submodule is ahead of the committed gitlink, stage parent-repo files explicitly and
  never use `git commit -a` or `git add -A`.

Screen wording is fixed by [contracts/scoring-app-ui.md](contracts/scoring-app-ui.md); copy it
exactly. Comments explain *why*, never *what* (constitution, Comments). Areas, units and payloads
are never logged.

---

## Phase 1: Setup

**Purpose**: The branches this feature's work goes on

- [X] T001 Create the branches. Fork: `git -C apps/viewer checkout -b 004-live-measurement-update` from the commit the parent repo pins today (`3051b37fd0`, tip of the pushed fork branch `003-share-bridge-guards`; check with `git submodule status`). Parent repo: `git checkout -b 004-live-measurement-update-impl` from `main`. Do not push yet

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `MEASUREMENT_UPDATED` exists in the contract and the form accepts it safely. No story
can start until the contract compiles in both apps.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 (fork) In `apps/viewer/extensions/bridge/src/messages.ts`, give `MEASUREMENT_UPDATED` its payload, exactly as in [contracts/bridge-messages.md § New enum](contracts/bridge-messages.md#new-enum). Keep the file free of imports:
  - add `export enum MeasurementChange { AreaChanged = 'areaChanged', AreaUnavailable = 'areaUnavailable', Removed = 'removed' }`;
  - add `type MeasurementUpdate = { change: MeasurementChange.AreaChanged; area: number; unit: string } | { change: MeasurementChange.AreaUnavailable } | { change: MeasurementChange.Removed }`;
  - add `[BridgeEvent.MeasurementUpdated]: ForStudy<{ rowId: string } & MeasurementUpdate>` to `EventPayloads`, so it joins `BridgeEventMessage`;
  - remove the "reserved for the starred task 5.1" comment on `BridgeEvent.MeasurementUpdated` and the "MEASUREMENT_UPDATED is left out on purpose" sentence above `EventPayloads`;
  - in the header comment, point to `specs/004-live-measurement-update/contracts/bridge-messages.md` next to 003's, and add in one line why deletions travel in `MEASUREMENT_UPDATED` (the event names are fixed and none means "removed"; `change` tells them apart)
- [X] T003 In `apps/scoring-form/src/lib/bridge.ts`, accept `MEASUREMENT_UPDATED` in `isBridgeEventMessage` per [contracts/bridge-messages.md § Receiver rules (host), additions](contracts/bridge-messages.md#receiver-rules-host-additions). Depends on T002:
  - extract a helper `hasAreaAndUnit(payload)` holding the existing `MEASUREMENT_ADDED` checks, "`area` a finite number ≥ 0; `unit` a non-empty string of at most 16 characters" (`MAX_UNIT_LENGTH`), and use it for both messages (two call sites);
  - add `const MEASUREMENT_CHANGES: readonly unknown[] = Object.values(MeasurementChange)`, like `FAILURE_REASONS`;
  - the new `case BridgeEvent.MeasurementUpdated` requires `rowId` a non-empty string and `change` in `MEASUREMENT_CHANGES`, and for `MeasurementChange.AreaChanged` also `hasAreaAndUnit(payload)`. `AreaUnavailable` and `Removed` need nothing more; extra fields are ignored;
  - origin, source, version and study checks in `subscribeToViewer` stay as they are
- [X] T004 Run `npm run typecheck && npm run lint` in `apps/scoring-form`; both must pass (the scoring app compiles the new `messages.ts` through the alias, and `useMeasurements` still ignores events it does not handle). Fix errors under `apps/scoring-form/src/` this phase caused
- [X] T005 Commit T002 inside `apps/viewer` on `004-live-measurement-update` with a small imperative message. **Ask the user before pushing** the branch to `origin`, then push it, and commit in the parent repo the gitlink bump together with `apps/scoring-form/src/lib/bridge.ts`, staged explicitly. The scoring app's `typecheck` in that commit is the compatibility check

**Checkpoint**: The contract has `MEASUREMENT_UPDATED` in both apps; nothing sends it yet, and nothing user-visible has changed.

---

## Phase 3: User Story 1 - Resize a finished ellipse and watch its row follow (Priority: P1) 🎯 MVP

**Goal**: Dragging a handle of a finished ellipse changes its row's value and the total while the drag is in progress, ends on the final area, and shows "No area" while the ellipse is partly off the image.

**Independent Test**: quickstart scenarios 1–5, 16 and 18.

### Implementation for User Story 1

- [X] T006 [US1] (fork) In `apps/viewer/extensions/bridge/src/watchMeasurements.ts`, link each reported ellipse to its row ([data-model.md § Viewer bridge state](data-model.md#viewer-bridge-state-viewer), research R3). Depends on T002:
  - add `uid: string` to the local measurement event type (OHIF's `measurement.uid` is the annotation's uid in ADDED, UPDATED and REMOVED alike), and a type `Link = { rowId: string; last: { area: number; unit: string } | undefined }`, where `undefined` means the area is unavailable;
  - keep `const links = new Map<string, Link>()` next to `pendingRowId`, from `watchMeasurements` start to its stop function, which also calls `links.clear()`;
  - in the `MEASUREMENT_ADDED` handler, right after posting, `links.set(measurement.uid, { rowId: <the pending row id>, last: result })`, read before `pendingRowId` is cleared;
  - extract the "read `STUDY_UIDS_PARAM` from `window.location.search`, `log.error` and return `undefined` when missing" code into a helper, since T007 and T014 post too (≥ 2 call sites)
- [X] T007 [US1] (fork) In the same file, subscribe to `measurementService.EVENTS.MEASUREMENT_UPDATED` (research R1, R2). Depends on T006:
  - look up `links.get(measurement.uid)`; with no link, return. Add a comment saying why: OHIF fires this event from mouse-down and throughout the first drawing, and for ellipses drawn from the viewer's own toolbar, none of which belong to a row (FR-008);
  - `const result = firstArea(measurement.data)`. If it equals `link.last` (both `undefined`, or both defined with the same `area` and `unit`), return. Comment why: most of these events repeat the previous area (stale handle moves, selection, lock, visibility), and the message means "it changed" (research R2);
  - otherwise post with `buildEvent(BridgeEvent.MeasurementUpdated, …)` through `postToHost`: `{ StudyInstanceUID, rowId: link.rowId, change: MeasurementChange.AreaChanged, area, unit }` when `result` is defined, else `{ StudyInstanceUID, rowId: link.rowId, change: MeasurementChange.AreaUnavailable }`; then `link.last = result`;
  - no throttle (cornerstone already limits fresh areas to about every 100 ms, research R1) and no log per update; the stop function also unsubscribes
- [X] T008 [P] [US1] In `apps/scoring-form/src/lib/measurements.ts`, extend the reducer for a finished row's value ([data-model.md § Row state machine](data-model.md#row-state-machine)). Depends on T002:
  - add `MeasurementAreaChanged = 'measurementAreaChanged'` and `MeasurementAreaUnavailable = 'measurementAreaUnavailable'` to `MeasurementActionType`, with actions `{ rowId, area, unit }` and `{ rowId }`;
  - both apply only when a row with that `id` exists and is `RowStatus.Done`; otherwise return the state unchanged;
  - area changed: `value = { area: roundToOneDecimal(area), unit }`, but **if that equals the current value (same rounded area and same unit), return the state unchanged**, so React does not re-render (research R2);
  - area unavailable: remove `value`, keeping status `Done`; if the row already has no value, return the state unchanged;
  - `computeAreaTotals` needs no change: it already counts only `Done` rows with a `value`. Confirm, and add nothing
- [X] T009 [US1] In `useMeasurements` (same file), handle `BridgeEvent.MeasurementUpdated`. Depends on T003, T008:
  - turn `onMessage` into a `switch (message.event)`: `ViewerReady` and `MeasurementAdded` as today, plus `MeasurementUpdated`;
  - for `MeasurementUpdated`: if the row named by `payload.rowId` is missing or not `Done`, drop it with `logger.warn('ignored a measurement update for a row that is not done', { reason })`, where `reason` is `DroppedBecause.UnknownRow` or a new `DroppedBecause.NotDone = 'notDone'`, and never the payload (FR-011). Otherwise `switch (payload.change)`: `AreaChanged` → dispatch the area-changed action; `AreaUnavailable` → dispatch the area-unavailable action; `Removed` → leave for T016 (ignore it for now, no log);
  - area changes are not logged: they are not status transitions, and at about ten a second they would bury the useful lines (plan, Principle III)
- [X] T010 [P] [US1] In `apps/scoring-form/src/components/MeasurementForm.tsx`, show the text **No area** in place of the value for a `Done` row that has no `value`, exactly as in [contracts/scoring-app-ui.md § A finished row follows its ellipse](contracts/scoring-app-ui.md#a-finished-row-follows-its-ellipse). A `Done` row with a value is unchanged (`` `${area.toFixed(1)} ${unit}` ``); the total needs no change. Depends on T008
- [X] T011 [US1] Run `npm run typecheck && npm run lint` in `apps/scoring-form`, then start both apps as in [quickstart.md § Setup](quickstart.md#setup) and run scenarios 1–5, 16 (a ten-second drag) and 18 (rejected and accepted updates from the console). Record the **verify** outcomes for R1 (the value moves during the drag), R3 (the row ends on the viewer's area after a quick release) and R7 (a handle can be dragged on Pan) as a short "Verified 2026-…: …" line under each item in [research.md](research.md). Fix what fails in the module responsible
- [X] T012 [US1] Commit the fork changes (T006, T007) in `apps/viewer`, push `004-live-measurement-update`, and commit in the parent repo the gitlink bump together with `apps/scoring-form/src/lib/measurements.ts` and `apps/scoring-form/src/components/MeasurementForm.tsx`, staged explicitly

**Checkpoint**: A finished row follows its ellipse live; the MVP of the starred task is demonstrable.

---

## Phase 4: User Story 2 - Edits land in the right row, and only there (Priority: P2)

**Goal**: With several rows, an edit changes only its own row; a "Drawing…" row is untouched and still filled by the next new ellipse; ellipses that belong to no row change nothing.

**Independent Test**: quickstart scenarios 6–9.

### Implementation for User Story 2

No new code: T006's links (only ellipses reported with `MEASUREMENT_ADDED` are linked) and T008's `Done`-only rule already give this behaviour (research R3, R7).

- [X] T013 [US2] Run [quickstart.md](quickstart.md) scenarios 6–9. Record the R7 outcome for scenario 7 (with the Ellipse tool active for another row, grabbing an existing handle edits that ellipse) in [research.md](research.md). If scenario 7 or 9 fails because an edit or the first drawing reaches a row it should not, fix it in `apps/viewer/extensions/bridge/src/watchMeasurements.ts` (for example, ignore a `MEASUREMENT_ADDED` whose `uid` is already in `links`), record the finding in research R3, and commit and push the fork and the gitlink bump as in T012

**Checkpoint**: US1 and US2 both hold with several rows.

---

## Phase 5: User Story 3 - Delete a measurement from the viewer (Priority: P3)

**Goal**: Deleting a linked ellipse in the viewer, singly or in bulk, removes its row and recalculates the total; the other rows keep their names.

**Independent Test**: quickstart scenarios 10–15 and 17.

### Implementation for User Story 3

- [X] T014 [US3] (fork) In `apps/viewer/extensions/bridge/src/watchMeasurements.ts`, report deletions (research R5). Depends on T006:
  - add a helper `reportRemoved(uid: string)`: if `links` has `uid`, post `buildEvent(BridgeEvent.MeasurementUpdated, { StudyInstanceUID, rowId, change: MeasurementChange.Removed })` through `postToHost` and `links.delete(uid)`; otherwise do nothing;
  - subscribe to `measurementService.EVENTS.MEASUREMENT_REMOVED`. Its payload is `{ source, measurement }` where **`measurement` is the uid string, not an object**; call `reportRemoved` only when it is a string;
  - subscribe to `measurementService.EVENTS.MEASUREMENTS_CLEARED`. Its payload is `{ measurements: Measurement[] }`; if it is an array, call `reportRemoved(m.uid)` for each entry with a string `uid`. Comment why both events: bulk deletes ("Delete all", a group's Delete) fire only `MEASUREMENTS_CLEARED`, with no per-item `MEASUREMENT_REMOVED`;
  - comment once why OHIF's own clear at mode enter and exit never reaches the form: on exit the extensions' `onModeExit` (which unsubscribes) runs before the services', and on enter there are no links yet (research R5);
  - the stop function also unsubscribes both
- [X] T015 [P] [US3] In `apps/scoring-form/src/lib/measurements.ts`, add fixed row numbers and removal (research R6, [data-model.md](data-model.md#measurement-row-scoring-app)). Depends on T008:
  - add `number: number` to `MeasurementRow`; `AddRow` sets `number: state.nextRowNumber` along with `id: \`row-${state.nextRowNumber}\``. Numbers are never reused;
  - add `MeasurementRemoved = 'measurementRemoved'` to `MeasurementActionType`, action `{ rowId }`: only when that row exists and is `RowStatus.Done`, remove it from `rows`; otherwise return the state unchanged. A `Drawing` row is never touched (FR-010)
- [X] T016 [US3] In `useMeasurements` (same file). Depends on T009, T015:
  - handle `MeasurementChange.Removed` in the `MeasurementUpdated` switch from T009 by dispatching the removed action. The `Done`-row check and its `warn` from T009 already cover it;
  - in the row-transition logging effect, also log each row that is in the previous rows but not the current ones with `logger.info('measurement row removed', { rowId })`, and nothing else ([contracts/scoring-app-ui.md § Text and logs](contracts/scoring-app-ui.md#text-and-logs))
- [X] T017 [US3] In `apps/scoring-form/src/components/MeasurementForm.tsx`, label each row **Measurement N** from `row.number` instead of its list position, and drop the position-based `number` prop ([contracts/scoring-app-ui.md § Row names are fixed at creation](contracts/scoring-app-ui.md#row-names-are-fixed-at-creation)). Depends on T015
- [X] T018 [US3] Run `npm run typecheck && npm run lint` in `apps/scoring-form`, then [quickstart.md](quickstart.md) scenarios 10–15 and 17. Record the R5 outcomes (a bulk delete removes rows; a viewer-frame reload removes none) in [research.md](research.md). Fix what fails in the module responsible
- [X] T019 [US3] Commit the fork change (T014) in `apps/viewer`, push, and commit in the parent repo the gitlink bump together with T015–T017's files, staged explicitly

**Checkpoint**: All three stories work.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: The documentation and gates that span the stories

- [X] T020 Update `ARCHITECTURE.md` (FR-013, SC-009), keeping `messages.ts` as the stated source of truth:
  - **Flow**: add a second diagram, or extend the first, for a finished row: handle dragged → `MEASUREMENT_UPDATED { change: AreaChanged }` → row value and total; off the image → `AreaUnavailable` → "No area"; deleted → `Removed` → row removed;
  - **Viewer → host table**: replace the "reserved name" paragraph with `MEASUREMENT_UPDATED`'s three payloads and when each is sent, from [contracts/bridge-messages.md](contracts/bridge-messages.md#new-event);
  - **Why every message carries a version**: add that `MEASUREMENT_UPDATED` stayed on `V1` and why (research R9);
  - **Receiver rules** (host): the `change` and `AreaChanged` checks, and the `Done`-row rule;
  - **Where the state lives**: the viewer's uid → row links; fixed row numbers;
  - **Key decisions**: deletion inside `MEASUREMENT_UPDATED` with a `change` discriminant, and the alternatives (R5); the annotation uid stays in the viewer (R3); live pace from cornerstone's 100 ms stats throttle, with repeats not sent (R1, R2); "No area" rather than a stale value (R4); rows keep their names (R6);
  - **Left out on purpose**: "Editing or deleting a measurement" becomes removing a row from the form, and editing a value by hand;
  - **Known limitations**: undo of a deletion restores the ellipse but not its row; a deletion while a new ellipse is half drawn makes OHIF finish it, which fills the "Drawing…" row (R10); after a viewer reload, finished rows keep their values but can no longer be edited; the viewer's area text rounds by significant figures, so it can differ from the row's one decimal in the last digit
- [X] T021 Comment and enum audit over everything this feature touched (`git diff main` in the parent repo, and `git diff 3051b37fd0` in `apps/viewer`): remove comments that restate the code, and confirm no domain value is repeated as a string literal (`MeasurementChange` values, action types, drop reasons, event names)
- [X] T022 Run the whole [quickstart.md](quickstart.md), scenarios 1–19 in order, from a fresh page. Then the delivery gates: in `apps/scoring-form`, `npm run typecheck`, `npm run lint`, `npm run build` and `npm audit --omit=dev` (no high or critical); in the fork, `pnpm exec tsc --noEmit -p tsconfig.json` in `apps/viewer`, looking only at errors under `extensions/bridge/`
- [X] T023 Final pin: the fork branch is pushed, `git submodule status` shows the pushed `004-live-measurement-update` commit, and the parent repo's gitlink points at it. Commit T020–T021's changes in the parent repo with small, imperative messages

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup. Blocks all stories.
- **US1 (Phase 3)**: after Foundational. The MVP.
- **US2 (Phase 4)**: after US1 (it checks US1's links with several rows).
- **US3 (Phase 5)**: after US1: it builds on T006's links, T008's reducer cases and T009's switch. Independent of US2.
- **Polish (Phase 6)**: after the stories you ship.

### Within a phase

- T002 (contract) before everything else; T003 after it.
- US1: fork chain T006 → T007 (same file); host chain T008 → T009 (same file), with T010 alongside T009 (different file, needs T008's types only).
- US3: fork T014; host T015 → T016 (same file), with T017 alongside T016.
- Each verification task needs both sides built and the viewer running.

### Parallel Opportunities

- US1: the fork chain (T006 → T007) and the host work (T008 → T009, T010) are independent until T011.
- US3: T014 (fork) and T015 (host) are independent; T016 and T017 touch different files.

### Parallel Example: User Story 1

```text
Fork:  T006 → T007
Host:  T008 → T009
            ↘ T010
Then:  T011 → T012
```

### Parallel Example: User Story 3

```text
Fork:  T014
Host:  T015 → T016
            ↘ T017
Then:  T018 → T019
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1, then Phase 2 (the contract in both apps).
2. Phase 3 (US1), then **stop and validate** with quickstart scenarios 1–5, 16 and 18. The **verify** items
   (live pace, the correction after release, dragging on Pan) are the risky part, so this is
   where surprises show up.

### Incremental delivery

1. US1 → a finished row follows its ellipse live (demo).
2. US2 → confirmed with several rows and a drawing in progress.
3. US3 → deleting an ellipse removes its row; rows keep their names.
4. Polish → `ARCHITECTURE.md`, gates, final pin.

Each story leaves the branch runnable and demonstrable.

## Notes

- **No test tasks** under constitution v3.0.0.
- Limits from the contract are copied into the tasks that implement them (`area` "a finite
  number ≥ 0", `unit` "a non-empty string of at most 16 characters", `change` a known
  `MeasurementChange`), so they are not left to the implementer.
- Fork pushes are outward-facing: T005, T012 and T019 push a branch to `mkozak0108/Viewers`. Ask
  the user before the first push (T005).
- README is unchanged: no run step changes, and decisions live in `ARCHITECTURE.md`.

---

description: "Task list for 003 Add Area Measurements"
---

# Tasks: Add Area Measurements

**Input**: Design documents from `specs/003-add-area-measurements/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: None. The constitution (v3.0.0, Development Workflow & Quality Gates) pauses all
automated testing project-wide, so this file has no test tasks. Each story ends with a manual
check against [quickstart.md](quickstart.md) instead, plus `typecheck` and `lint`.

**Organization**: Tasks are grouped by user story. US2 and US3 extend the reducer and the form
that US1 creates (same modules), so they are built after US1, but each has its own manual check.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Two apps and one contract file, from the repo root:

- **Scoring app** (npm): `apps/scoring-form/`. Run: `cd apps/scoring-form && npm run typecheck && npm run lint`.
- **Viewer bridge** (OHIF fork, git submodule, pnpm): `apps/viewer/extensions/bridge/`. All viewer
  work is committed **inside the submodule** on a new fork branch `003-add-area-measurements`
  (remote `mkozak0108/Viewers`), created in T001. The user merges the fork PR later; the parent
  repo pins the pushed branch.
- **Message contract**: `apps/viewer/extensions/bridge/src/messages.ts` is the only copy. It has
  no imports (two toolchains compile it), the bridge imports it as `./messages`, and the scoring
  app as `@bridge-contract`. Both apps reference its enums and never the string values
  (constitution, Enums).
- While the submodule is ahead of the committed gitlink, stage parent-repo files explicitly and
  never use `git commit -a` or `git add -A`.

Screen wording is fixed by [contracts/scoring-app-ui.md](contracts/scoring-app-ui.md); copy it
exactly, including the `…` (U+2026) in "Drawing…" and "Waiting for the viewer to be ready…".
Comments explain *why*, never *what* (constitution, Comments).

---

## Phase 1: Setup

**Purpose**: The fork branch this feature's viewer work goes on

- [ ] T001 Create the fork branch: `git -C apps/viewer checkout -b 003-add-area-measurements`, from the commit the parent repo pins (`d596bff643`, the tip of the pushed `001-study-scoring-view` branch). Do not push yet

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The v1 contract and the plumbing on both sides that every story relies on. No story
can start until the contract compiles in both apps.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T002 (fork) Rewrite `apps/viewer/extensions/bridge/src/messages.ts` as contract v1, exactly as in [contracts/bridge-messages.md § The enums](contracts/bridge-messages.md#the-enums-shape-in-messagests) and its unions. Keep the file free of imports and keep `STUDY_UIDS_PARAM`:
  - add `BridgeSource.Host = 'spsoft-mvp-host'` and `BridgeMessageType.Command = 'command'`;
  - add `enum BridgeVersion { V1 = 1 }`;
  - `BridgeEvent`: `StudyLoaded = 'STUDY_LOADED'`, `StudyLoadFailed = 'STUDY_LOAD_FAILED'` (renamed from camelCase), `ViewerReady = 'VIEWER_READY'`, `MeasurementAdded = 'MEASUREMENT_ADDED'`, and `MeasurementUpdated = 'MEASUREMENT_UPDATED'` as a **reserved name with no member in any message union**, with a comment saying it is the starred task 5.1's;
  - `enum BridgeCommand { ActivateTool = 'ACTIVATE_TOOL', DeactivateTool = 'DEACTIVATE_TOOL' }` and `enum BridgeTool { EllipticalROI = 'EllipticalROI' }`;
  - `BridgeEventMessage` (viewer → host, `version: BridgeVersion.V1` on every member): `STUDY_LOADED { StudyInstanceUID }`, `STUDY_LOAD_FAILED { StudyInstanceUID, reason }`, `VIEWER_READY { StudyInstanceUID }`, `MEASUREMENT_ADDED { StudyInstanceUID, rowId: string, area: number, unit: string }`;
  - new `BridgeCommandMessage` (host → viewer, `source: BridgeSource.Host`, `type: BridgeMessageType.Command`, `version: BridgeVersion.V1`, field `command`): `ACTIVATE_TOOL { rowId: string, tool: BridgeTool }`, `DEACTIVATE_TOOL { rowId: string }`;
  - update the file's header comment: it now covers both directions and the version's reason in one line, pointing at the contract doc
- [ ] T003 [P] (fork) In `apps/viewer/extensions/bridge/src/watchStudy.ts`, put `version: BridgeVersion.V1` on both existing messages, and after posting `STUDY_LOADED` post `VIEWER_READY { StudyInstanceUID }` from the same first-render signal. Never post it after `STUDY_LOAD_FAILED`. Add a comment saying why it follows `STUDY_LOADED`: tool groups are created after the bridge starts, so the first rendered image is the earliest moment commands work (research R6). Depends on T002
- [ ] T004 [P] In `apps/scoring-form/src/lib/bridge.ts`, extend `isBridgeEventMessage` and `subscribeToViewer` to the v1 receiver rules in [contracts/bridge-messages.md § Receiver rules](contracts/bridge-messages.md#receiver-rules), host side. Depends on T002:
  - add `Version = 'version'` to the `IgnoredBecause` enum; the check order is origin, source, **version**, shape, study id;
  - log levels ([contract § Receiver rules](contracts/bridge-messages.md#receiver-rules)): a wrong origin or source stays at `logger.debug`, since that is other pages' traffic and production silences `debug`. From the right origin and source, a `version` that is not exactly `BridgeVersion.V1` is dropped and logged with `logger.warn` (context `{ reason: IgnoredBecause.Version }` only, never the data or the received number), before the shape check, and a shape failure now also logs at `logger.warn` with `{ reason: IgnoredBecause.Shape }` (it was `debug` in 001). The version is read from `event.data` only after `isRecord(event.data)`;
  - the guard accepts `STUDY_LOADED`, `STUDY_LOAD_FAILED` (reason known), `VIEWER_READY`, and `MEASUREMENT_ADDED`, requiring: `StudyInstanceUID` a non-empty string; `rowId` a non-empty string; `area` a finite number ≥ 0; `unit` a non-empty string of at most 16 characters. Extra fields are ignored. `MEASUREMENT_UPDATED` and any unknown event are rejected (the reserved name has no handler);
  - `payload.StudyInstanceUID` must equal the requested one for every accepted event (existing rule)
- [ ] T005 In `apps/scoring-form/src/lib/bridge.ts`, add `postToViewer({ origin, getSource, message }: …)` for a `BridgeCommandMessage`. It posts to `getSource()` with `targetOrigin` set to `origin` and never `'*'`. If `getSource()` is `null`, it logs `logger.warn` and returns without throwing. Never log the message payload. Same file as T004, so after it
- [ ] T006 [P] In `apps/scoring-form/src/lib/viewerStatus.ts`, narrow `onMessage` to the two study events with a `switch` on `message.event`, so `VIEWER_READY` and `MEASUREMENT_ADDED` are ignored there (they belong to measurements) and the ternary that assumes the only other event is a failure is gone. Depends on T002
- [ ] T007 Run `npm run typecheck && npm run lint` in `apps/scoring-form`; both must pass (the scoring app's `tsc` compiles the new `messages.ts` through the alias). Fix the errors under `apps/scoring-form/src/` this phase caused
- [ ] T008 Commit the fork changes (T002, T003) inside `apps/viewer` on `003-add-area-measurements` with a small imperative message, **ask the user before pushing** the branch to `origin`, then push it, and commit in the parent repo the gitlink bump together with T004–T006's files, staged explicitly. The scoring app's `typecheck` in that commit is the compatibility check (001 R11)

**Checkpoint**: The versioned contract compiles in both apps; nothing user-visible has changed yet.

---

## Phase 3: User Story 1 - Measure an area and see it in the form (Priority: P1) 🎯 MVP

**Goal**: With a study on screen: add a row, activate it, draw one ellipse, and see its area in that row as "Done", with the viewer back on Pan.

**Independent Test**: quickstart scenarios 1–5, 9, 10, 12 and 13, with a single row.

### Implementation for User Story 1

- [ ] T009 [P] [US1] (fork) In `apps/viewer/platform/app/public/config/default.js`, add `measurementTrackingMode: 'none'` next to the other app-config keys, with a comment saying why: OHIF's default `'standard'` opens a "track measurements?" modal on the first measurement, which would stop the flow (research R5). This is the only fork change outside `extensions/bridge/`
- [ ] T010 [US1] (fork) Create `apps/viewer/extensions/bridge/src/watchMeasurements.ts` exporting `watchMeasurements({ servicesManager, commandsManager, extensionManager }): () => void`, part 1, command intake. Depends on T002:
  - a `window` `message` listener that accepts a command only under [the viewer receiver rules](contracts/bridge-messages.md#receiver-rules): `event.origin` is a `HostOrigin` value (import the enum from `./postToHost`), `event.source === window.parent`, `version === BridgeVersion.V1`, and the data passes a local guard `isBridgeCommandMessage`: `source` is `BridgeSource.Host`, `type` is `BridgeMessageType.Command`, `command` is a known `BridgeCommand`, `rowId` is a non-empty string **of at most 64 characters**, and for `ACTIVATE_TOOL` `tool` is a known `BridgeTool`. Log levels as in the contract: a wrong origin or source is ignored with `log.debug`; a wrong version or a failed guard, from the right origin and source, is ignored with `log.warn`. Neither logs the data;
  - OHIF's own identifiers are named once, as enums at the top of the file (they are repeated in T010, T011 and T022, and the constitution's Enums rule applies): `enum OhifCommand { SetToolActiveToolbar = 'setToolActiveToolbar' }`, `enum OhifCommandContext { Cornerstone = 'CORNERSTONE' }` and `enum OhifModule { CornerstoneTools = '@ohif/extension-cornerstone.utilityModule.tools' }`, with a comment saying they are OHIF's identifiers and must match the fork's `commandsModule.ts` and module ids;
  - keeps `pendingRowId: string | undefined`;
  - `ACTIVATE_TOOL` sets `pendingRowId` (replacing any earlier one) and enables the tool with `commandsManager.runCommand(OhifCommand.SetToolActiveToolbar, { toolName }, OhifCommandContext.Cornerstone)`, where `toolName` comes from `extensionManager.getModuleEntry(OhifModule.CornerstoneTools).exports.toolNames` through an exhaustive `Record<BridgeTool, string>` (`BridgeTool.EllipticalROI` → `toolNames.EllipticalROI`), never a string literal. If the module entry or tool group is missing, `log.warn` and leave `pendingRowId` set (the host's Cancel is the recovery; research R7);
  - the returned function removes the listener and clears `pendingRowId`. Handle `DEACTIVATE_TOOL` in T022, not here
- [ ] T011 [US1] (fork) In the same file, part 2, detecting the finished ellipse (research R4). Subscribe to `servicesManager.services.measurementService` `EVENTS.MEASUREMENT_ADDED`. When `pendingRowId` is set and `measurement.toolName` equals `toolNames.EllipticalROI`:
  - read `area` and `areaUnit` from the first value of `measurement.data` whose `area` is a finite number, using `areaUnit` as `unit`;
  - if there is none, `log.error` (no values) and post nothing: the row stays "Drawing…" (visible, cancellable);
  - otherwise post `MEASUREMENT_ADDED { StudyInstanceUID, rowId, area, unit }` with `source: BridgeSource.Viewer`, `type: BridgeMessageType.Event`, `version: BridgeVersion.V1` through `postToHost`, where `StudyInstanceUID` is the page's `STUDY_UIDS_PARAM` value (as `watchStudy` reads it). Then clear `pendingRowId` and activate `toolNames.Pan` with the same command through the `OhifCommand` / `OhifCommandContext` enums from T010;
  - with no `pendingRowId` the event is ignored (a drawing from the viewer's own toolbar);
  - the returned stop function also unsubscribes. Add a comment on why `MEASUREMENT_ADDED` and not cornerstone's own annotation events: the measurement service is where the stats are mapped
- [ ] T012 [US1] (fork) In `apps/viewer/extensions/bridge/src/index.ts`, start `watchMeasurements({ servicesManager, commandsManager, extensionManager })` in `onModeEnter` and stop it in `onModeExit`, next to `watchStudy`, without changing `watchStudy`'s behaviour. Widen the `onModeEnter` parameter type to include `servicesManager` and `commandsManager`. Depends on T010, T011
- [ ] T013 [P] [US1] Create `apps/scoring-form/src/lib/measurements.ts` with the pure reducer of [data-model.md](data-model.md#measurement-state-scoring-app), part 1. Depends on T002:
  - `enum RowStatus { Pending = 'pending', Drawing = 'drawing', Done = 'done' }` and an action-type enum;
  - state `{ rows, viewerReady: false, nextRowNumber: 1 }`; row `{ id: 'row-<n>', status, value?: { area: number; unit: string } }`, ids from the counter in the state (research R2, R8);
  - actions and rules: **add row** appends a `Pending` row; **activate `id`** only when that row is `Pending` and `viewerReady`, → `Drawing`; **viewer ready** sets `viewerReady` and turns any `Drawing` row back to `Pending` (FR-008); **measurement added `{ rowId, area, unit }`** only when a row with that `id` exists and is `Drawing`, → `Done` with `area` rounded to one decimal when stored (research R8). Any action outside its condition returns the state unchanged;
  - no `cancel` action and no demotion of other `Drawing` rows here: those are T023 (US3)
- [ ] T014 [US1] In the same file, add the hook `useMeasurements({ origin, studyInstanceUid, getSource })` returning `{ state, addRow, activate }`. Depends on T004, T005, T013:
  - it calls `subscribeToViewer` (research R9) and dispatches only `VIEWER_READY` and `MEASUREMENT_ADDED`, ignoring the study events;
  - `activate(id)` does nothing unless the row is `Pending` and `viewerReady` (read from a ref of the latest state); otherwise it calls `postToViewer` with `ACTIVATE_TOOL { rowId, tool: BridgeTool.EllipticalROI }` and dispatches. The message carries `source: BridgeSource.Host`, `type: BridgeMessageType.Command`, `version: BridgeVersion.V1`;
  - a `MEASUREMENT_ADDED` naming no row, or a row that is not `Drawing`, is dropped with `logger.warn` (context `{ reason }` only) and does not reach the reducer (FR-010);
  - every row transition is logged with `logger.info` and `{ rowId, from, to }`. Never log areas, units or payloads
- [ ] T015 [P] [US1] Create `apps/scoring-form/src/components/MeasurementForm.tsx`, per [contracts/scoring-app-ui.md](contracts/scoring-app-ui.md), taking the hook's `{ state, addRow, activate }`. Depends on T013:
  - heading "Measurements" and a button **Add measurement**, always enabled;
  - an ordered list, one item per row in creation order, labelled **Measurement N** (N = position + 1), with the status text "Pending" / "Drawing…" / "Done";
  - a `Done` row shows `` `${area.toFixed(1)} ${unit}` `` as text, and no control; a `Pending` row shows a button **Activate**, disabled while `!viewerReady`; a `Drawing` row shows only its status text for now (its Cancel is T025);
  - while `!viewerReady`, a `role="status"` line "Waiting for the viewer to be ready…" so the reason for the disabled button is visible;
  - no total yet (T020). Values and units are rendered as text, never as HTML
- [ ] T016 [US1] Wire the form in. Depends on T014, T015:
  - `apps/scoring-form/src/components/ScoringForm.tsx`: take `children` and render them in the `Loaded` state in place of the "Scoring is not available yet." placeholder; `Loading` and `Failed` are unchanged;
  - `apps/scoring-form/src/components/StudyView.tsx`: call `useMeasurements({ origin, studyInstanceUid, getSource })` and pass `<MeasurementForm … />` as `ScoringForm`'s child;
  - `apps/scoring-form/src/App.tsx` needs no change (the `Unavailable` path passes no children);
  - `apps/scoring-form/src/App.css`: list, row and button styles; status is text, not colour only
- [ ] T017 [US1] Run `npm run typecheck && npm run lint` in `apps/scoring-form`, then start both apps as in [quickstart.md](quickstart.md#setup) (restart the viewer, the config changed) and run scenarios 1–5, 9, 10, 12 and 13. Record the three **verify** outcomes: toolbar highlight follows (R3), the area is present when the event fires (R4), no tracking modal (R5). If a "track measurements?" modal appears, change T009's value to `'simplified'`, update research R5 and the plan's Complexity Tracking, and re-run scenario 4. Fix what fails in the module responsible
- [ ] T018 [US1] Commit the fork changes (T009–T012), push `003-add-area-measurements` to `origin`, and commit in the parent repo the gitlink bump together with T013–T016's files, staged explicitly

**Checkpoint**: One measurement works end to end and is demonstrable.

---

## Phase 4: User Story 2 - Take any number of measurements and see the total (Priority: P1)

**Goal**: Any number of rows, each filled by the ellipse drawn for it whatever the order, and a total of the finished areas that updates by itself.

**Independent Test**: quickstart scenario 6, plus the mixed-unit check.

### Implementation for User Story 2

- [ ] T019 [US2] In `apps/scoring-form/src/lib/measurements.ts`, add `enum AreaTotalKind { None = 'none', Sum = 'sum', MixedUnits = 'mixedUnits' }` and a pure `computeAreaTotal(rows)`, derived on render and never stored ([data-model.md](data-model.md#area-total-derived-never-stored)): **only `Done` rows count**; no `Done` row → `None`; all `Done` rows sharing one `unit` → `Sum` with the summed stored (already one-decimal) values and that unit; different units → `MixedUnits`. Depends on T013
- [ ] T020 [US2] In `apps/scoring-form/src/components/MeasurementForm.tsx`, add the total at the bottom as a `role="status"` region labelled **Total area**: `None` → "Total area: —"; `Sum` → `` `Total area: ${sum.toFixed(1)} ${unit}` ``; `MixedUnits` → "Total area: can't be added up because the units differ" (exact wording from the UI contract). Depends on T019, T015
- [ ] T021 [US2] Run `npm run typecheck && npm run lint` in `apps/scoring-form`, then quickstart scenario 6 (three rows activated out of creation order; the total equals the sum of the displayed values after each one, and each value is in the row it was activated for). Then check the mixed-unit rule as far as the public source allows and record the outcome (or "unverified") in [quickstart.md](quickstart.md#checks-that-need-the-running-viewer-verify). Commit the parent-repo changes (no fork changes in this phase)

**Checkpoint**: US1 and US2 both work; the core scenario of the task is complete.

---

## Phase 5: User Story 3 - Switch or cancel a drawing in progress (Priority: P2)

**Goal**: A doctor can cancel a drawing, or activate another row instead; at most one row is ever "Drawing…".

**Independent Test**: quickstart scenarios 7 and 8.

### Implementation for User Story 3

- [ ] T022 [US3] (fork) In `apps/viewer/extensions/bridge/src/watchMeasurements.ts`, handle `DEACTIVATE_TOOL`: if its `rowId` equals `pendingRowId`, clear it and activate `toolNames.Pan`; otherwise ignore it with `log.debug`, so a late cancel for a row that is no longer pending cannot switch off a newer activation. Add a comment on that reason (research R7). The guard already validates `DEACTIVATE_TOOL`'s `rowId` (T010)
- [ ] T023 [US3] In `apps/scoring-form/src/lib/measurements.ts`, extend the reducer: a **cancel `id`** action, allowed only when that row is `Drawing`, → `Pending`; and in **activate `id`**, any other `Drawing` row → `Pending` in the same transition, so at most one row is ever `Drawing` (FR-005, SC-004). Depends on T013
- [ ] T024 [US3] In `useMeasurements` (same file), add `cancel(id)`: does nothing unless the row is `Drawing`; otherwise `postToViewer` with `DEACTIVATE_TOOL { rowId }` (`source: BridgeSource.Host`, `type: BridgeMessageType.Command`, `version: BridgeVersion.V1`), then dispatch. Activating another row sends only `ACTIVATE_TOOL`: the viewer replaces its pending row (research R8). Log the transition as in T014. Depends on T014, T023
- [ ] T025 [US3] In `apps/scoring-form/src/components/MeasurementForm.tsx`, give a `Drawing` row a button **Cancel** that calls `cancel(id)`. Depends on T024
- [ ] T026 [US3] Run `npm run typecheck && npm run lint` in `apps/scoring-form`, then quickstart scenarios 7 and 8; also confirm no row is ever left "Drawing…" beside the newly activated one. Commit the fork change (T022), push, and commit in the parent repo the gitlink bump with T023–T025's files, staged explicitly

**Checkpoint**: All three stories work.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: The deliverables and gates that span the stories

- [ ] T027 [P] Write `ARCHITECTURE.md` at the repository root (FR-012, SC-007): the two apps and how they meet; the message flow of the "add measurement" scenario (activate → draw → result → Pan); the payload of **every** message in [contracts/bridge-messages.md](contracts/bridge-messages.md) as tables, taking the shapes from `messages.ts`; the receiver rules; **why messages carry a version** (research R1, in plain words); the reserved `MEASUREMENT_UPDATED`. State that `messages.ts` is the source of truth, so the document can't silently disagree with it
- [ ] T028 [P] Update `README.md` (constitution Principle IV): the measurement flow in the app's description and a link to `ARCHITECTURE.md`; key decisions (two-way versioned contract and why, the `measurementTrackingMode: 'none'` line and why, Pan as the return tool, `VIEWER_READY` vs `STUDY_LOADED`); scope cuts and known limitations from [plan.md](plan.md#post-design-re-check) (commands are not acknowledged, and a drawing the viewer cannot start, or that reports no area, is only logged: the row stays "Drawing…" with Cancel, the Principle III deviation in the plan's Complexity Tracking; no persistence, window/level not restored after a measurement, `MEASUREMENT_UPDATED` unimplemented, mixed-unit total possibly unverified); and note that the scoring app's tab and the viewer must both be restarted after this change
- [ ] T029 Comment and enum audit over everything this feature touched (`git diff` in both repos): remove comments that restate the code, and confirm no domain value is repeated as a string literal (statuses, event and command names, tool names, ignore reasons, and OHIF's command, context and module ids, which T010 names once as enums), as there are no tests to exempt
- [ ] T030 Run the whole [quickstart.md](quickstart.md), scenarios 1–13 in order, from a fresh page. Then the delivery gates: in `apps/scoring-form`, `npm run typecheck`, `npm run lint`, `npm run build` and `npm audit --omit=dev` (no high or critical); in the fork, confirm the bridge sources compile: `pnpm exec tsc --noEmit -p tsconfig.json` in `apps/viewer`, looking only at errors under `extensions/bridge/` (the rest of the fork's upstream code is not this feature's concern)
- [ ] T031 Final pin: make sure the fork branch is pushed, `git submodule status` shows the pushed `003-add-area-measurements` commit, and the parent repo's gitlink points at it. Commit the polish changes (T027–T029) with small, imperative messages

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup. Blocks all stories.
- **US1 (Phase 3)**: after Foundational. The MVP.
- **US2 (Phase 4)**: after US1 (edits `measurements.ts` and `MeasurementForm.tsx`).
- **US3 (Phase 5)**: after US1. Independent of US2 in behaviour, but it edits the same files, so run it after US2 to avoid conflicts, or before it if the total is not needed first.
- **Polish (Phase 6)**: after the stories you ship.

### Within a phase

- T002 (contract) before everything else in Phase 2. T004 → T005 (same file).
- US1: fork side T010 → T011 → T012 (same file, then wiring); host side T013 → T014 (same file); T015 needs T013 for its types; T016 needs T014 and T015.
- Verification (T017) needs both sides built and the viewer restarted.

### Parallel Opportunities

- After T002: T003 (fork `watchStudy.ts`), T004 (host `bridge.ts`) and T006 (host `viewerStatus.ts`) touch different files.
- In US1: T009 (config), the fork chain T010–T012, and the host chain T013 → T014 with T015 in parallel with T014, are independent until T016.
- Polish: T027 and T028 are different files.

### Parallel Example: User Story 1

```text
Fork:  T010 → T011 → T012
Host:  T013 → T014 ─┐
       T015 ────────┴→ T016
Also:  T009 (config, any time)
Then:  T017 → T018
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1, then Phase 2 (contract in both apps).
2. Phase 3 (US1), then **stop and validate** with quickstart scenarios 1–5. One measurement end to end is the demonstrable core; the three **verify** items in T017 are the risky part, so this is where surprises show up.

### Incremental delivery

1. US1 → a single working measurement (demo).
2. US2 → any number of rows and the total: the task's core scenario is now complete.
3. US3 → cancel and switch: closes the gap where a doctor activates the wrong row.
4. Polish → `ARCHITECTURE.md`, README, gates.

Each story leaves `main`'s branch runnable and demonstrable.

## Notes

- **No test tasks** by constitution v3.0.0; the reducer and total are pure so tests can be added
  when testing returns, and nothing is arranged around that beyond it.
- Anything the contract says about a field's limits is copied into the task that implements it
  (`rowId` ≤ 64 characters, `unit` ≤ 16 characters, `area` finite and ≥ 0), so it is not left to
  the implementer.
- Fork pushes are outward-facing: T008, T018 and T026 push a branch to `mkozak0108/Viewers`.
  Ask the user before the first push (T008).

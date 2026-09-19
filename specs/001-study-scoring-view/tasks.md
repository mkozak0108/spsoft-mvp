---

description: "Task list for 001 Study Scoring View"
---

# Tasks: Study Scoring View

**Input**: Design documents from `specs/001-study-scoring-view/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Required. Constitution Principle I (test-first, non-negotiable) and its workflow gate
("every `tasks.md` MUST include test tasks for each user story, ordered before that story's
implementation tasks") override the template's "tests are optional" default. Every test task
ends with running the suite and **seeing the new tests fail** for the expected reason before
the matching implementation task starts.

**Organization**: Tasks are grouped by user story. US2 extends the components US1 creates
(same screen, same files), so it is built after US1, but it has its own tests and its own
quickstart scenarios.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2)

## Path Conventions

Two apps and one contract file, from the repo root:

- **Scoring app** (npm, Vitest): `apps/scoring-form/`. Tests sit next to the module they cover.
  Run: `cd apps/scoring-form && npm test`.
- **Viewer bridge** (OHIF fork, git submodule, pnpm, Jest): `apps/viewer/extensions/bridge/`.
  All viewer work is committed **inside the submodule** on the fork's existing branch
  `001-study-scoring-view` (remote `mkozak0108/Viewers`). Run:
  `cd apps/viewer && pnpm --filter @spsoft-mvp/extension-bridge run test:unit:ci`.
- **Message contract**: `apps/viewer/extensions/bridge/src/messages.ts` is the only copy
  (research R11):
  - it is types only and has no imports;
  - the bridge imports it as `./messages`;
  - the scoring app uses only top-level `import type … from '@bridge-contract'`, a
    `tsconfig.app.json` path alias into the submodule;
  - `shared/` is deleted in T007.

Screen wording used in tests is fixed by [contracts/scoring-app-ui.md](contracts/scoring-app-ui.md);
copy it exactly, including the `…` (U+2026) in "Loading study…" and "Waiting for the study to load…".

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Test tooling and configuration for both apps

- [X] T001 Install the scoring app's test dev dependencies: in `apps/scoring-form` run `npm install --save-dev @testing-library/react @testing-library/dom`, committing the updated `apps/scoring-form/package.json` and `apps/scoring-form/package-lock.json`. Add no runtime dependencies, and do not add `@testing-library/jest-dom` or `@testing-library/user-event` (research R10)
- [X] T002 Create `apps/scoring-form/src/test-setup.ts`, which calls `cleanup()` from `@testing-library/react` in `afterEach`. Register it in `apps/scoring-form/vite.config.ts` as `test.setupFiles: ['./src/test-setup.ts']`, keeping `environment: 'jsdom'` (depends on T001)
- [X] T003 [P] Create `apps/scoring-form/.env.example` containing `VITE_VIEWER_URL=http://localhost:3000`, with a comment saying the value is not a secret, that it defaults to `http://localhost:3000` when unset, and that its origin is the only origin bridge messages are accepted from (research R9). In `apps/scoring-form/src/vite-env.d.ts`, replace `readonly VITE_VIEWER_ORIGIN?: string;` with `readonly VITE_VIEWER_URL?: string;`. The root `.gitignore` already ignores `.env` and `.env.*` except `.env.example`, so it needs no change
- [X] T004 [P] In the fork (`apps/viewer`, branch `001-study-scoring-view`), set up the bridge's test infrastructure:
  - copy `apps/viewer/extensions/default/jest.config.js` and `apps/viewer/extensions/default/babel.config.js` verbatim to `apps/viewer/extensions/bridge/jest.config.js` and `apps/viewer/extensions/bridge/babel.config.js`;
  - in `apps/viewer/extensions/bridge/package.json`, add `"scripts": { "test:unit": "jest --watchAll", "test:unit:ci": "jest --ci --runInBand --collectCoverage --passWithNoTests" }` and the peer dependency `"@cornerstonejs/core": "5.10.3"` (the version `extensions/cornerstone` pins);
  - run `pnpm install --no-frozen-lockfile` in `apps/viewer` (the fork's `pnpm-workspace.yaml` sets `frozenLockfile: true`, so a plain install refuses to update the lockfile), and commit `pnpm-lock.yaml` if it changes. The plan's Constraints allow this lockfile change;
  - confirm that `pnpm --filter @spsoft-mvp/extension-bridge run test:unit:ci` exits 0 with no tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The message contract (landed in the fork first, then pinned by the parent), the
logger, and both ends of the `postMessage` channel. Both user stories send or receive bridge
messages through these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 (fork) Create `apps/viewer/extensions/bridge/src/messages.ts`, the single source of truth for the contract, with exactly the type shape in [contracts/bridge-messages.md § Events](contracts/bridge-messages.md#events):
  - export `StudyLoadFailureReason = 'notFound' | 'sourceUnreachable'`;
  - export `BridgeEventMessage`, the discriminated union of `{ source: 'spsoft-mvp-viewer'; type: 'event'; event: 'studyLoaded'; payload: { StudyInstanceUID: string } }` and `{ …; event: 'studyLoadFailed'; payload: { StudyInstanceUID: string; reason: StudyLoadFailureReason } }`;
  - no `BridgeCommandMessage` and no other event names (research R11);
  - types only, no imports, no runtime code, because both the fork's babel and the scoring app's `tsc` compile it.

  Header comment: this is the only copy of the bridge message contract; the scoring app (parent repo) type-imports it as `@bridge-contract`; change it through a fork PR, then bump the submodule.

  In the same commit:
  - in `apps/viewer/extensions/bridge/README.md`, replace the paragraph that points at `shared/bridge-messages.ts` and asks for hand-syncing with one saying the contract is `src/messages.ts` and the scoring app type-imports it through the submodule;
  - in `apps/viewer/extensions/bridge/src/index.ts`, change the comment `Message contract: shared/bridge-messages.ts` to `Message contract: ./messages.ts`.
- [X] T006 (fork) Land the contract in the fork before the parent repo uses it.
  - **Ask the user before pushing.** Then push the fork branch `001-study-scoring-view` (containing T004 and T005) to `origin` (`mkozak0108/Viewers`).
  - Open a PR against `master`, e.g. "Add bridge message contract and test setup".
  - Wait for the user to merge it. T008–T009 and T012–T013 can proceed meanwhile. Commit T012–T013 locally, but don't push them until the PR is merged, or they would join it.
- [X] T007 After the T006 PR is merged, switch the parent repo to the single contract in **one parent commit**:
  - `git -C apps/viewer fetch origin && git -C apps/viewer checkout <merged master commit>`;
  - `git rm -r shared`;
  - in `apps/scoring-form/tsconfig.app.json`, replace `"../../shared"` in `include` with `"../viewer/extensions/bridge/src/messages.ts"`, and add `"paths": { "@bridge-contract": ["../viewer/extensions/bridge/src/messages.ts"] }` to `compilerOptions`;
  - in `apps/scoring-form/eslint.config.js`, add the rule `'@typescript-eslint/no-import-type-side-effects': 'error'` (research R11);
  - in `apps/scoring-form/src/lib/bridge.ts`, change the stub comment `Message contract: shared/bridge-messages.ts.` to `Message contract: @bridge-contract (apps/viewer/extensions/bridge/src/messages.ts).`;
  - in the root `README.md`:
    - intro: say the apps share only the bridge's message contract, one types-only file in the viewer's bridge extension that the scoring app type-imports through the submodule;
    - "Checks": replace the "If you change anything in `shared/`" paragraph with: the contract lives in the fork; `npm run typecheck` needs the submodule checked out; a contract change goes through a fork PR and a submodule bump, and the checks are re-run in the bump commit;
    - project structure: remove the `shared/` line;
    - replace the "Shared types, not shared code" decision with "One contract file, owned by the bridge", covering R11's rationale and its trade-off that the scoring app's typecheck needs the submodule source, though not an installed or running viewer.

  Then run `npm run typecheck && npm run lint` in `apps/scoring-form` (both must pass) and commit the gitlink together with the above.

  Afterwards, return the submodule working tree to the fork branch:
  - if the branch has no commits beyond the merged PR, run `git -C apps/viewer checkout -B 001-study-scoring-view origin/master`;
  - otherwise rebase its new commits onto `origin/master`.

  Until T046, the submodule runs ahead of the committed gitlink, so stage parent-repo files explicitly and never use `git commit -a` or `git add -A`.
- [X] T008 [P] Write failing tests in `apps/scoring-form/src/lib/logger.test.ts`:
  - `logger.debug|info|warn|error(message, context?)` each call the matching `console` method (spy with `vi.spyOn(console, …)`) with the message and the structured context object;
  - `logger.debug` does not call `console.debug` when `import.meta.env.PROD` is true (`vi.stubEnv('PROD', true)`; restore it with `vi.unstubAllEnvs()`).

  Run `npm test` and confirm the tests fail.
- [X] T009 Implement `apps/scoring-form/src/lib/logger.ts`:
  - export `logger` with `debug`, `info`, `warn` and `error(message: string, context?: Record<string, unknown>)`;
  - check `import.meta.env.PROD` at call time and make `debug` a no-op in production;
  - it is the only module allowed to use `console` (Principle IV): start the file with `/* eslint-disable no-console -- the app's single logging sink (constitution Principle IV) */`.

  Make T008 pass.
- [X] T010 Write failing tests in `apps/scoring-form/src/lib/bridge.test.ts`, with types from `import type { BridgeEventMessage } from '@bridge-contract'` (depends on T007).

  `isBridgeEventMessage(data: unknown)`:
  - accepts a valid `studyLoaded`, and a valid `studyLoadFailed` with each reason;
  - accepts messages with extra fields;
  - rejects `null`, a string, an array, a wrong `source`, `type` or `event`, a missing or non-object `payload`, an empty or non-string `StudyInstanceUID`, an unknown `reason`, and `studyLoadFailed` without `reason`.

  `subscribeToViewer({ origin, expectedStudyInstanceUid, getSource, onMessage })`, returning an unsubscribe function:
  - Setup: append two `<iframe>`s to `document.body`, and dispatch `new MessageEvent('message', { data, origin, source: iframe.contentWindow })` on `window`.
  - `onMessage` is called with the typed message only when **all** of these hold: `event.origin === origin`; `event.source === getSource()`, evaluated at event time, so switching `getSource` to the second iframe makes messages from the first one ignored; the guard passes; and `payload.StudyInstanceUID === expectedStudyInstanceUid`.
  - Anything else is ignored: wrong origin, wrong source window, malformed data, or a mismatched UID.
  - After unsubscribing, nothing is delivered.

  Run and confirm the tests fail.
- [X] T011 Implement `apps/scoring-form/src/lib/bridge.ts` with `isBridgeEventMessage` and `subscribeToViewer`, following the receiver rules in [contracts/bridge-messages.md § Receiver rules](contracts/bridge-messages.md#receiver-rules-scoring-app):
  - import contract types only with top-level `import type … from '@bridge-contract'`;
  - keep the known reasons in a local `const` array, because the contract file is types only;
  - log rejected messages with `logger.debug` (context: `{ reason: 'origin' | 'source' | 'shape' }`, never the data);
  - log a mismatched UID with `logger.warn` (context: `{ event }` only, no UIDs).

  Make T010 pass (depends on T009).
- [X] T012 [P] (fork) Write failing Jest tests in `apps/viewer/extensions/bridge/src/postToHost.test.ts` (depends on T004, T005):
  - when not framed (in jsdom, `window.parent === window` by default), `postToHost(msg)` posts nothing;
  - when framed (`jest.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage: jest.fn() } as unknown as Window)`; no `any`), it calls `parent.postMessage(msg, origin)` exactly once for each of `'http://localhost:5173'` and `'http://localhost:4173'`;
  - it never uses `'*'` as the target origin.

  Run `test:unit:ci` and confirm the tests fail.
- [X] T013 (fork) Implement `apps/viewer/extensions/bridge/src/postToHost.ts`:
  - export `HOST_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'] as const`;
  - export `postToHost(message: BridgeEventMessage): void`, typed from `./messages`, which returns early unless `window.parent !== window` and then posts to each allowlisted origin, never to `'*'` (research R6).

  Make T012 pass.

**Checkpoint**: The parent pins a fork commit that contains the contract, and `shared/` is gone.
`npm test` passes the logger and bridge tests, and the bridge's `test:unit:ci` passes the
`postToHost` tests. User story work can begin.

---

## Phase 3: User Story 1 - Open a patient's study next to the scoring form (Priority: P1) 🎯 MVP

**Goal**: Opening `/?StudyInstanceUIDs=<uid>` shows the OHIF viewer on that study on the left
and the "Scoring form" panel on the right. Once the viewer reports its first rendered image, the
panel shows "Scoring is not available yet." and no inputs.

**Independent Test**: Start both apps and open quickstart scenario 1's link. The CT images
appear on the left, "Scoring is not available yet." appears on the right, and there is no page
scrollbar at 1280×800. Browsing the images leaves the panel unchanged (scenario 2), and
reloading reopens the same study (scenario 3). Automated: the US1 cases in `App.test.tsx`,
`studyLink.test.ts`, `viewerLink.test.ts`, `viewerStatus.test.ts`, `watchStudy.test.ts` and
`index.test.ts`.

### Tests for User Story 1 ⚠️ (write first, see them fail)

- [X] T014 [P] [US1] Write failing table-driven tests in `apps/scoring-form/src/lib/studyLink.test.ts` for `parseStudyLink(search: string): StudyLink`, where `StudyLink = { kind: 'valid'; studyInstanceUid: string } | { kind: 'missing' } | { kind: 'malformed' }`. The rule, verbatim from research R8: "Valid when non-empty, at most 64 characters, and matching `^[0-9]+(\.[0-9]+)+$`".
  - **Valid:** `1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5`, `1.2.840.113619.2.30.1.1762295590.1623.978668949.886`, `1.2.3.4.5.6.7.8.9`, and a leading zero inside a component (`1.02.3`).
  - **`missing`:** `''`, `?`, `?StudyInstanceUIDs=`, and `?other=1`.
  - **`malformed`:** `abc`, a single component `123`, a trailing dot `1.2.`, a leading dot `.1.2`, a comma list `1.2.3,4.5.6`, embedded whitespace, a valid-looking UID of 65 characters, and one of exactly 64 characters, which is valid.
  - Assert that `malformed` results equal `{ kind: 'malformed' }` exactly, so the untrusted raw value is never carried along (data-model).
- [X] T015 [P] [US1] Write failing tests in `apps/scoring-form/src/lib/viewerLink.test.ts`:
  - `parseViewerOrigin(raw: string | undefined): string` returns `'http://localhost:3000'` for `undefined` and `''`;
  - it returns the origin for `http://` and `https://` URLs, dropping any path (`http://host:3000/foo` → `http://host:3000`);
  - it throws an `Error` whose message names `VITE_VIEWER_URL` for an unparseable value and for other schemes (`javascript:alert(1)`, `ftp://x`);
  - `buildViewerLink(origin, studyInstanceUid)` returns `${origin}/viewer?StudyInstanceUIDs=${uid}`, built with `URL`/`URLSearchParams` (research R9, data-model ViewerLink).
- [X] T016 [P] [US1] Write failing tests in `apps/scoring-form/src/lib/viewerStatus.test.ts` for the pure reducer `viewerStatusReducer(state, action)`:
  - the initial state `INITIAL_VIEWER_STATUS` equals `{ status: 'loading', slow: false }`;
  - `{ type: 'studyLoaded' }` in `loading` leads to `{ status: 'loaded' }`;
  - in `loaded`, a repeated `studyLoaded` and a late `{ type: 'studyLoadFailed', reason: 'notFound' }` both return the same `loaded` state (US1-2).
- [X] T017 [P] [US1] Write failing tests in `apps/scoring-form/src/App.test.tsx`.

  Setup:
  - `vi.stubEnv('VITE_VIEWER_URL', 'http://viewer.test:3000')`, and `window.history.replaceState(null, '', '/?StudyInstanceUIDs=1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5')` before each `render(<App />)`;
  - a local helper that dispatches `new MessageEvent('message', { origin: 'http://viewer.test:3000', source: iframe.contentWindow, data })` on `window` inside `act()`.

  Cases:
  - (US1-1) The iframe found by title "Study viewer" has `src` `http://viewer.test:3000/viewer?StudyInstanceUIDs=<uid>`, and the region named "Scoring form" is present.
  - (US1-1) After `studyLoaded`, the iframe and the region are both present, and there is no `role="status"` and no `role="alert"`.
  - (US1-3) After `studyLoaded`, the region contains "Scoring is not available yet." and no `textbox`, `combobox`, `checkbox`, `radio` or `spinbutton`.
  - (US1-2) After `loaded`, a second `studyLoaded` and a `studyLoadFailed` leave the region's text unchanged.
  - (US1-4) Unmounting and rendering again with the same URL gives the same iframe `src`.
- [X] T018 [P] [US1] (fork) Write failing Jest tests in `apps/viewer/extensions/bridge/src/watchStudy.test.ts` for `watchStudy({ extensionManager }): () => void` (research R3).

  Setup:
  - `jest.mock('./postToHost')`;
  - set the page URL with `window.history.replaceState({}, '', '/viewer?StudyInstanceUIDs=1.2.3.4')`;
  - a fake `extensionManager.getActiveDataSource()` returning `[{ query: { studies: { search: jest.fn().mockResolvedValue([{}]) } } }]`, so the existence check added in US2 finds a match and stays silent.

  Cases, "enabling" a real `div` by dispatching `new CustomEvent(Enums.Events.ELEMENT_ENABLED, { detail: { element } })` on `eventTarget` (both from `@cornerstonejs/core`), then dispatching `new CustomEvent(Enums.Events.IMAGE_RENDERED, { detail: { viewportStatus } })` on that element:
  - a `preRender` render posts nothing;
  - the first render with any other status posts `{ source: 'spsoft-mvp-viewer', type: 'event', event: 'studyLoaded', payload: { StudyInstanceUID: '1.2.3.4' } }` exactly once;
  - later renders on the same or a second enabled element post nothing more;
  - enabling the same element twice does not add a second listener;
  - a render on an element that was never enabled posts nothing;
  - after the returned `stop()`, enabling and rendering post nothing;
  - with no `StudyInstanceUIDs` in the URL, nothing is posted.

  Run and confirm the tests fail.

- [X] T019 [P] [US1] (fork) Write failing Jest tests in `apps/viewer/extensions/bridge/src/index.test.ts` for the extension's lifecycle hooks, which are its public interface (Principle I).
  - Setup: `jest.mock('./watchStudy')`, with `watchStudy` returning a fresh `jest.fn()` stop function on each call. Pass fake hook arguments cast with `as unknown as …`, never `any`.
  - `onModeEnter({ extensionManager })` calls `watchStudy` once with `{ extensionManager }`.
  - A second `onModeEnter` first calls the previous stop function.
  - `onModeExit()` calls the current stop function, and a second `onModeExit()` calls nothing.
  - `preRegistration` does not call `watchStudy`.

  Run and confirm the tests fail.

### Implementation for User Story 1

- [X] T020 [P] [US1] Implement `apps/scoring-form/src/lib/studyLink.ts`: `parseStudyLink(search)` reads `StudyInstanceUIDs` with `URLSearchParams.get` and applies the R8 rule and the `StudyLink` type from T014. Make T014 pass
- [X] T021 [P] [US1] Implement `apps/scoring-form/src/lib/viewerLink.ts` with `parseViewerOrigin` and `buildViewerLink`, using `new URL()` and `URLSearchParams` and no string concatenation of the UID. Make T015 pass
- [X] T022 [US1] Implement `apps/scoring-form/src/lib/viewerStatus.ts`.
  - Types: `ViewerStatus = { status: 'loading'; slow: boolean } | { status: 'loaded' }`, and actions `{ type: 'studyLoaded' } | { type: 'studyLoadFailed'; reason: StudyLoadFailureReason }`, with `StudyLoadFailureReason` from `import type … from '@bridge-contract'`.
  - `INITIAL_VIEWER_STATUS` and `viewerStatusReducer`: `studyLoaded` is honoured only in `loading`; everything else returns the same state.
  - The hook `useViewerStatus({ origin, studyInstanceUid, getSource })` runs `useReducer` and, in a `useEffect`, calls `subscribeToViewer` from `./bridge`, dispatching the event as an action. It unsubscribes on cleanup and logs each transition with `logger.info('viewer status', { from, to })`. It returns `{ status }`.

  Make T016 pass (depends on T011).
- [X] T023 [P] [US1] Replace the stub in `apps/scoring-form/src/components/ScoringForm.tsx` with `ScoringForm({ mode }: { mode: 'waiting' | 'ready' })`:
  - render a `<section aria-labelledby=…>` headed by a visible `<h2>Scoring form</h2>`, so it is the region "Scoring form" (SC-004);
  - in `ready`, render `<p>Scoring is not available yet.</p>`, with no form controls (FR-005);
  - in `waiting`, render only the heading. US2 adds the text.
- [X] T024 [P] [US1] Replace the stub in `apps/scoring-form/src/components/ViewerFrame.tsx` with `ViewerFrame({ src, iframeRef }: { src: string; iframeRef: React.Ref<HTMLIFrameElement> })`, rendering `<iframe title="Study viewer" src={src} ref={iframeRef}>` inside a wrapper that fills the left column. Do not add a `sandbox` attribute: OHIF needs scripts and same-origin storage
- [X] T025 [US1] Create `apps/scoring-form/src/components/StudyView.tsx` and rewrite `apps/scoring-form/src/App.tsx`, so that no hook is ever called conditionally (the `react-hooks` lint rule is part of `npm run lint`).
  - `StudyView({ origin, studyInstanceUid })` handles a valid link only:
    - build the link with `buildViewerLink` and hold an `iframeRef`;
    - call `useViewerStatus({ origin, studyInstanceUid, getSource: () => iframeRef.current?.contentWindow ?? null })`;
    - render `<ViewerFrame>` on the left and `<ScoringForm mode={status === 'loaded' ? 'ready' : 'waiting'}>` on the right.
  - `App` reads `window.location.search` with `parseStudyLink`, and `import.meta.env.VITE_VIEWER_URL` with `parseViewerOrigin`, once per mount in lazy `useState` initializers (not at module load, so tests can stub the env). It renders `<main className="app">`:
    - with `<StudyView>` for a `valid` link;
    - otherwise with no iframe (FR-007) and an empty left column. US2 adds the messages.

  Make T017 pass (depends on T020–T024).
- [X] T026 [P] [US1] Replace the Vite template styles to lay out the two columns ([contracts/scoring-app-ui.md § Layout](contracts/scoring-app-ui.md#layout)).
  - In `apps/scoring-form/src/index.css`:
    - delete the `#root` block (width, centring, `text-align`, `border-inline`), the `#social` rule, the `.counter` selector and the oversized `h1` rules;
    - keep the colour tokens;
    - add `html, body, #root { height: 100%; }` and `body { margin: 0; }`.
  - In `apps/scoring-form/src/App.css`, make `.app` a full-height grid:
    - `height: 100vh; display: grid; grid-template-columns: minmax(640px, 1fr) minmax(300px, 360px);` so the viewer takes the larger share;
    - no vertical page scroll;
    - below the summed minimum width the page scrolls horizontally rather than hiding a panel (spec edge case, narrow window);
    - the iframe fills its column with `width: 100%; height: 100%; border: 0; display: block;`.
- [X] T027 [P] [US1] (fork) Implement `apps/viewer/extensions/bridge/src/watchStudy.ts` with `watchStudy({ extensionManager })`.
  - On start, read `StudyInstanceUIDs` from `new URLSearchParams(window.location.search)`. If it is absent, `log.info` and return a no-op stop function.
  - Listen for `Enums.Events.ELEMENT_ENABLED` on `eventTarget` from `@cornerstonejs/core`, the same hook OHIF's `initViewTiming` uses (research R3). For each `detail.element`, at most once per element (tracked in a `Set`), add an `Enums.Events.IMAGE_RENDERED` listener.
  - The first event whose `detail.viewportStatus !== 'preRender'` sets an "already posted" flag and calls `postToHost` with `studyLoaded`, typed from `./messages`.
  - `stop()` removes the `eventTarget` listener and all element listeners.
  - Log through `log` from `@ohif/core`, never `console`.

  Make T018 pass.
- [X] T028 [US1] (fork) Wire `apps/viewer/extensions/bridge/src/index.ts`:
  - hold a module-level `stopWatching` function;
  - `onModeEnter: ({ extensionManager }) => { stopWatching?.(); stopWatching = watchStudy({ extensionManager }); }`;
  - `onModeExit: () => { stopWatching?.(); stopWatching = undefined; }`;
  - keep `preRegistration` a no-op (research R2);
  - replace the "Accepts commands from apps/scoring-form" comment with a description of the events it now posts.

  Make T019 pass (depends on T027).
- [X] T029 [US1] Validate US1:
  - all scoring-app and bridge tests pass;
  - `npm run typecheck && npm run lint` pass in `apps/scoring-form`;
  - with `pnpm dev` in `apps/viewer` (fork branch working tree) and `npm run dev` in `apps/scoring-form`, [quickstart.md](quickstart.md) scenarios 1–3 behave as described.

**Checkpoint**: User Story 1 is fully functional. It is the MVP: a study opens side by side
with the placeholder panel.

---

## Phase 4: User Story 2 - Clear feedback while the study loads or fails to load (Priority: P2)

**Goal**: The doctor always knows whether the study is loading, loaded or failed:
- a loading status, plus a 10 s "taking longer" warning that never becomes a failure;
- plain-language errors with "Try again" for a study that isn't found or a source that can't be reached;
- messages for a missing or malformed link;
- a form panel that shows waiting or unavailable states instead of looking ready.

**Independent Test**: Quickstart scenarios 4–11: no UID, `abc`, an unknown UID with Try again,
the network offline, the viewer stopped, slow 3G, and the ECG study. Each shows the exact
wording from [contracts/scoring-app-ui.md](contracts/scoring-app-ui.md) within 10 s, and the form
panel is never in its ready state. Automated: the US2 cases in `viewerStatus.test.ts`,
`App.test.tsx` and `watchStudy.test.ts`.

### Tests for User Story 2 ⚠️ (write first, see them fail)

- [X] T030 [P] [US2] Extend `apps/scoring-form/src/lib/viewerStatus.test.ts`.

  Reducer:
  - `studyLoadFailed` in `loading` gives `{ status: 'failed', reason }` for each reason;
  - `{ type: 'retry' }` in `failed` gives `{ status: 'loading', slow: false }`;
  - `{ type: 'slowTimerFired' }` in `loading` gives `slow: true` with the status unchanged, and is ignored in `loaded` and `failed`;
  - `studyLoaded` in `failed` is ignored.

  Hook, using `renderHook` from `@testing-library/react`, `vi.useFakeTimers()`, a real `<iframe>` appended to `document.body` as `getSource`, and `MessageEvent`s dispatched inside `act()`:
  - at `SLOW_WARNING_MS - 100` (9.9 s), `slow` is false;
  - at `SLOW_WARNING_MS` (exported, `10_000`), `slow` is true and the status is still `loading`;
  - a later `studyLoaded` gives `loaded`;
  - once `loaded`, advancing 60 s never sets `slow`;
  - with no messages at all, after 10 minutes the status is still `loading` with `slow: true` and never `failed` (research R7);
  - `retry()` from `failed` returns to `loading` with `slow: false`, increments `attempt`, and re-arms a fresh 10 s timer.
- [X] T031 [P] [US2] Extend `apps/scoring-form/src/App.test.tsx` with the US2 scenarios, using the wording from [contracts/scoring-app-ui.md § Screen states](contracts/scoring-app-ui.md#screen-states):
  - (US2-1) Before `studyLoaded`, a `role="status"` region on the left contains "Loading study…", and the "Scoring form" region contains a `role="status"` with "Waiting for the study to load…".
  - (US2-2) For each case, dispatch `studyLoadFailed` and check the alert, the "Try again" button, that the iframe has the `hidden` attribute, and that the panel says "Scoring is unavailable.":
    - `notFound`: alert "Study not found" / "The image source has no study with this identifier.";
    - `sourceUnreachable`: alert "Can't reach the image source" / "Check your connection and try again.".
  - (US2-2 retry) Clicking "Try again" with `fireEvent.click` renders a **new** iframe element (not the same node as before) that is not hidden, and "Loading study…" shows again with no slow warning.
  - (US2-3) `/` gives the alert "No study selected" / "Open this page using a link that includes a study."; `/?StudyInstanceUIDs=abc` gives "This study link is not valid" / "Check the link you were given and try again.". In both, there is no iframe, no "Try again" button, the panel says "Scoring is unavailable.", and for `abc` the text `abc` appears nowhere in `document.body.textContent`.
  - (US2-4) With `vi.useFakeTimers()`, advancing 10 s adds "This is taking longer than it should." inside the same `role="status"` region as "Loading study…", and there is no `button` on the page. A later `studyLoaded` removes the status and the warning and shows "Scoring is not available yet.".
  - (Config, research R9) With `vi.stubEnv('VITE_VIEWER_URL', 'ftp://x')` and a valid study link, the alert "The viewer is not configured" / "Set VITE_VIEWER_URL to the viewer's http or https address, then restart the app." is shown. There is no iframe and no "Try again" button, and the panel says "Scoring is unavailable.".
- [X] T032 [P] [US2] (fork) Extend `apps/viewer/extensions/bridge/src/watchStudy.test.ts` with the existence check (research R4).
  - `search` is called once with `{ studyInstanceUid: '1.2.3.4' }`.
  - Resolving `[]` posts `studyLoadFailed` with `{ StudyInstanceUID: '1.2.3.4', reason: 'notFound' }`.
  - Rejecting posts `reason: 'sourceUnreachable'`.
  - Resolving `[{}]` posts nothing by itself.
  - The failure is still posted when `stop()` ran before the search settled, because OHIF's redirect to `/notfoundstudy` fires `onModeExit`.
  - At most one message per start: a search failure after `studyLoaded` was already posted posts nothing, and a render after a failure was posted posts nothing.
  - Await settled promises with `await Promise.resolve()` or `await new Promise(process.nextTick)`.

### Implementation for User Story 2

- [X] T033 [US2] Extend `apps/scoring-form/src/lib/viewerStatus.ts`.
  - Add the state `{ status: 'failed'; reason: StudyLoadFailureReason }` and the actions `retry` and `slowTimerFired`.
  - Transitions follow [data-model.md § ViewerStatus](data-model.md#viewerstatus-scoring-app-state-machine): messages are honoured only in `loading`; `retry` works only from `failed`; leaving `loading` clears `slow`.
  - Export `SLOW_WARNING_MS = 10_000`.
  - In `useViewerStatus`, arm a `setTimeout(SLOW_WARNING_MS)` whenever the status enters `loading` (on mount and after retry). It dispatches `slowTimerFired` and is cleared on leaving `loading` and on unmount.
  - Return `{ status, attempt, retry }`, where `attempt` is a counter bumped by `retry`.
  - Logging: `logger.info` with `{ from, to, reason? }` for each transition, and `logger.warn('study is slow to load')` when `slow` is set. No UIDs or patient data.

  Make T030 pass.
- [X] T034 [P] [US2] Extend `apps/scoring-form/src/components/ScoringForm.tsx` to `mode: 'waiting' | 'ready' | 'unavailable'` (FR-004):
  - `waiting` renders `<p role="status">Waiting for the study to load…</p>`;
  - `unavailable` renders `<p>Scoring is unavailable.</p>`;
  - still no form controls in any mode.
- [X] T035 [P] [US2] Extend `apps/scoring-form/src/components/ViewerFrame.tsx` with props `status: ViewerStatus` and `onRetry: () => void`.
  - **Loading:** one `role="status"` element over the iframe containing "Loading study…" and, when `slow`, a second line "This is taking longer than it should." with no button.
  - **Failed:** the iframe gets the `hidden` attribute, and a `role="alert"` block shows a title and text per reason, exactly as in [contracts/scoring-app-ui.md](contracts/scoring-app-ui.md), plus `<button type="button" onClick={onRetry}>Try again</button>`.
  - **Loaded:** the iframe only.
  - Render plain JSX text only, never `innerHTML` (Principle III).
- [X] T036 [US2] Extend `apps/scoring-form/src/App.tsx` and `apps/scoring-form/src/components/StudyView.tsx`.
  - **Viewer not configured:** in `App`, catch the error from `parseViewerOrigin` in its `useState` initializer, and log it with `logger.error('invalid VITE_VIEWER_URL')`. Render the contract's `role="alert"` ("The viewer is not configured" / "Set VITE_VIEWER_URL to the viewer's http or https address, then restart the app.") and `ScoringForm mode="unavailable"`. This state is checked before the study link.
  - **Invalid link:** for `missing` and `malformed`, render a `role="alert"` block in the left column with the contract's title and text: "No study selected" / "Open this page using a link that includes a study.", and "This study link is not valid" / "Check the link you were given and try again.". Pass `mode="unavailable"` to `ScoringForm`, never echo the raw query value, and log once with `logger.warn('invalid study link', { kind })`.
  - **Valid link (in `StudyView`):** key `ViewerFrame` by `attempt` so Retry remounts the iframe, then pass `status` and `onRetry={retry}`. Map the status to the panel mode: `loaded` → `ready`, `failed` → `unavailable`, `loading` → `waiting`.

  Make T031 pass (depends on T033–T035).
- [X] T037 [P] [US2] In `apps/scoring-form/src/App.css`, style the loading status and the alerts:
  - they are centred over or in place of the viewer column, readable in light and dark mode using the existing `index.css` tokens;
  - the status overlay must not block pointer events on the iframe once loaded (it is not rendered then);
  - the form panel keeps its column width in all states.
- [X] T038 [P] [US2] (fork) Extend `apps/viewer/extensions/bridge/src/watchStudy.ts`.
  - On start, call `extensionManager.getActiveDataSource()[0].query.studies.search({ studyInstanceUid })`, the same call as OHIF's `validateStudies` in `platform/app/src/routes/Mode/Mode.tsx`.
  - An empty result posts `studyLoadFailed`/`notFound`; a throw or rejection posts `studyLoadFailed`/`sourceUnreachable`; a match posts nothing.
  - Do not cancel the search or its post in `stop()` (research R4).
  - Share the "already posted" flag with the first-render path, so at most one message is sent per start.
  - Log the outcome with `log.info` or `log.warn`, never `console`.

  Make T032 pass.
- [X] T039 [US2] Validate US2:
  - all tests pass in both apps;
  - `npm run typecheck && npm run lint` pass;
  - run [quickstart.md](quickstart.md) scenarios 4–11, noting the actual behaviour of scenario 11 (ECG study) for the README (T044).

**Checkpoint**: User Stories 1 and 2 both work. Every screen state in the UI contract is
reachable and covered by a test.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Delivery gates, documentation (Principle V), and landing the fork change before
the final submodule bump

- [X] T040 [P] (fork) Update `apps/viewer/extensions/bridge/README.md`:
  - replace "Not implemented yet" with: what the bridge posts (`studyLoaded`, `studyLoadFailed`) and when; the host-origin allowlist in `src/postToHost.ts` and how to change it; the existence check's extra QIDO request; and the test command `pnpm --filter @spsoft-mvp/extension-bridge run test:unit:ci`.
  - Change the `description` in `apps/viewer/extensions/bridge/package.json` from "accepts commands via postMessage and publishes viewer events back out" to one that says it publishes study-load events to the host app. It no longer accepts commands (R11).
- [X] T041 (fork) Run the viewer-side checks in `apps/viewer`: `pnpm --filter @spsoft-mvp/extension-bridge run test:unit:ci` and `pnpm exec eslint extensions/bridge/src`. Both must pass. Fix what they report
- [X] T042 Run the scoring-app delivery gates in `apps/scoring-form`: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm audit --omit=dev`. The first four must pass, and the audit must report no high or critical vulnerabilities (Principle III). Check that `console` appears only in `src/lib/logger.ts` (`grep -rn "console\." src`)
- [X] T043 Run all of [quickstart.md](quickstart.md) end to end (§1 automated checks, §2 both apps, §3 scenarios 1–13), including scenario 12 (narrow window, about 900 px: both panels reachable by horizontal scroll) and scenario 13 (DevTools console: no unexpected errors, no patient data or UIDs in scoring-app logs). Fix any failures with a test first (Principle I)
- [X] T044 Update the root `README.md` (Principle V). The contract and `shared/` changes were already made in T007.
  - Rewrite the intro bullet about the bridge, which says it "accepts commands": it now only publishes study-load events.
  - Replace "Right now this is an empty scaffold…" in §3 with how to open a study: the entry link format `http://localhost:5173/?StudyInstanceUIDs=<uid>` and the sample link from research R12, `1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5`.
  - Document `VITE_VIEWER_URL` and `apps/scoring-form/.env.example`.
  - In "Checks", remove the "npm test fails with no test files" note and add the bridge's Jest command.
  - Add key decisions R4 (the bridge's own existence check), R6 (origin/source/shape checks and the host allowlist) and R7 (slow warning, never a timeout failure, no heartbeat).
  - Add a "Known limitations" section:
    - a viewer that isn't running and a study with no viewable images both show only the generic slow warning;
    - a viewer that breaks after loading is not detected;
    - host origins are hard-coded in the bridge;
    - `netlify.toml` in the fork sets `X-Frame-Options: DENY`, so that deploy recipe can't be framed;
    - the observed scenario 11 (ECG) behaviour from T039/T043.
  - Add "Deliberately left out": scoring fields, saving, patient details, a study list.
- [X] T045 (fork) Deliver the rest of the fork change first: the fork PR merges before the parent repo's submodule bump.
  - Commit any remaining bridge work on the fork's `001-study-scoring-view` branch, keeping each test with or before its implementation.
  - **Ask the user before pushing.** Then push to `origin` (`mkozak0108/Viewers`) and open a PR against `master` describing the bridge's `studyLoaded`/`studyLoadFailed` events.
  - Wait for the user to merge it.
- [X] T046 After the T045 PR is merged, bump the submodule in the parent repo: `git -C apps/viewer fetch origin && git -C apps/viewer checkout <merged master commit>`, then commit the `apps/viewer` gitlink in spsoft-mvp. In that commit, run `npm run typecheck && npm test && npm run build` in `apps/scoring-form`. This is the contract compatibility check (research R11)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. T002 needs T001, and the rest can run in parallel.
- **Foundational (Phase 2)**: Depends on Setup. It blocks both user stories. It includes one
  wait: the T006 fork PR must be merged before T007.
- **US1 (Phase 3)**: Depends on Foundational.
- **US2 (Phase 4)**: Depends on US1. It extends US1's `viewerStatus.ts`, `ScoringForm.tsx`,
  `ViewerFrame.tsx`, `App.tsx`, `App.test.tsx` and `watchStudy.ts`, rather than adding
  parallel files. It is still verified on its own, through its own tests and quickstart
  scenarios 4–11.
- **Polish (Phase 5)**: Depends on US1 and US2. T045 (fork PR merged) must come before T046
  (submodule bump).

### Within each phase

- Test task → run it and see it fail → implementation task → see it pass (Principle I).
- Scoring app: `logger` → `bridge` → `viewerStatus` → components → `App`.
- Viewer: `messages` → `postToHost` → `watchStudy` → `index.ts`.
- The scoring-app and fork tracks share only the contract file (T005, pinned in T007), so after
  Phase 2 they can be worked on in parallel within each story.

### Task-level dependencies (non-obvious ones)

| Task | Needs |
| --- | --- |
| T006 | T004, T005 |
| T007 | T006 merged |
| T010 | T007 (the `@bridge-contract` alias) |
| T011 | T009, T010 |
| T012 | T004, T005 |
| T022 | T011, T016 |
| T025 | T020–T024 |
| T028 | T019, T027 |
| T033 | T030 (and T022) |
| T036 | T031, T033–T035 |
| T038 | T032 (and T027) |
| T044 | T039, T043 (scenario 11 result) |
| T046 | T045 merged |

---

## Parallel Examples

### Phase 2

```text
# While waiting for the T006 fork PR to be merged:
T008 logger.test.ts → T009 logger.ts  ‖  T012 (fork) postToHost.test.ts → T013 postToHost.ts
# After T007 (parent pins the contract):
T010 bridge.test.ts → T011 bridge.ts
```

### User Story 1

```text
# All US1 tests at once (different files, two repos):
T014 studyLink.test.ts ‖ T015 viewerLink.test.ts ‖ T016 viewerStatus.test.ts
‖ T017 App.test.tsx ‖ T018 (fork) watchStudy.test.ts ‖ T019 (fork) index.test.ts

# Then the independent implementations:
T020 studyLink.ts ‖ T021 viewerLink.ts ‖ T023 ScoringForm.tsx ‖ T024 ViewerFrame.tsx
‖ T026 index.css + App.css ‖ T027 (fork) watchStudy.ts
# Then: T022 viewerStatus.ts → T025 StudyView.tsx + App.tsx;  T027 → T028 index.ts
```

### User Story 2

```text
T030 viewerStatus.test.ts ‖ T031 App.test.tsx ‖ T032 (fork) watchStudy.test.ts
# Then:
T033 viewerStatus.ts ‖ T034 ScoringForm.tsx ‖ T035 ViewerFrame.tsx ‖ T037 App.css ‖ T038 (fork) watchStudy.ts
# Then: T036 App.tsx + StudyView.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001–T004)
2. Phase 2: Foundational (T005–T013), including merging the contract PR in the fork (T006)
3. Phase 3: US1 (T014–T029)
4. **Stop and validate**: quickstart scenarios 1–3. A study opens side by side with the
   placeholder panel.

At this point a failed or slow load shows an empty form panel and whatever OHIF itself shows.
That is acceptable for a demo of the happy path, but not for delivery.

### Incremental Delivery

1. Setup + Foundational: the contract is pinned, and the message channel exists at both ends,
   with tests.
2. US1: the happy path works end to end (MVP).
3. US2: every loading, failure and invalid-link state has visible, tested wording.
4. Polish: the gates pass, the README is updated, the second fork PR is merged, and the
   submodule is bumped.

### Commit guidance

- Principle I: commit each test with its implementation, or before it (for example T014 + T020
  together).
- Scoring-app commits go to spsoft-mvp on branch `001-study-scoring-view`. Fork commits go
  inside `apps/viewer` on the fork's branch of the same name.
- The `apps/viewer` gitlink is committed only in T007 and T046, each time pointing at a
  merged fork `master` commit. So every parent commit typechecks on a fresh clone.

---

## Notes

- [P] tasks touch different files and don't depend on incomplete tasks.
- "(fork)" marks tasks committed inside the `apps/viewer` submodule.
- The contract has one copy (research R11). If it has to change mid-feature, change
  `messages.ts` in the fork, merge that through a fork PR, and bump the submodule. Never add a
  second copy in the parent repo.
- Only US1 and US2 are in scope. Scoring fields, saving, patient details and detecting a
  viewer that breaks after loading are deliberately left out (spec Assumptions).

---

## Phase 6: Drop the host-added loading/failure UI over the viewer (2026-09-19)

**Trigger**: code review question ("does OHIF have no loading indicator itself?"). Verified live
by opening the viewer directly (bypassing the scoring app): OHIF shows nothing while a study
loads, and a generic, reason-agnostic message with a dead "study list" link on failure. Product
owner decision: stop duplicating/patching that from the host. See spec.md's 2026-09-19
clarification, [research.md § R7 (amended)](research.md#r7-slow-loads-and-a-viewer-that-stops-responding-timing-values),
and the plan's Complexity Tracking entry for the full rationale.

**Scope**: remove the status overlay, the slow-load warning/timer, the failure alert and the
Try again/retry mechanism from the viewer column. Keep: the bridge's existence check and
`studyLoaded`/`studyLoadFailed` events (unchanged, no fork PR needed), the form panel's
waiting/ready/unavailable wording (still driven by the same events), and the invalid-link /
not-configured alerts (unrelated to viewer loading).

- [X] T047 [P] Simplify `apps/scoring-form/src/lib/viewerStatus.ts`: drop `slow`,
  `SLOW_WARNING_MS`, `ViewerActionType.SlowTimerFired`, `ViewerActionType.Retry`, the timer
  effect, and `retry`/`attempt` from `useViewerStatus`. `ViewerStatus`'s `Loading` variant
  carries no fields; `Failed` keeps `reason`, logged but no longer rendered. Update
  `viewerStatus.test.ts` to match (drop the slow-timer and retry cases; add a case asserting
  `loading` never changes with no bridge message, per research R7)
- [X] T048 [P] Move `ViewerAlert` out of `ViewerFrame.tsx` into its own
  `apps/scoring-form/src/components/ViewerAlert.tsx` (it is still used by `App.tsx` for the
  invalid-link and not-configured screens). Replace `ViewerFrame.tsx` with a bare
  `<iframe title="Study viewer" src={src} ref={iframeRef}>` in its `.viewer-frame` wrapper: no
  `status`/`onRetry` props, no overlay, no `hidden`
- [X] T049 Update `apps/scoring-form/src/components/StudyView.tsx`: no `key={attempt}`, no
  `onRetry`; pass only `src`/`iframeRef` to `ViewerFrame` and `status.state` to `ScoringForm`.
  Update `App.tsx`'s `ViewerAlert` import to the new file
- [X] T050 [P] Update `apps/scoring-form/src/App.css`: drop the `.viewer-notice button` rules
  (the Try again button is gone); keep `.viewer-notice`/`.viewer-notice-title` for the
  invalid-link/not-configured alerts
- [X] T051 Update `apps/scoring-form/src/App.test.tsx`: drop the loading-status, slow-warning
  and retry cases; add a case asserting the form panel shows the same "Scoring is unavailable."
  wording for every `StudyLoadFailureReason`, with no host-added alert, button, or hidden iframe
- [X] T052 Update docs: spec.md (User Story 2 renamed and narrowed, FR-006/SC-003 revised,
  a 2026-09-19 Assumption added), research.md R7 (amended note), data-model.md's ViewerStatus
  section, contracts/scoring-app-ui.md's screen-states table, quickstart.md scenarios 1 and
  6–11, plan.md (Summary, Constitution Check, acceptance-scenario mapping, a new Complexity
  Tracking entry for the Principle IV deviation), and the root README (decisions + known
  limitations)
- [X] T053 Validate: `npm run typecheck && npm run lint && npm test && npm run build` in
  `apps/scoring-form`; manually confirm in the browser that an unknown study shows OHIF's own
  message with the form panel on "Scoring is unavailable." and the iframe not hidden

**Checkpoint**: The viewer column shows only the iframe. The form panel still distinguishes
loading, loaded and failed. No fork changes were needed.

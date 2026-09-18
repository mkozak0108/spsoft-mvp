# Implementation Plan: Study Scoring View

**Branch**: `001-study-scoring-view` | **Date**: 2026-09-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-study-scoring-view/spec.md`

## Summary

The doctor opens `scoring-app/?StudyInstanceUIDs=<uid>`. The scoring app validates the UID and
embeds the OHIF viewer on the left via `/viewer?StudyInstanceUIDs=<uid>`. A form panel on the
right shows a placeholder once the study is on screen, and a waiting or unavailable state
otherwise.

Loading and failure states come from two sources:
- **The viewer's bridge extension** posts `studyLoaded` (first rendered image) or
  `studyLoadFailed` (its own study search found nothing or threw) to the parent window.
- **One host-side timer:** if the study isn't on screen after 10 s, a simple "This is taking
  longer than it should." warning appears while loading continues. Slowness is never reported
  as a failure. A viewer that breaks after loading is not detected (research R7).

Scoring fields, patient details, and any data persistence are out of scope.

## Technical Context

**Language/Version**: TypeScript ~6.0 (strict) in both apps. React 19.2 in the scoring app.
The viewer is the OHIF v3.14.0-beta.30 fork.

**Primary Dependencies**:
- **Scoring app:** React, Vite 8. No runtime dependencies are added.
- **Viewer bridge:** `@ohif/core` (existing peer dependency), plus `@cornerstonejs/core` 5.10.3
  as a new peer dependency. It is already in the workspace; the bridge needs it only for
  `eventTarget` and the `Enums.Events` constants (R3).

**Storage**: N/A. Nothing is persisted; the study UID in the address is the only state that
survives a reload.

**Testing**:
- **Scoring app:** Vitest 5 + jsdom, plus the new dev dependencies `@testing-library/react` and
  `@testing-library/dom`.
- **Viewer bridge:** Jest, using OHIF's upstream toolchain and a new per-extension
  `jest.config.js`.
- **End to end:** manual, following [quickstart.md](quickstart.md).

**Target Platform**: Current desktop Chrome, Firefox, Safari and Edge. Dev servers run on
`localhost:3000` (viewer) and `localhost:5173` (scoring app); `vite preview` uses `:4173`.

**Project Type**: Two client-side web apps talking over `postMessage`. The message contract is
one types-only file owned by the viewer bridge; the scoring app type-imports it through the
submodule (R11).

**Performance Goals**: First image and the form panel appear within 5 s for the sample CT
study (SC-002). Failure messages appear within 10 s for failures the image source reports
(SC-003). Anything slower gets the slow warning within 10 s (research R7).

**Constraints**:
- No backend.
- The viewer's image source is the public OHIF DICOMweb server, unmodified.
- The viewer link format `/viewer?StudyInstanceUIDs=` is fixed by the product owner.
- Changes to the OHIF fork stay inside `extensions/bridge/`, apart from the `pnpm-lock.yaml`
  entries that the bridge's own `package.json` causes.

**Scale/Scope**: One screen, one study per page, one user.

All Technical Context unknowns were resolved in [research.md](research.md) (R1–R12).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research gate

| Principle | Gate | Status |
| --- | --- | --- |
| I. Test-First | Every acceptance scenario can be mapped to an automated test; tests are written before code in `tasks.md` | PASS — planned per app (R10); mapping below |
| II. Simplicity | Only US1 and US2 are built. No new runtime dependencies. Abstractions have ≥ 2 call sites | PASS — no runtime dependencies added; the flat `lib/` layout is below |
| III. Security & Privacy | Untrusted input (query string, `postMessage` data) is validated. No secrets. No `innerHTML` | PASS — addressed in R6 and R8; `VITE_VIEWER_URL` is not a secret (R9) |
| IV. Observability | Loading, empty and error states are visible to the user. There is one logger. `no-console` is enforced | PASS — every screen state is in the UI contract; a logger module is planned |
| V. Reviewer-Ready | Runs from documented commands; the README is updated | PASS — covered by the quickstart and README tasks |
| Tech constraints | Vite, Vitest, npm, strict TS | DEVIATION in the viewer bridge (Jest, pnpm) → Complexity Tracking |

### Post-design re-check

| Principle | Result after design |
| --- | --- |
| I | PASS. Every US1 and US2 acceptance scenario and every edge case maps to at least one automated test (table below). Pixel layout ("no page scroll", narrow window) is additionally checked by hand in quickstart scenarios 1 and 12. |
| II | PASS. The scoring app gets 5 small `lib/` modules and 3 components; no layers or providers. `StudyView` exists so that `App` never calls a hook conditionally: it owns the valid-link screen. `viewerStatus.ts` holds both the pure reducer (for tests) and its hook (for components), in one file. The bridge adds 3 source files. The speculative contract surface is removed, and the contract exists in one file only (R11). |
| III | PASS. Incoming messages are accepted only if origin, source window and runtime type guard all match, and the UID must match the requested one (contracts/bridge-messages.md). The viewer posts only to an allowlist of host origins. The UID is regex-checked and passed through `URLSearchParams`. No patient data is shown or logged. `npm audit --omit=dev` runs at delivery. |
| IV | PASS. `lib/logger.ts` is the only module with `console` (file-level lint exemption). Every state transition is logged at `info`, rejected messages at `debug`/`warn`, and the slow warning at `warn`. Every failure has a visible message and Retry; slowness shows a visible warning. Bridge-side logging uses `@ohif/core`'s `log`, the viewer's own single logger. |
| V | PASS. `.env.example` is added. README gains: how to open a study, the sample link, the new decisions (R4, R6, R7, R11), and that the scoring app's typecheck needs the viewer submodule checked out (R11); known limitations: a viewer that isn't running and a study with no viewable images both show only the generic slow warning; a viewer that breaks after loading is not detected; host origins are hard-coded in the bridge; `netlify.toml` blocks framing. |

### Acceptance scenario → test mapping

| Scenario | Automated test (scoring app unless noted) |
| --- | --- |
| US1-1 study opens side by side | `App.test.tsx`: valid link renders iframe with `src` = viewer link and the "Scoring form" region; after `studyLoaded` both are present and no status or alert is shown |
| US1-2 browsing does not affect panel | `viewerStatus.test.ts`: in `loaded`, repeated `studyLoaded` and late `studyLoadFailed` are ignored, so the state stays `loaded`. `App.test.tsx`: after `loaded`, extra messages leave the form panel unchanged. Browsing itself is checked by hand (quickstart scenario 2) |
| US1-3 placeholder, no inputs | `App.test.tsx`: in `loaded`, the panel shows "Scoring is not available yet." and contains no `textbox`/`combobox`/`checkbox`/`radio`/`spinbutton` |
| US1-4 reload keeps study | `studyLink.test.ts` + `App.test.tsx`: the viewer link is derived solely from `location.search` (render twice with the same URL → same `src`) |
| US2-1 loading state | `App.test.tsx`: before `studyLoaded`, status "Loading study…" and "Waiting for the study to load…" |
| US2-2 not found / unreachable | `App.test.tsx`: `studyLoadFailed` with each `reason` → matching alert, "Try again" button, panel "Scoring is unavailable."; Retry remounts the iframe → `loading` with `slow` reset. Bridge (Jest): search returns `[]` → posts `notFound`; search throws → posts `sourceUnreachable` |
| US2-3 missing / malformed link | `studyLink.test.ts` (table of inputs); `App.test.tsx`: no iframe, matching alert |
| Config: invalid `VITE_VIEWER_URL` (research R9) | `viewerLink.test.ts`: `parseViewerOrigin` throws; `App.test.tsx`: "The viewer is not configured" alert, no iframe, panel "Scoring is unavailable." |
| US2-4 slow warning | `viewerStatus.test.ts` (fake timers): not loaded at 9.9 s → `slow` false; at 10 s → `slow` true, state unchanged; a later `studyLoaded` → `loaded` (warning gone); `slow` is never set after `loaded`; with no messages at all the state stays `loading` with `slow` and never fails. `App.test.tsx`: warning text shown with no button, and it disappears on `studyLoaded` |
| Edge: no viewable images / slow source | Same as US2-4: the state stays `loading` with `slow` indefinitely and never becomes a failure |
| Edge: narrow window | Quickstart scenario 12 (visual only) |
| Security rules | `bridge.test.ts`: wrong origin, wrong source window, malformed data and mismatched UID are all ignored. Bridge (Jest): not framed → no post; posts only to allowlisted origins |
| Bridge `studyLoaded` | Bridge (Jest), `watchStudy.test.ts`: listeners attach on `ELEMENT_ENABLED` (R3); the first non-`preRender` `IMAGE_RENDERED` posts once; `preRender` and later renders do not; nothing is posted after `stop()`. `index.test.ts`: `onModeEnter` starts watching and `onModeExit` stops it |

## Project Structure

### Documentation (this feature)

```text
specs/001-study-scoring-view/
├── spec.md
├── plan.md                        # this file
├── research.md                    # Phase 0
├── data-model.md                  # Phase 1: StudyLink, ViewerStatus state machine
├── quickstart.md                  # Phase 1: manual validation
├── contracts/
│   ├── bridge-messages.md         # viewer → scoring app postMessage contract
│   └── scoring-app-ui.md          # entry link, layout, screen-state wording
├── checklists/requirements.md
└── tasks.md                       # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
shared/                            # DELETE: the contract moves into the bridge (R11)

apps/scoring-form/
├── .env.example                   # NEW: VITE_VIEWER_URL=http://localhost:3000
├── package.json                   # + devDeps @testing-library/react, @testing-library/dom
├── tsconfig.app.json              # include + `paths` alias @bridge-contract → bridge messages.ts (R11)
├── eslint.config.js               # + @typescript-eslint/no-import-type-side-effects (R11)
├── vite.config.ts                 # + test.setupFiles (RTL cleanup)
└── src/
    ├── App.tsx                    # reads StudyLink + viewer address; invalid → alert, valid → StudyView
    ├── App.css                    # two-column full-height layout
    ├── index.css                  # drop Vite template #root sizing/centering
    ├── App.test.tsx               # scenario-level tests (mapping above)
    ├── test-setup.ts              # NEW: RTL cleanup after each test
    ├── components/
    │   ├── StudyView.tsx          # NEW: valid-link screen; owns the iframe ref + useViewerStatus
    │   ├── ViewerFrame.tsx        # iframe + loading/error overlays + Try again
    │   └── ScoringForm.tsx        # form panel: waiting / placeholder / unavailable
    └── lib/
        ├── studyLink.ts (+ .test) # NEW: parse/validate StudyInstanceUIDs (R8)
        ├── viewerLink.ts (+ .test)# NEW: VITE_VIEWER_URL → viewer origin + link (R9)
        ├── bridge.ts (+ .test)    # isBridgeEventMessage guard + subscribe with origin/source filter (R6)
        ├── viewerStatus.ts (+ .test) # reducer, timer constants, useViewerStatus hook (R7)
        └── logger.ts (+ .test)    # NEW: leveled structured logger; debug off in prod

apps/viewer/extensions/bridge/     # only OHIF-side change
├── package.json                   # + peerDep @cornerstonejs/core, + test:unit / test:unit:ci
├── jest.config.js                 # NEW: copied from extensions/default
├── babel.config.js                # NEW: copied from extensions/default
└── src/
    ├── index.ts (+ .test)         # onModeEnter / onModeExit wiring
    ├── id.ts
    ├── messages.ts                # NEW: the message contract, single source of truth (R11)
    ├── postToHost.ts (+ .test)    # NEW: framed check, allowlisted origins
    └── watchStudy.ts (+ .test)    # NEW: existence check + first-render detection

README.md                          # updated per Principle V
```

**Structure Decision**:
- **Scoring app:** keeps its existing flat `src/components` + `src/lib` layout, with tests next
  to the modules they cover.
- **Viewer:** all changes stay inside the already-registered `@spsoft-mvp/extension-bridge`. No OHIF
  mode, route or config file changes, which keeps upstream merges clean.
- **Contract:** lives only in the bridge (`src/messages.ts`). The parent repo already depends on
  the fork (it pins it as a submodule), so the scoring app reads the contract through the
  submodule. The fork never depends on the parent. A contract change lands through a fork PR
  and reaches the scoring app with the submodule bump (R11).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Viewer bridge tested with Jest and installed with pnpm, not Vitest/npm (Technology Constraints) | The bridge lives in the OHIF pnpm workspace, whose build and test toolchain is Jest/babel | A separate Vitest setup inside an OHIF extension would fight the workspace's module resolution and babel config. The README already records the "viewer keeps upstream toolchain" decision. |
| Bridge repeats OHIF's study search (one extra QIDO request per open) | OHIF emits no event for "study not found" or "source unreachable" (R4) | Patching `Mode.tsx` diverges from upstream. Watching `/notfoundstudy` can't tell the two failures apart. |
| Host origins allowlist hard-coded in the bridge | Messages must not be posted to `'*'` (Principle III) | An OHIF config key would be a config option for a deployment that doesn't exist (Principle II). Revisit when there is a deployment. |

# Research: Study Scoring View

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-09-18

All paths under `apps/viewer/` refer to the OHIF v3.14.0-beta.30 fork (git submodule).

## R1. Which OHIF route/mode serves `/viewer?StudyInstanceUIDs=…`, and does the bridge load there?

- **Decision**: Rely on the existing registration; no mode changes.
- **Rationale**: `/viewer` is the *longitudinal* mode (`modes/longitudinal/src/index.ts:63`
  `routeName: 'viewer'`), not `basic`. `@spsoft-mvp/extension-bridge` is in
  `platform/app/pluginConfig.json:66-67` without `default: false`, so it is registered at app
  start for every mode (`platform/app/src/appInit.js:123`), and longitudinal also inherits it
  through basic's dependency list (`modes/longitudinal/src/index.ts:24`). Extension
  `onModeEnter`/`onModeExit` run for every registered extension regardless of mode
  (`platform/core/src/extensions/ExtensionManager.ts:168-196`).
- **Alternatives considered**: Adding a dedicated `spsoft-mvp` mode — rejected (Principle II; more
  fork divergence for no user-visible gain).

## R2. Where in OHIF can the bridge run code?

- **Decision**: `onModeEnter` starts watching the study, and `onModeExit` removes the study
  listeners. `preRegistration` stays a no-op.
- **Rationale**:
  - `onModeEnter` for extensions runs *before* the mode's own `onModeEnter` and before
    `defaultRouteInit` (`platform/app/src/routes/Mode/Mode.tsx:234,314,367`). So subscriptions
    made there see every study-load event.
  - `onModeEnter` has `servicesManager` and `extensionManager`, and cornerstone's services are
    registered at app start, before any mode is entered (`pluginConfig.json` order,
    `ExtensionManager.ts:223-242`).
  - Nothing in this feature needs to run earlier. An app-level `ready` announcement and
    heartbeat were considered and dropped (R7).
- **Alternatives considered**: Top-level module code — rejected, no access to services.

## R3. What signal means "the study is on screen"?

- **Decision**: The first cornerstone `IMAGE_RENDERED` event on any viewport element whose
  `detail.viewportStatus !== 'preRender'`, after `onModeEnter`. The bridge listens for
  cornerstone's `ELEMENT_ENABLED` on `eventTarget` (both from `@cornerstonejs/core`). For each
  enabled element it attaches a one-shot `IMAGE_RENDERED` listener, and it posts `studyLoaded`
  once.
- **Rationale**:
  - This is exactly how OHIF itself times "first image". `eventTarget` gets an
    `ELEMENT_ENABLED` listener (`extensions/cornerstone/src/init.tsx:354`), which calls
    `initViewTiming` to attach the `IMAGE_RENDERED` listener
    (`extensions/cornerstone/src/utils/initViewTiming.ts:36-48`).
  - Attaching when the element is enabled means the listener exists before anything can be
    drawn on that element.
  - Extension `onModeEnter` runs before the viewport grid enables any element (R2), so no
    element is missed.
- **Consequence**: `@cornerstonejs/core` (already in the workspace at 5.10.3 via
  `extensions/cornerstone`) becomes a peer dependency of the bridge, for `eventTarget` and the
  `Enums.Events` constants. No new package is installed.
- **Alternatives considered**:
  - `ViewportGridService` `VIEWPORTS_READY`: rejected, because it fires before pixels are
    drawn. `ViewportGrid.tsx:289` marks a viewport ready in `onElementEnabled`, and the grid
    publishes the event once all viewports with content are enabled (`ViewportGrid.tsx:143-148`),
    before any image is loaded. It would report "loaded" next to an empty viewer, would hide the
    slow warning on slow networks, and fires again on every layout change.
  - Attaching the render listener on `CornerstoneViewportService` `VIEWPORT_DATA_CHANGED` (the
    first draft of this plan): rejected. It is broadcast after data is bound
    (`CornerstoneViewportService.ts:611`), which leaves a window where the first render could
    be missed.
  - `DISPLAY_SETS_ADDED`: rejected, because it fires on metadata and would report "loaded"
    before anything is drawn (violates the spec's "study is shown").
  - Listening on `document` for the event: rejected, because cornerstone dispatches on the
    element and bubbling is not guaranteed.

## R4. How does the viewer report failures (study not found, source unreachable, no images)?

- **Finding**: OHIF exposes no failure event. For an unknown UID, `validateStudies`
  (`Mode.tsx:148-174`) gets an empty search result and navigates to `/notfoundstudy`; for an
  unreachable server the search throws and it navigates to the same route. A study with no
  displayable series makes `applyHangingProtocol` return early (`defaultRouteInit.ts:39-41`):
  empty viewer, no error, no event.
- **Decision**: In `onModeEnter` the bridge runs its own existence check with the same call
  OHIF uses in `validateStudies` — the active data source's `query.studies.search` for the
  UID from the page's `StudyInstanceUIDs` parameter:
  - search throws → post `studyLoadFailed` with `reason: 'sourceUnreachable'`;
  - search returns no match → post `studyLoadFailed` with `reason: 'notFound'`;
  - match → nothing to post; wait for R3's first render.

  The result must be posted even if OHIF has already redirected to `/notfoundstudy` (which
  fires `onModeExit`), so the search is not cancelled by `onModeExit`.
  "No viewable images" and "source hangs without failing" are not detected as failures; the
  host shows its "taking longer than it should" warning after 10 s (R7).
- **Rationale**: Gives the doctor distinct, accurate messages for the two common failures
  without patching OHIF's route code. One duplicate QIDO request per study open is negligible
  against the images being fetched.
- **Alternatives considered**:
  - Patch `Mode.tsx` to emit an event — rejected: increases fork divergence (README decision
    "bridge extension instead of forking OHIF's application code").
  - Detect `/notfoundstudy` in `onModeExit` via `location.pathname` — rejected: cannot tell
    "not found" from "unreachable", relies on an unverified ordering.
  - `appConfig.httpErrorHandler` — rejected: global to all requests, and whether
    `dicomweb-client` calls it on network errors is unverified.
  - Detect "no displayable series" in the bridge — rejected for now (Principle II): no event
    exists; the slow warning (R7) is shown instead. Recorded in README Known limitations.

## R5. Can the viewer be framed by the scoring app?

- **Decision**: Yes, in development and `vite preview`; no header changes needed.
- **Rationale**: The rspack dev server (`platform/app/.webpack/webpack.pwa.js:148-191`) sets no
  `X-Frame-Options`, CSP `frame-ancestors`, COOP or COEP. Only deploy recipes do
  (`netlify.toml:24` `X-Frame-Options: DENY`) — out of scope, recorded in README.

## R6. postMessage security on both sides

- **Decision**:
  - **Viewer → host**: the bridge posts only when framed (`window.parent !== window`), and
    only to an explicit allowlist of host origins — `http://localhost:5173` (dev) and
    `http://localhost:4173` (`vite preview`) — by calling `parent.postMessage(msg, origin)` for
    each; the browser drops deliveries whose origin does not match. Never `'*'`.
  - **Host ← viewer**: the host accepts a message only if `event.origin` equals the configured
    viewer origin **and** `event.source` is the iframe's `contentWindow`, and the data passes a
    runtime type guard for `BridgeEventMessage`. Anything else is ignored (logged at `debug`).
  - The study UID in `studyLoaded`/`studyLoadFailed` must equal the UID the host requested;
    mismatches are ignored and logged at `warn`.
- **Rationale**: Principle III — messages are untrusted input; TypeScript types are not
  validation. The allowlist is a constant in the bridge because the project only runs locally
  (Principle II: no config option for a hypothetical deployment).
- **Alternatives considered**: `targetOrigin '*'` — rejected (leaks events to any embedder);
  deriving the target from `document.referrer` — rejected (can be stripped by referrer
  policy); an OHIF app-config key for the allowlist — deferred until there is a deployment.

## R7. Slow loads, and a viewer that stops responding; timing values

- **Amended 2026-09-19, after implementation**: the host-side timer and its visible "This is
  taking longer than it should." warning, below, were removed. Opening the viewer directly
  (`http://localhost:3000/viewer?StudyInstanceUIDs=…`) and watching it confirmed OHIF shows
  nothing at all while a study loads — no spinner, no text, a plain black viewport for over a
  second on the sample CT study — so there was no existing OHIF state for a slow-load warning to
  sit next to; it was a message the host invented from nothing. The product owner decided that
  duplicating loading/failure feedback the viewer doesn't have is out of scope (spec §User Story
  2, revised). The reasoning below (no timeout-based failure, no heartbeat) is kept as the record
  of why a *timeout-driven failure* was rejected even when a warning existed; with the warning
  gone, there is no timer left to time out with. What is unaffected: the bridge's own existence
  check (R4) still posts `studyLoadFailed`, and the form panel still reflects loading vs. loaded
  vs. failed — only the host-added UI *over the viewer column* is gone.
- **Original decision**: One host-side timer, a constant in `viewerStatus.ts`.

  | Timer | Value | Starts | When it fires |
  | --- | --- | --- | --- |
  | Slow warning | 10 s | iframe mounted (and again on Retry) | if the study is not yet `loaded`, set the `slow` flag. The state doesn't change and loading continues |

  - **Slowness is never a failure.** There is no ready timeout and no study-load timeout. Hard
    failures come only from the viewer (`studyLoadFailed`, R4).
  - **The `slow` flag** shows one warning, "This is taking longer than it should." It offers no
    action, and it clears as soon as the study is `loaded`.
  - **A viewer that stops responding after loading is not detected** (see below).
- **Rationale**:
  - **Why no timeout failure:** a slow viewer, a slow image source, a hanging image source, a
    viewer that isn't running, and a study with no viewable images all look the same from the
    host: nothing arrives. A timeout can't tell these apart.
  - **The warning is honest in every one of those cases**, and it never reports a failure that
    would disappear with more waiting. OHIF's first dev-server load is heavy, so a hard
    10-second timeout would give false failures.
  - **SC-003 is still met.** The doctor sees a readable message within 10 s: the warning, or a
    real error from R4, which arrives well within 10 s for "not found" and "connection
    refused".
- **Trade-off**: If the viewer isn't running at all, or the study has no images, the doctor gets
  the generic warning rather than a specific cause. This is recorded in README Known
  limitations.
- **Why there is no heartbeat** (dropped by the product owner). A viewer-to-host "I'm alive"
  message every few seconds was designed and then rejected, because in this setup it catches
  almost nothing:
  - **Stopping the viewer's dev server:** the already-loaded page keeps running, since its
    code is in the browser and the images come from the public source. Not detected.
  - **OHIF crashing to its error screen:** the bridge's timer runs outside React and keeps
    firing. Not detected.
  - **A frozen viewer:** `localhost:3000` and `localhost:5173` are the same site, so browsers
    usually run both in one process on one main thread. A frozen viewer freezes the host too,
    so it couldn't show a message anyway.
  - **The iframe navigating to another site:** heartbeats would stop, but nothing in this
    feature causes that.

  Its cost was a timer on each side plus a hidden-tab workaround, since browsers throttle
  timers in background tabs. Not detecting a viewer that breaks after loading is recorded in
  spec Assumptions and README Known limitations.
- **Alternatives considered**:
  - **Ready and load timeouts that fail** (the first draft of this plan): rejected by the
    product owner in favour of a warning. Slowness shouldn't read as failure.
  - **A warning with a "Try again" button**: rejected by the product owner, who wants a simple
    warning. Reloading the page already works as a retry (FR-009).
  - **Heartbeat, or a host→viewer ping/pong:** rejected, see above.

## R8. Validating the study identifier from the scoring app's link

- **Decision**: Read `StudyInstanceUIDs` from the scoring app's own query string (same name as
  the viewer's parameter, so the doctor-facing link mirrors the viewer link). Valid when
  non-empty, at most 64 characters, and matching `^[0-9]+(\.[0-9]+)+$` (digits in
  dot-separated components). Missing/empty → `missing`; anything else (including a
  comma-separated list) → `malformed`. The value is passed to the viewer link through
  `URLSearchParams`, never string-concatenated.
- **Rationale**: Principle III boundary validation; DICOM PS3.5 §9.1 UID character set and
  length. Leading zeros inside components are tolerated because real archives contain them.
  Checked against the public source's 81 studies: all UIDs pass.
- **Alternatives considered**: Strict PS3.5 (no leading zeros) — rejected, would reject some
  real studies; accepting any string — rejected, the value ends up in another app's URL.

## R9. Viewer URL configuration in the scoring app

- **Decision**: `VITE_VIEWER_URL` (default `http://localhost:3000`), documented in a new
  `apps/scoring-form/.env.example`. Parsed once with `new URL()`; must be `http:` or `https:`.
  Its `origin` is also the origin the host accepts messages from (R6).
  - An invalid value is caught when the page starts. It is logged at `error`, and the page shows
    the "viewer is not configured" alert with no iframe
    ([contracts/scoring-app-ui.md](contracts/scoring-app-ui.md)), never a blank page
    (Principle IV).
- **Rationale**: The viewer's address differs between setups; it is not a secret, so a
  `VITE_` variable is allowed (Principle III forbids only secrets there).
- **Alternatives considered**: Hard-coded constant — rejected: the README documents running
  the viewer elsewhere (e.g. production build ports).

## R10. Testing approach

- **Decision**:
  - **Scoring app** (Vitest 5 + jsdom, already configured): pure unit tests for link parsing,
    the message guard, and the status state machine (fake timers); component tests with
    `@testing-library/react` that render `App` and drive it by dispatching `MessageEvent`s with
    the right `origin` and `source: iframe.contentWindow`.
  - **Viewer bridge** (Jest, upstream toolchain): add `jest.config.js` + `babel.config.js`
    copied from `extensions/default`, and `test:unit:ci`; unit-test the posting, the existence
    check and the first-render detection with fake services. Run with
    `pnpm --filter @spsoft-mvp/extension-bridge run test:unit:ci`.
  - **End-to-end**: manual, via [quickstart.md](quickstart.md). No Playwright: both apps plus
    the public image source would be needed in CI, and every scenario's logic is covered by
    the tests above; only pixel layout ("both visible without scrolling") is checked by eye.
- **Dev dependencies**: `@testing-library/react` and its peer `@testing-library/dom` (dev only;
  hand-rolling render/query helpers around `react-dom/client` + `act` would reimplement them).
  No `@testing-library/jest-dom` or `user-event`: plain assertions and `fireEvent` suffice.
- **Alternatives considered**: Vitest for the bridge — rejected: the bridge lives in OHIF's
  pnpm workspace whose toolchain is Jest (README decision).

## R11. The message contract: shape and location

- **Decision (shape)**: `BridgeEventMessage` becomes a discriminated union of exactly the events
  this feature uses, `studyLoaded` and `studyLoadFailed`, each with its own typed payload.
  The speculative event names (`ready`, `layoutChanged`, `measurement*`,
  `activeViewportChanged`, `commandError`) and `BridgeCommandMessage` are removed, because
  nothing sends them yet.
- **Decision (location)**: the contract exists **once**, in the fork, at
  `apps/viewer/extensions/bridge/src/messages.ts`. The parent repo's `shared/` folder is deleted.
  - The bridge imports it relatively (`./messages`).
  - The scoring app imports it as `@bridge-contract`: a `paths` alias in
    `apps/scoring-form/tsconfig.app.json` for `tsc`, and a matching `resolve.alias` in
    `vite.config.ts` for Vite and Vitest, both pointing into the submodule.
  - The file has no imports, because two toolchains compile it: the fork's babel and the
    scoring app's Vite and `tsc`.
  - **Amended after review (constitution 1.1.0, "Enums" rule):** the file was first types only,
    imported with `import type` so Vite never had to resolve the alias. That left each app
    repeating the values as string literals. It now also exports TypeScript enums for every
    value (`BridgeSource`, `BridgeMessageType`, `BridgeEvent`, `StudyLoadFailureReason`) and
    the `StudyInstanceUIDs` parameter name, which both apps import at runtime. The scoring app's
    `tsconfig` drops `erasableSyntaxOnly`, which rejects `enum`, and its Vite dev server is
    allowed to serve the contract file from outside the app.
- **Rationale**:
  - Principle II: the contract describes what exists, and the discriminated union lets the
    host's type guard and `switch` be exhaustive. Each future feature adds what it uses.
  - One copy cannot drift.
  - The dependency direction already exists: the parent pins the fork as a submodule, while the
    fork must build and be reviewed on its own, so it cannot depend on the parent.
  - A contract change lands through a fork PR first, then reaches the scoring app in the
    submodule-bump commit. That commit changes the contract and the scoring app's view of it
    together, and the scoring app's `tsc` fails there if they no longer match.
  - Cost: the scoring app's typecheck and build need the viewer submodule checked out. They do
    not need it installed or running. The README already requires `--recurse-submodules`.
- **Alternatives considered**:
  - Keep the boilerplate names and add new ones: rejected, because it leaves unused surface,
    and `payload?: unknown` pushes all narrowing to call sites.
  - A hand-synced copy in `shared/` and in the bridge (the first draft of this plan): rejected
    by the product owner in favour of one copy.
  - A tiny package inside the bridge (`contract/package.json`) consumed with a `file:`
    dependency: gives a real package name, but adds a manifest and lockfile entry for one file.
    The path alias does the same job with less.
  - A separate published or git-dependency package: a third repo plus versioning and releases
    for about 20 lines (Principle II).
  - The fork importing the parent's `shared/` by relative path: builds, because type imports
    are removed, but the fork would no longer typecheck on its own. Rejected because it inverts
    the dependency.

## R12. Sample data for validation

From the public source (`https://d14fa38qiwhyfd.cloudfront.net/dicomweb/studies`, 81 studies,
queried 2026-09-18):

| Use | StudyInstanceUID | Description |
| --- | --- | --- |
| Happy path | `1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5` | DFCI CT CHEST W CONTRAST, 381 instances |
| Small/fast | `1.2.840.113619.2.30.1.1762295590.1623.978668949.886` | CHEST CT, 7 instances |
| Not found | `1.2.3.4.5.6.7.8.9` | valid format, absent from the source |
| No viewable images (candidate) | `1.3.76.13.65829.2.20130125082826.1072139.2` | ECG waveform, 1 instance — verify in quickstart |

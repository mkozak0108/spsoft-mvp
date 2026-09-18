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
  `detail.viewportStatus !== 'preRender'`, after `onModeEnter`. The bridge attaches a one-shot
  listener to each viewport element announced by `CornerstoneViewportService`
  `VIEWPORT_DATA_CHANGED`, and posts `studyLoaded` once.
- **Rationale**: This is what OHIF itself uses to time "first image"
  (`extensions/cornerstone/src/utils/initViewTiming.ts:36-48`, hooked from `init.tsx:333-336`).
  Earlier events do not mean pixels are visible: `DISPLAY_SETS_ADDED` fires on metadata,
  `VIEWPORTS_READY` on enabled elements (`ViewportGridService.ts:14,140`), and
  `VIEWPORT_DATA_CHANGED` when data is bound but not drawn (`CornerstoneViewportService.ts:611`).
- **Consequence**: `@cornerstonejs/core` (already in the workspace at 5.10.3 via
  `extensions/cornerstone`) becomes a peer dependency of the bridge, for the `Enums.Events`
  constant. No new package is installed.
- **Alternatives considered**: `DISPLAY_SETS_ADDED` — rejected, would report "loaded" before
  anything is drawn (violates the spec's "study is shown"). Listening on `document` for the
  event — rejected, cornerstone dispatches on the element and bubbling is not guaranteed.

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

- **Decision**: One host-side timer, a constant in `viewerStatus.ts`.

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

## R11. Contract changes (`shared/bridge-messages.ts`)

- **Decision**: Rewrite `BridgeEventMessage` as a discriminated union of exactly the events
  this feature uses — `studyLoaded` and `studyLoadFailed` — each with its own typed payload.
  Remove the speculative event names (`ready`, `layoutChanged`, `measurement*`,
  `activeViewportChanged`, `commandError`) and `BridgeCommandMessage`, which nothing sends yet.
  The viewer's hand-kept copy lives in `extensions/bridge/src/messages.ts`.
- **Rationale**: Principle II — the contract should describe what exists; a discriminated union
  lets the host's type guard and `switch` be exhaustive. Each future feature adds what it uses.
- **Alternatives considered**: Keep the boilerplate names and add new ones — rejected: unused
  surface, and `payload?: unknown` pushes all narrowing to call sites.

## R12. Sample data for validation

From the public source (`https://d14fa38qiwhyfd.cloudfront.net/dicomweb/studies`, 81 studies,
queried 2026-09-18):

| Use | StudyInstanceUID | Description |
| --- | --- | --- |
| Happy path | `1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5` | DFCI CT CHEST W CONTRAST, 381 instances |
| Small/fast | `1.2.840.113619.2.30.1.1762295590.1623.978668949.886` | CHEST CT, 7 instances |
| Not found | `1.2.3.4.5.6.7.8.9` | valid format, absent from the source |
| No viewable images (candidate) | `1.3.76.13.65829.2.20130125082826.1072139.2` | ECG waveform, 1 instance — verify in quickstart |

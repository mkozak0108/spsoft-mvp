# spsoft-mvp

Two independent browser apps, built as a take-home assignment:

- **Medical Research Viewer** (`apps/viewer/`): a fork of
  [OHIF Viewers](https://github.com/OHIF/Viewers) with one custom extension,
  `@spsoft-mvp/extension-bridge` (`apps/viewer/extensions/bridge/`). Over `window.postMessage`, it
  tells the page embedding the viewer when the study is on screen, or why it failed to load.
- **Scoring Form** (`apps/scoring-form/`): a React + Vite app that the doctor opens with a link
  naming one study. It shows that study in the viewer on the left (in an `<iframe>`) and the
  scoring form panel on the right, with loading and error states driven by the bridge's events.

Each app is its own package, with its own dependencies, lockfile, scripts and tests, and its own
package manager (`apps/viewer` is a pnpm workspace inherited from upstream OHIF; `apps/scoring-form`
is a plain npm package). The only thing they share is the bridge's message contract: one file in
the viewer's bridge extension (`apps/viewer/extensions/bridge/src/messages.ts`) with the message
types and their enums, which the scoring app imports through the submodule. There is no backend or database, and
no account or API key is needed.

> Not a medical device and not for clinical use. Use only synthetic or de-identified data.

## Run it from scratch (git clone → working screen)

### Prerequisites

| Tool    | Version                                     | Needed for                | Check            |
| ------- | -------------------------------------------- | -------------------------- | ---------------- |
| Git     | any recent version                           | both apps                  | `git --version`  |
| Node.js | 22 or newer for `scoring-form`, 24+ for `viewer` (an LTS release is advised) | both apps | `node -v`         |
| npm     | 10 or newer (ships with Node.js 22)          | `apps/scoring-form`        | `npm -v`          |
| pnpm    | 11 or newer                                  | `apps/viewer` (OHIF fork)  | `pnpm -v`         |

### 1. Get the code

`apps/viewer` is a git submodule pointing at a fork of OHIF Viewers, so clone with
`--recurse-submodules`:

```bash
git clone --recurse-submodules https://github.com/mkozak0108/spsoft-mvp.git
cd spsoft-mvp
```

Already have a plain clone? Pull the submodule in separately:

```bash
git submodule update --init --recursive
```

### 2. Medical Research Viewer

From the repo root. The first `pnpm install` pulls the full OHIF monorepo's dependencies and
takes a while.

```bash
cd apps/viewer
pnpm install
pnpm dev
```

Open http://localhost:3000 to check it's up: you should see OHIF's study list. You don't need to
use it directly; the scoring app embeds it.

Run `pnpm` from inside `apps/viewer`: the fork pins its version (`packageManager` in its
`package.json`), and Corepack only uses that pin from there.

### 3. Scoring Form

In a second terminal, from the repo root:

```bash
cd apps/scoring-form
npm ci        # install this app's dependencies
npm run dev   # start the dev server
```

Open a study with a link that names its StudyInstanceUID:

```text
http://localhost:5173/?StudyInstanceUIDs=<study identifier>
```

For example, a chest CT from the viewer's public sample image source:

http://localhost:5173/?StudyInstanceUIDs=1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5

You should see the right panel say "Waiting for the study to load…", then within a few seconds
the CT images on the left and the "Scoring form" panel on the right, saying "Scoring is not
available yet." Reloading the page reopens the same study. To score another study, open another
link; there is no study list.

The scoring app finds the viewer through `VITE_VIEWER_URL`, which defaults to
`http://localhost:3000`, as documented in
[`apps/scoring-form/.env.example`](apps/scoring-form/.env.example). To change it, copy that file
to `apps/scoring-form/.env.local` (git-ignored), edit the value and restart the dev server. It
isn't a secret, since every `VITE_` variable ends up in the browser bundle. Its origin is also the
only origin the scoring app accepts bridge messages from.

### Production build

Run these inside the app's folder:

```bash
npm run build     # builds the app into dist/
npm run preview   # serves the build on :4173
```

(`apps/viewer` follows upstream OHIF's own build process — see `apps/viewer/README.md`.)

## Checks

Run these inside `apps/scoring-form/`. Before anything is merged to `main`, all four must pass:

| Command             | What it does                            |
| ------------------- | ---------------------------------------- |
| `npm test`          | Vitest unit and UI tests                 |
| `npm run typecheck` | `tsc -b` in strict mode                  |
| `npm run lint`      | ESLint, including the `no-console` rule  |
| `npm run build`     | Production build                         |

The bridge's message contract lives in the fork (`apps/viewer/extensions/bridge/src/messages.ts`),
so the scoring app's typecheck, tests, build and dev server need the `apps/viewer` submodule
checked out (not installed or running).
A contract change goes through a fork PR first, then a submodule bump in this repo; re-run the
checks in the bump commit.

`apps/viewer` is a fork of upstream OHIF and keeps upstream's own toolchain (Jest, upstream
ESLint config) rather than this project's, so its checks aren't part of this table. The bridge
extension has its own Jest tests. Run them from `apps/viewer`:

```bash
pnpm --filter @spsoft-mvp/extension-bridge run test:unit:ci
```

## Project structure

```text
apps/
  viewer/         Medical Research Viewer: OHIF Viewers fork (git submodule, pnpm workspace)
    extensions/
      bridge/     @spsoft-mvp/extension-bridge — the viewer's half of the postMessage bridge
  scoring-form/   Scoring Form: host app, iframes the viewer (own package.json and lockfile)
specs/            feature specs, plans and task lists (Spec Kit)
.specify/         Spec Kit config and the project constitution
```

## How it was built

The project is spec-driven, using [GitHub Spec Kit](https://github.com/github/spec-kit).
Each feature goes through spec, plan, tasks and implementation, and its documents live under
`specs/`. The engineering rules (test-first, no secrets in the bundle, visible loading and
error states) are in the [constitution](.specify/memory/constitution.md). This initial
boilerplate — the viewer fork, the bridge extension skeleton, and the scoring-form scaffold —
was set up directly, ahead of the first `/speckit-specify` feature. The first feature, the study
scoring view, is in [`specs/001-study-scoring-view/`](specs/001-study-scoring-view/).

## Key decisions and trade-offs

- **OHIF fork as a git submodule.** `apps/viewer` tracks a fork
  ([mkozak0108/Viewers](https://github.com/mkozak0108/Viewers)) as a submodule rather than
  vendoring its source into this repo. Keeps OHIF's own history and lets upstream updates be
  pulled in with normal git commands. The trade-off: a fresh clone needs
  `--recurse-submodules` (or a follow-up `git submodule update --init`), and the fork must exist
  on GitHub independently of this repo.
- **A bridge extension instead of forking OHIF's application code.** `apps/viewer` stays as
  close to upstream as possible; the only OHIF-side changes are one new extension package
  (`extensions/bridge/`), its two registration lines in `pluginConfig.json` and `modes/basic`,
  and its entry in `pnpm-lock.yaml`. This keeps future `git fetch upstream && git merge` in the fork low-conflict.
- **Two fully separate apps, separate package managers.** Each can be installed and run without
  the other. `apps/viewer` keeps pnpm (required by upstream OHIF); `apps/scoring-form` uses npm,
  per this project's own constitution. The trade-off is two toolchains in one repo instead of
  one.
- **One contract file, owned by the bridge.** The postMessage contract exists once, in
  `apps/viewer/extensions/bridge/src/messages.ts`: the message types plus an enum for every value
  in them, so neither app spells out an event name or reason as a string. It has no imports,
  because two toolchains compile it: the fork's babel and the scoring app's Vite and `tsc`. The
  bridge imports it directly. The scoring app imports it as `@bridge-contract`, an alias into the
  submodule in both `tsconfig.app.json` and `vite.config.ts`. The dependency direction already
  existed (this repo pins the fork, while the fork must build on its own), and one copy can't
  drift. A contract change lands through a fork PR, then reaches the scoring app with the
  submodule bump, where `tsc` and the tests fail if the two no longer match. The trade-offs: the
  scoring app needs the viewer submodule checked out (not installed or running) for every
  command, and its `tsconfig` drops `erasableSyntaxOnly`, which rejects `enum`.
- **Client-side only.** There is no server to deploy or configure. The trade-off is that
  data stays in the browser and is not shared between users or devices.
- **The bridge checks that the study exists itself.** OHIF emits no event when a study can't be
  found or the image source can't be reached; it just redirects to `/notfoundstudy`. So on mode
  entry the bridge runs the same study search OHIF does, and posts `notFound` or
  `sourceUnreachable` to the host. The trade-off is one extra study search request per open, which
  is small next to the images themselves. Patching OHIF's route code instead would diverge the
  fork from upstream. *(Revised 2026-09-19)* The scoring app no longer shows a message or button
  for this itself — see "No loading or failure UI over the viewer", below — it only uses the
  event to flip the form panel to unavailable, and logs the reason for diagnosis.
- **Messages are checked on both ends.** The scoring app accepts a bridge message only when it
  comes from the `VITE_VIEWER_URL` origin, from the current viewer iframe's window, passes a
  runtime shape check, and names the study that was requested. Anything else is ignored and
  logged without its contents. The viewer posts only when it is framed, only to an allowlist of
  host origins, and never to `'*'`. The allowlist is a constant in the bridge rather than a config
  option, because the project only runs locally.
- **No loading or failure UI over the viewer (added 2026-09-19).** The scoring app used to layer
  its own "Loading study…" status, a 10-second "taking longer than it should" warning, and a
  plain-language alert with "Try again" over the viewer column. Opening the viewer directly
  (bypassing the scoring app) showed that OHIF itself renders nothing at all while a study loads,
  and a generic, reason-agnostic message with a dead "study list" link on failure. Given that,
  duplicating feedback OHIF doesn't have, or patching around feedback it does have but gets
  wrong, was judged more than this feature needs. The viewer column now shows only the iframe;
  whatever OHIF renders inside it is shown as-is. The form panel — the app's own UI, not layered
  on the viewer — still shows a waiting or unavailable state from the same bridge messages, so
  the doctor still knows loading from failed; retrying a failure means reloading the page
  (FR-009), not an in-app button. There is no heartbeat either. In this setup, a viewer that
  breaks after loading keeps running the bridge's code, or freezes the scoring app along with it,
  so a heartbeat would catch almost nothing.

## Left out on purpose

- **Scoring fields and saving.** The form panel only marks where scoring will happen. Scoring
  fields, submitting and saving scores come in a later feature.
- **Patient and study details.** The form panel doesn't identify the open study.
- **A study list.** The doctor opens one study per link; there is no browsing or search.
- **Interaction between the form and the images**, such as measurements.
- **A phone layout.** Narrow desktop windows scroll sideways instead.

## Known limitations

- Not validated for clinical use.
- `apps/viewer`'s dependency install is large and slow (full OHIF monorepo); there's no way
  around that short of vendoring a stripped-down copy.
- The scoring app adds no loading indicator, failure message or retry control of its own over
  the viewer (2026-09-19). A viewer that isn't running, a study with no viewable images, and a
  slow image source all leave the form panel on "Waiting for the study to load…" indefinitely,
  with nothing shown to explain why; the viewer column shows whatever OHIF itself renders (empty
  while loading). Reloading the page is the only way to try again.
- A found-but-unreachable study and a genuinely missing one look the same to the doctor: the
  form panel says "Scoring is unavailable." either way, and the viewer shows OHIF's own generic
  "not available" message for both. The specific reason is only in the console log.
- A viewer that breaks after the study has loaded is not detected.
- The host origins the bridge posts to are hard-coded in
  `apps/viewer/extensions/bridge/src/postToHost.ts`: `http://localhost:5173` (dev) and
  `http://localhost:4173` (`npm run preview`). Serving the scoring app from anywhere else needs
  that list changed in the fork. Because the bridge posts to both, the viewer's console shows a
  "target origin … does not match" warning for the one that isn't the current host. The browser
  drops that delivery by design.
- The fork's `netlify.toml` sets `X-Frame-Options: DENY`, so a viewer deployed with that recipe
  can't be embedded.
- The public sample set's ECG study (`1.3.76.13.65829.2.20130125082826.1072139.2`) was checked
  as a "no viewable images" case. OHIF draws it as a waveform, which counts as the study being on
  screen, so it loads normally. No sample study was found that shows the warning-only case.
- Some sample studies contain series in JPEG transfer syntaxes this OHIF version can't decode
  (for example `1.2.840.113619.2.30.1.1762295590.1623.978668949.886`). Under `pnpm dev` the viewer
  shows its dev server's red error overlay for them, which can be closed. Other series still
  display.

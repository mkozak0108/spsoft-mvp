# spsoft-mvp

Two independent browser apps, built as a take-home assignment:

- **Medical Research Viewer** (`apps/viewer/`): a fork of
  [OHIF Viewers](https://github.com/OHIF/Viewers) with one custom extension,
  `@spsoft-mvp/extension-bridge` (`apps/viewer/extensions/bridge/`). Over `window.postMessage`, it
  talks to the page that embeds it.
- **Scoring Form** (`apps/scoring-form/`): a React + Vite app that the doctor opens with a link
  naming one study. It shows that study in the viewer on the left (in an `<iframe>`) and the
  scoring form panel on the right, with loading and error states driven by the bridge's events.
  Once the study is on screen, the panel is a measurement form with a total area.

How the two apps talk, the key decisions, what was left out and the known limitations are in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

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

You should see the CT images on the left and, after a few seconds, the measurement form on the
right: **Add measurement**, **Activate** the new row, then draw one ellipse on the image and the
row shows its area. If the viewer was already running from an earlier version, restart it and
reload the scoring app's tab.

The scoring app reads only the `?StudyInstanceUIDs=` query string, never its own path, so
`http://localhost:5173/viewer?StudyInstanceUIDs=<uid>` opens the same screen. That `/viewer` is
on the scoring app's own origin (`:5173`) and is a different thing from the *embedded* viewer's
`/viewer?StudyInstanceUIDs=<uid>` on `VITE_VIEWER_URL` (`:3000` by default) — they only share a
path name.

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
| `npm run typecheck` | `tsc -b` in strict mode                  |
| `npm run lint`      | ESLint, including the `no-console` rule  |
| `npm test`          | Vitest unit tests                        |
| `npm run build`     | Production build                         |

The unit tests cover the area total (`computeAreaTotals`). The rest is checked by hand against
each feature's `specs/*/quickstart.md`.

The bridge's message contract lives in the fork (`apps/viewer/extensions/bridge/src/messages.ts`),
so the scoring app's typecheck, build and dev server need the `apps/viewer` submodule checked
out (not installed or running).
A contract change goes through a fork PR first, then a submodule bump in this repo; re-run the
checks in the bump commit.

`apps/viewer` is a fork of upstream OHIF and keeps upstream's own toolchain (Jest, upstream
ESLint config) rather than this project's, so its checks aren't part of this table. The bridge
extension keeps its Jest setup for whenever tests are added back; right now
`pnpm --filter @spsoft-mvp/extension-bridge run test:unit:ci` (run from `apps/viewer`) also
reports no tests found.

## Project structure

```text
apps/
  viewer/         Medical Research Viewer: OHIF Viewers fork (git submodule, pnpm workspace)
    extensions/
      bridge/     @spsoft-mvp/extension-bridge — the viewer's half of the postMessage bridge
  scoring-form/   Scoring Form: host app, iframes the viewer (own package.json and lockfile)
ARCHITECTURE.md   the bridge's messages, rules and flow, for reviewers
specs/            feature specs, plans and task lists (Spec Kit)
.specify/         Spec Kit config and the project constitution
```

## How it was built

Spec-driven with [GitHub Spec Kit](https://github.com/github/spec-kit): each feature's spec, plan
and tasks are under `specs/`, and the engineering rules are in the
[constitution](.specify/memory/constitution.md).

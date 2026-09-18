# spsoft-mvp

Two independent browser apps, built as a take-home assignment:

- **Medical Research Viewer** (`apps/viewer/`): a fork of
  [OHIF Viewers](https://github.com/OHIF/Viewers), embedded via a custom `@spsoft-mvp/extension-bridge`
  extension (`apps/viewer/extensions/bridge/`) that accepts commands from outside the viewer and
  publishes viewer events back out, over `window.postMessage`.
- **Scoring Form** (`apps/scoring-form/`): a React + Vite app that embeds the viewer in an
  `<iframe>` and renders a scoring form next to it, talking to the viewer through the same
  bridge.

Each app is its own package, with its own dependencies, lockfile, scripts and tests, and its own
package manager (`apps/viewer` is a pnpm workspace inherited from upstream OHIF; `apps/scoring-form`
is a plain npm package). The only thing they share is a set of TypeScript types in `shared/`,
starting with the bridge's message contract. There is no backend or database, and no account or
API key is needed.

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

Open http://localhost:3000. You should see: _the start screen, from the spec_.

### 3. Scoring Form

In a second terminal, from the repo root:

```bash
cd apps/scoring-form
npm ci        # install this app's dependencies
npm run dev   # start the dev server
```

Open http://localhost:5173. Right now this is an empty scaffold — `ViewerFrame` and
`ScoringForm` (`src/components/`) and the bridge client (`src/lib/bridge.ts`) are unimplemented
stubs, not wired into the page yet.

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

Right now `npm test` fails with "no test files found" — there's nothing to test yet. That's
expected until the first feature adds tests alongside its implementation (Principle I).

If you change anything in `shared/`, re-run the checks, since a type change can break the app —
and check whether the corresponding types in `apps/viewer/extensions/bridge/` still match (see
that extension's README).

`apps/viewer` is a fork of upstream OHIF and keeps upstream's own toolchain (Jest, upstream
ESLint config) rather than this project's; those checks aren't part of this table.

## Project structure

```text
apps/
  viewer/         Medical Research Viewer: OHIF Viewers fork (git submodule, pnpm workspace)
    extensions/
      bridge/     @spsoft-mvp/extension-bridge — the viewer's half of the postMessage bridge
  scoring-form/   Scoring Form: host app, iframes the viewer (own package.json and lockfile)
shared/           TypeScript types used by both apps (types only, no runtime code)
specs/            feature specs, plans and task lists (Spec Kit)
.specify/         Spec Kit config and the project constitution
```

## How it was built

The project is spec-driven, using [GitHub Spec Kit](https://github.com/github/spec-kit).
Each feature goes through spec, plan, tasks and implementation, and its documents live under
`specs/`. The engineering rules (test-first, no secrets in the bundle, visible loading and
error states) are in the [constitution](.specify/memory/constitution.md). This initial
boilerplate — the viewer fork, the bridge extension skeleton, and the scoring-form scaffold —
was set up directly, ahead of the first `/speckit-specify` feature.

## Key decisions and trade-offs

- **OHIF fork as a git submodule.** `apps/viewer` tracks a fork
  ([mkozak0108/Viewers](https://github.com/mkozak0108/Viewers)) as a submodule rather than
  vendoring its source into this repo. Keeps OHIF's own history and lets upstream updates be
  pulled in with normal git commands. The trade-off: a fresh clone needs
  `--recurse-submodules` (or a follow-up `git submodule update --init`), and the fork must exist
  on GitHub independently of this repo.
- **A bridge extension instead of forking OHIF's application code.** `apps/viewer` stays as
  close to upstream as possible; the only OHIF-side changes are one new extension package
  (`extensions/bridge/`) and its two registration lines in `pluginConfig.json` and
  `modes/basic`. This keeps future `git fetch upstream && git merge` in the fork low-conflict.
- **Two fully separate apps, separate package managers.** Each can be installed and run without
  the other. `apps/viewer` keeps pnpm (required by upstream OHIF); `apps/scoring-form` uses npm,
  per this project's own constitution. The trade-off is two toolchains in one repo instead of
  one.
- **Shared types, not shared code.** Both apps describe the same postMessage contract, so its
  types are written once in `shared/bridge-messages.ts`. `apps/viewer`'s bridge extension can't
  import it (different package manager, different repo), so its copy will need to be kept in
  sync by hand once both sides are implemented.
- **Client-side only.** There is no server to deploy or configure. The trade-off is that
  data stays in the browser and is not shared between users or devices.
- _More entries will be added as features land._

## Left out on purpose

- Nothing is implemented yet: `ViewerFrame`, `ScoringForm`, `lib/bridge.ts`, and the viewer's
  `@spsoft-mvp/extension-bridge` are all unimplemented stubs. This commit is boilerplate only — repo
  layout, tooling, and the two apps installing/building/running empty — not a feature.
- _Every scope cut will be listed here as it is made, once features start landing._

## Known limitations

- Not validated for clinical use.
- `apps/viewer`'s dependency install is large and slow (full OHIF monorepo); there's no way
  around that short of vendoring a stripped-down copy.
- _More entries will be added as features land._

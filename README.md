# spsoft-mvp

Two independent browser apps, built as a take-home assignment:

- **Medical Research Viewer** (`apps/viewer/`): _one-line summary, taken from its spec_
- **Scoring Form** (`apps/scoring-form/`): _one-line summary, taken from its spec_

Each app is its own npm package, with its own dependencies, lockfile, scripts and tests. The
only thing they share is a set of TypeScript types in `shared/`. Both are client-side
TypeScript apps built with Vite. There is no backend or database, and no account or API key
is needed.

> Not a medical device and not for clinical use. Use only synthetic or de-identified data.

## Run it from scratch (git clone → working screen)

### Prerequisites

| Tool    | Version                                 | Check           |
| ------- | --------------------------------------- | --------------- |
| Git     | any recent version                      | `git --version` |
| Node.js | 22 or newer (an LTS release is advised) | `node -v`       |
| npm     | 10 or newer (ships with Node.js 22)     | `npm -v`        |

### 1. Get the code

```bash
git clone https://github.com/mkozak0108/spsoft-mvp.git
cd spsoft-mvp
```

### 2. Medical Research Viewer

From the repo root:

```bash
cd apps/viewer
npm ci        # install this app's dependencies
npm run dev   # start the dev server
```

Open http://localhost:5173. You should see: _the start screen, from the spec_.

### 3. Scoring Form

In a second terminal, from the repo root:

```bash
cd apps/scoring-form
npm ci        # install this app's dependencies
npm run dev   # start the dev server
```

Open http://localhost:5174. You should see: _the start screen, from the spec_.

### Production build

Run these inside the app's folder:

```bash
npm run build     # builds the app into dist/
npm run preview   # serves the build: viewer on :4173, scoring form on :4174
```

## Checks

Run these inside each app's folder. Before anything is merged to `main`, all four must pass
in both apps:

| Command             | What it does                            |
| ------------------- | --------------------------------------- |
| `npm test`          | Vitest unit and UI tests                |
| `npm run typecheck` | `tsc --noEmit` in strict mode           |
| `npm run lint`      | ESLint, including the `no-console` rule |
| `npm run build`     | Production build                        |

If you change anything in `shared/`, run the checks in both apps, since a type change can break
either one.

## Project structure

```text
apps/
  viewer/         Medical Research Viewer (its own package.json and lockfile)
  scoring-form/   Scoring Form (its own package.json and lockfile)
shared/           TypeScript types used by both apps (types only, no runtime code)
specs/            feature specs, plans and task lists (Spec Kit)
.specify/         Spec Kit config and the project constitution
```

## How it was built

The project is spec-driven, using [GitHub Spec Kit](https://github.com/github/spec-kit).
Each feature goes through spec, plan, tasks and implementation, and its documents live under
`specs/`. The engineering rules (test-first, no secrets in the bundle, visible loading and
error states) are in the [constitution](.specify/memory/constitution.md).

## Key decisions and trade-offs

- **Two fully separate apps.** Each can be installed, run, tested and built without the
  other, and nothing couples their dependencies or release. The trade-off is some duplicated
  tooling config (Vite, TypeScript, ESLint, Vitest), and each app is installed on its own.
- **Shared types, not shared code.** Both apps describe the same data, so its types are
  written once in `shared/`. Types disappear at build time, so the apps stay independent at
  runtime and `shared/` needs no build step. The trade-off is that the apps are coupled at
  compile time: a type change must pass the checks in both.
- **Client-side only.** There is no server to deploy or configure. The trade-off is that
  data stays in the browser and is not shared between users or devices.
- _More entries will be added as features land._

## Left out on purpose

_Every scope cut will be listed here as it is made._

## Known limitations

- Not validated for clinical use.
- _More entries will be added as features land._

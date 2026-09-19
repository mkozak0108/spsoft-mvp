# spsoft-mvp Constitution

## Core Principles

### I. Simplicity / YAGNI

- Build only what the current spec's user stories require. No speculative features, config
  options, extension points or abstractions for hypothetical future needs.
- Prefer the platform and the standard library over dependencies. Every runtime dependency
  MUST be justified in `plan.md`: what it provides and why writing it by hand is worse.
- Introduce an abstraction only when it has at least two concrete call sites.
- Keep the file structure flat and obvious. Prefer fewer, cohesive modules over deep
  hierarchies.
- Any deviation MUST be recorded in the plan's Complexity Tracking table, with the simpler
  alternative that was rejected.

**Rationale**: Reviewers read every line. Less code means less to review, less to break and
a clearer signal of judgment.

### II. Security & Privacy by Default

- Everything shipped to the browser is public. Secrets, API keys and tokens MUST NOT appear in
  source, in `VITE_`-prefixed environment variables or in the built bundle.
- `.env*` files containing values MUST be git-ignored. A committed `.env.example` MUST document
  every required variable with placeholder values.
- Untrusted data (user input, URL parameters, browser storage, API responses) MUST be validated
  or narrowed at the boundary before use. TypeScript types alone are not validation.
- Untrusted content MUST NOT be rendered as HTML (`innerHTML`, `dangerouslySetInnerHTML`,
  `v-html` or equivalents) unless it is sanitized and the exception is justified in `plan.md`.
- Personal data MUST be kept to the minimum a feature needs. It MUST NOT appear in logs, error
  messages or URLs. Storing it persistently in the browser MUST be justified in `plan.md`.
- `npm audit --omit=dev` MUST report no high or critical vulnerabilities at delivery.

**Rationale**: Security mistakes in a client-side app are cheap to make and fully visible to
anyone who opens DevTools, reviewers included.

### III. Observability

- Errors MUST NOT be swallowed. Every `catch` either recovers visibly for the user, or logs
  and rethrows.
- All logging MUST go through a single logger module with levels (`debug`, `info`, `warn`,
  `error`) and structured context objects. Direct `console.*` calls outside that module are
  forbidden and MUST be blocked by the linter (`no-console`).
- Every async or failure-prone user flow MUST have explicit loading, empty and error states
  that the user can see.
- `debug` output MUST be silenced in production builds.
- Log content MUST obey Principle II: no secrets and no personal data.

**Rationale**: Reviewers run the app and try to break it. Failures must be visible to the user
and diagnosable from the console, not silent.

### IV. Reviewer-Ready Delivery

- A fresh clone MUST work using only documented commands: `npm ci`, then `npm run dev` and
  `npm run build`. No undocumented global tools or manual setup steps.
- `README.md` MUST cover: what the app does, how to run and test it, key decisions and
  trade-offs, what was deliberately left out, and known limitations.
- Scope cuts MUST be recorded explicitly in the README rather than left as silent gaps.
- `main` MUST always be in a runnable, demonstrable state.

**Rationale**: The first few minutes of a review decide its outcome. An unreproducible setup
or unexplained gaps outweigh good code.

## Technology Constraints

- **Language**: TypeScript with `"strict": true`. Any use of `any` MUST carry an inline
  comment explaining why. `tsc --noEmit` MUST pass.
- **Build tool / dev server**: Vite. The UI framework, or none, is chosen in `/speckit-plan`
  and justified under Principle I.
- **Test runner**: Vitest, sharing the Vite config, with a DOM environment for UI tests, for
  whenever automated tests are written again (see Development Workflow & Quality Gates — none
  are written right now). Browser-level end-to-end tooling (e.g. Playwright) is added only when
  a user story cannot be verified otherwise.
- **Linting**: ESLint, configured with at least the `no-console` rule required by
  Principle III.
- **Runtime & packages**: Node.js LTS, pinned via `engines` in `package.json`. npm is the
  package manager, with `package-lock.json` committed.
- **Architecture**: a client-side Vite application. Adding a backend, database or third-party
  service MUST be required by a spec and justified in `plan.md`.
- **Comments**: comments explain *why*, never *what*; the code states what it does. A comment
  is allowed only when it says something the code can't: a constraint, a trade-off, a
  non-obvious reason, or an outside behaviour the code relies on. Comments that restate the code
  next to them MUST NOT be written, and existing ones are removed when that code is touched. Doc
  comments on exported APIs follow the same rule: they state the contract or the reason, not a
  paraphrase of the signature.
- **Enums**: domain values and discriminants (statuses, event names, reasons, modes, kinds)
  MUST be TypeScript `enum`s and MUST be referenced through the enum everywhere, tests
  included. Repeating their values as string literals is forbidden. User-facing copy and log
  messages stay plain text. Values shared by the two apps are defined once, in the bridge
  message contract, and both apps import them from there.

## Development Workflow & Quality Gates

- Features follow the Spec Kit flow: `/speckit-specify` → `/speckit-clarify` (when the spec has
  open questions) → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` →
  `/speckit-implement`. Specs describe *what* and *why*. Plans describe *how*.
- Every `plan.md` MUST evaluate Principles I–IV as explicit gates in its Constitution Check,
  both before research and again after design.
- **No automated tests are written, for any feature, until the product owner explicitly lifts
  this in a future amendment.** This is a standing pause on testing project-wide, not a
  per-feature choice: `tasks.md` MUST NOT include test tasks, and `plan.md` needs no
  Complexity Tracking entry to justify skipping them. Automated testing is expected to return
  as its own, separate feature.
- Before any merge to `main` and before delivery, these MUST all pass: `npm run typecheck`,
  `npm run lint` and `npm run build`.
- Commits MUST be small and focused, with imperative-mood messages. The git log is part of the
  deliverable and SHOULD read as a coherent story.

## Governance

- This constitution supersedes all other practices and conventions in this repository. Where
  agent runtime guidance (e.g. `CLAUDE.md`) or any other document conflicts with it, the
  constitution wins, and the conflicting document MUST be corrected.
- **Amendments** are made only through `/speckit-constitution`. Each amendment MUST bump the
  version, update the Last Amended date and be reviewed with its Sync Impact Report before it
  is committed. In-flight plans MUST be re-checked against the amended principles.
- **Versioning** follows semantic versioning. MAJOR: a principle is removed or redefined in a
  backward-incompatible way. MINOR: a principle or section is added, or guidance is
  materially expanded. PATCH: clarifications and wording fixes with no change in meaning.
- **Compliance**: `/speckit-plan` enforces the Constitution Check gate, and `/speckit-analyze`
  reports any constitution conflict as CRITICAL. A violation of any principle (I–IV) may
  proceed only with a justified entry in the plan's Complexity Tracking table; the testing
  pause in Development Workflow & Quality Gates is a standing exception and needs no such entry.

**Version**: 3.0.0 | **Ratified**: 2026-09-18 | **Last Amended**: 2026-09-19

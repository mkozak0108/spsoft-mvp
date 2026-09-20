# Architecture

Two browser apps that share nothing but a set of `window.postMessage` messages.

- **Scoring Form** (`apps/scoring-form/`, React + Vite) is the host page. It embeds the viewer in
  an `<iframe>` and shows the measurement form beside it.
- **Medical Research Viewer** (`apps/viewer/`, an OHIF fork) runs inside the iframe. Its
  `@spsoft-mvp/extension-bridge` extension (`apps/viewer/extensions/bridge/`) is the viewer's half
  of the bridge.

**`apps/viewer/extensions/bridge/src/messages.ts` is the source of truth for every message.**
This document describes it and can fall behind it; when they disagree, the file is right. Both
apps import its enums, and neither writes an event, command or tool name as a string. Both
build their messages with `buildEvent` / `buildCommand` from `buildMessages.ts`, next to it (the
scoring app imports it as `@bridge-builders`), so the envelope is written once. Detailed
rules and their reasons are in
[`specs/003-add-area-measurements/contracts/bridge-messages.md`](specs/003-add-area-measurements/contracts/bridge-messages.md)
and, for `MEASUREMENT_UPDATED`,
[`specs/004-live-measurement-update/contracts/bridge-messages.md`](specs/004-live-measurement-update/contracts/bridge-messages.md).

## Flow: adding a measurement

```text
Scoring app (host)                                  Viewer (iframe)
──────────────────                                  ───────────────
                       ◄── STUDY_LOADED ──────────  first image rendered
                       ◄── VIEWER_READY ──────────  tool groups exist, commands work
"Add measurement"  →  row appears, Pending
"Activate"         →  row Drawing…
                       ── ACTIVATE_TOOL ─────────►  remembers rowId, enables the Ellipse tool
                                                    doctor draws the ellipse
                       ◄── MEASUREMENT_ADDED ─────  { rowId, area, unit }
row Done, total updates                             switches back to Pan
"Cancel" instead   →  row Pending
                       ── DEACTIVATE_TOOL ───────►  clears rowId, switches back to Pan
```

The viewer remembers one pending row. Activating another row replaces it, and the host turns the
previous "Drawing…" row back to "Pending" in the same step, so at most one row is "Drawing…".
Commands are not acknowledged. The viewer only logs a command it cannot act on, and Cancel is the
doctor's way out.

## Flow: a finished row follows its ellipse

```text
Scoring app (host)                                  Viewer (iframe)
──────────────────                                  ───────────────
                                                    on MEASUREMENT_ADDED, links the ellipse's
                                                    uid to rowId
                                                    doctor drags a handle
                       ◄── MEASUREMENT_UPDATED ───  { rowId, change: AreaChanged, area, unit }
row value and total                                 about every 100 ms, and once after release
                                                    part of the ellipse leaves the image
                       ◄── MEASUREMENT_UPDATED ───  { rowId, change: AreaUnavailable }
row shows "No area", left out of the total
                                                    doctor deletes the ellipse
                       ◄── MEASUREMENT_REMOVED ───  { rowId }
row removed, total recalculated                     forgets the link
```

Only ellipses reported with `MEASUREMENT_ADDED` are linked, so an ellipse still being drawn, one
drawn from the viewer's own toolbar, or one brought back by undo after it was deleted never
reaches the form. An edit is reported only when the area or unit actually changed.

## Envelope

Every message is a plain object. The host and the viewer each send their own kind:

| Direction | `source` | `type` | `version` | Name field |
| --- | --- | --- | --- | --- |
| viewer → host | `BridgeSource.Viewer` | `BridgeMessageType.Event` | `BridgeVersion.V1` | `event` |
| host → viewer | `BridgeSource.Host` | `BridgeMessageType.Command` | `BridgeVersion.V1` | `command` |

Each message also carries a `payload`, described below.

## Viewer → host (events)

| `event` | `payload` | Sent when |
| --- | --- | --- |
| `STUDY_LOADED` | `StudyInstanceUID: string` | the first image is rendered |
| `STUDY_LOAD_FAILED` | `StudyInstanceUID: string`, `reason: StudyLoadFailureReason` (`notFound` or `sourceUnreachable`) | the bridge's own study search found nothing or threw |
| `VIEWER_READY` | `StudyInstanceUID: string` | right after `STUDY_LOADED`; never after a failure |
| `MEASUREMENT_ADDED` | `StudyInstanceUID: string`, `rowId: string`, `area: number`, `unit: string` | an ellipse drawn for the pending row is finished, once per activation |
| `MEASUREMENT_UPDATED` | `StudyInstanceUID: string`, `rowId: string`, `change: MeasurementChange.AreaChanged`, `area: number`, `unit: string` | the area or unit of a linked ellipse changed: during a drag, and once more with the final area after it |
| | `StudyInstanceUID: string`, `rowId: string`, `change: MeasurementChange.AreaUnavailable` | a linked ellipse lost its area (part of it is off the image); the next `AreaChanged` restores it |
| `MEASUREMENT_REMOVED` | `StudyInstanceUID: string`, `rowId: string` | a linked ellipse was deleted, singly or as part of a bulk delete; the last message for that row |

`MEASUREMENT_REMOVED` carries the same name as the viewer's own removal event, so both sides read
the same way. A bulk delete is reported as one message per linked row.

## Host → viewer (commands)

| `command` | `payload` | Viewer does |
| --- | --- | --- |
| `ACTIVATE_TOOL` | `rowId: string`, `tool: BridgeTool` (`EllipticalROI`) | remembers `rowId` as the pending row and enables the tool for the primary mouse button |
| `DEACTIVATE_TOOL` | `rowId: string` | if `rowId` is the pending row: clears it and returns to Pan. Otherwise ignores it |

## Why every message carries a version

The two apps are built and shipped separately and share only these messages. If a payload changed
on one side, a receiver with no version would have to guess from the message's shape. A message
that still looks valid would then be misread without any error, and the form would show a wrong
number. With `version`, a receiver refuses what it does not understand and logs why.

- A receiver accepts only `BridgeVersion.V1`, and checks it before the payload.
- Anything else is dropped, changes nothing, and is logged at `warn` without its contents.
- Adding an optional field stays V1, since receivers ignore extra fields. Anything that would
  make a V1 receiver misread a message needs `V2`.
- `MEASUREMENT_UPDATED` and `MEASUREMENT_REMOVED` were added under V1 for the same reason: a form
  built before them rejects an unknown event and logs a `warn`, and no existing message changed.

## Receiver rules

A message is used only if all of these hold; otherwise it is ignored and logged.

**Host** (viewer → host):

1. `event.origin` is the origin of `VITE_VIEWER_URL` (else `debug`).
2. `event.source` is the viewer iframe's window (else `debug`).
3. `version` is `V1` (else `warn`).
4. The payload passes a runtime check: ids are non-empty strings, `area` is a finite number ≥ 0,
   `unit` is a non-empty string of at most 16 characters, and `MEASUREMENT_UPDATED`'s `change` is a
   known `MeasurementChange`, with `area` and `unit` required for `AreaChanged` (else `warn`).
5. `StudyInstanceUID` is the requested study (else `warn`).

A `MEASUREMENT_ADDED` naming no row, or a row that is not "Drawing…", changes nothing and is
logged at `warn`. So does a `MEASUREMENT_UPDATED` or `MEASUREMENT_REMOVED` naming no row, or a row
that is not "Done".

**Viewer** (host → viewer):

1. `event.origin` is in the host allowlist, `http://localhost:5173` or `:4173` (else `debug`).
2. `event.source` is `window.parent` (else `debug`).
3. `version` is `V1` (else `warn`).
4. The message passes a runtime check: a known `command`, `rowId` a non-empty string of at most
   64 characters, and for `ACTIVATE_TOOL` a known `tool` (else `warn`).

A wrong origin or window is other pages' traffic, so it is logged at `debug`, which production
silences. Once both match, the sender is the other app and any rejection is worth seeing. Neither
level logs the message data. Senders never post to `'*'`: the host targets the viewer's exact
origin, and the viewer posts to each allowed host origin.

## Where the state lives

The scoring app keeps the measurement rows in memory (`apps/scoring-form/src/lib/measurements.ts`):
a pure reducer plus one hook. The area total is derived on render from the finished rows that
have a value, never stored. Each row keeps the number it was created with, so removing a row
renames none of the others. The viewer keeps the one pending `rowId`, and a map from each linked
ellipse's measurement uid to its `rowId` and the last area it reported. Nothing is saved:
reloading the page starts with no rows.

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
  submodule bump, where `tsc` fails if the two no longer match. The trade-offs: the
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

- **A two-way contract with a version on every message.** The bridge grew from viewer → host
  events to host → viewer commands (`ACTIVATE_TOOL`, `DEACTIVATE_TOOL`), and every message now
  carries `version: 1`. The two apps ship separately, so a receiver that could not tell versions
  apart would misread a changed payload without any error and show a wrong number. Now it
  refuses what it does not understand and logs why. The rules and the payloads are in
  the sections above.
- **A deletion has its own event, `MEASUREMENT_REMOVED`.** It is a different fact from a new area,
  and it carries the name the viewer's own measurement service uses, so the two sides read alike.
  `MEASUREMENT_UPDATED` keeps the two area cases, told apart by `change`. It was first built with
  a third `change: Removed` case, on the belief that the event names were fixed; once that turned
  out to be wrong (2026-09-20), the removal moved to its own name rather than leaving one message
  meaning two things. `area: null` as the signal was rejected outright: one field with two
  meanings, where a missing check reads a removal as zero.
- **The ellipse's id stays in the viewer.** The viewer maps OHIF's measurement uid to the row id
  the host gave it, so the host keeps knowing rows only by its own ids and nothing about OHIF's
  ids is on the wire or needs validating.
- **The live pace is cornerstone's.** It recomputes an ellipse's area at most every 100 ms during
  a drag and once more after it stops, so the row keeps up and ends on the final value with no
  throttle of ours. OHIF also fires its update event on every mouse move with the previous area,
  and on selection, lock or visibility changes; the bridge sends only when the area or unit
  changed.
- **"No area" rather than a stale number.** When part of an ellipse leaves the image, cornerstone
  computes no area and the viewer shows none. The row says "No area" and drops out of the total
  until the ellipse is back, instead of keeping a number the image no longer supports.
- **`VIEWER_READY` is separate from `STUDY_LOADED`.** They arrive together today. "Ready" means
  the viewer's tool groups exist and commands work, which is the earliest the first rendered
  image guarantees, so it gates the **Activate** buttons.
- **Pan is the tool the viewer returns to.** After a finished or cancelled drawing the bridge
  switches the viewer to Pan, so a stray drag can't draw a second ellipse. The trade-off is that
  whatever tool was active before (for example window/level) is not restored.
- **`measurementTrackingMode: 'none'` in the fork's `dev.js` and `default.js`.** OHIF's default
  opens a "track measurements?" modal on the first measurement, which would stop the flow, and
  nothing here is saved or tracked. It is the only fork change outside `extensions/bridge/`, and
  a supported config key. `dev.js` is what `pnpm dev` serves, so both files carry it.
- **A row's value is rounded to one decimal when stored,** so the total is the sum of the numbers
  the doctor sees.

## Left out on purpose

- **Scoring fields and saving.** The form panel only marks where scoring will happen. Scoring
  fields, submitting and saving scores come in a later feature.
- **Patient and study details.** The form panel doesn't identify the open study.
- **A study list.** The doctor opens one study per link; there is no browsing or search.
- **Removing a row or changing its value from the form.** Rows follow their ellipse: editing or
  deleting it in the viewer is the only way. Drawing shapes other than one ellipse per row is
  also left out.
- **Persistence.** Measurements live in the page's memory; reloading starts over.
- **A phone layout.** Narrow desktop windows scroll sideways instead.

## Known limitations

- **No automated tests right now (2026-09-19).** Feature 001 was built test-first and had a full
  suite; it was removed once the product owner paused all testing project-wide (constitution
  v3.0.0), until they explicitly lift it. Automated testing is expected to return as its own,
  separate feature. Until then, behavior is verified only by hand, against the quickstart
  scenarios recorded in each feature's own `specs/*/quickstart.md`.
- Not validated for clinical use.
- Commands are not acknowledged. If the viewer can't start a drawing, or finishes an ellipse with
  no area, it only logs the problem: the row stays "Drawing…" and **Cancel** is the way out. No
  error is shown to the doctor (a deviation from the constitution's visible-error-state rule,
  recorded in `specs/003-add-area-measurements/plan.md`).
- After a measurement the viewer is on Pan, not on the tool that was active before.
- The total adds finished rows per unit and shows every sum, for example "Total area: 124.5 mm² +
  30.0 px²", since areas in different units are not comparable. Mixed units were not seen in the
  running app: the sample study has one calibration throughout, and no public study with mixed
  calibration was found. The grouping itself is a pure function and was checked on its own.
- The viewer's own toolbar still works. An ellipse the doctor draws from it, with no row
  activated, is not reported to the form.
- Undoing a deletion in the viewer brings the ellipse back but not its row: the ellipse then
  belongs to no row. Undo right after drawing counts as a deletion and removes the row.
- A deletion while a new ellipse is half drawn (click, move, then Backspace) makes OHIF finish that
  ellipse, which then fills the "Drawing…" row.
- After the viewer reloads, finished rows keep their values but can no longer be edited, since
  their ellipses are gone.
- The viewer's own area text is rounded by significant figures (no decimals at 100 and above), so
  it can differ from the row's one decimal in the last digit, e.g. "125 mm²" next to "124.5 mm²".
- With measurement tracking off, the measurements panel's header "Delete" only offers to untrack
  the study and changes nothing. A bulk delete that does happen is reported row by row; it was not
  seen in the running app.
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

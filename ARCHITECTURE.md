# Architecture

Two browser apps that share nothing but a set of `window.postMessage` messages.

- **Scoring Form** (`apps/scoring-form/`, React + Vite) is the host page. It embeds the viewer in
  an `<iframe>` and shows the measurement form beside it.
- **Medical Research Viewer** (`apps/viewer/`, an OHIF fork) runs inside the iframe. Its
  `@spsoft-mvp/extension-bridge` extension (`apps/viewer/extensions/bridge/`) is the viewer's half
  of the bridge.

**`apps/viewer/extensions/bridge/src/messages.ts` is the source of truth for every message.**
This document describes it and can fall behind it; when they disagree, the file is right. Both
apps import its enums, and neither writes an event, command or tool name as a string. Detailed
rules and their reasons are in
[`specs/003-add-area-measurements/contracts/bridge-messages.md`](specs/003-add-area-measurements/contracts/bridge-messages.md).

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

`MEASUREMENT_UPDATED` is a **reserved name** for editing a finished measurement (the starred
task 5.1). It has no payload and no message type, so neither app sends or accepts it yet.

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

## Receiver rules

A message is used only if all of these hold; otherwise it is ignored and logged.

**Host** (viewer → host):

1. `event.origin` is the origin of `VITE_VIEWER_URL` (else `debug`).
2. `event.source` is the viewer iframe's window (else `debug`).
3. `version` is `V1` (else `warn`).
4. The payload passes a runtime check: ids are non-empty strings, `area` is a finite number ≥ 0,
   `unit` is a non-empty string of at most 16 characters (else `warn`).
5. `StudyInstanceUID` is the requested study (else `warn`).

A `MEASUREMENT_ADDED` naming no row, or a row that is not "Drawing…", changes nothing and is
logged at `warn`.

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
a pure reducer plus one hook. The area total is derived on render from the finished rows, never
stored. The viewer keeps only the one pending `rowId`. Nothing is saved: reloading the page
starts with no rows.

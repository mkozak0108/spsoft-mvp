# Contract: Bridge messages, version 1

**Transport**: `window.postMessage`, in both directions between the viewer (in an iframe) and the
scoring app (its parent window).

**Source of truth**: `apps/viewer/extensions/bridge/src/messages.ts`, in the fork; the only
copy. This file extends the contract of
[feature 001](../../001-study-scoring-view/contracts/bridge-messages.md) (which it supersedes
where they differ) and is published for reviewers in `ARCHITECTURE.md` at the repository root.

- The bridge imports it as `./messages`; the scoring app as `@bridge-contract`.
- The file has no imports; both apps reference the enums and never the string values.
- A change lands through a fork PR, then reaches the scoring app with the submodule bump.

## Envelope

Every message, either way, is a plain object with these four fields plus the name:

```ts
// viewer → host
{ source: BridgeSource.Viewer; type: BridgeMessageType.Event;   version: BridgeVersion.V1; event: BridgeEvent;     payload: … }
// host → viewer
{ source: BridgeSource.Host;   type: BridgeMessageType.Command; version: BridgeVersion.V1; command: BridgeCommand; payload: … }
```

## Version

`version` is `BridgeVersion.V1` (the number `1`) on every message. Why it exists: the two apps
are built and shipped separately and share only these messages. If a payload changes on one side,
a receiver without a version would have to guess from the shape, and a message that still looks
valid would be misread without any error, giving a wrong number in the form. With it, the receiver
refuses what it does not understand and logs why.

- A receiver accepts only `version === BridgeVersion.V1`, checked before the payload.
- A message with any other version is dropped, changes nothing, and is logged at `warn`
  (the fact only, never the payload).
- Adding an optional field is allowed in V1 (receivers ignore extras). Anything that would make a
  V1 receiver misread a message needs `V2`.

## Viewer → host (events)

| `event` | `payload` | Sent when |
| --- | --- | --- |
| `STUDY_LOADED` | `{ StudyInstanceUID: string }` | the first non-`preRender` `IMAGE_RENDERED` after mode entry (unchanged from 001) |
| `STUDY_LOAD_FAILED` | `{ StudyInstanceUID: string; reason: StudyLoadFailureReason }` | the bridge's own study search found nothing or threw (unchanged from 001) |
| `VIEWER_READY` | `{ StudyInstanceUID: string }` | right after `STUDY_LOADED`, from the same signal: tool groups exist and commands work. Sent again after a viewer reload |
| `MEASUREMENT_ADDED` | `{ StudyInstanceUID: string; rowId: string; area: number; unit: string }` | an ellipse drawn for the pending row is finished. `area` in `unit`, e.g. `124.5` / `mm²`. Sent once per activation |
| `MEASUREMENT_UPDATED` | *not defined* | **name reserved** for starred task 5.1. The viewer never sends it in this feature; a host that receives it ignores it and logs it |

At most one of `STUDY_LOADED` / `STUDY_LOAD_FAILED` is sent per mode entry. `VIEWER_READY`
is sent only after `STUDY_LOADED`, never after `STUDY_LOAD_FAILED`.

`unit` is text passed through from the viewer, not an enum: the set is open (`mm²`, `px²`).

## Host → viewer (commands)

| `command` | `payload` | Viewer does |
| --- | --- | --- |
| `ACTIVATE_TOOL` | `{ rowId: string; tool: BridgeTool }` | remembers `rowId` as the single pending activation (replacing any earlier one) and enables the tool for the primary mouse button |
| `DEACTIVATE_TOOL` | `{ rowId: string }` | if `rowId` is the pending one: clears it and returns to Pan. Otherwise ignored |

`BridgeTool` has one member today, `EllipticalROI`. An unknown tool makes the command invalid
(dropped, logged).

The viewer does not acknowledge commands. If it cannot act (no tool group), it logs at
`warn`, and the row shows "Drawing…" until the doctor cancels (research R7).

## The enums (shape in `messages.ts`)

```ts
export enum BridgeSource { Viewer = 'spsoft-mvp-viewer', Host = 'spsoft-mvp-host' }
export enum BridgeMessageType { Event = 'event', Command = 'command' }
export enum BridgeVersion { V1 = 1 }
export enum BridgeEvent {
  StudyLoaded = 'STUDY_LOADED',
  StudyLoadFailed = 'STUDY_LOAD_FAILED',
  ViewerReady = 'VIEWER_READY',
  MeasurementAdded = 'MEASUREMENT_ADDED',
  MeasurementUpdated = 'MEASUREMENT_UPDATED', // reserved: no message type in the union yet
}
export enum BridgeCommand { ActivateTool = 'ACTIVATE_TOOL', DeactivateTool = 'DEACTIVATE_TOOL' }
export enum BridgeTool { EllipticalROI = 'EllipticalROI' }
export enum StudyLoadFailureReason { NotFound = 'notFound', SourceUnreachable = 'sourceUnreachable' }
```

`BridgeEventMessage` and a new `BridgeCommandMessage` are discriminated unions over these, one
member per message in the tables above. The `STUDY_LOADED` / `STUDY_LOAD_FAILED` wire values
change from 001's camelCase; both apps change in the same submodule bump.

## Sender rules

- **Viewer**: posts only when framed, to each origin in the `HostOrigin` allowlist, never `'*'`
  (unchanged from 001).
- **Host**: posts only to the viewer iframe's `contentWindow`, with `targetOrigin` set to the
  origin of `VITE_VIEWER_URL`, never `'*'`.

## Receiver rules

A message is accepted only if **all** hold. Otherwise it is ignored and logged, at the level shown.

**Log levels.** A message from the wrong origin or window is other pages' traffic (browser
extensions and other embedders post to the same window), so it is logged at `debug`, which
production builds silence. Once origin and window match, the sender is the other app, and any
rejection is a fault worth seeing in production, so it is logged at `warn`. Neither level ever
includes the message data.

**Host** (viewer → host), as in 001 plus the version:
1. `event.origin === new URL(VITE_VIEWER_URL).origin` (else `debug`)
2. `event.source === iframe.contentWindow` (else `debug`)
3. `event.data.version === BridgeVersion.V1` (else `warn`)
4. `event.data` passes the runtime guard (else `warn`): `source`, `type`, `event` have expected
   values and the payload has the right field types: `StudyInstanceUID` a non-empty string;
   `rowId` a non-empty string; `area` a finite number ≥ 0; `unit` a non-empty string of at most
   16 characters; `reason` a known reason. Extra fields are ignored.
5. `payload.StudyInstanceUID` equals the requested one (else `warn`).

Then, in the measurement state (see [data-model.md](../data-model.md)): a `MEASUREMENT_ADDED` whose
`rowId` names no row, or a row that is not `Drawing`, changes nothing and is logged at `warn`.

**Viewer** (host → viewer):
1. `event.origin` is in the `HostOrigin` allowlist (else `debug`).
2. `event.source === window.parent` (else `debug`).
3. `version` is `V1` (else `warn`).
4. The data passes the guard (else `warn`): `source` Host, `type` Command, a known `command`,
   `rowId` a non-empty string of at most 64 characters, `tool` (for `ACTIVATE_TOOL`) a known
   `BridgeTool`.

Nothing from a payload is ever rendered as HTML; `unit` and `area` are shown as text.

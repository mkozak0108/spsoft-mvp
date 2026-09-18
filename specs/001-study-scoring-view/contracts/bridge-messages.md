# Contract: Bridge messages (viewer → scoring app)

**Transport**: `window.parent.postMessage(message, targetOrigin)`, from the viewer iframe to
the scoring app.

**Source of truth**: `apps/viewer/extensions/bridge/src/messages.ts`, in the fork. This is the
only copy (research R11).
- The bridge imports it as `./messages`.
- The scoring app imports it as `@bridge-contract`, an alias into the submodule in both
  `tsconfig.app.json` and `vite.config.ts`.
- The file has no imports. It exports the message types and an enum for every value in them;
  both apps reference the enums, never the string values.
- A change lands through a fork PR, then reaches the scoring app with the submodule bump. The
  scoring app's `npm run typecheck` in that bump commit is the compatibility check.

## Envelope

Every message is a plain object:

```ts
{ source: BridgeSource.Viewer; type: BridgeMessageType.Event; event: BridgeEvent; payload: <per event> }
```

## Events

| `event` | `payload` | Sent when |
| --- | --- | --- |
| `BridgeEvent.StudyLoaded` | `{ StudyInstanceUID: string }` | the first non-`preRender` `IMAGE_RENDERED` after mode entry |
| `BridgeEvent.StudyLoadFailed` | `{ StudyInstanceUID: string; reason: StudyLoadFailureReason }` | the bridge's own study search returned no match (`NotFound`) or threw (`SourceUnreachable`) |

At most one of these is sent per mode entry, never both.

The shape in `apps/viewer/extensions/bridge/src/messages.ts`:

```ts
export const STUDY_UIDS_PARAM = 'StudyInstanceUIDs';

export enum BridgeSource { Viewer = 'spsoft-mvp-viewer' }
export enum BridgeMessageType { Event = 'event' }
export enum BridgeEvent { StudyLoaded = 'studyLoaded', StudyLoadFailed = 'studyLoadFailed' }
export enum StudyLoadFailureReason { NotFound = 'notFound', SourceUnreachable = 'sourceUnreachable' }

export type BridgeEventMessage =
  | { source: BridgeSource.Viewer; type: BridgeMessageType.Event;
      event: BridgeEvent.StudyLoaded; payload: { StudyInstanceUID: string } }
  | { source: BridgeSource.Viewer; type: BridgeMessageType.Event;
      event: BridgeEvent.StudyLoadFailed;
      payload: { StudyInstanceUID: string; reason: StudyLoadFailureReason } };
```

## Sender rules (viewer)

- Post only when the viewer is framed (`window.parent !== window`).
- Post to each origin in the allowlist `['http://localhost:5173', 'http://localhost:4173']`.
  Never post to `'*'`.
- `StudyInstanceUID` is the value of the viewer page's `StudyInstanceUIDs` parameter.

## Receiver rules (scoring app)

A message is accepted only if **all** of these hold. Otherwise it is ignored and logged at
`debug`.

1. `event.origin === new URL(VITE_VIEWER_URL).origin`
2. `event.source === iframe.contentWindow`. This must be the current iframe, not a previous one
   left over from before a retry.
3. `event.data` passes the runtime guard `isBridgeEventMessage`:
   - `source`, `type` and `event` have the expected values;
   - `payload` is an object;
   - `StudyInstanceUID` is a non-empty string;
   - `reason` is a known reason.

   Extra fields are ignored.

An accepted message whose `StudyInstanceUID` differs from the requested one is ignored and
logged at `warn` (see [data-model.md](../data-model.md)).

## Removed from the boilerplate contract

These are removed because no feature uses them (research R11):
- `BridgeCommandMessage`;
- the event names `ready`, `layoutChanged`, `measurementAdded`, `measurementUpdated`,
  `measurementRemoved`, `activeViewportChanged` and `commandError`.

A future feature re-adds whatever it implements.

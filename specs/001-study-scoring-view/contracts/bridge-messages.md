# Contract: Bridge messages (viewer → scoring app)

**Transport**: `window.parent.postMessage(message, targetOrigin)`, from the viewer iframe to
the scoring app.

**Source of truth**: `apps/viewer/extensions/bridge/src/messages.ts`, in the fork. This is the
only copy (research R11).
- The bridge imports it as `./messages`.
- The scoring app type-imports it as `@bridge-contract`, a `tsconfig.app.json` path alias into
  the submodule.
- The file is types only and has no imports.
- The scoring app imports it only with top-level `import type`.
- A change lands through a fork PR, then reaches the scoring app with the submodule bump. The
  scoring app's `npm run typecheck` in that bump commit is the compatibility check.

## Envelope

Every message is a plain object:

```ts
{ source: 'spsoft-mvp-viewer'; type: 'event'; event: <name>; payload: <per event> }
```

## Events

| `event` | `payload` | Sent when |
| --- | --- | --- |
| `studyLoaded` | `{ StudyInstanceUID: string }` | the first non-`preRender` `IMAGE_RENDERED` after mode entry |
| `studyLoadFailed` | `{ StudyInstanceUID: string; reason: 'notFound' \| 'sourceUnreachable' }` | the bridge's own study search returned no match (`notFound`) or threw (`sourceUnreachable`) |

At most one of these is sent per mode entry, never both.

The type shape to write in `apps/viewer/extensions/bridge/src/messages.ts`:

```ts
export type StudyLoadFailureReason = 'notFound' | 'sourceUnreachable';

export type BridgeEventMessage =
  | { source: 'spsoft-mvp-viewer'; type: 'event'; event: 'studyLoaded';
      payload: { StudyInstanceUID: string } }
  | { source: 'spsoft-mvp-viewer'; type: 'event'; event: 'studyLoadFailed';
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

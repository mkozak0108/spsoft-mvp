# Data Model: Study Scoring View

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Nothing is persisted. All state lives in memory in the scoring app for the lifetime of the page.
The study identifier in the page's own address is the only thing that survives a reload
(FR-009).

## StudyLink (scoring app)

The result of reading the scoring app's own address, derived once on page load.

| Variant | Fields | When |
| --- | --- | --- |
| `valid` | `studyInstanceUid: string` | `StudyInstanceUIDs` is present and well-formed |
| `missing` | — | the parameter is absent or empty |
| `malformed` | — | anything else (bad characters, more than 64 characters, a comma-separated list, …) |

Validation rules are in [research.md § R8](research.md#r8-validating-the-study-identifier-from-the-scoring-apps-link).
When the value is invalid, it is untrusted, so it is never echoed into messages or logs.

## ViewerLink (scoring app)

`<VITE_VIEWER_URL origin>/viewer?StudyInstanceUIDs=<studyInstanceUid>`

- Built only from a `valid` StudyLink, using `URL`/`URLSearchParams`.
- The format is fixed by the product owner (spec Assumptions).
- The origin of `VITE_VIEWER_URL` is also the only origin bridge messages are accepted from.
- If `VITE_VIEWER_URL` is not a valid `http:`/`https:` URL, no ViewerLink is built. The page
  shows the "viewer is not configured" state and never mounts the viewer (research R9).

## Bridge messages (viewer → scoring app)

Defined in [contracts/bridge-messages.md](contracts/bridge-messages.md):
- `studyLoaded { StudyInstanceUID }`
- `studyLoadFailed { StudyInstanceUID, reason }`, with `reason ∈ { notFound, sourceUnreachable }`

## ViewerStatus (scoring app): state machine

This is the single source of truth for both panels. It exists only for a `valid` StudyLink
and a valid viewer address. For `missing` or `malformed`, the page shows the invalid-link state
and never mounts the viewer (FR-007).

```text
      mount iframe
          │
          ▼
   ┌──► loading { slow } ── slow-warning (10 s): slow = true, still loading
   │      │        │
   │  studyLoaded  studyLoadFailed(reason)
   │      ▼        ▼
   │    loaded   failed(reason)
   │               │
   └── retry ◄─────┘   (remount iframe)
```

| State | Meaning | Viewer side (left) | Form panel (right) |
| --- | --- | --- | --- |
| `loading` | iframe mounted, study not yet on screen | iframe + loading indicator (+ slow warning if `slow`) | waiting state |
| `loaded` | first image of the study rendered | iframe | placeholder "Scoring is not available yet", no inputs |
| `failed(notFound)` | the source has no such study | message + Retry, iframe hidden | unavailable state |
| `failed(sourceUnreachable)` | the image source cannot be reached | message + Retry, iframe hidden | unavailable state |

Transition rules:

- **Slow warning:** the 10 s timer is armed on entering `loading`. If it fires while still in
  `loading`, it sets `slow = true` and changes nothing else. The warning offers no action.
  Leaving `loading` clears the timer and the flag.
- **No timeout-based failure:** a viewer that never starts, a study with no viewable images, or
  a source that hangs all stay in `loading` with the slow warning (research R7).
- **Which messages count:** before a message reaches the state machine, the receiver
  (`lib/bridge.ts`) drops any whose `StudyInstanceUID` differs from the requested one, and logs
  that at `warn` ([contracts/bridge-messages.md](contracts/bridge-messages.md)). The state
  machine then honours `studyLoaded` and `studyLoadFailed` only in `loading`. In any other state
  they are expected (e.g. a late failure after the study loaded) and are ignored without a log.
- **Retry:** remounts the iframe with a new React `key`, returning to `loading` with
  `slow = false` and a fresh timer. It is not offered for invalid links.
- **Logging:** every transition, and setting the `slow` flag, is logged at `info` with
  `{ from, to, reason? }`. No patient data.

## Viewer bridge state (viewer)

| Scope | Lives from → to | Holds |
| --- | --- | --- |
| Study | `onModeEnter` → whichever comes first: a message posted, or `onModeExit` | viewport render listeners, an "already posted" flag |

The existence check started in `onModeEnter` is not cancelled by `onModeExit` (research R4). At
most one of `studyLoaded` / `studyLoadFailed` is posted per mode entry.

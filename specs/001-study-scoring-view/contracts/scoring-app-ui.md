# Contract: Scoring app entry link and screen states

## Entry link (doctor-facing)

```text
<scoring app origin>/?StudyInstanceUIDs=<study identifier>
```

e.g. `http://localhost:5173/?StudyInstanceUIDs=1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5`

- Exactly one study identifier; validation per [research.md § R8](../research.md#r8-validating-the-study-identifier-from-the-scoring-apps-link).
- The scoring app embeds `<VITE_VIEWER_URL origin>/viewer?StudyInstanceUIDs=<same identifier>`.
- Reloading the page reopens the same study (FR-009).
- *(Added 2026-09-19)* The scoring app reads only the query string, never its own path — there
  is no router. `<scoring app origin>/viewer?StudyInstanceUIDs=<uid>` works identically to
  `<scoring app origin>/?StudyInstanceUIDs=<uid>`, and so would any other path, in both `npm run
  dev` and `npm run preview` (Vite's SPA fallback serves `index.html` for any unmatched path).
  This is a different origin and a different app from the embedded viewer's own
  `/viewer?StudyInstanceUIDs=<uid>` on `VITE_VIEWER_URL` — the two only share a path name.
  Deploying the scoring app to a static host with no SPA fallback of its own would need an
  explicit rewrite rule for this to keep working; none exists yet (no such host is configured).

## Layout

Two columns filling the viewport height, no page scroll: viewer on the left (the larger share),
form panel on the right (a narrower fixed column). Below a narrow desktop width the panels keep
a minimum width and the page scrolls horizontally rather than hiding either panel (spec edge
case). Phone layout is out of scope.

## Screen states

*(Revised 2026-09-19: the host no longer adds a loading indicator, failure message, retry
button or slow-load warning over the viewer column — see [research.md § R7 (amended)](../research.md#r7-slow-loads-and-a-viewer-that-stops-responding-timing-values)
and [spec.md § User Story 2](../spec.md#user-story-2---the-form-panel-reflects-whether-a-study-is-on-screen-priority-p2).
The viewer column shows only the iframe; whatever OHIF itself renders inside it — nothing while
loading, its own generic message on failure — is shown as-is.)*

The wording below is the contract for tests (matched by role and accessible name / text).
Status messages use `role="status"`; alerts (`role="alert"`) remain only for link/config errors,
which are unrelated to viewer loading.

| State ([data-model.md](../data-model.md)) | Left side | Form panel (region "Scoring form") |
| --- | --- | --- |
| viewer not configured (`VITE_VIEWER_URL` invalid; checked before the link) | alert "The viewer is not configured" / "Set VITE_VIEWER_URL to the viewer's http or https address, then restart the app." — no iframe | "Scoring is unavailable." |
| invalid link: `missing` | alert "No study selected" / "Open this page using a link that includes a study." — no iframe | "Scoring is unavailable." |
| invalid link: `malformed` | alert "This study link is not valid" / "Check the link you were given and try again." — no iframe | "Scoring is unavailable." |
| `loading` | iframe (title "Study viewer"), no host-added status | status "Waiting for the study to load…" |
| `loaded` | iframe | "Scoring is not available yet." — no form controls |
| `failed` (either reason) | iframe (whatever OHIF renders for the failure, e.g. its own `/notfoundstudy` message) | "Scoring is unavailable." |

Messages never include patient data or the raw query-string value.

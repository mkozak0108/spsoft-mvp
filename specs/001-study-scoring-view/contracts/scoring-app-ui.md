# Contract: Scoring app entry link and screen states

## Entry link (doctor-facing)

```text
<scoring app origin>/?StudyInstanceUIDs=<study identifier>
```

e.g. `http://localhost:5173/?StudyInstanceUIDs=1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5`

- Exactly one study identifier; validation per [research.md § R8](../research.md#r8-validating-the-study-identifier-from-the-scoring-apps-link).
- The scoring app embeds `<VITE_VIEWER_URL origin>/viewer?StudyInstanceUIDs=<same identifier>`.
- Reloading the page reopens the same study (FR-009).

## Layout

Two columns filling the viewport height, no page scroll: viewer on the left (the larger share),
form panel on the right (a narrower fixed column). Below a narrow desktop width the panels keep
a minimum width and the page scrolls horizontally rather than hiding either panel (spec edge
case). Phone layout is out of scope.

## Screen states

The wording below is the contract for tests (matched by role and accessible name / text).
Status messages use `role="status"` (loading) or `role="alert"` (errors).

| State ([data-model.md](../data-model.md)) | Left side | Form panel (region "Scoring form") |
| --- | --- | --- |
| viewer not configured (`VITE_VIEWER_URL` invalid; checked before the link) | alert "The viewer is not configured" / "Set VITE_VIEWER_URL to the viewer's http or https address, then restart the app." — no iframe, no "Try again" | "Scoring is unavailable." |
| invalid link: `missing` | alert "No study selected" / "Open this page using a link that includes a study." — no iframe | "Scoring is unavailable." |
| invalid link: `malformed` | alert "This study link is not valid" / "Check the link you were given and try again." — no iframe | "Scoring is unavailable." |
| `loading` | iframe (title "Study viewer") + status "Loading study…" | status "Waiting for the study to load…" |
| `loading` with `slow` | as above, plus the warning "This is taking longer than it should." (in the same `role="status"` region, no button) | status "Waiting for the study to load…" |
| `loaded` | iframe | "Scoring is not available yet." — no form controls |
| `failed(notFound)` | alert "Study not found" / "The image source has no study with this identifier." + button "Try again" | "Scoring is unavailable." |
| `failed(sourceUnreachable)` | alert "Can't reach the image source" / "Check your connection and try again." + button "Try again" | "Scoring is unavailable." |

Messages never include patient data or the raw query-string value.

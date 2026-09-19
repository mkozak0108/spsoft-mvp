# Contract: Measurement form UI

Extends [feature 001's screen states](../../001-study-scoring-view/contracts/scoring-app-ui.md).
The wording below is the contract for checking by role and accessible name / text.

## What changes in the form panel

The panel is still the region named "Scoring form". Its waiting and unavailable states are
unchanged. In the `loaded` state, the placeholder "Scoring is not available yet." is replaced by
the measurement form below.

| Viewer state | Region "Scoring form" shows |
| --- | --- |
| `loading` | status "Waiting for the study to load…" (unchanged) |
| `failed` | "Scoring is unavailable." (unchanged) |
| link / config errors | "Scoring is unavailable." (unchanged) |
| `loaded` | the measurement form |

## Measurement form

```text
Measurements
[ Add measurement ]

 1. Measurement 1   Done         124.5 mm²
 2. Measurement 2   Drawing…                   [ Cancel ]
 3. Measurement 3   Pending                    [ Activate ]

Total area: 124.5 mm²
```

- A button named **Add measurement**, always enabled while the form is shown.
- An ordered list; one item per row, in creation order, labelled **Measurement N** (N = the row's
  number).
- Each row shows its status text and, when `Done`, its value:

| Row status | Status text | Value | Control |
| --- | --- | --- | --- |
| `Pending` | "Pending" | none | button **Activate** (see below) |
| `Drawing` | "Drawing…" | none | button **Cancel** |
| `Done` | "Done" | `<area to one decimal> <unit>`, e.g. "124.5 mm²" | none |

- **Activate** is disabled while the viewer has not said `VIEWER_READY`, and then the form shows the
  status "Waiting for the viewer to be ready…" (`role="status"`) so the reason is visible.
  Adding rows works meanwhile.
- **Cancel** returns the row to `Pending`.
- Activating a row turns another `Drawing` row back to `Pending`; nothing else is shown for it.

## Total

Always shown at the bottom, labelled **Total area**:

| Total kind | Shown |
| --- | --- |
| none | "Total area: —" |
| sum | "Total area: 124.5 mm²" (one decimal, the rows' shared unit) |
| mixed units | "Total area: can't be added up because the units differ" |

The total is in a live region (`role="status"`) so a change is announced.

## Accessibility and text

- Status is in the row's text, not colour only.
- All strings are plain text; values and units from the viewer are rendered as text nodes.
- Messages and logs never include the raw values from the viewer.

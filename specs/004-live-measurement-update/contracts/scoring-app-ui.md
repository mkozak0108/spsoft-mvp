# Contract: Measurement form UI (changes)

Extends [feature 003's form contract](../../003-add-area-measurements/contracts/scoring-app-ui.md),
which stays in force except where this file says otherwise. The wording is the contract for
checking by role and accessible name / text.

## Row names are fixed at creation

*(Changes 003.)* A row is labelled **Measurement N**, where N is the row's own number, given when
the row is added and never changed or reused. 003 numbered rows by list position, which renamed
every later row when one was removed (research R6).

```text
Before the ellipse of Measurement 2 is deleted     After
 Measurement 1   Done   124.5 mm²                   Measurement 1   Done   124.5 mm²
 Measurement 2   Done    30.2 mm²                   Measurement 3   Done    88.0 mm²
 Measurement 3   Done    88.0 mm²
Total area: 242.7 mm²                              Total area: 212.5 mm²
```

## A finished row follows its ellipse

| Event in the viewer | Row | Total |
| --- | --- | --- |
| a handle of the row's ellipse is dragged | the value text changes with each update, one decimal and the reported unit; status stays "Done"; no control appears | recalculated with the row |
| part of the ellipse is dragged off the image | status stays "Done"; the value is replaced by the text "No area" | recalculated without the row; "Total area: —" if no other row has a value |
| the ellipse is back on the image | the value returns, as above | recalculated with the row |
| the row's ellipse is deleted | the row is removed from the list, with no confirmation and no message | recalculated without it; "Total area: —" when no "Done" row is left |

- A value that rounds to the one already shown leaves the row untouched (no re-render).
- "Activate" and "Cancel" behave as in 003. A "Drawing…" row is never changed by an update or a
  removal of another row.

## Total

Unchanged text and formats (003). It stays a live region (`role="status"`). During a drag it
changes many times a second; polite announcements are left to the screen reader to coalesce
(research R8).

## Text and logs

- Values and units from the viewer are rendered as text nodes, as before.
- An area change is not logged per update. A removal is logged at `info` with the row id only.
  Rejected updates and removals are logged at `warn` without their data.

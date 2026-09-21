# Contract: Measurement form UI (changes)

Extends [feature 004's form contract](../../004-live-measurement-update/contracts/scoring-app-ui.md)
and, through it, 003's, which stay in force except where this file says otherwise. The wording is
the contract for checking by role and accessible name / text.

## After a reload

No new control and no message. The list simply has rows in it when the page opens: each restored
row looks exactly as it did before the reload, and restored `Done` rows cannot be told apart from
ones drawn in this session.

## A row that could not be restored

*(New.)* A row whose ellipse the viewer could not put back (research R13):

| Part | Shows |
| --- | --- |
| name | **Measurement N**, unchanged |
| status | **Not restored** |
| value | the saved value, as before (`` `${area.toFixed(1)} ${unit}` ``) |
| control | **Activate**, enabled once the viewer is ready, exactly as on a "Pending" row |
| total | left out of it |

```text
 Measurement 1   Done           124.5 mm²
 Measurement 2   Not restored    30.2 mm²   [Activate]
 Measurement 3   Done            88.0 mm²
Total area: 212.5 mm²
```

- **Activate** on a not-restored row behaves as on a "Pending" one: the row becomes "Drawing…"
  with **Cancel**, and any other "Drawing…" row returns to "Pending". The saved value disappears
  when the row is activated, so it reads like any other row being drawn; **Cancel** leaves it
  "Pending" with no value.
- The next ellipse the doctor draws fills it, and it is an ordinary "Done" row from then on.
- There is no **Remove** control: as in 004, a row leaves the form only when its ellipse is deleted
  in the viewer, so a not-restored row the doctor does not want is redrawn and then deleted.

## Text and logs

- The not-restored mark is logged once by the existing row-transition line, at `info`, with the row
  id and the two statuses only (`done` → `failed`).
- A `MEASUREMENT_RESTORE_FAILED` for a row that is not "Done" is logged at `warn` with the reason
  only.

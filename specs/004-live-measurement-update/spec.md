# Feature Specification: Live Measurement Update

**Feature Branch**: `004-live-measurement-update`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "5.1. Live update. The user drags a vertex (handle) of an ellipse measurement in the viewer — the corresponding value in the scoring form updates in real time, and the total is recalculated."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resize a finished ellipse and watch its row follow (Priority: P1)

The doctor has finished a measurement: its row is "Done" and shows an area. Looking at the image
again, they see the ellipse doesn't quite fit the region, so they grab one of its handles in the
viewer and drag it. While the handle is still moving, the row's value changes with it and the
total at the bottom of the form is recalculated. When the doctor lets go, the row shows the
ellipse's final area, agreeing with the area the viewer shows next to the ellipse, and the total
includes it.

**Why this priority**: This is the whole feature. Without it, a doctor who corrects an ellipse is
left with a form that silently disagrees with the image, and the total is wrong.

**Independent Test**: Finish one measurement, drag one of the ellipse's handles slowly for a few
seconds, and check that the row's value and the total change during the drag, not only after it,
and that after release the row agrees with the area the viewer shows for that ellipse. The viewer
may round more coarsely than the form's one decimal (for example "125 mm²" next to "124.5 mm²").

**Acceptance Scenarios**:

1. **Given** a row in "Done" whose ellipse is on screen, **When** the doctor drags one of the
   ellipse's handles, **Then** the row's value changes while the drag is in progress, following
   the ellipse's current area.
2. **Given** a drag in progress, **When** the row's value changes, **Then** the total at the
   bottom of the form is recalculated at the same time.
3. **Given** the doctor releases the handle, **When** they compare the row with the viewer,
   **Then** the row shows the ellipse's final area, rounded to one decimal, with its unit.
4. **Given** the viewer is back on its default tool (pan) after the measurement, **When** the
   doctor grabs a handle of the finished ellipse, **Then** the handle moves; no button in the form
   has to be pressed first.
5. **Given** the doctor has edited an ellipse, **When** they look at its row, **Then** the row is
   still "Done" and still offers no "Activate"; editing changes the value, not the status.

---

### User Story 2 - Edits land in the right row, and only there (Priority: P2)

The doctor has several finished measurements and adjusts them in any order, sometimes while
another row is waiting for a new ellipse. Each edit changes only the row that ellipse was drawn
for. A row that is "Drawing…" stays "Drawing…" and is still filled by the next new ellipse, and
ellipses the doctor drew from the viewer's own toolbar, which belong to no row, change nothing in
the form.

**Why this priority**: A live value in the wrong row is worse than no live value. It depends on
User Story 1 but is its own check: it can be tested once a single edit works.

**Independent Test**: Finish three measurements, activate a fourth row, then drag a handle of the
second ellipse. Check that only the second row and the total change, that the fourth row is still
"Drawing…", and that the next new ellipse fills the fourth row.

**Acceptance Scenarios**:

1. **Given** several rows in "Done", **When** the doctor drags a handle of one of their ellipses,
   **Then** only that ellipse's row changes value; every other row keeps its value.
2. **Given** row A in "Done" and row B in "Drawing…", **When** the doctor drags a handle of row
   A's ellipse, **Then** row A's value follows the drag, row B stays "Drawing…", and the next new
   ellipse the doctor draws fills row B.
3. **Given** an ellipse drawn from the viewer's own toolbar, with no row activated for it,
   **When** the doctor drags one of its handles, **Then** nothing in the form changes.
4. **Given** a row in "Drawing…", **When** the doctor is still in the middle of drawing its new
   ellipse, **Then** the row gets its value only once the ellipse is finished, as before; the
   in-progress shape does not show in the row.

---

### User Story 3 - Delete a measurement from the viewer (Priority: P3)

The doctor decides a measurement was a mistake and deletes its ellipse in the viewer. Its row
disappears from the form and the total is recalculated without it, so the form never counts an
ellipse that is no longer on the image.

**Why this priority**: Once the form follows edits to an ellipse, it must also follow the ellipse
going away; otherwise the total includes an area the doctor removed. It can be tested on its own,
without any dragging.

**Independent Test**: Finish two measurements, delete the first ellipse in the viewer, and check
that its row is gone, the second row is unchanged, and the total equals the second row's value.

**Acceptance Scenarios**:

1. **Given** a row in "Done", **When** the doctor deletes its ellipse in the viewer, **Then** the
   row is removed from the form and the total no longer includes its value.
2. **Given** the only "Done" row, **When** the doctor deletes its ellipse, **Then** the row is
   removed and the total shows no value, as when no row is "Done".
3. **Given** row A in "Done" and row B in "Drawing…", **When** the doctor deletes row A's
   ellipse, **Then** row A is removed, row B stays "Drawing…", and the next new ellipse fills
   row B.
4. **Given** an ellipse drawn from the viewer's own toolbar, with no row activated for it,
   **When** the doctor deletes it, **Then** nothing in the form changes.

---

### Edge Cases

- The doctor drags a handle quickly or for a long time: the row may skip intermediate values, but
  it keeps moving during the drag and always ends on the ellipse's final area after release.
- The doctor shrinks the ellipse until its area is zero: the row shows 0.0 in its unit and the
  total adds nothing for it.
- The doctor moves the whole ellipse without changing its size: the row's value stays the same.
- The doctor releases the handle outside the viewer: the row ends on whatever area the ellipse
  ends with.
- The doctor drags part of the ellipse off the image, where the viewer can't measure it and shows
  no area: the row stays "Done" but shows no value and is left out of the total, until the ellipse
  is back on the image and has an area again.
- While the doctor drags, the viewer has not yet worked out the new area for a moment: the row
  keeps its last value until the viewer has one.
- The doctor deletes several or all ellipses at once in the viewer: every row linked to a deleted
  ellipse is removed, and the total ends on the sum of the rows that remain.
- A deleted ellipse is brought back in the viewer (for example by undo): it belongs to no row, and
  the removed row does not come back.
- The viewer announces that it is ready again (for example it was reloaded): its ellipses are
  gone, so the rows that were "Done" keep their last values and can no longer be edited.
  "Drawing…" rows return to "Pending", as before.
- An update or a deletion names a row that doesn't exist (for example one already removed), or a
  row that is "Pending" or "Drawing…": it is ignored and no row changes.
- An update has an unsupported contract version, is malformed, names another study, or comes from
  an origin or window other than the embedded viewer: it is ignored and changes nothing. If it came
  from the embedded viewer, the rejection is visible in the diagnostic log at warning level, as for
  every other message.
- An edit changes a row's unit (for example the image's calibration differs from the one first
  reported): the row takes the new unit, and the total follows the existing rule for mixed units,
  showing one sum per unit.
- The doctor reloads the page: rows, values and ellipses are gone, as before.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The viewer MUST remember which row each finished ellipse was drawn for, until that
  ellipse is deleted or the viewer page closes, so later changes to that ellipse can be reported
  for that row.
- **FR-002**: Whenever the area of an ellipse linked to a "Done" row changes in the viewer,
  however the doctor changes it (dragging one of its handles is the main case), the viewer MUST
  report the ellipse's new area, its unit and the row identifier to the form with
  `MEASUREMENT_UPDATED`.
- **FR-003**: Updates MUST be sent while the drag is in progress, not only when it ends. The viewer
  MAY skip intermediate values to keep both apps responsive, but MUST always report the area the
  ellipse has once the drag ends.
- **FR-004**: When the form receives an update for a "Done" row, it MUST replace that row's value
  and unit with the reported ones, rounded to one decimal as when first recorded, and MUST keep the
  row "Done".
- **FR-005**: The total MUST be recalculated whenever a row's value changes, so it always equals
  the sum of the displayed values of the "Done" rows, following the existing rules for no rows and
  mixed units.
- **FR-006**: A finished ellipse MUST stay editable in the viewer after it returns to its default
  tool, without the doctor pressing anything in the form.
- **FR-007**: Editing an existing ellipse MUST NOT fill, complete, cancel or otherwise change a
  "Drawing…" row. Only a newly finished ellipse fills a "Drawing…" row, as before.
- **FR-008**: Changes to ellipses that belong to no row, and to an ellipse still being drawn, MUST
  NOT be reported as updates. Deleting an ellipse that belongs to no row MUST NOT be reported.
- **FR-009**: When an ellipse linked to a "Done" row is deleted in the viewer, however the doctor
  deletes it, the viewer MUST report the deletion with the row identifier and forget the link.
  Because the event names are fixed and none of them means "removed", the deletion MUST be
  reported with `MEASUREMENT_UPDATED`, in a form the receiver cannot mistake for a new area.
- **FR-010**: When the form receives a deletion for a "Done" row, it MUST remove that row and
  recalculate the total. No other row changes, and a "Drawing…" row stays "Drawing…".
- **FR-011**: The form MUST ignore, and log at warning level, an update or a deletion that names
  an unknown row or a row that is not "Done", without changing any row.
- **FR-012**: `MEASUREMENT_UPDATED` MUST follow the same rules as every other message: it carries
  the contract version (`version: 1`), and the form accepts it only under the existing checks on
  origin, window, version, payload shape and study.
- **FR-013**: The payload of `MEASUREMENT_UPDATED` for both an area change and a deletion, when
  each is sent, and why it didn't need a new contract version MUST be documented in
  `ARCHITECTURE.md`, and the documentation MUST no longer list editing or deleting a measurement
  in the viewer as left out.
- **FR-014**: The payload type of `MEASUREMENT_UPDATED` MUST be defined in the one shared contract
  used by both apps, like every other message.
- **FR-015**: When a linked ellipse can no longer be measured (part of it lies off the image, so
  the viewer shows no area), the viewer MUST report that, and the form MUST show the row as "Done"
  with no value and leave it out of the total until an area is reported again.

### Key Entities

- **Measurement row**: As before, one line of the form with an identifier, a status and, once
  Done, an area with a unit. The value of a Done row can now change after it is first recorded,
  and the row is removed when its ellipse is deleted.
- **Ellipse link**: The viewer's record of which row a finished ellipse was drawn for. It exists
  for every finished row and lasts until the ellipse is deleted or the viewer page closes.
- **Measurement update**: What the viewer reports when a linked ellipse changes: the identifier
  of the row the ellipse belongs to, and one of: the new area with its unit, the fact that the
  ellipse can't be measured right now, or the fact that it was deleted.
- **Area total**: As before, the sum of the displayed values of all Done rows, per unit, derived
  from the rows and never stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: During a drag of a handle lasting at least one second, the row's value visibly
  changes while the pointer is still held down, and never trails the area the viewer shows by
  more than a quarter of a second.
- **SC-002**: After a drag ends, in 100% of cases the row shows the viewer's final area for that
  ellipse, rounded to one decimal, within half a second, and the total equals the sum of the
  displayed values of the "Done" rows.
- **SC-003**: With five finished rows edited in any order, 100% of edits change only the row
  the edited ellipse was drawn for.
- **SC-004**: Editing a finished ellipse while another row is "Drawing…" leaves that row
  "Drawing…" in 100% of cases, and the next new ellipse still fills it.
- **SC-005**: Editing an ellipse that belongs to no row changes nothing in the form in 100% of
  cases.
- **SC-006**: A continuous ten-second drag leaves both apps responsive: the handle keeps following
  the pointer throughout, and the form responds to a click immediately after release.
- **SC-007**: After the doctor deletes a linked ellipse, in 100% of cases its row is gone from the
  form within half a second, the total no longer includes it, and no other row changes.
- **SC-008**: An update or deletion with an unsupported version, or one that is malformed,
  misaddressed, or names a row that is not "Done", changes no row in 100% of cases, and when it
  came from the other app it leaves a warning in the diagnostic log that is present in a
  production build.
- **SC-009**: A reviewer can find in `ARCHITECTURE.md` the payload of `MEASUREMENT_UPDATED` for an
  area change and for a deletion, when each is sent, and why it did not need a new contract
  version.

## Assumptions

- Constraint (given by the product owner): the event names are fixed, and `MEASUREMENT_UPDATED`
  (viewer → host) is the one for this feature. Its name was reserved by the previous feature;
  its payload is ours to design.
- "In real time" means during the drag, not only when the handle is released. "Immediately" is
  taken as within a quarter of a second, which reads as live to a person watching both panels.
- The contract stays at version 1. Adding a new event does not change how a version-1 receiver
  reads any existing message: an older form that gets `MEASUREMENT_UPDATED` rejects it as an
  unknown event and logs it, instead of misreading it. The rule already recorded in
  `ARCHITECTURE.md` asks for a new version only when a receiver could misread a message.
- Updates flow one way, from the viewer to the form. Typing a value into the form, or changing the
  ellipse from the form, is out of scope.
- Deleting a linked ellipse in the viewer removes its row (decided by the product owner). None of
  the fixed event names means "removed", so `MEASUREMENT_UPDATED` carries deletions as well as new
  areas; its payload is ours to design, and it has no earlier version to stay compatible with.
- Rows are still removed only this way. A remove button in the form, which would also have to
  delete the ellipse in the viewer, is out of scope.
- An edited row keeps status "Done"; there is no separate "edited" or "editing" status.
- Messages from the viewer to the form arrive in the order they were sent, so the latest update
  for a row is the one the row ends with.
- The links between rows and ellipses live only in the open pages and are not saved, like the rows
  themselves.
- This feature replaces the previous feature's assumptions that "a Done row keeps the value first
  reported" and that removing rows is out of scope, and its "left out on purpose" item on editing
  or deleting a measurement.
- The user is a single doctor at a desktop or laptop browser, as before; nothing leaves the
  browser except the messages between the two frames.

# Feature Specification: Add Area Measurements

**Feature Branch**: `003-add-area-measurements`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "\"Add measurement\" scenario (core of the task). The form has an \"Add measurement\" button. Clicking it creates a new empty row with status Pending and an \"Activate\" button. Clicking \"Activate\" sends the iframe a command to enable the Ellipse tool (EllipticalROI); the row moves to status \"Drawing…\". The user draws an ellipse in the viewer. The viewer sends back the annotation's area together with an identifier by which the host can tell which row the value belongs to. The row receives the value (e.g. 124.5 mm²) and status \"Done\"; the tool in the viewer switches itself off (returns to Pan/default). The steps are repeatable: there can be any number of rows. At the bottom of the form is the sum of the areas of all rows, recalculated automatically. Minimal message contract: VIEWER_READY (viewer → host), ACTIVATE_TOOL (host → viewer), DEACTIVATE_TOOL (host → viewer), MEASUREMENT_ADDED (viewer → host), MEASUREMENT_UPDATED (viewer → host, starred task 5.1). Event names are fixed; payload structure is designed by us and described in ARCHITECTURE.md. Agree on a contract version (version: 1), embed it in every message, and be able to explain at the defense why."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Measure an area and see it in the form (Priority: P1)

With a study on screen, the doctor clicks "Add measurement". An empty row appears in the form
with status "Pending" and an "Activate" button. The doctor clicks "Activate": the row's status
becomes "Drawing…" and the viewer is ready to draw an ellipse. The doctor draws an ellipse on
the image. The row receives the ellipse's area (for example "124.5 mm²") and status "Done", and
the viewer goes back to its default tool by itself, so a stray click on the image does not draw
another ellipse.

**Why this priority**: This is the core of the whole feature and the reason the form and the
viewer are shown together. Without it, nothing links what the doctor does on the image to what
is recorded in the form.

**Independent Test**: Open a study, add one measurement, activate it, draw one ellipse, and
check that the row shows an area value and "Done", and that the viewer is back on its default
tool.

**Acceptance Scenarios**:

1. **Given** a study is on screen, **When** the doctor clicks "Add measurement", **Then** a new
   row appears in the form with status "Pending", no value, and an "Activate" button.
2. **Given** a row in "Pending", **When** the doctor clicks "Activate", **Then** the row's
   status becomes "Drawing…" and the doctor can draw an ellipse on the image.
3. **Given** a row in "Drawing…", **When** the doctor finishes drawing an ellipse, **Then** that
   row shows the ellipse's area with its unit (for example "124.5 mm²") and status "Done".
4. **Given** the doctor has just finished an ellipse, **When** they click or drag on the image,
   **Then** no further ellipse is started; the viewer is back on its default tool (pan).
5. **Given** a row in "Done", **When** the doctor looks at it, **Then** it no longer offers
   "Activate"; a measurement is drawn once per row.

---

### User Story 2 - Take any number of measurements and see the total (Priority: P1)

The doctor repeats the flow as many times as needed, adding rows one after another. At the
bottom of the form a total shows the sum of the areas of all finished rows, and it updates on
its own each time a row becomes "Done".

**Why this priority**: Repeatable rows and the total are named in the request as part of the
core scenario; a single row with no total does not meet it.

**Independent Test**: Complete three measurements and check that the total equals the sum of
the three displayed values, and that it changed after each one.

**Acceptance Scenarios**:

1. **Given** rows already in "Done", **When** the doctor adds and completes another row,
   **Then** the new value is added to the total without any further action.
2. **Given** several rows in "Pending", "Drawing…" and "Done", **When** the doctor looks at the
   total, **Then** it counts only the rows in "Done".
3. **Given** the doctor adds several rows first and activates them later in a different order,
   **When** each ellipse is drawn, **Then** each value appears in the row that was activated
   for it, never in a different one.
4. **Given** no row is "Done" yet, **When** the doctor looks at the total, **Then** it shows no
   value (not a misleading zero).

---

### User Story 3 - Switch or cancel a drawing in progress (Priority: P2)

The doctor activates a row and then changes their mind: they cancel the drawing, or activate a
different row instead. Only one row can be waiting for an ellipse at a time; the row that
stops waiting goes back to "Pending" and can be activated again later.

**Why this priority**: Without it, a doctor who activates the wrong row is stuck with the
viewer waiting for a drawing they no longer want. The main flow works without it, so it ranks
below the first two stories.

**Independent Test**: Activate a row, cancel it, and check it is "Pending" again and the viewer
no longer draws; then activate row A, activate row B, and check A is "Pending" and B is
"Drawing…".

**Acceptance Scenarios**:

1. **Given** a row in "Drawing…", **When** the doctor cancels it, **Then** the row returns to
   "Pending" and the viewer stops waiting for an ellipse.
2. **Given** row A in "Drawing…", **When** the doctor activates row B, **Then** row A returns to
   "Pending", row B becomes "Drawing…", and the next ellipse fills row B.
3. **Given** a row in "Drawing…", **When** the doctor cancels it and later activates it again,
   **Then** it works as a fresh activation.

---

### Edge Cases

- The viewer has not finished loading (it has not announced that it is ready): "Activate" is
  unavailable, with a visible reason, so a command is never sent to a viewer that cannot act on
  it. Adding rows remains possible.
- No study is on screen (loading, failed, or invalid link): the form panel keeps showing its
  waiting or unavailable state from the earlier feature, and no measurement controls are shown.
- The viewer announces that it is ready again while a row is "Drawing…" (for example it was
  reloaded): the drawing state is lost, so that row returns to "Pending".
- The doctor draws an ellipse with the viewer's own toolbar while no row is "Drawing…": the
  form ignores it; only drawings made for an activated row fill rows.
- A measurement message names a row that does not exist, or a row that is not "Drawing…"
  (duplicate or late message): it is ignored and the existing rows are unchanged.
- A message has an unsupported contract version, is malformed, or comes from an origin or window
  other than the embedded viewer: it is ignored and changes nothing in the form. If it came from
  the embedded viewer, the rejection is visible in the diagnostic log at warning level (FR-010).
- The reported area's unit differs between finished rows (for example one calibrated in mm² and
  one with no physical scale): the total is not shown as a single sum; the form says the areas
  can't be added up because their units differ.
- The doctor reloads the page: rows and values are gone, the study reopens as before (see
  Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: With a study on screen, the form MUST offer an "Add measurement" button that
  appends a new row with status "Pending", no value, and an "Activate" button. Any number of
  rows MUST be possible.
- **FR-002**: Activating a "Pending" row MUST tell the viewer to enable the Ellipse tool for
  that row, and MUST move the row to "Drawing…". The command MUST carry an identifier of the
  row that the viewer returns unchanged with its result.
- **FR-003**: When the viewer reports a finished ellipse for a row that is "Drawing…", the form
  MUST set that row's value (area with unit) and status "Done", using only the row identifier
  from the message to decide which row to fill.
- **FR-004**: After an ellipse is finished, the viewer MUST return to its default tool (pan)
  without any action from the doctor.
- **FR-005**: At most one row MAY be "Drawing…" at a time. Activating another row MUST cancel
  the current drawing (the previous row returns to "Pending"), and a "Drawing…" row MUST offer a
  way to cancel, which tells the viewer to stop waiting for a drawing and returns the row to
  "Pending".
- **FR-006**: The bottom of the form MUST show the total of the areas of all "Done" rows and
  MUST recalculate it automatically whenever a row becomes "Done". When no row is "Done" it MUST
  show no value; when finished rows use different units it MUST say the areas can't be added
  instead of showing a sum.
- **FR-007**: "Activate" MUST be unavailable, with a visible reason, until the viewer has
  announced that it is ready to accept commands.
- **FR-008**: If the viewer announces it is ready while a row is "Drawing…", that row MUST
  return to "Pending".
- **FR-009**: Every message in either direction MUST carry the contract version (`version: 1`).
  The receiving side MUST ignore, without changing the form or the viewer, any message whose
  version it does not support, and MUST log the rejection.
- **FR-010**: The receiving side MUST also ignore, and log, messages that are malformed, name an
  unknown row, name a row not currently "Drawing…", or arrive from anything other than the
  embedded viewer's origin and window. Incoming data is validated before use. Rejections of
  messages that came from the other app are logged at warning level, so they show in a
  production build; traffic from any other origin or window is logged at debug level only, since
  it is other pages' messages and not a fault of this pair.
- **FR-011**: The message contract MUST use these fixed names: `VIEWER_READY` (viewer → host),
  `ACTIVATE_TOOL` (host → viewer), `DEACTIVATE_TOOL` (host → viewer), `MEASUREMENT_ADDED`
  (viewer → host), `MEASUREMENT_UPDATED` (viewer → host, name reserved; see Assumptions).
  `MEASUREMENT_ADDED` MUST carry the area value, its unit and the row identifier.
- **FR-012**: The payload of every message, the version field and the reason it exists MUST be
  documented in `ARCHITECTURE.md`.
- **FR-013**: The contract's names and payload types MUST be defined in one place and used by
  both apps, as for the messages of the earlier feature, so the two sides cannot drift apart.

### Key Entities

- **Measurement row**: One line of the form. Has an identifier that the host creates and the
  viewer echoes back, a status (Pending, Drawing…, Done), and, once Done, an area value with a
  unit.
- **Measurement result**: What the viewer reports for a finished ellipse: the area, its unit,
  and the identifier of the row it was drawn for.
- **Area total**: The sum of the values of all Done rows, in their shared unit.
- **Bridge message**: One event or command exchanged between the viewer and the host. Every
  message has a type, a contract version and a payload.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A doctor with a study on screen can go from "Add measurement" to a row showing a
  value and "Done" using only the button clicks and one drawn ellipse, with no other steps, and
  the value appears within 1 second of finishing the ellipse.
- **SC-002**: With 10 rows completed in any order, 100% of values are in the row they were
  activated for.
- **SC-003**: The total equals the sum of the displayed values of the "Done" rows at all times,
  and updates within 1 second of a row becoming "Done".
- **SC-004**: There is never more than one row in "Drawing…", including after any sequence of
  activating, cancelling and re-activating rows.
- **SC-005**: After each finished ellipse, 100% of the time the next click on the image does not
  draw another ellipse.
- **SC-006**: A message with an unsupported version, or one that is malformed or misaddressed,
  changes no row in 100% of cases. When it came from the other app, it also leaves a warning in
  the diagnostic log that is present in a production build.
- **SC-007**: A reviewer can find, in `ARCHITECTURE.md`, the payload of every message in the
  contract and a plain explanation of why the messages carry a version.

## Assumptions

- Constraint (given by the product owner): the form runs in the host page, the viewer runs in an
  embedded frame, and the two talk only through messages. The Ellipse tool (the viewer's
  elliptical region-of-interest tool) is the only drawing tool, and the measured quantity is its
  area.
- Constraint (given by the product owner): event names are fixed as in FR-011; payload shapes
  are ours to design.
- Why the contract carries a version: the two apps are built and shipped separately and only
  meet through these messages. Without a version, a change to one side's payload would be
  silently misread by the other; with it, the receiver can tell "I don't understand this" from
  "this is broken" and refuse cleanly. This is what to explain at the defense.
- `MEASUREMENT_UPDATED` (an existing annotation was edited) is part of the agreed contract as a
  reserved name only. Handling it, and keeping row values in sync with edited annotations, is
  the separate starred task and is out of scope here. In this feature a Done row keeps the value
  first reported.
- Removing or renaming rows, editing values by hand, and selecting a drawn ellipse from its row
  are out of scope. A drawn ellipse stays in the viewer.
- Rows and values live only in the open page. They are not saved, and a page reload starts with
  no rows. Saving and exporting scores stay out of scope, as they were in the earlier feature.
- The unit is whatever the viewer reports for the ellipse (typically mm² for images with a
  physical scale). Values are shown to one decimal place, as in the example "124.5 mm²".
- This feature replaces the earlier feature's "scoring not available yet" placeholder with the
  measurement form once a study is shown. The earlier "no input fields" rule (its FR-005) and its
  "measurements out of scope" assumption no longer apply. The waiting/unavailable states of
  the form panel are unchanged.
- The user is a single doctor at a desktop or laptop browser; there is no backend, so nothing
  leaves the browser except the messages between the two frames.

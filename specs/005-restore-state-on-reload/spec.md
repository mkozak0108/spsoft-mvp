# Feature Specification: Restore State on Reload

**Feature Branch**: `005-restore-state-on-reload`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "5.6. State restoration. After a page reload the form and the annotations are restored."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reload the page and find the work still there (Priority: P1)

The doctor has measured a few regions: the form lists their rows with their areas and a total, and
the ellipses are on the image. The page reloads — they press the browser's reload button, the tab
is restored after a crash, or a change to the app reloads it during a demo. Once the study is back
on screen, the form shows the same rows, in the same order, with the same numbers, values and
total, and the same ellipses are back on the images they were drawn on, in the same place and the
same size. The doctor carries on from where they were, without measuring anything twice.

**Why this priority**: This is the whole feature. Without it, one accidental reload throws away
every measurement the doctor has made, and the longer the study, the more there is to lose.

**Independent Test**: Draw three measurements, note the rows and the total, reload the page, and
check that the rows, their values and the total come back unchanged and the three ellipses are on
the image where they were.

**Acceptance Scenarios**:

1. **Given** several rows in "Done" with values, **When** the doctor reloads the page, **Then**
   the form shows the same rows in the same order, each with the number, status, value and unit it
   had before.
2. **Given** those rows, **When** the page has reloaded and the study is on screen, **Then** each
   row's ellipse is on the image it was drawn on, in the same position and size, and the area the
   viewer shows for it agrees with the row's value.
3. **Given** a total at the bottom of the form, **When** the doctor reloads, **Then** the total is
   the same, because it is the sum of the same restored rows.
4. **Given** the doctor has never measured anything for this study, **When** they open or reload
   it, **Then** the form starts empty, as it does today.
5. **Given** restored rows, **When** the doctor presses "Add measurement", **Then** the new row
   continues the numbering from the restored rows instead of reusing a number.

---

### User Story 2 - Restored measurements are still live (Priority: P2)

After the reload the doctor keeps working on what they restored, not on a frozen copy of it. They
grab a handle of a restored ellipse and its row follows the drag, exactly as before the reload.
They delete another restored ellipse and its row goes away with it. If they reload again, the
edited value and the deletion are what comes back. And if an ellipse could not be put back, its row
says so plainly, leaves the total, and lets the doctor draw that ellipse again for the same row.

**Why this priority**: A row that comes back but can no longer be corrected or removed is a trap:
the doctor sees their work, cannot change it, and cannot get rid of it. It depends on User Story 1
but is its own check.

**Independent Test**: Reload with two finished measurements, drag a handle of the first ellipse and
watch its row change, delete the second ellipse and watch its row go, then reload again and check
that the new value is there and the deleted row has not come back.

**Acceptance Scenarios**:

1. **Given** a restored row and its restored ellipse, **When** the doctor drags one of the
   ellipse's handles, **Then** the row's value follows the drag and the total is recalculated, as
   it does for an ellipse drawn in this session.
2. **Given** a restored row, **When** the doctor deletes its ellipse in the viewer, **Then** the
   row is removed from the form and the total no longer includes it.
3. **Given** the doctor has edited and deleted restored measurements, **When** they reload the page
   again, **Then** the form comes back with the edited values and without the deleted rows.
4. **Given** restored rows, **When** the doctor activates a new row and draws an ellipse, **Then**
   it fills that row as usual and joins the restored ones.
5. **Given** a restored ellipse, **When** the doctor drags part of it off the image, **Then** the
   row shows no value and leaves the total until the ellipse is back, following the existing rule.
6. **Given** a row whose ellipse could not be put back, **When** the page has reloaded, **Then**
   the row is marked as not restored, still shows its saved value, is left out of the total, and
   offers "Activate"; **When** the doctor activates it and draws an ellipse, **Then** the row is an
   ordinary finished row again, with the new area, and the total includes it.

---

### User Story 3 - Each study keeps its own work (Priority: P3)

The doctor finishes one study, opens a link to another, and the second study's form is its own: the
first study's rows are not in it. Coming back to the first study's link brings the first study's
rows and ellipses back.

**Why this priority**: Restoring the wrong study's measurements onto another study's images would
be worse than restoring nothing. It can be tested on its own, with two links and no editing.

**Independent Test**: Measure in study A, open study B's link, check that B's form is empty, then
open A's link again and check that A's rows and ellipses are back.

**Acceptance Scenarios**:

1. **Given** saved work for study A, **When** the doctor opens study B, **Then** B's form starts
   empty and no ellipse from A appears on B's images.
2. **Given** work in both studies, **When** the doctor returns to either link, **Then** that
   study's own rows, values and ellipses come back.
3. **Given** saved work for a study, **When** the study cannot be loaded, **Then** the form panel
   says scoring is unavailable, as it does today, nothing is drawn, and the saved work is still
   there the next time the study loads.

---

### Edge Cases

- A row was "Drawing…" when the page reloaded: its ellipse was never finished, so the row comes
  back as "Pending" and can be activated again, following the existing rule for a viewer that
  announces it is ready again.
- The doctor reloads while dragging a handle: the row comes back with the last area the viewer
  reported before the reload.
- The tab crashes, with no chance to save on the way out, and is reloaded: the work comes back as
  it was at most a second before the crash.
- The doctor deletes every ellipse and then reloads: the form is empty, because the deletions were
  saved too.
- What was saved cannot be read — it is damaged, or it was written by a version of the app that
  described it differently: nothing is restored, the form starts empty, the unusable data is
  discarded so it cannot break every later open, and the reason is visible in the diagnostic log at
  warning level.
- A saved ellipse cannot be put back on the image (for example the image it was drawn on is no
  longer in the study): its row is marked as not restored. It keeps its saved value on screen, so
  the doctor can see what they had, but it is left out of the total, because nothing on the image
  backs it. It offers "Activate", and drawing a new ellipse for it makes it an ordinary finished
  row. The failure is also logged at warning level.
- The doctor opens the same study in a second tab: each tab keeps its own work and neither
  overwrites the other's.
- The viewer is reloaded on its own (inside the page, without the page reloading): the ellipses it
  is holding are restored the same way, because restoring runs whenever the study becomes ready.
- An ellipse the doctor drew from the viewer's own toolbar, which belongs to no row: it is not
  saved and does not come back, as it was never part of the form.
- The doctor closes the tab and opens the link again later: the work is gone and the form starts
  empty (see Assumptions). Reopening the closed tab itself, through the browser's own "reopen
  closed tab" or session restore, counts as the same tab and may bring the work back with it.
- Storage is unavailable or full — the browser is in a mode that refuses it, or there is no room
  left: the app keeps working for the rest of the session, nothing is restored after the next
  reload, and the failure is logged at warning level rather than shown as an error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST remember, for the study that is open, the measurement rows the doctor
  has made and the ellipses they were drawn from, so that both can be put back after a reload.
- **FR-002**: What is remembered MUST be kept up to date as the doctor works — a row added, an
  ellipse finished, an area edited, a row removed — so that a reload at any moment restores what
  was last on screen. While changes keep coming, what is remembered MAY trail the screen by up to
  one second, but whatever is on screen when the page is hidden, reloaded or closed MUST be
  remembered at that moment.
- **FR-003**: On opening a study, the form MUST show the remembered rows in their original order,
  each with the number, status, value and unit it had, and MUST show the total derived from them.
- **FR-004**: Numbering MUST continue from the restored rows: a row added after a reload MUST NOT
  reuse the number of a restored or previously removed row.
- **FR-005**: Once the study is on screen, the viewer MUST put the remembered ellipses back on the
  images they were drawn on, in the same position and size, without the doctor pressing anything.
- **FR-006**: Every restored ellipse MUST be linked to its row again, so that editing it reports to
  that row and deleting it removes that row, exactly as for an ellipse drawn in the current
  session.
- **FR-007**: A row that was "Drawing…" when the page reloaded MUST come back as "Pending", and no
  half-drawn ellipse MUST be restored.
- **FR-008**: What is remembered MUST be scoped to the study it was made for: opening a study MUST
  restore only that study's rows and ellipses, and never another study's.
- **FR-009**: Restoration MUST be automatic. The doctor MUST NOT have to confirm it, press a
  button, or re-activate a row to get their work back.
- **FR-010**: When what was saved cannot be read or does not match what this version of the app
  understands, the app MUST start with an empty form, discard the unusable data, and log the reason
  at warning level. It MUST NOT restore part of it, and MUST NOT show a broken or half-filled form.
- **FR-011**: What is saved MUST carry its own version, so a shape this version of the app does not
  understand is refused rather than misread, for the reason every bridge message carries a version.
- **FR-012**: Saved data MUST be treated as untrusted when it is read back: rows, values, units and
  ellipse positions MUST be checked before anything is shown or drawn, and anything that fails the
  check falls under FR-010.
- **FR-013**: Only what restoration needs MUST be saved — the study identifier that is already in
  the address, the rows, and the position and size of their ellipses. No patient or study details
  MUST be saved, and saved data MUST NOT appear in logs.
- **FR-014**: Any message the two apps need for restoring ellipses MUST follow the existing
  contract rules: it carries the contract version, it is defined once in the shared contract used
  by both apps, and it is accepted only under the existing checks on origin, window, version,
  payload shape and study.
- **FR-015**: Failing to save, or failing to read what was saved, MUST NOT stop the doctor working:
  the form and the viewer keep working for the rest of the session and the failure is logged, not
  shown as an error over the app. A single ellipse that cannot be put back is shown in its own row
  instead (FR-017).
- **FR-016**: What is saved, how long it lives, what ends it and how the doctor is left with a
  clean slate MUST be documented in `ARCHITECTURE.md`, which MUST no longer list persistence as
  left out, nor list a reloaded viewer's rows as no longer editable.
- **FR-017**: When the viewer cannot put a saved ellipse back, the form MUST mark that row as not
  restored: it keeps showing the saved value, it is left out of the total, and it offers
  "Activate". Activating it starts the row over — the saved value goes, as for any row being drawn
  — and the ellipse the doctor draws fills it as it would a "Pending" row. The mark is remembered
  like any other status, so a further reload does not try to put the same ellipse back again.

### Key Entities

- **Saved study work**: Everything kept for one study so it can come back: which study it belongs
  to, the version of the shape it was written in, the measurement rows and their saved ellipses.
  There is one of these per study the doctor has worked on.
- **Measurement row**: As before — an identifier, a number, a status and, when Done, an area with
  its unit. It now outlives the page it was created on, and it has one more status, not restored,
  for a row whose ellipse could not be put back.
- **Saved ellipse**: Where a row's ellipse sits — which image of the study it is on, its position
  and its size — and which row it belongs to. It is what lets a restored ellipse be drawn again and
  linked back to its row.
- **Area total**: As before, the sum of the displayed values of the Done rows, per unit, derived on
  render and never stored — including after a restore.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a reload, 100% of the rows that were on screen come back with the same number,
  status, value and unit, and the total is unchanged.
- **SC-002**: After a reload, 100% of the restored rows' ellipses are back on their images within
  two seconds of the study appearing, in the same position and size, with the area the viewer shows
  agreeing with the row's value.
- **SC-003**: A restored ellipse behaves like one drawn in the current session in 100% of cases:
  dragging a handle moves its row's value live, and deleting it removes its row.
- **SC-004**: A change made in the last second before a reload — a new row, an edited area, a
  deletion — is part of what comes back in 100% of cases.
- **SC-005**: Opening a different study shows that study's own work, and no row or ellipse from
  another study, in 100% of cases.
- **SC-006**: With nothing saved, or with saved data the app cannot read, the doctor gets an empty,
  fully working form rather than an error screen in 100% of cases, and an unreadable save leaves a
  warning in the diagnostic log that is present in a production build.
- **SC-007**: A doctor who has measured five regions and reloads the page reaches the same screen
  with no repeated measuring, in under five seconds of their own time.
- **SC-008**: Inspecting everything the app has stored shows only the study identifier, the rows
  and the ellipse geometry — no patient or study details — in 100% of cases.
- **SC-009**: A reviewer can find in `ARCHITECTURE.md` what is stored, how long it lives, what ends
  it, and how to get back to a clean slate.
- **SC-010**: A row whose ellipse cannot be put back is marked as not restored and left out of the
  total in 100% of cases, and activating it and drawing makes it an ordinary finished row that is
  counted again.

## Assumptions

- **Lifetime: saved work survives reloads and lasts as long as the browser tab it was made in.**
  Closing the tab ends it, and opening the link in a new tab starts empty. It is the smallest
  answer that meets "after a page reload", and it leaves nothing behind on a shared machine, which
  matters for a medical app. Carrying work across browser restarts, or across devices, is a bigger
  promise and is not made here. Confirmed by the product owner on 2026-09-20, against the
  alternative of keeping the work in the browser profile under an age limit: browsers offer only a
  per-tab life or an indefinite one, "outlives the tab but not the browser" cannot be told apart
  reliably, and an indefinite life would leave measurement data in the profile after the doctor
  walks away.
- Restoration stays in the browser, because the project has no backend. Work is not shared between
  users, devices or browsers, and another doctor opening the same link sees their own empty form.
- Only rows made through the form, and the ellipses drawn for them, are saved. An ellipse drawn
  from the viewer's own toolbar belongs to no row and is not restored.
- A row restored with its ellipse keeps status "Done"; nothing distinguishes it from one drawn in
  this session. The only new status is "not restored", for a row whose ellipse could not be put
  back, chosen by the product owner on 2026-09-21 over keeping such a row as "Done" (it could then
  be neither edited nor deleted) and over removing it silently.
- There is no "clear" or "start over" control in the form. The doctor empties a study's work by
  deleting its ellipses in the viewer, and closing the tab discards everything.
- The two tabs case follows from the lifetime above: each tab's work is its own, so there is no
  last-writer-wins conflict to resolve.
- The bridge may gain whatever messages restoring ellipses needs; event and command names are ours
  to extend, and `version: 1` stays, since nothing an existing receiver reads changes.
- Restoring runs whenever the study becomes ready in the viewer, so a viewer reloaded on its own is
  covered by the same path as a full page reload.
- Scoring fields and saving scores are still out of scope: this feature restores the measurement
  work that exists today, not scores that have not been built yet.
- This feature replaces `ARCHITECTURE.md`'s "Persistence — measurements live in the page's memory;
  reloading starts over" under "Left out on purpose", and the known limitation that rows survive a
  viewer reload but can no longer be edited.
- The user is a single doctor at a desktop or laptop browser, as before; nothing leaves the browser
  except the messages between the two frames.

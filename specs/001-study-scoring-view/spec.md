# Feature Specification: Study Scoring View

**Feature Branch**: `001-study-scoring-view`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "doctor opens a research of a patient on the right side form is shown"

## Clarifications

### Session 2026-09-18

- Q: What does the form contain in this feature? → A: Layout only. The form panel shows a
  placeholder; scoring fields and saving come in a later feature.
- Q: Where do studies come from? → A: The viewer's default public sample image source, as
  shipped; no own image archive is set up.
- Q: How is the viewer opened? → A: Directly on one specific study, by a link that carries the
  study identifier; that same link is what the scoring app uses to show the viewer.
- Q: How does the doctor get to a specific study? → A: By a link to the scoring app that
  carries the study identifier; the scoring app passes it on to the viewer. There is no study
  list in this feature, and moving to another study means opening another link.
- Q: Does the form panel identify the open study? → A: No. Showing study details in the form
  panel is out of scope for this feature.
- Q: What happens when the viewer or the study takes too long to appear? → A: The doctor is
  shown a simple warning that it is taking longer than it should (no action offered); the app
  keeps waiting and shows the study if it arrives. Slowness alone is never reported as a
  failure.
- Q: Should the app detect a viewer that stops responding after the study has loaded? → A: No.
  In this setup such failures either can't be observed from the scoring app or freeze it too,
  so detection is out of scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a patient's study next to the scoring form (Priority: P1)

A doctor has a link to one patient's imaging study that needs scoring. They open the link, and
the screen splits in two: the study's images on the left, where they can scroll through and
inspect them, and the scoring form panel on the right. In this feature the panel holds no
scoring fields yet; it marks the place where scoring will happen.

**Why this priority**: This is the whole point of the feature. Without the side-by-side screen
there is nothing to score, and every later feature (scoring fields, saving, sending scores)
builds on it.

**Independent Test**: Open the link for a known sample study and check that its images appear
on the left and the form panel appears on the right.

**Acceptance Scenarios**:

1. **Given** a link to a study that exists in the image source, **When** the doctor opens it,
   **Then** that study's images are shown on the left side of the screen and the form panel is
   shown on the right side, both visible at once without scrolling the page and without any
   further action.
2. **Given** a study is open, **When** the doctor scrolls, zooms or pans the images, **Then**
   the form panel stays in place and unchanged.
3. **Given** a study is open, **When** the doctor looks at the form panel, **Then** it shows a
   placeholder saying that scoring is not available yet, and it has no input fields.
4. **Given** a study is open, **When** the doctor reloads the page, **Then** the same study is
   shown again next to the form panel.

---

### User Story 2 - Clear feedback while the study loads or fails to load (Priority: P2)

Studies can be large and slow to arrive, a link can point to a study that does not exist, and
the public image source can be unreachable. The doctor must always be able to tell whether the
study is still loading, has loaded, or has failed, and the form panel must not look ready
while no study is on screen.

**Why this priority**: A silent blank panel looks like a bug and leaves the doctor unsure what
they are looking at. It is needed for a trustworthy P1, but P1 is demonstrable without it on
the happy path.

**Independent Test**: Open a link to a study that does not exist, a link with no study
identifier, and a valid link while the image source is unreachable; check that each shows a
readable message and that the form panel shows a waiting or unavailable state.

**Acceptance Scenarios**:

1. **Given** the doctor has opened a study link, **When** the study's images have not arrived
   yet, **Then** a loading indicator is shown and the form panel shows a waiting state.
2. **Given** the doctor has opened a study link, **When** the study cannot be found or the
   image source cannot be reached, **Then** a message explains what went wrong in plain
   language, offers a way to try again, and the form panel shows an unavailable state.
3. **Given** the doctor opens the scoring app without a study identifier in the link (or with
   one that is malformed), **When** the page loads, **Then** they are told which study to open
   is missing, and no images are shown.
4. **Given** the doctor has opened a study link, **When** the viewer or the study still has
   not appeared after 10 seconds, **Then** a warning says it is taking longer than it should,
   while loading continues; **and when** the study then appears, it is shown normally and the
   warning disappears.

---

### Edge Cases

- The link names a study that has no viewable images (e.g. only non-image data): the viewer
  never shows an image, so after 10 seconds the doctor sees the "taking longer than it should"
  warning; the form panel stays in its waiting state.
- The browser window is narrower than the layout needs: both panels stay usable; the page does
  not hide the form panel or the images off-screen without a way to reach them.
- The image source is slow rather than down: the loading state stays visible, the "taking
  longer than it should" warning appears after 10 seconds, and no error is shown for slowness
  alone.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The scoring app MUST open on the study named by the study identifier in its own
  link, with no study list or other intermediate screen.
- **FR-002**: When a study is opened, the system MUST show its images on the left side of the
  screen and the form panel on the right side, both visible at the same time.
- **FR-003**: The doctor MUST be able to browse the open study's images (scroll through
  images, zoom, pan) without affecting the form panel.
- **FR-004**: Whenever no study is successfully shown (while loading or after an error), the
  form panel MUST show a waiting or unavailable state instead of its normal content.
- **FR-005**: Once a study is shown, the form panel MUST show a placeholder stating that
  scoring is not available yet, and MUST NOT contain input fields.
- **FR-006**: The system MUST show a visible loading state while a study is loading, and a
  plain-language error state with a retry option when it fails to load. If the viewer or the
  study has not appeared after 10 seconds, the system MUST add a warning that it is taking
  longer than it should, and MUST keep waiting rather than report a failure.
- **FR-007**: If the scoring app's link has no study identifier, or a malformed one, the system
  MUST say so plainly and MUST NOT open the viewer on some other study.
- **FR-008**: The viewer MUST open directly on one specific study from a link that identifies
  that study, with no intermediate screen; the left side of the screen shows the viewer through
  exactly such a link, built from the study identifier the scoring app was opened with.
- **FR-009**: Reloading the page MUST reopen the same study.

### Key Entities

- **Study**: One imaging examination of one patient, identified by a study identifier and
  shown to the doctor as its images.
- **Study link**: The address the doctor opens. It carries the study identifier, which the
  scoring app passes on to the viewer.
- **Form panel**: The right-hand area where the doctor will score the open study. In this
  feature it shows only a placeholder, or a waiting/unavailable state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Opening a study link shows the study side by side with the form panel with zero
  further actions from the doctor.
- **SC-002**: For a typical study from the public sample set, the first image and the form
  panel are both visible within 5 seconds of opening the link on a standard broadband
  connection.
- **SC-003**: In 100% of tested failure cases (missing or malformed study identifier, study not
  found, unreachable image source) and slow cases (slow source, viewer slow to start), the
  doctor sees a readable message or warning within 10 seconds and never a blank screen.
- **SC-004**: A first-time user who opens a study link identifies which panel shows the images
  and which is the form without help.

## Assumptions

- "Research" in the request means a patient's imaging study (one examination, possibly several
  series of images).
- The user is a single doctor/reviewer at a desktop or laptop browser; sign-in, user accounts
  and roles are out of scope, as the project has no backend.
- The doctor receives the study link from somewhere outside this app (e.g. a message or another
  system). Browsing, searching or choosing among studies is out of scope for this feature; to
  score another study, the doctor opens another link.
- Studies come from the viewer's default public sample image source, used as shipped; no own
  image archive is set up or hosted. All data there is synthetic or de-identified. The feature
  depends on that public source being reachable (see User Story 2 for when it is not).
- Constraint (given by the product owner): the viewer is opened by a direct study link of the
  form `/viewer?StudyInstanceUIDs=<study identifier>`, and this link is what gets embedded on
  the left side of the screen.
- Layout: images take the larger share of the screen (left), the form panel a narrower column
  (right); a phone-sized layout is out of scope, but narrow desktop windows must stay usable.
- Scoring fields, submitting, saving and exporting scores are out of scope for this feature
  and are planned for a following feature.
- Showing study or patient details in the form panel is out of scope for this feature.
- Detecting a viewer that breaks or stops responding after the study has loaded is out of
  scope for this feature.
- Measurements, annotations or other interaction between the form panel and the images are out
  of scope for this feature.

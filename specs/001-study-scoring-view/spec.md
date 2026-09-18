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

### Session 2026-09-19 (reversal, after implementation)

- Q: The scoring app showed its own loading indicator, slow-load warning, and plain-language
  failure message with a "Try again" button, layered over the viewer. Keep that, or drop it?
  → A: Drop it. The viewer (OHIF) already renders something in both cases — nothing during
  loading, a generic (non-actionable, reason-agnostic) message on failure — and duplicating or
  patching that from the host is more than this feature needs. The form panel still shows a
  waiting or unavailable state, driven by the same bridge messages; the viewer column itself no
  longer carries a host-added loading indicator, failure message, retry button or slow-load
  warning. Retrying a failure means reloading the page (FR-009), not an in-app button. This
  reverses the 2026-09-18 clarification on the slow-load warning; see [research.md § R7 (amended)](research.md#r7-slow-loads-and-a-viewer-that-stops-responding-timing-values)
  for what was verified in the viewer before making this call.

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

### User Story 2 - The form panel reflects whether a study is on screen (Priority: P2)

*(Renamed 2026-09-19; was "Clear feedback while the study loads or fails to load".)* A link can
point to a study that does not exist, or have no study identifier at all, or a malformed one.
The doctor must always be able to tell, from the form panel, whether a study is on screen, and
the panel must not look ready while it isn't.

**Why this priority**: A form panel that looks ready with no study on screen is misleading. It
is needed for a trustworthy P1, but P1 is demonstrable without it on the happy path.

**Independent Test**: Open a link to a study that does not exist, and a link with no study
identifier; check that the form panel shows an unavailable state, and that the missing-link
case also says so plainly.

**Acceptance Scenarios**:

1. **Given** the doctor has opened a study link, **When** the study has not loaded yet or has
   failed to load, **Then** the form panel shows a waiting or unavailable state instead of its
   normal content, without saying why the study hasn't appeared.
2. **Given** the doctor opens the scoring app without a study identifier in the link (or with
   one that is malformed), **When** the page loads, **Then** they are told that the link does
   not name a valid study, no images are shown, and the form panel shows an unavailable state.

---

### Edge Cases

- The link names a study that does not exist, or the image source cannot be reached, or the
  link names a study with no viewable images: the viewer's own screen is shown unmodified (see
  Assumptions); the form panel shows an unavailable or waiting state as appropriate, without a
  reason. Reloading the page (FR-009) is how the doctor tries again.
- The browser window is narrower than the layout needs: both panels stay usable; the page does
  not hide the form panel or the images off-screen without a way to reach them.

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
- **FR-006**: *(Revised 2026-09-19)* The system relies on the viewer's own screen for loading
  and failure display; the scoring app adds no loading indicator, failure message or retry
  control of its own over the viewer. It MUST NOT report a failure for slowness alone, and MUST
  NOT time out a study that is still loading.
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
- **SC-002**: For a typical study from the public sample set (validated with a chest CT study
  of 381 images), the first image and the form panel are both visible within 5 seconds of
  opening the link on a standard broadband connection.
- **SC-003**: *(Revised 2026-09-19)* For a missing or malformed study identifier, the doctor
  sees a readable message immediately, and the form panel never looks ready without a study on
  screen (missing/malformed link, still loading, or the viewer's own failure or empty screen).
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
- *(Added 2026-09-19)* A host-added loading indicator, failure message, retry control or
  slow-load warning over the viewer is out of scope. The viewer's own screen (blank while
  loading, a generic message on failure) is shown as-is; see README Known limitations.
- Measurements, annotations or other interaction between the form panel and the images are out
  of scope for this feature.

# Specification Quality Checklist: Restore State on Reload

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-20
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- **Settled with the product owner (2026-09-20)**: saved work lives as long as the browser tab —
  it survives reloads and ends when the tab closes. Raised as the spec's one open choice, put to
  the product owner against keeping the work in the browser profile under an age limit, and decided
  in favour of the per-tab life. Browsers offer only these two lifetimes; "outlives the tab but not
  the browser" is not something a page can tell reliably. Re-validated after the decision: all
  items still pass.
- Other choices made without asking, all recorded in the spec's Assumptions: restoration is
  automatic with no prompt; state is scoped per study; only rows made through the form and their
  ellipses are restored; restored rows keep status "Done"; there is no "clear" control, and
  deleting the ellipses is how a study is emptied.
- Storage is read back as untrusted data with its own version (FR-010 to FR-012), per the
  constitution's Principle II and the same reason every bridge message carries a version.
- `ARCHITECTURE.md`, `version: 1` and the existing receiver checks are the project's recorded rules,
  not implementation choices made here. Where the spec names the bridge, it is naming that contract,
  as feature 004's spec does.
- Two edge cases resolve in favour of not losing the doctor's work: a row whose ellipse cannot be
  put back is still shown with its value, and a save or restore that fails leaves the app working
  and logs the reason instead of showing an error.

# Feature Specification: WS7 Clickable Work Map and Debrief/Review View

**Feature Branch**: `ws7-sprint-1`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "WS7 Sprint 1 — Clickable Work Map (/map) and debrief/review view (/review). Source of truth: notes/ws7-sprints/sprint-1-work-map-review.md (sections "Scope" Lanes A–B, "Acceptance criteria", shared rules B1–B8)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Walk the interpretation workflow and see the evidence behind each item (Priority: P1)

A newcomer, expert or judge opens the Work Map. It shows the interpretation workflow as an ordered process of steps, decision points, guardrails and exceptions, each with a visible kind label and confirmation status. Selecting an item shows the trace region it is based on (focused, with a way to see the full image), the expert's own words as verbatim quotes, a separately labelled apprentice summary, the reasoning and guardrails, and a status badge. Items that are revoked or missing are clearly marked and their content is not presented as teaching material. Unresolved items say so and show the open question.

**Why this priority**: The challenge requires a Work Map where every step and guardrail has visual and verbal evidence. This is the screen judges inspect.

**Independent Test**: Open the Work Map with fixture data, select each item and compare the region, image and quotes shown with the fixture.

**Acceptance Scenarios**:

1. **Given** the Work Map, **When** it loads, **Then** items appear as a numbered process with kind labels (Step, Decision, Guardrail, Exception) and status badges using icon and text.
2. **Given** an item with evidence, **When** the user selects it, **Then** the evidence viewer shows the linked image focused on the linked region, and the user can switch to the full image.
3. **Given** an item with several pieces of evidence, **When** the user selects another piece, **Then** the viewer shows that piece's image and region.
4. **Given** a selected item, **When** the detail panel shows, **Then** expert quotes appear in a container labelled as the expert's words, and the apprentice summary appears in a separate container labelled "Apprentice summary".
5. **Given** an item whose status is draft, unresolved, revoked or missing, **When** it is shown in the list or detail panel, **Then** no "Confirmed" badge appears.
6. **Given** a revoked or missing item, **When** it is selected, **Then** the panel states that it is not teaching material and shows no quotes, summary, reasoning or guardrails.
7. **Given** an unresolved item, **When** it is selected, **Then** the panel says it is unresolved and shows its open question.
8. **Given** an item without evidence or without quotes, **When** it is selected, **Then** the panel shows "Missing visual evidence" or "Missing expert words" explicitly.

---

### User Story 2 - Navigate and share the Work Map without a mouse (Priority: P1)

A presenter drives the Work Map with the keyboard only (arrow keys to move, Enter to open) and can share or reopen a link that selects a specific item of a specific revision.

**Why this priority**: The demo runs on a display viewed through glasses; the demo script needs to jump straight to an item.

**Independent Test**: Keyboard-only navigation and opening a deep link in a fresh browser tab.

**Acceptance Scenarios**:

1. **Given** focus in the process list, **When** the user presses Down/Up (or Right/Left), Home or End, **Then** focus moves to the next, previous, first or last item without wrapping.
2. **Given** a focused item, **When** the user presses Enter, **Then** it becomes selected and its detail panel shows, and the address carries the item and revision.
3. **Given** a link naming an item and the current revision, **When** it is opened, **Then** that item is selected.
4. **Given** a link naming an item and a revision that is not the current one, **When** it is opened, **Then** the current revision is shown with a notice that the link referred to another revision.
5. **Given** a link naming an unknown item, **When** it is opened, **Then** no item is selected and a notice says the linked item was not found.

---

### User Story 3 - Follow the debrief and see corrections arrive (Priority: P1)

During the spoken debrief, the expert or an operator opens the review view. It shows the revision under review by a human-readable label, whether it changed since the previous revision, the draft process (same list as the Work Map), and the open questions marked answered or unanswered. When a new revision arrives, the view updates and marks what changed; a correction shows old → new. The view explains that confirmation happens in the spoken teach-back; there is no approve button.

**Why this priority**: The challenge requires a teach-back the expert confirms or corrects, with the confirmed revision recorded. The review view makes that visible.

**Independent Test**: Run the scripted fixture sequence (Revision 1 → correction → Revision 2 → confirmed) and observe the label, markers and confirmation status.

**Acceptance Scenarios**:

1. **Given** the review view, **When** it loads, **Then** it shows the revision label, a "changed since previous" indicator (or that there is no previous revision), the process list, and open questions each marked answered or unanswered.
2. **Given** an update delivering a new revision, **When** it arrives, **Then** the label changes, an announcement says a new revision was received, changed items are marked, and a changed item's detail shows old → new.
3. **Given** a confirmation for exactly the revision under review, **When** it arrives, **Then** the view says the expert confirmed this revision in the spoken teach-back. A confirmation for another revision is never shown as confirming the current one.
4. **Given** the review view, **When** the user looks for a way to confirm, **Then** there is none; text explains confirmation happens in the spoken teach-back.

---

### User Story 4 - Supplementary review marks with honest feedback (Priority: P2)

The operator can mark a step for correction or flag it unresolved. The control shows pending until the data source acknowledges it, then acknowledged, or a visible failure.

**Why this priority**: Supplementary only; speech remains primary.

**Independent Test**: Trigger a mark with a slow source and with a failing source.

**Acceptance Scenarios**:

1. **Given** a selected step, **When** the user marks it for correction, **Then** the control shows "pending" and cannot be submitted again until a response arrives.
2. **Given** a pending mark, **When** the source acknowledges it, **Then** it shows acknowledged; it never claims the step was corrected.
3. **Given** a pending mark, **When** the source fails, **Then** the failure message is shown and the user can retry.

### Edge Cases

- The data source fails to load: an error state is shown, not a blank page.
- A selected item disappears in a new revision: the selection is cleared and the panel says the item is not in this revision.
- An update for another session arrives: it is ignored.
- A revision removes items: they are listed as removed, by title.
- Ambiguous regions use the dashed outline; mismatched-frame regions draw nothing (inherited from the evidence viewer).
- Internal record ids are never displayed as text; the address may carry them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Work Map MUST render items as an ordered process (not an image gallery) with a visible kind label and status badge (icon + text) per item.
- **FR-002**: The process list MUST support keyboard navigation (arrow keys, Home, End) and selection with Enter.
- **FR-003**: The detail panel MUST show the evidence viewer focused on the linked region with a full-image toggle, and a selector when there is more than one piece of evidence.
- **FR-004**: Expert quotes MUST be shown verbatim in a container labelled as the expert's words; the apprentice summary MUST be in a separate container labelled "Apprentice summary".
- **FR-005**: Only items with status confirmed MAY show a "Confirmed" badge.
- **FR-006**: Revoked and missing items MUST be visibly marked and their content MUST NOT be shown as teaching material.
- **FR-007**: Unresolved items MUST be labelled unresolved and show their open question.
- **FR-008**: Items lacking evidence or quotes MUST show "Missing visual evidence" / "Missing expert words".
- **FR-009**: The address MUST carry the selected item and revision, and opening such an address MUST restore the selection (with notices for unknown items or other revisions).
- **FR-010**: The review view MUST show the revision label, a changed-since-previous indicator, the process list, and open questions marked answered/unanswered.
- **FR-011**: The review view MUST update on pushed updates, announce a new revision, mark changed/added items, list removed items, and show old → new for changed fields.
- **FR-012**: A teach-back confirmation MUST be shown only for the exact revision it refers to.
- **FR-013**: There MUST be no control that confirms knowledge; text MUST explain that confirmation happens in the spoken teach-back.
- **FR-014**: Supplementary marks ("Mark step for correction", "Flag unresolved") MUST go through the data-access layer and show pending, acknowledged or failed; no double submit while pending.
- **FR-015**: The fixture data source MUST provide a scripted sequence (Revision 1 → correction → Revision 2 → confirmed) that can be stepped through on the review view and is clearly labelled as fixture playback.
- **FR-016**: No internal record id may appear as visible text.

### Key Entities

- **Work Map revision**: a revision id, human-readable revision label, parent revision, change reason, and ordered items.
- **Work Map item**: kind, title, status, expert quotes, apprentice summary, reasoning, guardrails, evidence references, open question.
- **Review view**: the revision under review, its previous revision, open questions (WS3 shape) and teach-back confirmations (WS3 shape).
- **Review mark**: a supplementary request about one item of one revision, with an acknowledgement.

## Success Criteria *(mandatory)*

- **SC-001**: 100% of fixture items with evidence open the correct image and region, and show their quotes, in automated tests.
- **SC-002**: 0 non-confirmed items render a "Confirmed" badge across all fixture revisions.
- **SC-003**: The Work Map can be fully traversed and an item opened with the keyboard alone.
- **SC-004**: A deep link opens the named item in one page load.
- **SC-005**: Each step of the scripted review sequence is reflected (label, change marker, confirmation status) within one update.
- **SC-006**: Every supplementary mark shows exactly one of pending / acknowledged / failed at any time.

## Assumptions

- Fixture data only; no WS6 API exists yet. The scripted sequence is local to the browser tab and resets on reload.
- Reasoning and guardrail text are not verbatim expert words unless they appear as quotes, so they are styled as non-verbatim (conservative until WS5 confirms).
- The revision under review is the latest revision; the previous revision is its parent.
- Supplementary marks are requests; acknowledging one means it was received, not that anything changed.

# Feature Specification: WS7 App Shell, UI Contracts and Evidence Viewer

**Feature Branch**: `ws7-sprint-0`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "WS7 Sprint 0 — App shell, UI contracts, data layer, evidence viewer. Source of truth: notes/ws7-sprints/sprint-0-shell-contracts-viewer.md (sections "Scope" Lanes A–D and "Acceptance criteria", plus shared rules B1–B8)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect a captured trace region with confidence (Priority: P1)

A reviewer (expert, newcomer or judge) looks at a captured trace image. The region the expert pointed at is outlined and labelled, and the view can zoom in on the region or show the whole image. The viewer never shows a confident highlight that might be wrong. Ambiguous regions are drawn tentatively with an explicit label. Unresolved regions are not drawn at all. A region recorded on a different frame than the image shown is refused, with an explanation.

**Why this priority**: Every later screen (Work Map, review, practice, companion) relies on showing "what the apprentice is referring to". If the highlight can be wrong, the whole learning loop loses trust.

**Independent Test**: Open the viewer showcase page with fixture assets and step through the resolved, ambiguous, unresolved and mismatched-frame cases. Switch between focus and full mode and open the inspect view.

**Acceptance Scenarios**:

1. **Given** an image and a resolved region on the same frame, **When** the viewer shows it in full mode, **Then** an outlined, labelled box appears at the region's position, scaled correctly to the displayed size.
2. **Given** the same pair in focus mode, **When** the viewer renders, **Then** it shows the region enlarged with surrounding context, and the user can switch to the full image.
3. **Given** an ambiguous region, **When** the viewer renders, **Then** the outline is dashed and the text "Ambiguous region" is shown.
4. **Given** an unresolved region, **When** the viewer renders, **Then** no outline is drawn and the viewer says the region is unresolved.
5. **Given** a region whose frame differs from the image's frame, **When** the viewer renders, **Then** no outline is drawn and "Region belongs to a different frame" is shown.
6. **Given** the inspect view is open, **When** the user presses Escape, **Then** it closes and keyboard focus returns to the control that opened it.
7. **Given** the browser window is resized, **When** the image's display size changes, **Then** the outline stays aligned with the region.

---

### User Story 2 - Navigate the app and always know when data is not real (Priority: P1)

A team member opens the web app and moves between the main areas: entry, expert session, review, Work Map, practice, summary and developer tools. Whenever a screen shows development fixture data, a clearly visible banner says so. Fixture data can never be mistaken for captured expert knowledge.

**Why this priority**: The brief forbids presenting placeholders as verified knowledge. Navigation is the skeleton every later sprint fills in.

**Independent Test**: Visit every route. Each one loads, shows the shared navigation, and shows the fixture banner exactly when its data is fixture data.

**Acceptance Scenarios**:

1. **Given** the entry page, **When** the user chooses "Expert session", "Newcomer practice" or "Work Map", **Then** the matching area opens.
2. **Given** a placeholder area such as Work Map, **When** it is opened, **Then** it states which later sprint delivers it, and the fixture banner is visible if it shows fixture data.
3. **Given** data marked as live, **When** a screen shows it, **Then** no fixture banner appears.
4. **Given** the developer tools area, **When** it is opened, **Then** the existing voice prototype works exactly as before.

---

### User Story 3 - Stable UI contract for partner workstreams (Priority: P2)

Backend (WS6) and knowledge (WS5) owners receive a written summary of the UI states and data WS7 needs: sessions, evidence, regions, knowledge status, Work Map items, learner drafts, evaluations and assessments. They can align their outputs with it before the real screens are built.

**Why this priority**: The partner workstreams don't exist yet. An early, explicit contract prevents incompatible formats, but this story isn't user-facing.

**Independent Test**: Read the contract summary note. Every UI state the brief requires is listed, with the source workstream expected to supply it.

**Acceptance Scenarios**:

1. **Given** the contract note, **When** a WS6 owner reads it, **Then** they find the list of UI states WS7 needs from WS6, including acknowledgement states for off-record, save and other actions.
2. **Given** the fixture data, **When** it is inspected, **Then** it contains no evaluator-only fields (expected answers, acceptable explanations, common wrong decision, scoring) and no domain interpretation.

---

### Edge Cases

- A region touches or extends past the image edge: the focus view is clamped to the image bounds and the outline is clipped, not shifted.
- A very small region: the focus view uses a minimum zoom window so context remains visible.
- The image fails to load: the viewer shows an error state and draws no outline.
- No region is supplied: the viewer shows the full image without an outline.
- The data source fails to load: the screen shows an error state instead of a blank page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST provide distinct areas for entry, expert session, review, Work Map, practice, summary and developer tools, reachable from shared navigation.
- **FR-002**: The existing voice prototype MUST remain available, unchanged in behaviour, in the developer tools area.
- **FR-003**: Every screen showing fixture data MUST show a visible "FIXTURE DATA" banner. Screens showing live data MUST NOT.
- **FR-004**: All screen data MUST come through one data-access layer with a single interface, so the fixture implementation can later be replaced by the shared backend without changing screens.
- **FR-005**: The data-access layer MUST expose user actions as requests that return an acknowledgement or failure, and MUST provide a way to subscribe to live updates.
- **FR-006**: The evidence viewer MUST map a normalized region on the original frame to the displayed image at any size.
- **FR-007**: The evidence viewer MUST distinguish resolved, ambiguous and unresolved regions using shape and text, not colour alone.
- **FR-008**: The evidence viewer MUST refuse to draw a region whose frame differs from the shown image's frame, and say why.
- **FR-009**: The evidence viewer MUST offer a focus view, a full-image view and a keyboard-accessible full-screen inspect view.
- **FR-010**: Visual design MUST favour legibility on a large monitor viewed through smart glasses: large text, high contrast and thick outlines. It MUST support light and dark themes.
- **FR-011**: Fixture data MUST be labelled as fixture data and MUST NOT contain evaluator-only answers or invented domain interpretations.
- **FR-012**: A contract summary MUST document the UI data shapes and the UI states needed from WS6 and WS5, marked as v0 pending agreement.
- **FR-013**: Automated unit, component and end-to-end smoke checks MUST cover region mapping, focus clamping, frame mismatch, ambiguous/unresolved rendering, banner visibility and route availability.

### Key Entities

- **Session view**: role (expert/newcomer), lifecycle, recording state including pending states, connection status of capture/agent/backend, case and knowledge revision references, data source (live/fixture).
- **Evidence asset**: a stored image of a captured frame, with its frame identity and pixel dimensions, and an optional highlighted derivative.
- **Evidence region**: a normalized box on one specific frame, with a mapping status (resolved/ambiguous/unresolved).
- **Knowledge status**: draft, confirmed, unresolved, revoked or missing.
- **Work Map view**: ordered steps, decisions, guardrails and exceptions. Each one has the expert's verbatim quotes, an AI summary kept separate, reasoning, guardrails, evidence and status.
- **Learner draft / evaluation**: the learner's decision and reason at a specific draft revision. An evaluation refers to exactly one draft revision and one knowledge revision.
- **Assessment view**: what was done independently, what needed help, what remains unresolved, and what to practise next.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of app areas load from navigation without errors.
- **SC-002**: For every fixture screen, the fixture banner is visible. For live-marked data, it is absent in 100% of checked cases.
- **SC-003**: Region outlines align with the intended region within 1 display pixel at every tested display size.
- **SC-004**: 0 outlines are drawn for unresolved regions or mismatched frames in the automated checks.
- **SC-005**: A reviewer wearing the glasses can read the trace labels and see the region outline on the demo monitor (human gate).
- **SC-006**: 0 evaluator-only fields are found in fixture data.

## Assumptions

- WS3's shared contracts and test runner have not landed yet. This sprint adds the test runner in a compatible way and defines WS7 types independently, to be reconciled when WS3's types arrive.
- Fixture trace images are neutral, watermarked placeholders. Real WS4 assets replace them later.
- A WS6 backend doesn't exist yet. Only the fixture data implementation is built in this sprint.
- Later-sprint data actions may exist only as clearly marked "not implemented" stubs.
- Demo-display legibility is judged by a human. Automated checks cover only geometry and states.

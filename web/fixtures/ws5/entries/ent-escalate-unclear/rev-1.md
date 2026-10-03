---
schema_version: "ws5.v0"
entry_id: "ent-escalate-unclear"
revision_id: "rev-1"
parent_revision_id: null
status: "confirmed"
kind: "escalation"
workflow_position: 4
source: "fixture"
produced_by: {"module":"ws5-fixtures","version":"0.1.0"}
created_at_utc: "2026-10-03T10:03:20.000Z"
revoked_at_utc: null
revoked_reason: null
---

# escalation `ent-escalate-unclear` · rev-1

> **Status:** confirmed · **Kind:** escalation · **Source:** fixture

## Workflow step/decision

[AI synthesis] FIXTURE escalation: when region A cannot be told apart, escalate instead of saving.

## Observation

_unknown_

## Expert's words

> "when I can't tell region A apart, I escalate to a senior engineer instead of saving a decision."
> — exchange `exc-004`

## Expert interpretation

_none_

## Reasoning

_none_

## Synthesis (AI, not expert words)

_none_

## Exceptions / guardrails

- **When:** [expert words · exc-004] "when I can't tell region A apart"
  **Then:** [expert words · exc-004] "I escalate to a senior engineer instead of saving a decision"

## Visual evidence

- Event `evt-003`
  ![highlighted region of evt-003](<../../../../public/fixtures/trace-a-evt-001-highlight.svg>) [original frame](<../../../../public/fixtures/trace-a-full.svg>)
  <!-- ws5:visual {"event_id":"evt-003","asset_id":null,"image_ref":"../../../../public/fixtures/trace-a-full.svg","highlighted_image_ref":"../../../../public/fixtures/trace-a-evt-001-highlight.svg","region":{"x":0.2,"y":0.15,"width":0.15,"height":0.25,"coordinate_space":"original_frame_normalized","frame_width_px":1600,"frame_height_px":900},"session_time_ms":8000,"signal_interval":null} -->

## Confirmation evidence

- `cnf-003`: **confirmed** for revision `rev-1`, expert response `exc-005`
  <!-- ws5:confirmation {"confirmation_id":"cnf-003","revision_id_reviewed":"rev-1","result":"confirmed","expert_response_exchange_id":"exc-005"} -->

## Qualifiers

_none_

## Open questions

_none_

---
schema_version: "ws5.v0"
entry_id: "ent-decision-a"
revision_id: "rev-1"
parent_revision_id: null
status: "confirmed"
kind: "decision"
workflow_position: 2
source: "fixture"
produced_by: {"module":"ws5-fixtures","version":"0.1.0"}
created_at_utc: "2026-10-03T10:03:20.000Z"
revoked_at_utc: null
revoked_reason: null
---

# decision `ent-decision-a` · rev-1

> **Status:** confirmed · **Kind:** decision · **Source:** fixture

## Workflow step/decision

[AI synthesis] FIXTURE decision: choose decision A.

## Observation

[AI synthesis] FIXTURE observation: region A with cue B.

## Expert's words

> "I choose FIXTURE decision A only if FIXTURE cue B is also visible."
> — exchange `exc-002`

## Expert interpretation

_none_

## Reasoning

- [expert words · exc-002] "only if FIXTURE cue B is also visible" <!-- ws5:reasoning 0 -->

## Synthesis (AI, not expert words)

_none_

## Exceptions / guardrails

_none_

## Visual evidence

- Event `evt-001`
  ![highlighted region of evt-001](<../../../../public/fixtures/trace-a-evt-001-highlight.svg>) [original frame](<../../../../public/fixtures/trace-a-full.svg>)
  <!-- ws5:visual {"event_id":"evt-001","asset_id":null,"image_ref":"../../../../public/fixtures/trace-a-full.svg","highlighted_image_ref":"../../../../public/fixtures/trace-a-evt-001-highlight.svg","region":{"x":0.2,"y":0.15,"width":0.15,"height":0.25,"coordinate_space":"original_frame_normalized","frame_width_px":1600,"frame_height_px":900},"session_time_ms":5000,"signal_interval":null} -->

## Confirmation evidence

- `cnf-006`: **confirmed** for revision `rev-1`, expert response `exc-005`
  <!-- ws5:confirmation {"confirmation_id":"cnf-006","revision_id_reviewed":"rev-1","result":"confirmed","expert_response_exchange_id":"exc-005"} -->

## Qualifiers

- "only if"

## Open questions

_none_

---
schema_version: "ws5.v0"
entry_id: "ent-guardrail-c"
revision_id: "rev-1"
parent_revision_id: null
status: "confirmed"
kind: "guardrail"
workflow_position: 3
source: "fixture"
produced_by: {"module":"ws5-fixtures","version":"0.1.0"}
created_at_utc: "2026-10-03T10:03:20.000Z"
revoked_at_utc: null
revoked_reason: null
---

# guardrail `ent-guardrail-c` · rev-1

> **Status:** confirmed · **Kind:** guardrail · **Source:** fixture

## Workflow step/decision

[AI synthesis] FIXTURE guardrail: check the second channel before saving decision A.

## Observation

[AI synthesis] FIXTURE observation: highlighted region on the second channel.

## Expert's words

> "never save FIXTURE decision A when FIXTURE condition C is present on the second channel."
> — exchange `exc-003`

## Expert interpretation

_none_

## Reasoning

_none_

## Synthesis (AI, not expert words)

_none_

## Exceptions / guardrails

- **When:** [expert words · exc-003] "FIXTURE condition C is present on the second channel"
  **Then:** [expert words · exc-003] "never save FIXTURE decision A"

## Visual evidence

- Event `evt-002`
  ![highlighted region of evt-002](<../../../../public/fixtures/trace-a-evt-002-highlight.svg>) [original frame](<../../../../public/fixtures/trace-a-full.svg>)
  <!-- ws5:visual {"event_id":"evt-002","asset_id":null,"image_ref":"../../../../public/fixtures/trace-a-full.svg","highlighted_image_ref":"../../../../public/fixtures/trace-a-evt-002-highlight.svg","region":{"x":0.55,"y":0.55,"width":0.15,"height":0.25,"coordinate_space":"original_frame_normalized","frame_width_px":1600,"frame_height_px":900},"session_time_ms":21000,"signal_interval":null} -->

## Confirmation evidence

- `cnf-002`: **confirmed** for revision `rev-1`, expert response `exc-005`
  <!-- ws5:confirmation {"confirmation_id":"cnf-002","revision_id_reviewed":"rev-1","result":"confirmed","expert_response_exchange_id":"exc-005"} -->

## Qualifiers

_none_

## Open questions

_none_

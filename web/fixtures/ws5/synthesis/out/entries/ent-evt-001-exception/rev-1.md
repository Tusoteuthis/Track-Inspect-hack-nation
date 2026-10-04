---
schema_version: "ws5.v0"
entry_id: "ent-evt-001-exception"
revision_id: "rev-1"
parent_revision_id: null
status: "draft"
kind: "exception"
workflow_position: 4
source: "fixture"
produced_by: {"module":"ws5-synthesis","version":"0.2.0"}
created_at_utc: "2026-10-03T10:08:11.000Z"
revoked_at_utc: null
revoked_reason: null
change_reason: null
---

# exception `ent-evt-001-exception` · rev-1

> **Status:** draft · **Kind:** exception · **Source:** fixture

## Workflow step/decision

[AI synthesis] Before deciding, check whether the exception the expert stated applies.

## Observation

[AI synthesis] The expert pointed at a region of trace trace-A, channel SYS1 (event evt-001).

## Expert's words

> "Unless FIXTURE condition E is present."
> — exchange `sx-008`

## Expert interpretation

_none_

## Reasoning

_none_

## Synthesis (AI, not expert words)

_none_

## Exceptions / guardrails

- **When:** [expert words · sx-008] "Unless FIXTURE condition E is present."
  **Then:** [AI synthesis] Apply the exception the expert stated instead of the usual step.

## Visual evidence

- Event `evt-001`
  ![highlighted region of evt-001](<../../../../../../public/fixtures/trace-a-evt-001-highlight.svg>) [original frame](<../../../../../../public/fixtures/trace-a-full.svg>)
  <!-- ws5:visual {"event_id":"evt-001","asset_id":null,"image_ref":"../../../../../../public/fixtures/trace-a-full.svg","highlighted_image_ref":"../../../../../../public/fixtures/trace-a-evt-001-highlight.svg","region":{"x":0.2,"y":0.15,"width":0.15,"height":0.25,"coordinate_space":"original_frame_normalized","frame_width_px":1600,"frame_height_px":900},"session_time_ms":5000,"signal_interval":null} -->

## Confirmation evidence

_none_

## Qualifiers

- "Unless"

## Open questions

_none_

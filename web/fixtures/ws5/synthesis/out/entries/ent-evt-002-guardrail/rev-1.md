---
schema_version: "ws5.v0"
entry_id: "ent-evt-002-guardrail"
revision_id: "rev-1"
parent_revision_id: null
status: "draft"
kind: "guardrail"
workflow_position: 6
source: "fixture"
produced_by: {"module":"ws5-synthesis","version":"0.2.0"}
created_at_utc: "2026-10-03T10:04:12.000Z"
revoked_at_utc: null
revoked_reason: null
change_reason: null
---

# guardrail `ent-evt-002-guardrail` · rev-1

> **Status:** draft · **Kind:** guardrail · **Source:** fixture

## Workflow step/decision

[AI synthesis] Before saving, check the stop condition the expert stated; if it applies, stop.

## Observation

[AI synthesis] The expert pointed at a region of trace trace-A, channel SYS2 (event evt-002).

## Expert's words

> "Maybe also when FIXTURE pattern B is faint."
> — exchange `sx-004`

## Expert interpretation

_none_

## Reasoning

_none_

## Synthesis (AI, not expert words)

_none_

## Exceptions / guardrails

- **When:** [expert words · sx-004] "Maybe also when FIXTURE pattern B is faint."
  **Then:** [AI synthesis] Stop; do not continue past this point.

## Visual evidence

- Event `evt-002`
  ![highlighted region of evt-002](<../../../../../../public/fixtures/trace-a-evt-002-highlight.svg>) [original frame](<../../../../../../public/fixtures/trace-a-full.svg>)
  <!-- ws5:visual {"event_id":"evt-002","asset_id":null,"image_ref":"../../../../../../public/fixtures/trace-a-full.svg","highlighted_image_ref":"../../../../../../public/fixtures/trace-a-evt-002-highlight.svg","region":{"x":0.55,"y":0.55,"width":0.15,"height":0.25,"coordinate_space":"original_frame_normalized","frame_width_px":1600,"frame_height_px":900},"session_time_ms":21000,"signal_interval":null} -->

## Confirmation evidence

_none_

## Qualifiers

- "Maybe"

## Open questions

_none_

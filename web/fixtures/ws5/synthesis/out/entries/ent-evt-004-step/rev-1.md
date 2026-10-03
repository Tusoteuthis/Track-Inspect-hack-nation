---
schema_version: "ws5.v0"
entry_id: "ent-evt-004-step"
revision_id: "rev-1"
parent_revision_id: null
status: "draft"
kind: "step"
workflow_position: 3
source: "fixture"
produced_by: {"module":"ws5-synthesis","version":"0.2.0"}
created_at_utc: "2026-10-03T10:05:11.000Z"
revoked_at_utc: null
revoked_reason: null
change_reason: null
---

# step `ent-evt-004-step` · rev-1

> **Status:** draft · **Kind:** step · **Source:** fixture

## Workflow step/decision

[AI synthesis] Look at the region the expert pointed to and check it as the expert described.

## Observation

[AI synthesis] The expert pointed at a region of trace trace-A (event evt-004).

## Expert's words

> "FIXTURE: this one is FIXTURE pattern D."
> — exchange `sx-005`

## Expert interpretation

- [expert words · sx-005] "FIXTURE: this one is FIXTURE pattern D." <!-- ws5:interpretation 0 -->

## Reasoning

_none_

## Synthesis (AI, not expert words)

_none_

## Exceptions / guardrails

_none_

## Visual evidence

- Event `evt-004`
  ![highlighted region of evt-004](<../../../../../../public/fixtures/trace-a-evt-004-highlight.svg>) [original frame](<../../../../../../public/fixtures/trace-a-full.svg>)
  <!-- ws5:visual {"event_id":"evt-004","asset_id":null,"image_ref":"../../../../../../public/fixtures/trace-a-full.svg","highlighted_image_ref":"../../../../../../public/fixtures/trace-a-evt-004-highlight.svg","region":{"x":0.4,"y":0.1,"width":0.12,"height":0.75,"coordinate_space":"original_frame_normalized","frame_width_px":1600,"frame_height_px":900},"session_time_ms":34000,"signal_interval":null} -->

## Confirmation evidence

_none_

## Qualifiers

_none_

## Open questions

_none_

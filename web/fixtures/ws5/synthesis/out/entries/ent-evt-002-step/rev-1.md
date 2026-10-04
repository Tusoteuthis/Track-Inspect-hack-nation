---
schema_version: "ws5.v0"
entry_id: "ent-evt-002-step"
revision_id: "rev-1"
parent_revision_id: null
status: "draft"
kind: "step"
workflow_position: 2
source: "fixture"
produced_by: {"module":"ws5-synthesis","version":"0.2.0"}
created_at_utc: "2026-10-03T10:03:12.000Z"
revoked_at_utc: null
revoked_reason: null
change_reason: null
---

# step `ent-evt-002-step` · rev-1

> **Status:** draft · **Kind:** step · **Source:** fixture

## Workflow step/decision

[AI synthesis] Look at the region the expert pointed to and check it as the expert described.

## Observation

[AI synthesis] The expert pointed at a region of trace trace-A, channel SYS2 (event evt-002).

## Expert's words

> "FIXTURE: this second region shows FIXTURE pattern B."
> — exchange `sx-003`

> "It is normally FIXTURE decision B."
> — exchange `sx-003`

## Expert interpretation

- [expert words · sx-003] "FIXTURE: this second region shows FIXTURE pattern B." <!-- ws5:interpretation 0 -->
- [expert words · sx-003] "It is normally FIXTURE decision B." <!-- ws5:interpretation 1 -->

## Reasoning

_none_

## Synthesis (AI, not expert words)

_none_

## Exceptions / guardrails

_none_

## Visual evidence

- Event `evt-002`
  ![highlighted region of evt-002](<../../../../../../public/fixtures/trace-a-evt-002-highlight.svg>) [original frame](<../../../../../../public/fixtures/trace-a-full.svg>)
  <!-- ws5:visual {"event_id":"evt-002","asset_id":null,"image_ref":"../../../../../../public/fixtures/trace-a-full.svg","highlighted_image_ref":"../../../../../../public/fixtures/trace-a-evt-002-highlight.svg","region":{"x":0.55,"y":0.55,"width":0.15,"height":0.25,"coordinate_space":"original_frame_normalized","frame_width_px":1600,"frame_height_px":900},"session_time_ms":21000,"signal_interval":null} -->

## Confirmation evidence

_none_

## Qualifiers

- "normally"

## Open questions

_none_

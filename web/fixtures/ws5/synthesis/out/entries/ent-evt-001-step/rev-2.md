---
schema_version: "ws5.v0"
entry_id: "ent-evt-001-step"
revision_id: "rev-2"
parent_revision_id: "rev-1"
status: "draft"
kind: "decision"
workflow_position: 1
source: "fixture"
produced_by: {"module":"ws5-synthesis","version":"0.2.0"}
created_at_utc: "2026-10-03T10:12:11.000Z"
revoked_at_utc: null
revoked_reason: null
change_reason: "support changed: added sx-010 (correction cnf-sx-001)"
---

# decision `ent-evt-001-step` · rev-2

> **Status:** draft · **Kind:** decision · **Source:** fixture

## Workflow step/decision

[AI synthesis] Look at the region the expert pointed to, check it as the expert described, and decide for the reasons the expert gave.

## Observation

[AI synthesis] The expert pointed at a region of trace trace-A, channel SYS1 (event evt-001).

## Expert's words

> "FIXTURE: on this region I read FIXTURE pattern A."
> — exchange `sx-001`

> "It usually means FIXTURE decision A."
> — exchange `sx-001`

> "Because FIXTURE cue A1 is present."
> — exchange `sx-002`

> "And I never save FIXTURE decision A when FIXTURE condition C is visible."
> — exchange `sx-002`

> "No, FIXTURE decision A also needs FIXTURE cue A2."
> — exchange `sx-010`

## Expert interpretation

- [expert words · sx-001] "FIXTURE: on this region I read FIXTURE pattern A." <!-- ws5:interpretation 0 -->
- [expert words · sx-001] "It usually means FIXTURE decision A." <!-- ws5:interpretation 1 -->
- [expert words · sx-010] "No, FIXTURE decision A also needs FIXTURE cue A2." <!-- ws5:interpretation 2 -->

## Reasoning

- [expert words · sx-002] "Because FIXTURE cue A1 is present." <!-- ws5:reasoning 0 -->
- [expert words · sx-002] "And I never save FIXTURE decision A when FIXTURE condition C is visible." <!-- ws5:reasoning 1 -->

## Synthesis (AI, not expert words)

_none_

## Exceptions / guardrails

_none_

## Visual evidence

- Event `evt-001`
  ![highlighted region of evt-001](<../../../../../../public/fixtures/trace-a-evt-001-highlight.svg>) [original frame](<../../../../../../public/fixtures/trace-a-full.svg>)
  <!-- ws5:visual {"event_id":"evt-001","asset_id":null,"image_ref":"../../../../../../public/fixtures/trace-a-full.svg","highlighted_image_ref":"../../../../../../public/fixtures/trace-a-evt-001-highlight.svg","region":{"x":0.2,"y":0.15,"width":0.15,"height":0.25,"coordinate_space":"original_frame_normalized","frame_width_px":1600,"frame_height_px":900},"session_time_ms":5000,"signal_interval":null} -->

## Confirmation evidence

_none_

## Qualifiers

- "usually"

## Open questions

_none_

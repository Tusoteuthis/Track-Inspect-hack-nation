// Test support: the exact `[PHASE debrief]` / `[TEACH_BACK]` lines that the Sprint 3 probes
// inject, produced by the real reducer for a small deterministic fixture session. probes.test.ts
// checks that agents/probes.json still contains exactly these lines.
import { controlDebriefStart, controlTeachBack } from "./context-update";
import { phaseBlock } from "./debrief";
import { driver } from "./test-driver";

export const PROBE_SESSION_ID = "ses-20261004-070000-prb1";

export function probeSystemLines() {
  const d = driver(PROBE_SESSION_ID);
  d.event("evt-001");
  d.ask({ event_id: "evt-001", kind: "explain", question: "What do you recognise in this region?" });
  d.expert("That spike is usually from the wheel set passing a gap.");
  d.act({ type: "coverage_recorded", params: { exchange_id: "ex-001", dimensions: [{ dimension: "decision", status: "partial", note: "flags it" }] } });
  d.ask({ event_id: "evt-001", kind: "guardrail", question: "When would you stop and ask someone else about that spike?" });
  d.expert("If both channels show it at the same moment I stop and call the measurement team.");
  d.act({ type: "coverage_recorded", params: { exchange_id: "ex-002", dimensions: [{ dimension: "guardrails", status: "covered", note: "both channels" }] } });
  d.event("evt-002");
  d.act({ type: "task_completed", trigger: "console" });
  const debrief = phaseBlock(d.state)!;
  const agenda = d.state.debrief_agenda.map(g => g.gap_id);

  d.ask({ event_id: "evt-002", kind: "gap", phase: "debrief", gap_id: agenda[0], question: "What about the region you pointed at on SYS2?" });
  d.expert("That drift is the sensor warming up, I ignore it in the first ten minutes.");
  d.act({ type: "coverage_recorded", params: { exchange_id: d.lastExchangeId(), dimensions: [{ dimension: "decision", status: "covered", note: "ignore" }] } });
  d.act({
    type: "draft_proposed",
    trigger: "console",
    params: {
      steps: [
        { kind: "step", text: "First scan SYS1 for a narrow spike; it is usually from the wheel set passing a gap.", event_ids: ["evt-001"], exchange_ids: ["ex-001"] },
        { kind: "guardrail", text: "If both channels show it at the same moment, stop and call the measurement team.", event_ids: ["evt-001"], exchange_ids: ["ex-002"] },
        { kind: "step", text: "On SYS2, ignore a slow drift in the first ten minutes: it is the sensor warming up.", event_ids: ["evt-002"], exchange_ids: [d.lastExchangeId()] },
      ],
    },
  });
  return {
    debrief,
    agenda,
    controlDebrief: controlDebriefStart(),
    teachBack: phaseBlock(d.state)!,
    controlTeachBack: controlTeachBack("rev-1"),
  };
}

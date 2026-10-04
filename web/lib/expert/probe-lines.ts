// Test support: the exact system lines and tool results that the Sprint 3 probes replay,
// produced by the real reducer for a small deterministic fixture session. probes.test.ts
// checks that agents/probes.json still contains exactly these strings.
import { controlDebriefStart, controlTeachBack } from "./context-update";
import { phaseBlock } from "./debrief";
import { RECORD_STATE_RESULT } from "./record-state";
import { driver } from "./test-driver";

export const PROBE_SESSION_ID = "ses-20261004-070000-prb1";

export const PROBE_TOOL_PARAMS = {
  bqLive1: { event_id: "evt-001", kind: "explain", question: "What do you recognise in this region?" },
  covLive1: { exchange_id: "ex-001", dimensions: [{ dimension: "decision", status: "partial", note: "flags the spike" }] },
  bqLive2: { event_id: "evt-001", kind: "guardrail", question: "When would you stop and ask someone else about that spike?" },
  covLive2: { exchange_id: "ex-002", dimensions: [{ dimension: "guardrails", status: "covered", note: "both channels: call the team" }] },
  setOff: { state: "off_record" },
  setOn: { state: "on_record" },
  bqDebrief1: { event_id: "evt-002", kind: "gap", phase: "debrief", gap_id: "gap-oq-001", question: "What do you see and decide at the region you pointed at on SYS2?" },
  covDebrief1: { exchange_id: "ex-003", dimensions: [{ dimension: "decision", status: "covered", note: "ignores early drift" }] },
  bqDebrief2: {
    event_id: "evt-001",
    kind: "gap",
    phase: "debrief",
    gap_id: "gap-evt-001-alternatives",
    question: "What could look similar to that spike on SYS1, and how would you tell them apart?",
  },
} as const;

export const PROBE_ANSWERS = {
  live1: "That spike is usually from the wheel set passing a gap.",
  live2: "If both channels show it at the same moment I stop and call the measurement team.",
  debrief1: "That drift is the sensor warming up, I ignore it in the first ten minutes.",
  correction: "No, that's wrong, it's only when both channels show it at the same moment and it repeats on the next sleeper.",
  offRecord: "Off the record: honestly, the pineapple calibration crew never signed this section off.",
  offRecordMore: "Between us, the pineapple calibration was a mess that whole year.",
  backOn: "Okay, back on the record.",
  strike: "Sorry, forget what I just said.",
};

export const PROBE_TEACH_BACK_SPOKEN =
  "Here is how I would apply it. First, scan the upper channel for a narrow spike; it is usually the wheel set passing a gap. If both channels show it at the same moment, stop and call the measurement team. On the lower channel, ignore a slow drift in the first ten minutes, because that is the sensor warming up. Is that right, or would you change anything?";
export const PROBE_CORRECTED_STEP =
  "Stop and call the measurement team only when both channels show the spike at the same moment and it repeats on the next sleeper.";

export function probeSystemLines() {
  const d = driver(PROBE_SESSION_ID);
  const P = PROBE_TOOL_PARAMS;
  const results: Record<string, string> = {};
  const tool = (key: keyof typeof P, run: () => string | null) => {
    results[key] = run() ?? "";
  };

  d.event("evt-001");
  tool("bqLive1", () => d.ask({ ...P.bqLive1 }));
  d.expert(PROBE_ANSWERS.live1);
  tool("covLive1", () => d.act({ type: "coverage_recorded", params: P.covLive1 }));
  tool("bqLive2", () => d.ask({ ...P.bqLive2 }));
  d.expert(PROBE_ANSWERS.live2);
  tool("covLive2", () => d.act({ type: "coverage_recorded", params: P.covLive2 }));
  // off-record branch: the tool results the app returns for set_record_state, then the strike branch
  const live = d.state;
  d.expert(PROBE_ANSWERS.offRecord);
  results.setOff = d.act({ type: "record_state_tool", params: P.setOff }) ?? "";
  d.expert(PROBE_ANSWERS.offRecordMore);
  d.expert(PROBE_ANSWERS.backOn);
  results.setOn = d.act({ type: "record_state_tool", params: P.setOn }) ?? "";
  d.state = live;
  d.expert(PROBE_ANSWERS.strike);
  const strike = d.act({ type: "strike_requested", trigger: "agent_tool" }) ?? "";
  d.state = live;

  d.event("evt-002");
  d.act({ type: "task_completed", trigger: "console" });
  const debrief = phaseBlock(d.state)!;
  const agenda = d.state.debrief_agenda.map(g => g.gap_id);

  tool("bqDebrief1", () => d.ask({ ...P.bqDebrief1 }));
  d.expert(PROBE_ANSWERS.debrief1);
  tool("covDebrief1", () => d.act({ type: "coverage_recorded", params: P.covDebrief1 }));
  const beforeDraft = d.state;
  tool("bqDebrief2", () => d.ask({ ...P.bqDebrief2 }));
  d.state = beforeDraft; // the teach-back branch continues without the second debrief question

  d.act({
    type: "draft_proposed",
    trigger: "console",
    params: {
      steps: [
        { kind: "step", text: "First scan SYS1 for a narrow spike; it is usually from the wheel set passing a gap.", event_ids: ["evt-001"], exchange_ids: ["ex-001"] },
        { kind: "guardrail", text: "If both channels show it at the same moment, stop and call the measurement team.", event_ids: ["evt-001"], exchange_ids: ["ex-002"] },
        { kind: "step", text: "On SYS2, ignore a slow drift in the first ten minutes: it is the sensor warming up.", event_ids: ["evt-002"], exchange_ids: ["ex-003"] },
      ],
    },
  });
  const teachBack = phaseBlock(d.state)!;

  // correction branch: what propose_draft returns after the expert corrects the guardrail
  d.agent(PROBE_TEACH_BACK_SPOKEN);
  d.expert(PROBE_ANSWERS.correction);
  const correction = d.lastExchangeId();
  d.act({ type: "revision_confirmed", params: { revision_id: "rev-1", status: "corrected" } });
  const rev1 = d.state.revisions[0];
  const proposeRev2 = d.act({
    type: "draft_proposed",
    trigger: "agent_tool",
    params: {
      steps: rev1.steps.map(s =>
        s.kind === "guardrail"
          ? { kind: s.kind, text: PROBE_CORRECTED_STEP, event_ids: ["evt-001"], exchange_ids: ["ex-002", correction] }
          : { kind: s.kind, text: s.text, event_ids: s.supporting_event_ids, exchange_ids: s.supporting_exchange_ids }
      ),
      change_reason: "only when both channels show it at the same moment and it repeats on the next sleeper",
    },
  })!;

  return {
    strike,
    proposeRev2,
    debrief,
    agenda,
    controlDebrief: controlDebriefStart(),
    teachBack,
    controlTeachBack: controlTeachBack("rev-1"),
    results,
  };
}

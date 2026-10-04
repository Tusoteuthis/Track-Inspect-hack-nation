// Test support: the exact system lines and tool results that the Sprint 3 probes replay,
// produced by the real reducer for a small deterministic fixture session. probes.test.ts
// checks that agents/probes.json still contains exactly these strings.
import { controlDebriefStart, controlTeachBack } from "./context-update";
import { phaseBlock } from "./debrief";
import { driver } from "./test-driver";

export const PROBE_SESSION_ID = "ses-20261004-070000-prb1";

export const PROBE_TOOL_PARAMS = {
  bqLive1: { event_id: "evt-001", kind: "explain", question: "What do you recognise in this region?" },
  covLive1: { exchange_id: "ex-001", dimensions: [{ dimension: "decision", status: "partial", note: "flags the spike" }] },
  bqLive2: { event_id: "evt-001", kind: "guardrail", question: "When would you stop and ask someone else about that spike?" },
  covLive2: { exchange_id: "ex-002", dimensions: [{ dimension: "guardrails", status: "covered", note: "both channels: call the team" }] },
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
};

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
  return {
    debrief,
    agenda,
    controlDebrief: controlDebriefStart(),
    teachBack: phaseBlock(d.state)!,
    controlTeachBack: controlTeachBack("rev-1"),
    results,
  };
}

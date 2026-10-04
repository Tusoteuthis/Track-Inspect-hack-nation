/**
 * Stub synthesis, used when WS5_MODULES=stub. Obviously fake on purpose: one draft per session
 * that lists the screen moments and echoes exchange IDs with the expert's answer lines verbatim.
 * No interpretation, no gaps, no teach-back. Every output carries `source: "stub"`.
 */
import type { ModuleInfo } from "@/lib/contracts";
import type { SynthesisHost, SynthesisModule } from "./modules";

export const STUB_MODULE: ModuleInfo = { id: "ws6-stub-synthesis", version: "0.1.0", source: "stub" };
export const STUB_HEADING = "STUB SYNTHESIS — not expert knowledge";

export const stubEntryId = (sessionId: string) => `ent-stub-${sessionId}`.slice(0, 64);

const quote = (text: string) =>
  text
    .split("\n")
    .map(l => `> ${l}`)
    .join("\n");

export function createStubSynthesis(host: SynthesisHost): SynthesisModule {
  return {
    id: STUB_MODULE.id,
    version: STUB_MODULE.version,
    async synthesize({ session, events, exchanges, prior }) {
      const entryId = stubEntryId(session.session_id);
      const header = `> ${STUB_HEADING}. Produced by \`${STUB_MODULE.id}\` ${STUB_MODULE.version} (source: stub); no WS5 synthesis ran.`;
      if (!events.length && !exchanges.length) {
        return { revisions: [], workflow_markdown: `# Workflow\n\n${header}\n\n_No steps yet._\n`, gaps: [], teach_back: null };
      }

      const sortedEvents = [...events].sort((a, b) => a.captured_at_utc.localeCompare(b.captured_at_utc));
      const sortedExchanges = [...exchanges].sort(
        (a, b) => a.asked_at_utc.localeCompare(b.asked_at_utc) || a.exchange_id.localeCompare(b.exchange_id),
      );
      const markdown = [
        `# ${STUB_HEADING}`,
        "",
        `> **Source:** stub (\`${STUB_MODULE.id}\` ${STUB_MODULE.version}). This lists the session's screen moments and the expert's answer lines verbatim. Nothing here is interpreted.`,
        "",
        "## Screen moments",
        "",
        ...sortedEvents.flatMap(e => [
          `- Event \`${e.event_id}\``,
          `  ![highlighted region of ${e.event_id}](<${host.imageRef(e.highlighted_image_ref, entryId)}>) [original frame](<${host.imageRef(e.image_ref, entryId)}>)`,
        ]),
        "",
        "## Exchanges (answer lines verbatim)",
        "",
        ...sortedExchanges.flatMap(x => [
          `### Exchange \`${x.exchange_id}\`${x.event_id ? ` (event \`${x.event_id}\`)` : ""}`,
          "",
          ...(x.answer_lines.length ? x.answer_lines.flatMap(l => [quote(l.text), ""]) : ["_no answer lines_", ""]),
        ]),
      ].join("\n");

      const latest = prior
        .filter(r => r.entry_id === entryId)
        .sort((a, b) => b.revision_no - a.revision_no)[0];
      const unchanged = latest !== undefined && (await host.loadMarkdown(latest)) === markdown;
      const no = unchanged ? latest.revision_no : (latest?.revision_no ?? 0) + 1;

      return {
        revisions: unchanged
          ? []
          : [
              {
                entry_id: entryId,
                markdown,
                evidence: {
                  event_ids: sortedEvents.map(e => e.event_id).sort(),
                  exchange_ids: sortedExchanges.map(x => x.exchange_id).sort(),
                  asset_ids: [...new Set(sortedEvents.flatMap(e => (e.asset_id ? [e.asset_id] : [])))].sort(),
                },
                produced_by: { module: STUB_MODULE.id, version: STUB_MODULE.version, source: "stub" },
                change_reason: latest ? "stub: session records changed" : null,
                revision_no: no,
              },
            ],
        workflow_markdown: [
          "# Workflow",
          "",
          header,
          "",
          `1. **${STUB_HEADING}** — [\`${entryId}\` · rev-${no}](<entries/${entryId}/rev-${no}.md>) · stub`,
          "",
        ].join("\n"),
        gaps: [],
        teach_back: null,
      };
    },
  };
}

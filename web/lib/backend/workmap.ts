/**
 * Work Map: the current workflow's steps with every link resolved server-side — screen moments
 * as fetchable image URLs with their region, the expert's verbatim answer lines with the question.
 * A link that does not resolve is reported in the step's `broken_links`, never dropped.
 *
 * Default view: confirmed, current revisions that WS5 eligibility accepts (Work Map is a labelled
 * view, so fixture material is shown with its `source`). `include=draft`: everything but revoked.
 */
import path from "node:path";
import type {
  Confirmation,
  EvidenceAsset,
  ExchangePut,
  KnowledgeRevision,
  PointingEventIngest,
  WorkMapEvidence,
  WorkMapExchange,
  WorkMapView,
  WorkMapViewStep,
} from "@/lib/contracts";
import { buildWorkMap, isTeachable, type WorkMapAsset } from "@/lib/knowledge";
import { loadAssetMeta } from "./assets";
import { listConfirmations } from "./confirmations";
import { listEvents } from "./events";
import { listExchanges } from "./exchanges";
import {
  findRevision,
  loadEntry,
  readRevisionByNo,
  readWorkflow,
  revisionStatus,
  unresolvedLocalLinks,
  type WorkflowLink,
} from "./knowledge";
import { assetDir } from "./paths";
import { latestConfirmation, ws5Content } from "./ws5-content";
import { getBlobStore } from "./blobstore";

const assetUrl = (aid: string, which: "original" | "highlighted") => `/api/assets/${aid}/${which}`;

type SessionRecords = { events: Map<string, PointingEventIngest>; exchanges: Map<string, ExchangePut> };

class Lookups {
  private sessions = new Map<string, Promise<SessionRecords>>();
  private assets = new Map<string, Promise<EvidenceAsset | null>>();
  confirmations: Promise<Confirmation[]> = listConfirmations();

  session(sid: string): Promise<SessionRecords> {
    let p = this.sessions.get(sid);
    if (!p) {
      p = Promise.all([listEvents(sid), listExchanges(sid)]).then(([events, exchanges]) => ({
        events: new Map(events.map(e => [e.event_id, e])),
        exchanges: new Map(exchanges.map(x => [x.exchange_id, x])),
      }));
      this.sessions.set(sid, p);
    }
    return p;
  }

  asset(aid: string): Promise<EvidenceAsset | null> {
    let p = this.assets.get(aid);
    if (!p) {
      p = loadAssetMeta(aid).catch(() => null);
      this.assets.set(aid, p);
    }
    return p;
  }
}

const fileExists = async (file: string) => (await getBlobStore().stat(file))?.kind === "file";

async function resolveEvidence(
  rev: KnowledgeRevision,
  records: SessionRecords | null,
  l: Lookups,
  broken: string[],
): Promise<WorkMapEvidence[]> {
  const out: WorkMapEvidence[] = [];
  for (const eid of rev.evidence.event_ids) {
    const event = records?.events.get(eid);
    if (!event) {
      broken.push(`event ${eid} not found`);
      continue;
    }
    const aid = event.asset_id;
    const asset = aid ? await l.asset(aid) : null;
    if (!aid || !asset || asset.status !== "stored" || asset.session_id !== event.session_id) {
      broken.push(`asset ${aid ?? "(none)"} for event ${eid} not available`);
      continue;
    }
    if (!(await fileExists(path.join(assetDir(aid), asset.original.path)))) {
      broken.push(`original image of asset ${aid} missing`);
      continue;
    }
    const highlighted = asset.highlighted && (await fileExists(path.join(assetDir(aid), asset.highlighted.path)));
    if (asset.highlighted && !highlighted) broken.push(`highlighted image of asset ${aid} missing`);
    out.push({
      event_id: eid,
      asset_id: aid,
      original_url: assetUrl(aid, "original"),
      highlighted_url: highlighted ? assetUrl(aid, "highlighted") : null,
      region: event.region,
    });
  }
  return out;
}

function resolveExchanges(rev: KnowledgeRevision, records: SessionRecords | null, broken: string[]): WorkMapExchange[] {
  const out: WorkMapExchange[] = [];
  for (const xid of rev.evidence.exchange_ids) {
    const x = records?.exchanges.get(xid);
    if (!x) broken.push(`exchange ${xid} not found`);
    else out.push({ exchange_id: xid, question: x.question, answer_lines: x.answer_lines.map(a => ({ ...a })) });
  }
  return out;
}

type Built = { step: WorkMapViewStep } | { excluded: WorkMapView["excluded"][number] };

async function buildStep(link: WorkflowLink, include: WorkMapView["include"], l: Lookups): Promise<Built> {
  const stored = await readRevisionByNo(link.entry_id, link.revision_no).catch(() => null);
  const empty = {
    position: link.position,
    entry_id: link.entry_id,
    revision_id: link.revision_id,
    revision_no: link.revision_no,
    status: null,
    is_current: false,
    source: null,
    title: link.title,
    evidence: [],
    exchanges: [],
    content: null,
  };
  if (!stored || (link.revision_id !== null && stored.revision.revision_id !== link.revision_id)) {
    return { step: { ...empty, broken_links: [`revision ${link.entry_id}/rev-${link.revision_no} not stored`] } };
  }
  const rev = stored.revision;
  const status = await revisionStatus(rev);
  const entry = await loadEntry(rev.entry_id);
  const isCurrent = entry?.current_revision_id === rev.revision_id;
  const exclude = (reason: string): Built => ({ excluded: { entry_id: rev.entry_id, revision_id: rev.revision_id, reason } });

  if (status === "revoked") return exclude("revoked");
  if (include === "confirmed" && status !== "confirmed") return exclude(`not_confirmed: status is ${status}`);
  if (include === "confirmed" && !isCurrent) return exclude(`superseded: current revision is ${entry?.current_revision_id ?? "none"}`);

  const broken: string[] = [];
  const sid = rev.session_id ?? null;
  if (!sid) broken.push("revision has no originating session; its evidence cannot be resolved");
  const records = sid ? await l.session(sid).catch(() => null) : null;
  const confirmation = latestConfirmation(await l.confirmations, rev.revision_id);
  const content = ws5Content(stored.markdown, rev, status, confirmation);

  if (content && include === "confirmed") {
    const t = isTeachable(
      { record_type: "knowledge_entry", path: null, entry: content },
      {
        current_revision_by_entry: entry ? { [entry.entry_id]: `rev-${entry.current_revision_no}` } : {},
        events: [...(records?.events.values() ?? [])],
        exchanges: [...(records?.exchanges.values() ?? [])],
        allow_fixture: true,
      },
    );
    // Broken links are reported on the step below; every other reason excludes it.
    if (!t.ok && t.reason !== "invalid") return exclude(`${t.reason}: ${t.detail}`);
  }

  const evidence = await resolveEvidence(rev, records, l, broken);
  const exchanges = resolveExchanges(rev, records, broken);
  for (const target of await unresolvedLocalLinks(rev.entry_id, stored.markdown)) broken.push(`image link ${target} does not resolve`);

  let ws5Step: WorkMapViewStep["content"] = null;
  if (content) {
    const assets: WorkMapAsset[] = evidence.map(e => ({
      asset_id: e.asset_id,
      event_id: e.event_id,
      original_ref: e.original_url,
      highlighted_ref: e.highlighted_url ?? e.original_url,
    }));
    const built = buildWorkMap({
      workflow: {
        produced_by: { module: rev.produced_by.module, version: rev.produced_by.version },
        steps: [
          {
            position: link.position,
            entry_id: rev.entry_id,
            revision_id: content.revision_id,
            kind: content.kind,
            status,
            title: link.title ?? content.entry_id,
            event_ids: content.visual_evidence.map(v => v.event_id),
          },
        ],
        timeline: [],
      },
      revisions: [content],
      events: [...(records?.events.values() ?? [])],
      exchanges: [...(records?.exchanges.values() ?? [])],
      assets,
      include_draft: true,
    });
    const s = built.steps[0];
    if (s) {
      ws5Step = { ...s, revision_id: rev.revision_id };
      for (const b of s.broken_links) broken.push(b);
    }
  }

  return {
    step: {
      ...empty,
      revision_id: rev.revision_id,
      status,
      is_current: isCurrent,
      source: rev.produced_by.source,
      evidence,
      exchanges,
      content: ws5Step,
      broken_links: [...new Set(broken)],
    },
  };
}

export async function getWorkMap(include: WorkMapView["include"] = "confirmed"): Promise<WorkMapView> {
  const linkage = await readWorkflow();
  const view: WorkMapView = {
    include,
    produced_by: linkage?.produced_by ?? null,
    session_id: linkage?.session_id ?? null,
    job_id: linkage?.job_id ?? null,
    generated_at_utc: linkage?.generated_at_utc ?? null,
    steps: [],
    excluded: [],
  };
  const l = new Lookups();
  for (const link of linkage?.links ?? []) {
    const built = await buildStep(link, include, l);
    if ("step" in built) view.steps.push(built.step);
    else view.excluded.push(built.excluded);
  }
  return view;
}

/**
 * Steps for an explicit set of revisions (the session review, integration G9), built exactly like
 * `include=draft` Work Map steps. Position and title come from the current workflow when the
 * entry is linked there, otherwise from the order given.
 */
export async function getRevisionSteps(revisionIds: string[]): Promise<Pick<WorkMapView, "steps" | "excluded">> {
  const links = new Map((await readWorkflow())?.links.map(link => [link.entry_id, link]) ?? []);
  const l = new Lookups();
  const out: Pick<WorkMapView, "steps" | "excluded"> = { steps: [], excluded: [] };
  for (const [i, revisionId] of revisionIds.entries()) {
    const found = await findRevision(revisionId);
    if (!found) {
      out.excluded.push({ entry_id: "unknown", revision_id: revisionId, reason: "revision not stored" });
      continue;
    }
    const rev = found.revision;
    const linked = links.get(rev.entry_id);
    const built = await buildStep(
      { position: linked?.position ?? i + 1, entry_id: rev.entry_id, revision_id: rev.revision_id, revision_no: rev.revision_no, title: linked?.title ?? null },
      "draft",
      l,
    );
    if ("step" in built) out.steps.push(built.step);
    else out.excluded.push(built.excluded);
  }
  return out;
}

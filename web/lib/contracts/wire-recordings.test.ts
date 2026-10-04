/**
 * Integration I2: every recorded WS6 response (`fixtures/ws6/wire`, written by
 * `npm run e2e -- --record fixtures/ws6/wire`) must parse with its schema here, with no field the
 * schema does not declare. WS7's mapper tests read the same files, so the wire contract cannot
 * drift on one side unnoticed.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ApiErrorBodySchema,
  AssessmentSchema,
  BusEventSchema,
  CascadeSummarySchema,
  CommitSchema,
  ConfirmationResponseSchema,
  EvaluationSchema,
  EventAckSchema,
  EvidenceAssetSchema,
  IdSchema,
  KnowledgeEntrySchema,
  LearnerCaseSchema,
  LearnerDraftSchema,
  PointingEventIngestSchema,
  ReviewMarkSchema,
  SessionDraftViewSchema,
  SessionReviewViewSchema,
  SessionSchema,
  WorkMapViewSchema,
} from "@/lib/contracts";

const WIRE_DIR = path.join(process.cwd(), "fixtures", "ws6", "wire");

const SCHEMAS: Record<string, z.ZodType> = {
  "assessment": AssessmentSchema,
  "asset.put": EvidenceAssetSchema,
  "cascade.delete_event": CascadeSummarySchema,
  "cases.get": LearnerCaseSchema,
  "cases.list": z.array(LearnerCaseSchema),
  "cases.list_expert": z.array(LearnerCaseSchema),
  "commit.created": CommitSchema,
  "commit.get": CommitSchema,
  "confirmations.post": ConfirmationResponseSchema,
  "draft.expert": SessionDraftViewSchema,
  "evaluation.intervene": EvaluationSchema,
  "evaluation.ok": EvaluationSchema,
  "evaluation.post": EvaluationSchema,
  "evaluations.list": z.object({ evaluations: z.array(EvaluationSchema) }),
  "event.put": EventAckSchema,
  "events.list": z.array(PointingEventIngestSchema),
  "knowledge.revoke": z.object({ entry: KnowledgeEntrySchema, revoked_revision_id: IdSchema, cascade: CascadeSummarySchema }),
  "learner_draft.put": LearnerDraftSchema,
  "review": SessionReviewViewSchema,
  "review_mark.post": ReviewMarkSchema,
  "session.create.expert_case": SessionSchema,
  "session.get": SessionSchema,
  "session.lifecycle.pause": SessionSchema,
  "session.lifecycle.resume": SessionSchema,
  "session.lifecycle.start": SessionSchema,
  "session.newcomer": SessionSchema,
  "session.pin": SessionSchema,
  "stream.expert": z.array(BusEventSchema),
  "stream.newcomer": z.array(BusEventSchema),
  "stream.newcomer_revoked": z.array(BusEventSchema),
  "workmap.confirmed": WorkMapViewSchema,
  "workmap.draft": WorkMapViewSchema,
};

const Recording = z.strictObject({ method: z.string(), route: z.string().startsWith("/api/"), status: z.number().int(), body: z.unknown() });

/** Paths present in `raw` but dropped by parsing, i.e. fields the schema does not declare. */
function undeclared(raw: unknown, parsed: unknown, at = "$"): string[] {
  if (Array.isArray(raw) && Array.isArray(parsed)) return raw.flatMap((v, i) => undeclared(v, parsed[i], `${at}[${i}]`));
  if (raw && typeof raw === "object" && parsed && typeof parsed === "object" && !Array.isArray(raw)) {
    const p = parsed as Record<string, unknown>;
    return Object.entries(raw).flatMap(([k, v]) => (k in p ? undeclared(v, p[k], `${at}.${k}`) : [`${at}.${k}`]));
  }
  return [];
}

const files = readdirSync(WIRE_DIR).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5)).sort();

describe("WS6 wire recordings (integration I2)", () => {
  it("every recording has a schema and every schema has a recording", () => {
    const errors = files.filter(n => n.startsWith("error."));
    expect(files.filter(n => !errors.includes(n))).toEqual(Object.keys(SCHEMAS).sort());
    expect(errors.length).toBeGreaterThan(0);
  });

  it.each(files)("%s parses with its schema and has no undeclared field", name => {
    const rec = Recording.parse(JSON.parse(readFileSync(path.join(WIRE_DIR, `${name}.json`), "utf8")));
    const schema = name.startsWith("error.") ? ApiErrorBodySchema : SCHEMAS[name];
    if (name.startsWith("error.")) expect(rec.status).toBeGreaterThanOrEqual(400);
    else expect(rec.status).toBeLessThan(300);
    const parsed = schema.safeParse(rec.body);
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    // WS5 content inside steps is `unknown` by design; everything WS6 owns must be declared.
    expect(undeclared(rec.body, parsed.data)).toEqual([]);
  });
});

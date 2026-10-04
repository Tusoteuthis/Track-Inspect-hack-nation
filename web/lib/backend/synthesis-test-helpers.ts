// Test-only helpers for synthesis, confirmation and Work Map tests.
import { promises as fsp } from "node:fs";
import path from "node:path";
import type { ExchangePut } from "@/lib/contracts";
import { makeEvent, makeExchange, seedAsset } from "./capture-test-helpers";
import { putEvent } from "./events";
import { putExchange } from "./exchanges";
import { assetDir } from "./paths";

/** Asset record plus real files, so relative image links resolve on disk. */
export async function seedAssetWithFiles(sid: string, aid: string): Promise<void> {
  await seedAsset(sid, aid);
  await fsp.writeFile(path.join(assetDir(aid), "original.png"), "png-original");
  await fsp.writeFile(path.join(assetDir(aid), "highlighted.png"), "png-highlighted");
}

export function expertExchange(
  sid: string,
  xid: string,
  eventId: string | null,
  lines: string[],
  overrides: Partial<ExchangePut> = {},
): ExchangePut {
  const base = makeExchange(sid, xid, eventId, 1);
  return {
    ...base,
    answer_lines: lines.map((text, i) => ({ text, at_utc: `2026-10-03T10:00:${String(10 + i).padStart(2, "0")}.000Z`, transcript_line_id: `${xid}-l${i + 1}` })),
    ...overrides,
  };
}

/** Two pointed moments, each with an answered exchange (the second gives a reason and a guardrail). */
export async function seedCapture(sid: string): Promise<void> {
  await seedAssetWithFiles(sid, "a-1");
  await seedAssetWithFiles(sid, "a-2");
  await putEvent(sid, "evt-001", makeEvent(sid, "evt-001", "a-1"));
  await putEvent(sid, "evt-002", makeEvent(sid, "evt-002", "a-2", { captured_at_utc: "2026-10-03T10:00:20.000Z", session_time_ms: 20000 }));
  await putExchange(sid, "x-1", expertExchange(sid, "x-1", "evt-001", ["FIXTURE: here I read FIXTURE pattern A."]));
  await putExchange(
    sid,
    "x-2",
    expertExchange(sid, "x-2", "evt-002", ["Because FIXTURE cue B is present.", "I never save it when FIXTURE condition C is visible."], {
      kind: "reasoning",
      asked_at_utc: "2026-10-03T10:00:25.000Z",
    }),
  );
}

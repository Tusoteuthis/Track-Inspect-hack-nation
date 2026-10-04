import { promises as fsp, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getCaseRoute } from "@/app/api/cases/[case_id]/route";
import { GET as getTraceRoute } from "@/app/api/cases/[case_id]/trace/route";
import { parseCaseFile, parseLearnerCase } from "@/lib/contracts";
import { useTempDirs } from "./capture-test-helpers";
import { caseTraceResponse, getLearnerCase, listCaseIds, pickNewcomerCase } from "./cases";
import { getConfig, setConfigForTests } from "./config";
import { FIXTURE_CASES_DIR } from "./learner-test-helpers";
import { assetDir, caseDir, casesRoot, imagesRoot } from "./paths";

let cleanup: () => Promise<void>;
let dir: string;

beforeEach(async () => {
  ({ cleanup, dir } = await useTempDirs("ws6-cases-"));
  setConfigForTests({ casesDir: FIXTURE_CASES_DIR });
});
afterEach(() => cleanup());

const ctx = (case_id: string) => ({ params: Promise.resolve({ case_id }) });

describe("fixture cases", () => {
  it("every fixture case parses, is labelled fixture and has a trace", async () => {
    const ids = await listCaseIds();
    expect(ids).toEqual(["fx-e01", "fx-n01", "fx-n02"]);
    for (const id of ids) {
      const raw = JSON.parse(readFileSync(path.join(FIXTURE_CASES_DIR, id, "case.json"), "utf8"));
      const parsed = parseCaseFile(raw);
      expect(parsed.ok).toBe(true);
      expect(raw.source).toBe("fixture");
    }
  });
});

describe("learner case view", () => {
  it("returns the learner view only, with a fetchable trace", async () => {
    const view = await getLearnerCase("fx-n01");
    expect(parseLearnerCase(view).ok).toBe(true);
    expect(Object.keys(view).sort()).toEqual(["case_id", "decision_options", "shown_to_expert", "source", "title", "trace", "visible_context"]);
    expect(view.trace).toEqual({ url: "/api/cases/fx-n01/trace", mime: "image/png", width_px: 320, height_px: 180 });
    const res = await getTraceRoute(new Request("http://t/api/cases/fx-n01/trace"), ctx("fx-n01"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("GET /api/cases/:id → 200 view; unknown → 404; bad id → 400", async () => {
    expect((await getCaseRoute(new Request("http://t"), ctx("fx-n01"))).status).toBe(200);
    expect((await getCaseRoute(new Request("http://t"), ctx("nope"))).status).toBe(404);
    expect((await getCaseRoute(new Request("http://t"), ctx("../x"))).status).toBe(400);
  });

  it("a case file carrying evaluator material or extra keys is unusable", async () => {
    const root = path.join(dir, "cases");
    for (const [id, extra] of [
      ["c-key", { expected_decision: "x" }],
      ["c-extra", { notes: "x" }],
    ] as const) {
      await fsp.mkdir(path.join(root, id), { recursive: true });
      await fsp.copyFile(path.join(FIXTURE_CASES_DIR, "fx-n01", "trace.png"), path.join(root, id, "trace.png"));
      await fsp.writeFile(
        path.join(root, id, "case.json"),
        JSON.stringify({ case_id: id, title: null, trace_asset: "trace.png", shown_to_expert: false, source: "fixture", ...extra }),
      );
    }
    setConfigForTests({ casesDir: root });
    for (const id of ["c-key", "c-extra"]) {
      await expect(getLearnerCase(id)).rejects.toMatchObject({ code: "not_found" });
    }
    await expect(pickNewcomerCase(null)).rejects.toMatchObject({ code: "case_not_permitted" });
  });
});

describe("newcomer case choice", () => {
  it("refuses a case shown to the expert", async () => {
    await expect(pickNewcomerCase("fx-e01")).rejects.toMatchObject({ code: "case_not_permitted", details: { reason: "shown_to_expert" } });
  });
  it("picks the first unseen case when none is named", async () => {
    expect((await pickNewcomerCase(null)).case_id).toBe("fx-n01");
    expect((await pickNewcomerCase("fx-n02")).case_id).toBe("fx-n02");
  });
});

describe("evaluator separation", () => {
  it("every served-path resolver refuses EVALUATOR_DIR", async () => {
    const evaluatorDir = getConfig().evaluatorDir;
    setConfigForTests({ casesDir: evaluatorDir });
    expect(() => casesRoot()).toThrow();
    expect(() => caseDir("fx-n01")).toThrow();
    await expect(getLearnerCase("fx-n01")).rejects.toMatchObject({ code: "not_found" });
    await expect(caseTraceResponse("fx-n01")).rejects.toMatchObject({ code: "not_found" });

    setConfigForTests({ casesDir: FIXTURE_CASES_DIR, evaluatorDir: path.join(getConfig().knowledgeDir, "images") });
    expect(() => imagesRoot()).toThrow();
    expect(() => assetDir("a-1")).toThrow();

    // A parent of the evaluator dir is refused too (it would contain the answer key).
    setConfigForTests({ casesDir: path.dirname(evaluatorDir), evaluatorDir });
    expect(() => casesRoot()).toThrow();
  });

  it("no route handler or module adapter reads EVALUATOR_DIR (only config and the path guards name it)", () => {
    const web = process.cwd();
    const files: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const p = path.join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/test-helpers\.ts$/.test(name)) files.push(p);
      }
    };
    walk(path.join(web, "app", "api"));
    walk(path.join(web, "lib", "backend"));
    const allowed = new Set(["lib/backend/config.ts", "lib/backend/paths.ts", "lib/backend/assets.ts"].map(f => path.join(web, f)));
    const offenders = files.filter(f => !allowed.has(f) && /evaluatorDir|EVALUATOR_DIR|\.runtime\/evaluator/.test(readFileSync(f, "utf8")));
    expect(offenders.map(f => path.relative(web, f))).toEqual([]);
    expect(files.length).toBeGreaterThan(30);
  });
});

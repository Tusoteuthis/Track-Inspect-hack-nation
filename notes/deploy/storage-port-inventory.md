# Storage port — fs inventory (branch `ws-cf-storage`, from voice 811309f)

Roots (from `lib/backend/config.ts`): `KNOWLEDGE_DIR` (default `../knowledge`), `RUNTIME_DIR` (default `web/.runtime`),
`EVALUATOR_DIR` (default `RUNTIME_DIR/evaluator`, **never servable**), `CASES_DIR` (`../cases/learner` or `fixtures/ws6/cases`).
`lib/expert/store.ts` takes its own root (`knowledgeRoot()` = `KNOWLEDGE_DIR`, tests pass temp dirs).

## Direct `node:fs` uses

| File | Function | Op | Path pattern |
|---|---|---|---|
| store.ts | `writeFileAtomic` | mkdir -p, open(wx)+write+fsync+close, rename, unlink (cleanup) | any record file; temp `.<name>.<hex>.tmp` in same dir |
| store.ts | `readJsonRaw` (→ `readJson`, `putImmutable`, `putMutable`) | readFile utf8, ENOENT→null | any record file |
| bus.ts | `readAll` (→ `appendBus`, `readBusAfter`) | readFile utf8, ENOENT→[] | `knowledge/sessions/<sid>/bus.ndjson` |
| bus.ts | `appendBus` | mkdir -p, appendFile | same |
| events.ts | `listIds` | readdir, ENOENT→[] | `knowledge/sessions/<sid>/{events,exchanges}/` |
| jobs.ts | `listSessionJobs` | readdir, ENOENT→[] | `RUNTIME_DIR/jobs/` |
| confirmations.ts | `listConfirmations` | readdir, ENOENT→[] | `knowledge/confirmations/` |
| review.ts | `listReviewMarks` | readdir, ENOENT→[] | `knowledge/sessions/<sid>/review-marks/` |
| learner-store.ts | `listDrafts`, `listEvaluations` | readdir, any error→[] | `knowledge/learner/<sid>/{drafts,evaluations}/` |
| knowledge.ts | `readTextOrNull` | readFile utf8, ENOENT→null | `knowledge/entries/<id>/rev-N.md`, `workflow.md` |
| knowledge.ts | `listEntryIds`, `revisionNumbers` | readdir, ENOENT→[] | `knowledge/entries/`, `knowledge/entries/<id>/` |
| knowledge.ts | `appendStatus` | mkdir -p, appendFile | `knowledge/entries/<id>/status.ndjson` |
| knowledge.ts | `unresolvedLocalLinks` | stat isFile | any path under KNOWLEDGE_DIR (from Markdown links) |
| diagnostics.ts | `readDiagLines` | readdir + readFile, errors→empty | `RUNTIME_DIR/diag/YYYY-MM-DD.ndjson` |
| diagnostics.ts | `listSessionIds` | readdir, errors→[] | `knowledge/sessions/` |
| diag.ts | `diag` | mkdir -p, appendFile (errors swallowed) | `RUNTIME_DIR/diag/YYYY-MM-DD.ndjson` |
| workmap.ts | `fileExists` | stat isFile | asset files under `knowledge/images/<aid>/` |
| cascade.ts | `listSessionIds`, `listAssetIds` | readdir, errors→[] | `knowledge/sessions/`, `knowledge/images/` |
| cascade.ts | `rmrf` | rm recursive force | session dir, learner dir, `assessments/<sid>.{json,md}`, event/exchange files, draft/gaps, asset dir |
| cascade.ts | `deleteEvent`, `deleteExchange` | stat exists | event/exchange record files |
| assets.ts | `realpathOrNull`, `readAssetFile` | realpath (symlink escape check vs images root, runtime + evaluator dirs), readFile bytes | `knowledge/images/<aid>/<file>` |
| cases.ts | `loadCaseFile` | readFile utf8 (ENOENT→missing) | `CASES_DIR/<case_id>/case.json` |
| cases.ts | `readTrace` | realpath containment + readFile bytes | `CASES_DIR/<case_id>/<trace_asset>` |
| cases.ts | `listCaseIds` | readdir withFileTypes (dirs only) | `CASES_DIR/` |
| health.ts | `isWritableDir` | mkdir -p, access W_OK | KNOWLEDGE_DIR, RUNTIME_DIR |
| config.ts | `resolveConfig` | existsSync | `../cases/learner` (startup default selection only) |
| lib/expert/store.ts | `saveSnapshot`, `writeRevisions` | mkdir -p, rm force, write tmp + rename | `knowledge/sessions/<id>/*.{json,md}`, `revisions/rev-*.{json,md}` |
| lib/expert/store.ts | `loadSnapshot`, `saveDeletionReport`, `writeRevisions` | readFile utf8 | same |

Indirect users (through `store.ts` `readJson`/`writeJsonAtomic`/`putImmutable`/`putMutable`): sessions, events,
exchanges, assets meta, jobs, synthesis (gaps/draft), learner, review, confirmations, knowledge current.json,
tombstones, assessment. Porting `store.ts` covers them.

## Operation set actually needed
read text/bytes (null on missing) · atomic replace · append line · list immediate children (names; dirs flag for cases) ·
exists/isFile · delete file · delete prefix (rm -rf) · realpath containment (only meaningful on fs) · writable check.

## In-process state (not storage, but blocks Workers)

| Where | What | Problem on Workers |
|---|---|---|
| locks.ts `tails` Map | per-key promise chain (`withLock`) used by store put*, bus append, knowledge, sessions, cascade | isolates don't share memory → no mutual exclusion |
| bus.ts `globalThis.__ws6Bus` | SSE subscribers + lastSeq cache | an append in isolate A never reaches a stream held by isolate B; seq cache can go stale |
| synthesis.ts `globalThis.__ws6SynthesisJobs` | running job per session (dedupe + `done` promise) | dedupe lost across isolates; job dies when the request ends |
| synthesis.ts `requestSynthesis` | job continues after the response (polled via `/api/jobs/:id`) | needs `waitUntil` / DO / queue |
| sse.ts | long-lived ReadableStream fed by bus subscribers | fine per isolate, but needs a shared fan-out point (DO) |

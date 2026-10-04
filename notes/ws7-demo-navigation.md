# WS7 demo navigation guide

**For:** the WS1 demo owner and whoever presents the web screens. **Updated:** 2026-10-04 (WS7 Sprint 4, branch `ws7-sprint-4`).

There is no WS1 run sheet in `notes/` yet, so this guide follows the brief's order: capture → debrief → confirmed teach-back → Work Map → unseen case → learning summary (`notes/project-brief.md`, `notes/01-…pitch.md`). Re-order the sections to match WS1's run sheet when it exists.

## Honesty rules for the presenter
- **Every data screen currently shows FIXTURE DATA.** WS6 is not merged into `voice`, so no screen is live (see "Live vs fixture" below). Don't present fixture content as captured expert knowledge. Say "this is the screen; in the live run it shows what the expert just said".
- The **voice** parts (expert apprentice on `/expert`, tutor on `/practice`) are real ElevenLabs sessions when `web/.env` has a valid key. Their content is live; the screens around them are fixture-backed.
- Never click a button to "make the agent ask". The agent decides when to speak (B2). If it is silent, keep talking to it.
- "Confirmed" comes only from the **spoken** teach-back. No button confirms anything.

## Before the demo (10 min)
1. `cd web && npm run dev -- -p 3000`. Open Chrome on the demo laptop at `http://localhost:3000/`. Use one tab and move between screens with the top navigation; fixture state such as the confirmed review and removed items carries across screens only within one tab.
2. Set the second monitor (the one the expert looks at through the glasses) to its native resolution. All screens were checked at 1920×1080 (`web/test-results/journey/`).
3. Check the microphone permission in Chrome for `localhost`.
4. Reload once just before going on stage. A reload resets all fixture state to the beginning.

## Route-by-route path

| # | Route | Click / do | Say | Proves (B3) |
|---|---|---|---|---|
| 0 | `/` | Point at the three entries. Click **Expert session**. | "One app, two people: the expert who knows, the newcomer who learns." | – |
| 1a | `/expert` (setup, video case) | **Wheel sensor pass · Sys1/Sys2** is preselected ("Video · 22.8 s · 4 holds"). Click **Open trace display (new window)**, drag it to the glasses monitor, full-screen it. The setup page shows the **Monitor** strip ("Ready"). Click **Start session**: the monitor's pill turns **● REC**. | "This is what the expert looks at through the glasses: the real sensor pass." | Glasses-first |
| 1b | Monitor (`/expert/display`) | The expert (or a clicker in their hand) presses **Space**: train approach → sensor principle → signal trace. It **holds** at 4 moments ("Hold n of 4 · Point at what you see and explain it.", violet frame). The expert points and talks; **Space**/**PgDn** resumes, **PgUp** goes back a hold, **←/→** ±1 s, **R** restarts, **H** toggles auto-hold, **Esc** exits. On the companion the strip mirrors each hold and the hold's frame appears as the indicated region (fixture-simulated pointing). | "The video freezes so the expert can point at a still picture. The tool never says what the pattern is; that is the expert's knowledge." | Visual reference; expert supplies interpretation |
| 1 | `/expert` (setup, still case) | Alternative: choose **Trace A** for the timed pointing replay. Choose the case. Optionally click **Open trace display (new window)**, drag it to the glasses monitor and make it full-screen. Show the connection panel: capture reads **Unknown** and backend reads **No backend: fixture data**. Click **Start session**. It reads "Starting… waiting for confirmation" until the session is acknowledged. | "The expert wears the glasses and points at the screen. This page never pretends a device is connected." | Glasses-first; status honesty |
| 2 | `/expert` (companion) | In the rail, press **Start** under Voice apprentice. Let the expert point and talk. You'll see a solid **Indicated region**, then a repeat, then a dashed **Ambiguous region** with "the apprentice will ask you to clarify". | "Every gesture appears here on its own frame. Ambiguous pointing is never drawn as a confident highlight. The questions come from the agent, not from this page." | **≥3 live questions incl. a guardrail question** (spoken by the agent; listen for them) |
| 3 | `/expert` | Press **O**: "Going off record… waiting for confirmation", then the red **OFF RECORD** indicator. Press **O** again to go back on record. | "Off record is shown only once the backend has acknowledged it." | Trust: off-record |
| 4 | `/expert` → `/review` | Press **S** twice ("Press again to stop"), then "Session ended". Click **Open debrief review**. | "Now the debrief." | – |
| 5 | `/review` | Show Revision 1 and the open questions. In **Fixture playback**, step through **Expert correction**, **Revision 2 delivered** and **Revision 2 confirmed**. Changed items are marked; the confirmation names the exact revision. | "The apprentice reads its understanding back. The expert corrects it out loud, which produces revision 2, and then confirms it out loud." | **≥3 debrief questions**; **expert-confirmed teach-back** (spoken; the screen only reflects it) |
| 6 | `/map` | Click the nav item **Work Map**. It shows Revision 2. Click **Guardrail**: you'll see the visual evidence with the region on its own frame, the **Expert's words** (verbatim), and the **Apprentice summary** (AI, labelled). Point at the Revoked and Missing items: they show no teaching content. | "Every step and guardrail has a picture and the expert's own words. AI wording is always labelled." | **Work Map with visual + verbal evidence per step/guardrail** |
| 7 | `/map` (trust) | Optional. On **Workflow step 1**, click **Delete evidence 1**, then **Press again…**. It reads "Deleting… waiting for confirmation", then the item turns **Revoked**. ⚠ Don't remove the **Guardrail** before step 8: it is the expert example the tutor cites. | "Deletion is real only when the backend confirms it. Knowledge that relied on it stops being taught." | Trust: correction/deletion |
| 8 | `/practice` | Click the nav item **Practice**. Type a deliberately wrong decision and a reason, then **Request review**. You get **Guidance needed**, Save stays disabled, and the guidance cites the expert. Open **Open expert example 1**. Revise the reason, **Request review** again to reach **Review complete**, then **Save decision**. It reads Saving…, then **Saved**. | "The tutor catches the wrong decision *before* it is saved, using what the expert taught, on a trace the expert never saw." | **Unseen case with a pre-save correction** |
| 9 | `/summary` | Click **See the learning summary**. Show the four groups. The corrected decision is under **Needed help**, with the help given and the cited expert entry. Click the citation and it opens that Work Map item. Show "What this summary cannot show". | "We separate independent from assisted work. One coached correction is help, not mastery, and there is no score." | **Learning feedback separating independent from assisted** |

## Fallbacks if a component fails

| Failure | What you'll see | Do |
|---|---|---|
| Voice apprentice/tutor won't start (key, network, mic) | VoiceSession error, or the agent stays "Not connected" | Keep going on the screens and narrate the questions. Say plainly that the voice is offline. For a key problem, `ELEVEN_LABS_KEY` from the repo-root `.env` is the known-good one. |
| Glasses/iPhone capture not available | Capture stays **Unknown**. The fixture replay still shows pointing. | Say the pointing is a recorded replay (it is fixture-labelled). |
| Backend connection drops (live screens only) | Dashed banner: **Reconnecting… live updates are paused; showing the last confirmed state.** | Wait, it resyncs on its own. If it says **Disconnected**, reload. |
| A request is not confirmed | Red alert, e.g. "Off-record change not confirmed … You are still on record" or "Removal not confirmed. The item is unchanged." | Retry. The state shown is the true one. |
| Something odd mid-demo | – | Reload the tab (resets the fixture state) and jump straight to the route you need. `/map?entry=fixture-entry-003&rev=fixture-rev-2` opens the guardrail directly; `/practice` and `/summary` work on their own. |
| Need to rehearse failures | – | Add URL settings: `?fixture_latency=5000` (slow acks) or `?fixture_fail=offrecord\|pause\|stop` on `/expert`; `review\|commit` on `/practice`; `revoke\|delete` on `/map` or `/review`. |

## Live vs fixture (this branch)
All screens are **fixture**: `/expert`, `/expert/display`, `/review`, `/map`, `/practice` and `/summary`. When WS6 is merged, set `NEXT_PUBLIC_WS7_LIVE_SCREENS` (see `web/README.md`). The FIXTURE banner disappears only on the screens switched to live, and only when their data is not fixture or stub.

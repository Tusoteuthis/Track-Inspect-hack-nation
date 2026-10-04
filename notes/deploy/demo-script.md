# Demo script: deployed app

**For:** the presenter. **Based on:** `notes/ws7-demo-navigation.md` (full route table and fallbacks), adapted for the Cloudflare deployment. `<URL>` is the workers.dev URL that Terminal A reports.

## Before you go on stage (10 min)
1. **Wake the container.** Open `<URL>/api/health` a few minutes early and wait for the 200. The first request after it has been idle (`sleepAfter`) is a cold start.
2. **Unlock the API in the demo browser.** Open `<URL>/api/access?token=<BACKEND_ACCESS_TOKEN>&next=/` once. It sets a cookie and lands on `/`. Do this in the browser and profile you'll present from. If you skip it, the screens still load but **voice won't start** (401).
3. Allow **microphone** for the `<URL>` origin (Chrome site settings).
4. Use **one tab**. Fixture state (the confirmed review, deleted evidence) carries across screens only within that tab. Reload once just before you start, because a reload resets the fixture state.
5. Second monitor (the glasses view) at native resolution. The screens were checked at 1920×1080.

## Click path, with what to say
| # | Where | Do | Say |
|---|---|---|---|
| 0 | `/` | Point at the entries, then click **Expert session**. | "One app, two people: the expert who knows, the newcomer who learns." |
| 1 | `/expert` (setup) | **Wheel sensor pass** is preselected. Click **Open trace display (new window)**, drag it to the glasses monitor and make it full-screen. Click **Start session**; the monitor shows **● REC**. | "This is what the expert looks at through the glasses: the real sensor pass." |
| 2 | Monitor | Press **Space**. The video **holds** at 4 moments; the expert points and explains. Space resumes, PgUp goes back. | "The video freezes so the expert can point at a still frame. The tool never says what the pattern is. That's the expert's knowledge." |
| 3 | `/expert` (companion) | Under Voice apprentice, press **Start**. Let the expert talk. You'll see an Indicated region, then a dashed **Ambiguous region**. | "Every gesture appears on its own frame. Ambiguous pointing is never drawn as confident. The questions come from the agent." |
| 4 | `/expert` | Press **O** (off record), then **O** again. | "Off record is shown only once the backend has acknowledged it." |
| 5 | `/expert` → `/review` | Press **S** twice, then click **Open debrief review**. Step through **Expert correction → Revision 2 delivered → Revision 2 confirmed**. | "The apprentice reads back what it understood. The expert corrects it out loud, then confirms it out loud." |
| 6 | `/map` | **Work Map** → **Guardrail**: the visual evidence, the expert's own words, and an AI summary that is labelled as AI. | "Every step and guardrail has a picture and the expert's own words." |
| 7 | `/practice` | Type a wrong decision and a reason, then **Request review**. You get **Guidance needed**, which cites the expert. Revise it, **Request review** again, then **Save decision** to reach **Saved**. | "The tutor catches the wrong decision *before* it's saved, on a trace the expert never saw." |
| 8 | `/summary` | Show the four groups. The corrected decision is under **Needed help**. Click the citation. | "Independent and assisted work are kept separate. One coached correction counts as help, not mastery." |

## Rough edges to avoid
- **Every data screen is FIXTURE DATA** (there's a banner). Don't present it as live captured knowledge. Say "in the live run this shows what the expert just said". Only the **voice** (apprentice and tutor) is live.
- **Don't delete the Guardrail evidence on `/map`** before `/practice`. The tutor cites it.
- **Never click anything to "make the agent ask".** If the agent is silent, keep talking.
- **Don't open `/dev` or `/diagnostics`** during the showcase. They are developer pages.
- **If voice won't start:** first reload `<URL>/api/access?token=…&next=/expert` (the cookie may be missing). Otherwise narrate the questions and say plainly that voice is offline.
- **If something odd happens mid-demo:** reload, then jump straight in. `/map?entry=fixture-entry-003&rev=fixture-rev-2` opens the guardrail; `/practice` and `/summary` work on their own.
- **A container restart wipes server data.** That doesn't affect the fixture screens, but saved expert-session snapshots are lost.

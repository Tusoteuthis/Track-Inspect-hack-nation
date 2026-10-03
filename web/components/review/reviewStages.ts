// Test helper: the scripted fixture review stages as ReviewViews. Not imported by app code.
import { createReviewScript } from "@/lib/data/fixtureReviewScript";
import type { ReviewView } from "@/lib/ui/contracts";

export async function reviewStages(): Promise<ReviewView[]> {
  const script = createReviewScript({ markLatencyMs: 0 });
  const sessionId = (await script.getWorkMap("fixture-session-001")).session_id;
  const stages = [await script.getReview(sessionId)];
  while (script.controls.advance()) stages.push(await script.getReview(sessionId));
  return stages;
}

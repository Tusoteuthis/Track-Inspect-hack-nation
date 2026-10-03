"use client";

import { ReviewScreen } from "@/components/review/ReviewScreen";
import { FIXTURE_IDS } from "@/lib/data/fixtureSource";

export default function ReviewPage() {
  return <ReviewScreen sessionId={FIXTURE_IDS.expertSession} />;
}

// Display groups for /summary. WS5 decides the classes; this only guarantees
// that an assisted correction is never presented as independent mastery,
// even if an upstream item is mislabelled.
import type { AssessmentItem, AssessmentView } from "@/lib/ui/contracts";

export type SummaryGroups = {
  independent: AssessmentItem[];
  assisted: AssessmentItem[];
  unresolved: AssessmentItem[];
  practice_next: string[];
  empty: boolean;
};

const wasHelped = (item: AssessmentItem) => (item.interventions?.length ?? 0) > 0;

export function summaryGroups(view: AssessmentView): SummaryGroups {
  const independent = view.independent.filter(i => !wasHelped(i));
  const assisted = [...view.assisted, ...view.independent.filter(wasHelped)];
  const unresolved = view.unresolved;
  return {
    independent,
    assisted,
    unresolved,
    practice_next: view.practice_next,
    empty: independent.length + assisted.length + unresolved.length + view.practice_next.length === 0,
  };
}

// One place that decides how a knowledge status is presented. Only "confirmed"
// may read as verified knowledge; revoked and missing are never teaching material.
import type { KnowledgeStatus, WorkMapStep } from "@/lib/ui/contracts";

export type StatusPresentation = {
  icon: string;
  label: string;
  description: string;
  /** false = the item's content must not be shown as teaching material. */
  teachable: boolean;
};

const PRESENTATION: Record<KnowledgeStatus, StatusPresentation> = {
  confirmed: { icon: "✓", label: "Confirmed", description: "Verified by the expert in the spoken teach-back.", teachable: true },
  draft: { icon: "✎", label: "Draft", description: "Not yet verified by the expert.", teachable: true },
  unresolved: { icon: "?", label: "Unresolved", description: "Open question: not verified knowledge.", teachable: true },
  revoked: { icon: "⊘", label: "Revoked", description: "Withdrawn. No longer eligible as teaching material.", teachable: false },
  missing: { icon: "!", label: "Missing", description: "Not captured. There is no material to teach from.", teachable: false },
};

export const statusPresentation = (status: KnowledgeStatus): StatusPresentation => PRESENTATION[status];

export const KIND_LABEL: Record<WorkMapStep["kind"], string> = {
  step: "Step",
  decision: "Decision",
  guardrail: "Guardrail",
  exception: "Exception",
};

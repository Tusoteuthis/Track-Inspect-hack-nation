// Tiny in-page bus: the practice screen emits structured events, the tutor
// bridge (inside the voice session) forwards them as silent context.
import type { PracticeContextEvent } from "@/lib/practice/contextMessages";

export type PracticeEventBus = {
  emit(event: PracticeContextEvent): void;
  subscribe(listener: (event: PracticeContextEvent) => void): () => void;
};

export function createPracticeEventBus(): PracticeEventBus {
  const listeners = new Set<(event: PracticeContextEvent) => void>();
  return {
    emit: event => listeners.forEach(l => l(event)),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

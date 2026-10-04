// Single-process assumption: one `next dev`/`next start` process owns the data dirs.
// The default in-memory provider is not valid for serverless or multi-instance deployments;
// on Workers a Durable Object provider takes its place (see durable.ts).

/** Runs `fn` with exclusive access to `key`; callers for the same key run one after another. */
export interface LockProvider {
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

export class InMemoryLockProvider implements LockProvider {
  private readonly tails = new Map<string, Promise<void>>();

  withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(fn);
    // The chain tail never rejects, so one failure cannot poison later callers.
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }
}

let provider: LockProvider = new InMemoryLockProvider();

/** Swap the lock provider (Workers entry point: the Durable Object provider). */
export function setLockProvider(next: LockProvider): void {
  provider = next;
}

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return provider.withLock(key, fn);
}

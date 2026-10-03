// Single-process assumption: one `next dev`/`next start` process owns the data dirs.
// These in-memory locks are not valid for serverless or multi-instance deployments.
const tails = new Map<string, Promise<void>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const result = previous.then(fn);
  // The chain tail never rejects, so one failure cannot poison later callers.
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return result;
}

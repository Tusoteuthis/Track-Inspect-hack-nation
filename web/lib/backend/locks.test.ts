import { describe, expect, it } from "vitest";
import { withLock } from "./locks";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("withLock", () => {
  it("serialises same-key calls in FIFO order without overlap", async () => {
    const log: string[] = [];
    const task = (name: string, ms: number) =>
      withLock("k", async () => {
        log.push(`start ${name}`);
        await delay(ms);
        log.push(`end ${name}`);
        return name;
      });

    const results = await Promise.all([task("a", 30), task("b", 5), task("c", 15)]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("lets different keys overlap", async () => {
    const log: string[] = [];
    const task = (key: string, ms: number) =>
      withLock(key, async () => {
        log.push(`start ${key}`);
        await delay(ms);
        log.push(`end ${key}`);
      });

    await Promise.all([task("x", 30), task("y", 5)]);
    expect(log).toEqual(["start x", "start y", "end y", "end x"]);
  });

  it("releases the lock when fn rejects", async () => {
    const failing = withLock("r", async () => {
      await delay(5);
      throw new Error("boom");
    });
    const next = withLock("r", async () => "ran");

    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ran");
    await expect(withLock("r", async () => "again")).resolves.toBe("again");
  });
});

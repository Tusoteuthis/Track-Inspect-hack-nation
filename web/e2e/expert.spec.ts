import { expect, test, type Page } from "@playwright/test";

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/expert/${name}.png`, fullPage: true });

const FAST = "/expert?fixture_replay_ms=700&fixture_latency=600";

async function startSession(page: Page, url = FAST) {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1, name: "Expert session" })).toBeVisible();
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByTestId("control-rail")).toBeVisible();
}

type Box = { x: number; y: number; width: number; height: number };
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("setup → companion with event replay → off-record → stop → debrief review", async ({ page }) => {
  await page.goto(FAST);
  await expect(page.getByRole("status").filter({ hasText: "FIXTURE DATA" })).toBeVisible();
  await expect(page.getByTestId("connection-Capture device")).toContainText("Unknown");
  await expect(page.getByTestId("connection-Backend")).toContainText("No backend: fixture data");
  await expect(page.getByTestId("connection-Voice apprentice")).toContainText("Apprentice not connected");
  await shot(page, "01-setup");

  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("button", { name: /Starting… waiting for confirmation/ })).toBeVisible();
  await expect(page.getByTestId("control-rail")).toBeVisible();
  await expect(page.getByTestId("recording-status")).toHaveAttribute("data-recording", "on_record");

  // Replay: resolved → repeat → ambiguous.
  await expect(page.getByTestId("region-outline")).toHaveAttribute("data-style", "solid");
  await shot(page, "02-resolved");
  await expect(page.getByTestId("recent-event")).toHaveCount(3);
  await expect(page.getByTestId("region-outline")).toHaveAttribute("data-style", "dashed");
  await expect(page.getByText("Ambiguous: the apprentice will ask you to clarify")).toBeVisible();
  await shot(page, "03-ambiguous");

  // Off record: pending until acknowledged, then the indicator.
  await page.getByRole("button", { name: /Go off record/ }).click();
  await expect(page.getByTestId("recording-status")).toHaveAttribute("data-recording", "off_record_pending");
  await expect(page.getByTestId("off-record-indicator")).toHaveCount(0);
  await shot(page, "04-off-record-pending");
  await expect(page.getByTestId("off-record-indicator")).toBeVisible();
  await shot(page, "05-off-record");

  // Stop: two presses, pending, then ended with the review link.
  await page.keyboard.press("s");
  await expect(page.getByRole("button", { name: /Press again to stop/ })).toBeVisible();
  await page.keyboard.press("s");
  await expect(page.getByRole("button", { name: /Stopping… waiting for confirmation/ })).toBeVisible();
  await expect(page.getByTestId("session-ended")).toBeVisible();
  await shot(page, "06-ended");
  await page.getByRole("link", { name: "Open debrief review" }).click();
  await expect(page).toHaveURL(/\/review\?session=fixture-session-001$/);
  await expect(page.getByRole("heading", { level: 1, name: "Review" })).toBeVisible();
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`controls never overlap the trace at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await startSession(page);
    await expect(page.getByTestId("region-outline")).toBeVisible();
    const trace = page.getByTestId("companion-trace");
    const rail = page.getByTestId("control-rail");
    for (const state of ["expanded", "collapsed"] as const) {
      if (state === "collapsed") {
        await page.keyboard.press("[");
        await expect(page.getByRole("button", { name: /Controls/ })).toHaveAttribute("aria-expanded", "false");
      }
      const a = (await trace.boundingBox())!;
      const b = (await rail.boundingBox())!;
      expect(intersects(a, b), `${state}: trace ${JSON.stringify(a)} vs rail ${JSON.stringify(b)}`).toBe(false);
      await shot(page, `layout-${viewport.width}-${state}`);
    }
  });
}

test("a dropped connection shows Reconnecting… and restore resyncs", async ({ page }) => {
  await startSession(page);
  await expect(page.getByTestId("recent-event")).toHaveCount(1);
  await page.getByRole("button", { name: "Simulate connection drop" }).click();
  await expect(page.getByTestId("reconnecting")).toContainText("Reconnecting…");
  await shot(page, "07-reconnecting");
  // Replay continues server-side while disconnected; nothing new is shown until resync.
  await page.waitForTimeout(1600);
  await expect(page.getByTestId("recent-event")).toHaveCount(1);
  await page.getByRole("button", { name: "Restore connection" }).click();
  await expect(page.getByTestId("reconnecting")).toHaveCount(0);
  await expect(page.getByTestId("recent-event")).toHaveCount(3);
});

test("a failed off-record request is shown and the session stays on record", async ({ page }) => {
  await startSession(page, "/expert?fixture_fail=offrecord&fixture_latency=300");
  await page.keyboard.press("o");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Off-record change not confirmed");
  await expect(page.getByTestId("recording-status")).toHaveAttribute("data-recording", "on_record");
  await expect(page.getByTestId("off-record-indicator")).toHaveCount(0);
  await shot(page, "08-off-record-failed");
});

test("trace display is full-bleed with minimal chrome and Esc exits", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/expert/display?case=fixture-case-expert-001");
  const img = page.getByRole("img", { name: /^Trace:/ });
  await expect(img).toBeVisible();
  const box = (await img.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(1600 - 1);
  expect(box.height).toBeGreaterThanOrEqual(900 - 1);
  await expect(page.getByRole("status").filter({ hasText: "FIXTURE DATA" })).toBeVisible();
  await expect(page.getByText("Esc to exit")).toBeVisible();
  await shot(page, "09-trace-display");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/expert$/);
});

test("entry offers Expert session and Newcomer practice", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("link", { name: /Expert session/ })).toHaveAttribute("href", "/expert");
  await expect(page.getByRole("main").getByRole("link", { name: /Newcomer practice/ })).toHaveAttribute("href", "/practice");
});

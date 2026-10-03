import { expect, test } from "@playwright/test";

// Chromium flags that grant the screen picker automatically, so the sharing
// states can be exercised without a human choosing a source.
test.use({
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--auto-select-desktop-capture-source=Entire screen",
      "--auto-accept-this-tab-capture",
    ],
  },
});

test("screen share: idle → active (frame acknowledged) → stopped", async ({ page }) => {
  await page.goto("/practice?fixture_latency=100");
  const status = page.getByTestId("screen-status");
  await expect(status).toContainText("Screen not shared");
  await page.getByRole("button", { name: "Share screen" }).click();
  await expect(status).toContainText("Sharing your screen", { timeout: 10_000 });
  await expect(page.getByText(/Last still image received at/)).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: "test-results/practice/07-screen-sharing.png", fullPage: true });
  await page.getByRole("button", { name: "Stop sharing" }).click();
  await expect(status).toContainText("Screen sharing stopped");
});

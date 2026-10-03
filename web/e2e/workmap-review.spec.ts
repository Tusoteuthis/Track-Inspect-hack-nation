import { expect, test, type Page } from "@playwright/test";

const NO_IDS = /fixture-[a-z-]+\d/;

// Tab from the top of the page until focus lands in the process list (keyboard only).
async function tabIntoList(page: Page, listName: string) {
  const list = page.getByRole("list", { name: listName });
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    if (await list.evaluate(l => l.contains(document.activeElement))) return;
  }
  throw new Error("Tab never reached the list");
}

test("Work Map: navigate by keyboard only and open items", async ({ page }) => {
  await page.goto("/map");
  await expect(page.getByText("Showing Revision 1")).toBeVisible();
  await page.screenshot({ path: "test-results/s1-map.png", fullPage: true });

  await tabIntoList(page, "Work Map process");
  const items = page.getByRole("list", { name: "Work Map process" }).getByRole("button");
  await expect(items.nth(0)).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(2)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/map\?entry=fixture-entry-003&rev=fixture-rev-1$/);
  await expect(page.getByRole("heading", { level: 2, name: "Guardrail (fixture)" })).toBeVisible();
  await expect(items.nth(2)).toHaveAttribute("aria-current", "true");
  await expect(items.nth(2)).toBeFocused();

  await page.keyboard.press("Home");
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/entry=fixture-entry-001/);
  const detail = page.getByRole("article");
  await expect(detail.getByRole("region", { name: "Expert's words" })).toContainText("Expert explanation (fixture)");
  await expect(detail.getByRole("region", { name: "Apprentice summary" })).toContainText("Apprentice summary placeholder");
  await expect(detail.getByTestId("region-outline")).toBeVisible();
  await expect(detail.locator("figure").first()).toHaveAttribute("data-mode", "focus");

  // Tab out of the list (one tab stop) into the detail: choose the second piece of evidence.
  await page.keyboard.press("Tab");
  await expect(detail.getByRole("button", { name: "Evidence 1" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(detail.getByRole("button", { name: "Evidence 2" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(detail.getByRole("img", { name: "Captured trace evidence" })).toHaveAttribute("src", "/fixtures/ui/trace-b.svg");
  await page.screenshot({ path: "test-results/s1-map-detail.png", fullPage: true });

  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "Step not yet captured (fixture, missing)" })).toBeVisible();
  await expect(detail.getByRole("note")).toContainText("Nothing was captured");
  await expect(page.getByRole("main")).not.toContainText(NO_IDS);
});

test("Work Map: a deep link opens the named item", async ({ page }) => {
  await page.goto("/map?entry=fixture-entry-002&rev=fixture-rev-1");
  await expect(page.getByRole("heading", { level: 2, name: "Decision point (fixture)" })).toBeVisible();
  await expect(page.getByRole("article").getByTestId("region-outline")).toHaveAttribute("data-style", "dashed");
  await expect(page.getByRole("main")).not.toContainText(NO_IDS);

  await page.goto("/map?entry=fixture-entry-004&rev=fixture-rev-9");
  await expect(page.getByRole("heading", { level: 2, name: "Exception (fixture, unresolved)" })).toBeVisible();
  await expect(page.getByText(/link referred to another revision/)).toBeVisible();
  await expect(page.getByText("Missing visual evidence")).toBeVisible();
  await expect(page.getByText("Missing expert words")).toBeVisible();
});

test("Review: scripted correction sequence updates label, markers and confirmation", async ({ page }) => {
  await page.goto("/review");
  const header = page.getByRole("region", { name: "Revision under review" });
  await expect(header).toContainText("Revision under review: Revision 1");
  await expect(page.getByRole("button", { name: /approve|confirm/i })).toHaveCount(0);
  await page.screenshot({ path: "test-results/s1-review-rev1.png", fullPage: true });

  const playback = page.getByRole("region", { name: /Fixture playback/ });
  await playback.getByRole("button", { name: /^Next:/ }).click();
  await expect(header).toContainText("The expert corrected Revision 1");
  await playback.getByRole("button", { name: /^Next:/ }).click();
  await expect(header).toContainText("Revision under review: Revision 2");
  await expect(header).toContainText("Changed since Revision 1: 1 item changed.");
  await expect(page.getByText("New revision received: Revision 2. Changed items are marked.")).toBeVisible();

  const changed = page.getByRole("list", { name: "Draft process" }).getByRole("button", { name: /Decision point/ });
  await expect(changed).toContainText("Changed");
  await changed.click();
  await expect(page.getByRole("region", { name: "What changed since Revision 1" })).toBeVisible();

  await page.getByRole("button", { name: "Mark step for correction" }).click();
  const markRow = page.locator('[data-mark-state]').filter({ has: page.getByRole("button", { name: "Mark step for correction" }) });
  await expect(markRow).toHaveAttribute("data-mark-state", "pending");
  await expect(markRow).toHaveAttribute("data-mark-state", "acknowledged");
  await page.screenshot({ path: "test-results/s1-review-rev2.png", fullPage: true });

  await playback.getByRole("button", { name: /^Next:/ }).click();
  await expect(header).toContainText("The expert confirmed Revision 2 in the spoken teach-back.");
  await page.screenshot({ path: "test-results/s1-review-confirmed.png", fullPage: true });
  await expect(page.getByRole("main")).not.toContainText(NO_IDS);

  // After the debrief, the Work Map (same tab, client navigation) shows the confirmed revision.
  await page.getByRole("link", { name: "Work Map" }).click();
  await expect(page.getByText("Showing Revision 2")).toBeVisible();
  await expect(page.getByRole("list", { name: "Work Map process" }).locator('[data-status="confirmed"]')).toHaveCount(3);
});

test("Review: a simulated failure is shown", async ({ page }) => {
  await page.goto("/review");
  await page.getByRole("checkbox", { name: "Simulate action failures" }).check();
  await page.getByRole("list", { name: "Draft process" }).getByRole("button", { name: /Guardrail \(fixture\)/ }).click();
  await page.getByRole("button", { name: "Flag unresolved" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Failed: Simulated failure (fixture)");
});

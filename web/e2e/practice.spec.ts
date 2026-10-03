import { expect, test, type Page } from "@playwright/test";

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/practice/${name}.png`, fullPage: true });

const status = (page: Page) => page.getByTestId("review-status");
const saveButton = (page: Page) => page.getByRole("button", { name: /Save decision|Retry save/ });

async function draft(page: Page) {
  await page.getByLabel("Decision").fill("My first decision");
  await page.getByLabel("Reason").fill("Because of what I see on the trace");
}

async function reachReviewComplete(page: Page) {
  await draft(page);
  await page.getByRole("button", { name: "Request review" }).click();
  await expect(status(page)).toContainText(/Guidance needed/);
  await page.getByLabel("Reason").fill("Revised after checking the expert example");
  await page.getByRole("button", { name: "Request review" }).click();
  await expect(status(page)).toContainText(/Review complete/);
}

test("wrong draft → guidance with citation → expert example → edit → review complete → save → saved", async ({ page }) => {
  await page.goto("/practice?fixture_latency=400");
  await expect(page.getByRole("heading", { level: 1, name: "Newcomer practice" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "FIXTURE DATA" })).toBeVisible();

  await draft(page);
  // Optional rectangle on the practice trace.
  await page.getByRole("button", { name: "Mark a region (optional)" }).click();
  const marker = page.getByTestId("region-marker");
  await expect(marker.locator("img")).toHaveJSProperty("complete", true);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await marker.scrollIntoViewIfNeeded();
  const box = (await marker.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.6, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("learner-region")).toBeVisible();
  await page.getByRole("button", { name: "Done marking" }).click();
  await expect(page.getByTestId("region-outline")).toBeVisible();
  await expect(status(page)).toHaveText(/Draft changed \/ not yet reviewed/);
  await expect(saveButton(page)).toBeDisabled();
  await shot(page, "01-draft");

  await page.getByRole("button", { name: "Request review" }).click();
  await expect(status(page)).toContainText("Review pending");
  await expect(saveButton(page)).toBeDisabled();
  await expect(status(page)).toContainText(/Guidance needed/);
  const guidance = page.getByTestId("guidance-panel");
  await expect(guidance).toContainText("Fixture behaviour");
  await expect(guidance.getByRole("button", { name: "Open expert example 1" })).toBeVisible();
  await shot(page, "02-guidance");

  await guidance.getByRole("button", { name: "Open expert example 1" }).click();
  const dialog = page.getByRole("dialog", { name: "Expert example" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Expert's words (verbatim)")).toBeVisible();
  await expect(dialog.getByTestId("region-outline")).toBeVisible();
  await shot(page, "03-expert-example");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();

  await page.getByLabel("Reason").fill("Revised after checking the expert example");
  await expect(status(page)).toHaveText(/Draft changed \/ not yet reviewed/);
  await page.getByRole("button", { name: "Request review" }).click();
  await expect(status(page)).toContainText(/Review complete/);
  await expect(saveButton(page)).toBeEnabled();
  await shot(page, "04-review-complete");

  // Edit after review: Save is blocked again until a new review.
  await page.getByLabel("Decision").fill("My corrected decision");
  await expect(status(page)).toHaveText(/Draft changed \/ not yet reviewed/);
  await expect(saveButton(page)).toBeDisabled();
  await page.getByRole("button", { name: "Request review" }).click();
  await expect(status(page)).toContainText(/Review complete/);

  await saveButton(page).click();
  await expect(status(page)).toContainText(/Saving/);
  await expect(page.getByRole("main")).not.toContainText(/\bSaved\b/);
  await expect(status(page)).toHaveText(/Saved$/);
  const timeline = page.getByTestId("timeline").getByRole("listitem");
  await expect(timeline).toHaveCount(5);
  await expect(timeline.last()).toContainText("Saved");
  await shot(page, "05-saved");
});

test("a forced save failure is shown with retry and never as Saved", async ({ page }) => {
  await page.goto("/practice?fixture_fail=commit&fixture_latency=300");
  await reachReviewComplete(page);
  await saveButton(page).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/not saved/);
  await expect(status(page)).toContainText("Save failed");
  await expect(page.getByRole("main")).not.toContainText(/\bSaved\b/);
  await expect(page.getByRole("button", { name: "Retry save" })).toBeEnabled();
  await shot(page, "06-save-failed");
});

test("a slow save shows Saving until the acknowledgement", async ({ page }) => {
  await page.goto("/practice?fixture_latency=1500");
  await reachReviewComplete(page);
  await saveButton(page).dblclick();
  await expect(status(page)).toContainText(/Saving/);
  await page.waitForTimeout(700);
  await expect(page.getByRole("main")).not.toContainText(/\bSaved\b/);
  await expect(status(page)).toHaveText(/Saved$/, { timeout: 5000 });
  await expect(page.getByTestId("timeline").getByRole("listitem").filter({ hasText: "Saved" })).toHaveCount(1);
});

test("knowledge update invalidates a completed review", async ({ page }) => {
  await page.goto("/practice?fixture_latency=200");
  await reachReviewComplete(page);
  await page.getByText(/Fixture behaviour: scripted review/).click();
  await page.getByRole("button", { name: "Simulate knowledge update" }).click();
  await expect(status(page)).toHaveText(/Draft changed \/ not yet reviewed/);
  await expect(saveButton(page)).toBeDisabled();
});

test("tutor panel shows agent and microphone status separately", async ({ page }) => {
  await page.goto("/practice");
  await expect(page.getByTestId("agent-status")).toContainText("Tutor not connected");
  await expect(page.getByTestId("mic-permission")).toBeVisible();
});

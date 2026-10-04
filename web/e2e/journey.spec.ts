import { expect, test, type Page } from "@playwright/test";

// The full demo journey in one tab at the demo display resolution. Navigation is
// client-side (links, not page.goto) so fixture state carries across screens the
// way a live backend's would: the confirmed review, the deleted evidence.
test.use({ viewport: { width: 1920, height: 1080 } });

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/journey/${name}.png`, fullPage: true });

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("link", { name });

/** No WS6 screen is live in this branch, so every data screen must say FIXTURE DATA. */
const expectFixtureLabelled = (page: Page) =>
  expect(page.getByRole("status").filter({ hasText: "FIXTURE DATA" })).toBeVisible();

const status = (page: Page) => page.getByTestId("review-status");

test("entry → expert companion → review → Work Map → practice (wrong → guidance → corrected → saved) → summary", async ({
  page,
}) => {
  test.setTimeout(90_000);

  // 1. Entry
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Track Inspect" })).toBeVisible();
  await shot(page, "01-entry");
  await page.getByRole("link", { name: /Expert session/ }).first().click();

  // 2. Expert companion: pointing replay, ambiguous region, then stop.
  await expect(page.getByRole("heading", { level: 1, name: "Expert session" })).toBeVisible();
  await expectFixtureLabelled(page);
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByTestId("control-rail")).toBeVisible();
  await expect(page.getByTestId("region-outline")).toHaveAttribute("data-style", "solid");
  await expect(page.getByTestId("region-outline")).toHaveAttribute("data-style", "dashed", { timeout: 15_000 });
  await shot(page, "02-expert-companion");
  await page.keyboard.press("s");
  await page.keyboard.press("s");
  await expect(page.getByTestId("session-ended")).toBeVisible();
  await page.getByRole("link", { name: "Open debrief review" }).click();

  // 3. Review: Revision 1 → correction → Revision 2 → confirmed (spoken; fixture playback here).
  await expect(page).toHaveURL(/\/review\?session=fixture-session-001$/);
  await expect(page.getByRole("heading", { level: 1, name: "Review" })).toBeVisible();
  await expectFixtureLabelled(page);
  await shot(page, "03-review-rev1");
  for (const stage of ["Expert correction in the teach-back", "Revision 2 delivered", "Revision 2 confirmed in the teach-back"]) {
    await page.getByRole("button", { name: `Next: ${stage}` }).click();
  }
  await expect(page.getByRole("button", { name: "End of script" })).toBeDisabled();
  await shot(page, "04-review-confirmed");

  // 4. Work Map: the confirmed revision; open the guardrail; delete one piece of evidence (acked).
  await nav(page, "Work Map").click();
  await expect(page.getByText("Showing Revision 2")).toBeVisible();
  await expectFixtureLabelled(page);
  await page.getByRole("list", { name: "Work Map process" }).getByRole("button", { name: /Guardrail \(fixture\)/ }).click();
  const detail = page.getByRole("article");
  await expect(detail.getByRole("region", { name: "Expert's words" })).toBeVisible();
  await expect(detail.getByTestId("region-outline")).toBeVisible();
  await shot(page, "05-workmap-guardrail");

  await page.getByRole("list", { name: "Work Map process" }).getByRole("button", { name: /Workflow step 1/ }).click();
  await detail.getByRole("button", { name: "Delete evidence 1" }).click();
  await detail.getByRole("button", { name: "Press again to delete evidence 1" }).click();
  await expect(detail.getByText("Deleting… waiting for confirmation")).toBeVisible();
  await shot(page, "06-workmap-delete-pending");
  await expect(page.getByText(/This item has been revoked/)).toBeVisible();
  await shot(page, "07-workmap-delete-acknowledged");

  // 5. Practice: wrong draft is caught before save, guidance cites the expert, corrected, saved.
  await nav(page, "Practice").click();
  await expect(page.getByRole("heading", { level: 1, name: "Newcomer practice" })).toBeVisible();
  await expectFixtureLabelled(page);
  await page.getByLabel("Decision").fill("My first decision");
  await page.getByLabel("Reason").fill("Because of what I see on the trace");
  await page.getByRole("button", { name: "Request review" }).click();
  await expect(status(page)).toContainText(/Guidance needed/);
  const guidance = page.getByTestId("guidance-panel");
  await expect(guidance.getByRole("button", { name: "Open expert example 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Save decision/ })).toBeDisabled();
  await shot(page, "08-practice-guidance");
  await page.getByLabel("Reason").fill("Revised after checking the expert example");
  await page.getByRole("button", { name: "Request review" }).click();
  await expect(status(page)).toContainText(/Review complete/);
  await page.getByRole("button", { name: /Save decision/ }).click();
  await expect(status(page)).toContainText(/Saved/);
  await shot(page, "09-practice-saved");

  // 6. Summary: independent vs assisted, with the cited expert entry.
  await page.getByRole("link", { name: "See the learning summary" }).click();
  await expect(page).toHaveURL(/\/summary\?session=fixture-newcomer-session-001$/);
  await expect(page.getByRole("heading", { level: 1, name: "Learning summary" })).toBeVisible();
  await expectFixtureLabelled(page);
  const assisted = page.locator('[data-group="assisted"]');
  await expect(assisted.getByRole("heading", { name: /Needed help/ })).toBeVisible();
  await expect(assisted.getByRole("link", { name: /Open the cited expert entry/ })).toHaveAttribute(
    "href",
    "/map?entry=fixture-entry-003&rev=fixture-rev-2"
  );
  await expect(page.locator('[data-group="independent"]')).not.toContainText("corrected before saving");
  await shot(page, "10-summary");

  // The citation opens the right Work Map item.
  await assisted.getByRole("link", { name: /Open the cited expert entry/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Guardrail (fixture)" })).toBeVisible();
});

test("keyboard: the skip link moves focus to the main content on every route", async ({ page }) => {
  // /practice is excluded: WS3's VoiceSession calls scrollIntoView on mount, which moves Chrome's
  // Tab starting point past the page content (reported to WS3 in handoff-sprint-4.md).
  for (const route of ["/", "/expert", "/review", "/map", "/summary"]) {
    await test.step(route, async () => {
      await page.goto(route);
      // Wait for hydration: the screen's own heading is rendered by client code.
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", { name: "Skip to main content" });
      await expect(skip).toBeFocused();
      await expect(skip).toBeVisible();
      await page.keyboard.press("Enter");
      await expect(page.locator("main#main")).toBeFocused();
    });
  }
});

test("removal on /map: pending, then a forced failure is shown and the item keeps its content", async ({ page }) => {
  await page.goto("/map?entry=fixture-entry-001&rev=fixture-rev-1&fixture_fail=revoke&fixture_latency=800");
  const detail = page.getByRole("article");
  await detail.getByRole("button", { name: "Remove from teaching" }).click();
  await detail.getByRole("button", { name: "Press again to remove from teaching" }).click();
  await expect(detail.getByText("Removing… waiting for confirmation")).toBeVisible();
  await expect(detail.getByRole("alert")).toContainText("Removal not confirmed. The item is unchanged.");
  await expect(detail.getByRole("region", { name: "Expert's words" })).toBeVisible();
  await shot(page, "11-workmap-remove-failed");
});

test("removal on /review: pending until acknowledged, then marked Revoked", async ({ page }) => {
  await page.goto("/review?fixture_latency=800");
  await page.getByRole("list", { name: "Draft process" }).getByRole("button", { name: /Decision point/ }).click();
  const detail = page.getByRole("article");
  await detail.getByRole("button", { name: "Remove from teaching" }).click();
  await detail.getByRole("button", { name: "Press again to remove from teaching" }).click();
  await expect(detail.getByText("Removing… waiting for confirmation")).toBeVisible();
  await expect(detail.getByText(/This item has been revoked/)).toBeVisible();
  await expect(detail.getByText(/Removed from teaching \(confirmed\)/)).toBeVisible();
  await shot(page, "12-review-removed");
});

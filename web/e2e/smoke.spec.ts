import { expect, test } from "@playwright/test";

const FIXTURE_ROUTES = [
  { path: "/expert", heading: "Expert session" },
  { path: "/review", heading: "Review" },
  { path: "/map", heading: "Work Map" },
  { path: "/practice", heading: "Newcomer practice" },
  { path: "/summary", heading: "Learning summary" },
  { path: "/dev/evidence", heading: "Evidence viewer states" },
];

for (const route of FIXTURE_ROUTES) {
  test(`${route.path} loads its fixture view and shows the FIXTURE banner`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "FIXTURE DATA" })).toBeVisible();
    // Scoped to <main>: Next.js renders its own empty route-announcer alert outside it.
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    // Internal record ids are diagnostics, never user-facing text.
    await expect(page.getByRole("main")).not.toContainText(/fixture-[a-z-]+\d/);
    await page.screenshot({ path: `test-results/screens${route.path.replaceAll("/", "_")}.png`, fullPage: true });
  });
}

test("entry links lead to the three main areas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Track Inspect" })).toBeVisible();
  await page.getByRole("link", { name: /Newcomer practice/ }).click();
  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.getByRole("link", { name: "Practice" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Track Inspect" }).click();
  await page.getByRole("link", { name: /Work Map/ }).first().click();
  await expect(page).toHaveURL(/\/map$/);
});

test("/dev keeps the voice prototype", async ({ page }) => {
  await page.goto("/dev");
  await expect(page.getByRole("radiogroup", { name: "Flow" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start conversation" })).toBeVisible();
  // WS3's expert console hides the raw sender behind a toggle; it stays disabled until connected.
  await page.getByLabel(/raw contextual/).check();
  await expect(page.getByLabel("Contextual update (dev)", { exact: true })).toBeDisabled();
});

test("evidence showcase draws outlines only where allowed", async ({ page }) => {
  await page.goto("/dev/evidence");
  const card = (title: string) => page.locator("article").filter({ has: page.getByRole("heading", { name: title }) });
  await expect(card("Resolved: focus view").getByTestId("region-outline")).toBeVisible();
  await expect(card("Ambiguous region").getByTestId("region-outline")).toHaveAttribute("data-style", "dashed");
  await expect(card("Unresolved region").getByTestId("region-outline")).toHaveCount(0);
  await expect(card("Region from a different frame").getByTestId("region-outline")).toHaveCount(0);
  await expect(card("Region from a different frame").getByText("Region belongs to a different frame")).toBeVisible();
});

test("outline stays aligned with the region when the window resizes", async ({ page }) => {
  await page.goto("/dev/evidence");
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Resolved: full image" }) });
  for (const width of [1920, 1280, 900]) {
    await page.setViewportSize({ width, height: 1000 });
    const frame = await card.locator("img").first().evaluate(img => img.parentElement!.getBoundingClientRect().toJSON());
    const box = await card.getByTestId("region-outline").evaluate(el => el.getBoundingClientRect().toJSON());
    // Region x=0.62 y=0.62 w=0.14 h=0.2 within the 2px-bordered frame; allow 1px + border.
    const inner = { x: frame.x + 2, y: frame.y + 2, w: frame.width - 4, h: frame.height - 4 };
    expect(Math.abs(box.x - (inner.x + 0.62 * inner.w))).toBeLessThanOrEqual(1.5);
    expect(Math.abs(box.y - (inner.y + 0.62 * inner.h))).toBeLessThanOrEqual(1.5);
    expect(Math.abs(box.width - 0.14 * inner.w)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(box.height - 0.2 * inner.h)).toBeLessThanOrEqual(1.5);
  }
});

test("inspect dialog opens and Escape returns focus", async ({ page }) => {
  await page.goto("/dev/evidence");
  const card = page.locator("article").first();
  const opener = card.getByRole("button", { name: "Inspect full screen" });
  await opener.click();
  await expect(card.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("dialog")).toBeHidden();
  await expect(opener).toBeFocused();
});

test("inspect dialog keeps keyboard focus inside while open", async ({ page }) => {
  await page.goto("/dev/evidence");
  const card = page.locator("article").first();
  await card.getByRole("button", { name: "Inspect full screen" }).click();
  const dialog = card.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (const key of ["Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate(d => d.contains(document.activeElement)), `after ${key}`).toBe(true);
  }
});

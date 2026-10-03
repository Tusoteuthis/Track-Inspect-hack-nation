# Research: WS7 Sprint 0

## R1 — Test runner compatible with WS3's future setup
- **Decision**: vitest 5 with `vitest.config.ts` in `web/`, `@vitejs/plugin-react`, `jsdom` environment and the `@/*` alias resolved to `web/`. Scripts: `test: vitest run`, `test:e2e: playwright test`.
- **Rationale**: the WS3 Sprint 0 prompt names the same file and script. If both land, the merge conflict stays small, and the environment setting can live per file (`// @vitest-environment jsdom`) to stay compatible with WS3's node-only tests.
- **Alternatives**: Jest. Rejected: heavier ESM/TS setup and diverges from WS3.

## R2 — Region overlay technique
- **Decision**: the overlay is a percentage-positioned absolutely-placed element inside a wrapper that has the image's aspect ratio (`aspect-ratio: w / h`). Percentages are derived from normalized coordinates, so resize needs no JS. Focus mode uses a pure `focusViewport()` to compute a crop window (normalized). The image is rendered scaled and translated inside an `overflow: hidden` frame with the same aspect ratio as the crop.
- **Rationale**: percentage positioning is exact at any size (SC-003) and testable as pure math. No ResizeObserver flakiness in jsdom.
- **Alternatives**: canvas drawing (not accessible, needs a resize handler); SVG `viewBox` (viable, but focus cropping plus labels is more complex).

## R3 — Stale-frame and status rules
- **Decision**: `regionRenderState(asset, region)` returns `"none" | "resolved" | "ambiguous" | "unresolved" | "frame_mismatch"`. The component switches on it. Only `resolved` and `ambiguous` draw an outline (solid vs dashed + text label).
- **Rationale**: keeps the trust rule in one pure, tested function.

## R4 — Inspect dialog accessibility
- **Decision**: the native `<dialog>` with `showModal()`. It gives a focus trap, Esc to close and inert background for free. On close, focus returns to the opener. jsdom lacks `showModal`, so it's polyfilled in `vitest.setup.ts` (minimal open/close).
- **Alternatives**: a custom focus trap. More code, more bugs.

## R5 — Data source wiring
- **Decision**: `DataSource` is a TS interface. `fixtureSource` imports the JSON statically. `DataSourceProvider` (client component) provides it via context, and `useDataSource()` reads it. Pages are client components that load via `useEffect` with loading/error/ready states (`useSourceQuery` helper). `FixtureBanner` takes `source` and renders only for `"fixture"`.
- **Rationale**: a later `apiSource` swap only touches the provider. Client loading keeps the S3 `subscribe` streaming model uniform.
- **Alternatives**: server components reading fixtures directly. Rejected: that would bypass the single interface the brief requires.

## R6 — Design tokens for glasses legibility
- **Decision**: base font 18px; type scale 1.25; minimum contrast ≥ 7:1 for text tokens; region outline 4px plus a label chip; focus ring 3px. Light/dark via `prefers-color-scheme` plus a `data-theme` override on `<html>`. Status uses icon glyph + text + border style.
- **Rationale**: the brief asks for legibility through the glasses. A human gate verifies it.

## R7 — Playwright
- **Decision**: chromium-only project, `webServer: next dev` on port 3100 (avoids clashing with other agents' dev servers on 3000). `reuseExistingServer: false`. The output dir `test-results/` and `playwright-report/` are added to `web/.gitignore`.
- **Rationale**: browsers are already cached locally (chromium-1243). A separate port keeps parallel agents from colliding.

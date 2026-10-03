# Research: WS3 Sprint 0

ElevenLabs platform questions (Q1–Q10) are researched separately; their results are in `notes/ws3-sprints/docs/elevenlabs-capabilities.md`. This file covers the decisions for the foundation itself.

## Test runner

- **Decision**: vitest 4.1 (dev dependency) with `vitest.config.mts` that maps `@` to `web/`. vitest 5 was tried first, but its peer dependency needs `@types/node` ≥ 22. Bumping that shared dependency risks merge conflicts with parallel workstreams, so it was left at ^20.
- **Rationale**: native TypeScript/ESM support with no Babel setup. Compatible with Node 26 (engines `^22.12 || ^24 || >=26`). Fast to run in agent loops.
- **Alternatives considered**: Jest (needs a TypeScript/ESM transform and is heavier), and `node:test` with tsx (doesn't resolve path aliases and has weaker assertions).

## Validation approach

- **Decision**: hand-written validators returning `{ ok: true, value } | { ok: false, errors: string[] }`, covering external input only (PointingEvent now, tool params later).
- **Rationale**: Principle VIII (no runtime dependency for nine small record types), readable error messages, and the type stays the source of truth.
- **Alternatives considered**: zod (adds a runtime dependency, and the duplicated schema/type is an acceptable alternative later), JSON Schema with ajv (heavier, and it's a second source of truth).

## Field naming

- **Decision**: snake_case for all contract fields.
- **Rationale**: matches the WS2/WS5/WS6 briefs and the JSON on disk. Partners can read files without a mapping layer.
- **Alternatives considered**: camelCase in TypeScript with a mapping layer (extra code and a risk of drift).

## Region geometry

- **Decision**: a normalized box `{x, y, width, height}` in `[0, 1]`, origin at the top left of the original saved frame, with `coordinate_space: "original_frame_normalized"` and the frame size in pixels. Valid when `x + width ≤ 1` and `y + height ≤ 1`, and width and height are greater than 0.
- **Rationale**: exactly the WS2 brief §5 suggestion. Declaring the coordinate space prevents mixing geometry between images.

## Fixture images

- **Decision**: simple hand-written SVGs (two stylized curves on a grid, with a large "FIXTURE — not real data" text), no labels that suggest meaning.
- **Rationale**: no binary tooling needed, readable in diffs, and clearly not real evidence (Principle V).

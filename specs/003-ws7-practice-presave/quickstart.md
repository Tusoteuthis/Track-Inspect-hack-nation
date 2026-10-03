# Quickstart: WS7 S2 validation
```
cd web
npm run typecheck && npx vitest run
PW_PORT=3102 npx playwright test e2e/practice.spec.ts
npm run build && grep -riE 'expected[_ ]?(decision|answer)|acceptable[_ ]?explanation|common[_ ]?wrong|scoring|answer[_ ]?key|rubric' .next/static fixtures/ui public/fixtures/ui; echo exit=$?
npm run dev   # open /practice, /practice?fixture_latency=4000, /practice?fixture_fail=commit
```
Expected:
- All tests pass.
- The e2e screenshots land in `web/test-results/practice/`.
- The grep prints nothing and `exit=1`.

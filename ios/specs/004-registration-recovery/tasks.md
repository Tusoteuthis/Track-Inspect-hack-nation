# Tasks

- [x] T001 Add regression tests for SDK raw value, already-registered/registration-race/pending flows, real errors, callback outcomes and ViewModel retry/background behavior. FR-001–004.
- [x] T002 Implement SDK-boundary registration helper and typed service results; update existing mocks. FR-001–003.
- [x] T003 Add separate registration feedback and single-attempt guard; show status in dashboard/setup without changing capture behavior. FR-002/004.
- [x] T004 Run full tests, build/sign 0.1.0 (4), install/launch on original phone if available, and record actual evidence/remaining hardware limits. FR-005.

Results: 46 unit + 7 UI tests passed, including 14 registration regression tests. Raw value 0 is confirmed as alreadyRegistered. Signed build 0.1.0 (4) verified, installed and launched on the original iPhone 16 Pro Max. `docs/REGISTRATION-FIX.md` records evidence and remaining physical capture checks.

Dependencies: T001 → T002 → T003 → T004. All five requirements covered; no blocking spec inconsistencies or constitution exceptions. No credential edits planned.

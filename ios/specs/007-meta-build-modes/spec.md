# Explicit Meta build modes

User chooses DAM or legacy camera mode at build/install time. Build both and install legacy (without DAM), retaining a DAM artifact for rollback.

Requirements: display actual installed configuration in Settings; keep identical bundle identity and credentials; do not reset authorization or start capture automatically; reject unknown build modes; never simulate a runtime toggle unsupported by the SDK. Passing tests/installation is not proof of recovered glasses connectivity.

Acceptance: both artifacts contain boolean usesDam with the intended value; Settings labels that value; pinned SDK configuration parser accepts both; legacy tests pass; signed legacy artifact installs and launches on the existing phone.

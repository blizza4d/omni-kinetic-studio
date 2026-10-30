# Acceptance Matrix Rules & Verification Methodology

## 1. PURPOSE
The Acceptance Matrix is the formal, automated ledger of record for every feature, subsystem, and invariant across all development phases. No claim of capability is accepted without verifiable test status and artifact evidence.

## 2. STATUS TAXONOMY
Every entry in `acceptance-matrix.json` and `/docs/ACCEPTANCE_MATRIX.md` must be classified under one of four explicit statuses:
- **`passed`**: Validated by automated tests/gates and verified with visual/numeric trace evidence.
- **`failed`**: An implemented capability that currently fails its defined thresholds or throws errors.
- **`not_implemented`**: Planned for the current or upcoming milestone but not yet implemented.
- **`regressed`**: A capability that passed in a prior milestone but now fails due to subsequent changes.

## 3. EVIDENCE MANDATE
- Every `passed` row must link to a machine-readable test log, report JSON, or screenshot with build stamp.
- Re-running acceptance tests on the production build is mandatory before opening review gates.

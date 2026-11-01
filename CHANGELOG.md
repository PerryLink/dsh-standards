# Changelog

## 2026-11-02 — P0–P2 and attestation migration

- Renamed certificate → attestation (`dsh-attestation/1`, `DSH-ATT-*`,
  `publish/attestations/`); historical docs carry a migration banner.
- Added the gap ledger (43), role governance (44), and three-purpose kits (45).
- Added `scheme/`, `spec/clauses.json`, `spec/reference-suite.json`,
  `spec/schemas/report.schema.json`, `evidence/` hash chain.
- Added G4 static check, clause-map, stale-check, surveillance, dashboard.
- Added developer/official/market kits and `publish/verify.mjs` / `verify.html`.
- CI: governance checks, 72 tests, attestation verify, shell syntax, cross-platform matrix.
- Cross-repo: portal `f882144` (levels + verify), guide `e75cd9f` (scaffolder placeholder), kit `9897213` (manual template), catalog `914b793` (levels sidecar).

# Changelog

## 2026-11-02 — P0–P2, Apache-2.0, and attestation migration

- Renamed certificate → attestation (`dsh-attestation/1`, `DSH-ATT-*`,
  `publish/attestations/`); historical docs carry a migration banner.
- Added the gap ledger (43), role governance (44), and three-purpose kits (45).
- Added `scheme/`, `spec/clauses.json`, `spec/reference-suite.json`,
  `spec/schemas/report.schema.json`, `evidence/` hash chain.
- Added G4 static check, clause-map, stale-check, surveillance, dashboard.
- Added developer/official/market kits and `publish/verify.mjs` / `verify.html`.
- CI: governance checks, 73 tests, attestation verify, shell syntax, cross-platform matrix.
- License: text CC BY 4.0 with a required Change Notice; code Apache-2.0 (D-013); marks separate.
- Cross-repo: portal `f882144`, guide `e75cd9f`, kit `9897213`, catalog `a272d06`, certification `2f27666`, cert-mcp `4f0cf72`.

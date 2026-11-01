# dsh-standards specification tree

One project, three adoption levels. Each level has its own maturity; they share
the glossary, evidence anchor, and checker.

| Level | Document | Maturity | Evidence |
|---|---|---|---|
| ENTRY | [../31-DSH-ENTRY入门规范.md](../31-DSH-ENTRY入门规范.md) | public-preview | 18/18 recognized; 10/18 base G3, 8 clean after gate; client 15/15 loaded |
| FLOW | [../32-DSH-FLOW顺畅规范.md](../32-DSH-FLOW顺畅规范.md) | draft | J1/J2/J4/J6 runtime on fixture; 5 real packages; J3/J5/J7/J8 not-run |
| BOOST | [../33-DSH-BOOST加速实践.md](../33-DSH-BOOST加速实践.md) | draft | LEV-1–8 8/8 measured at synthetic/loader/provider-capture level |

Machine-readable:

- [levels.json](levels.json) — levels, gates, evidence states, crosswalk.
- [clauses.json](clauses.json) — stable clause IDs mapped to gates (`clause-map.mjs`).
- [reference-suite.json](reference-suite.json) — versioned samples, anchors, change rules.
- [schemas/evidence.schema.json](schemas/evidence.schema.json) — `dsh-levels/1` record.
- [schemas/attestation.schema.json](schemas/attestation.schema.json) — `dsh-attestation/1` quality record.
- [schemas/report.schema.json](schemas/report.schema.json) — `dsh-report/1` inspection report (no grade).
- [../40-checker/scripts/level-audit.mjs](../40-checker/scripts/level-audit.mjs) — one-command audit.
- [../publish/level-labels.example.json](../publish/level-labels.example.json) — market labels.

Rules:

- Levels depend on `common` only; do not import each other.
- A level is not a certification, badge, grade, or score.
- `dsh-standard` is an alias; `dsh-standards` is canonical.

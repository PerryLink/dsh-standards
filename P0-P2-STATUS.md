# P0–P2 status (2026-11-02)

> This is the honest status board for `43` §4. A task is `DONE` only when the
> artifact exists and its check passes. `PARTIAL` means the artifact exists but a
> runtime/external condition is still missing. `NOT DONE` is not written as done.

## P0 — rules and guardrails

| Task | Status | Evidence |
|---|---|---|
| governance/ + 4 checks | DONE | `governance-check`, `dco-check`, `attestation-check`, `claim-check` |
| governance.yml | DONE | `.github/workflows/governance.yml` |
| PR/issue templates | DONE | PR + appeal + bug + proposal |
| README/index/CONTRIBUTING/MAINTAINERS | DONE | links + disclaimers |
| decision log D-001..D-010 | DONE | `governance/decision-log.md` |

## P1 — minimum verifiable loop

| Task | Status | Evidence / gap |
|---|---|---|
| STD-02 clause map | DONE | `spec/clauses.json` + `clause-map.mjs` |
| STD-03 G4/G5 | DONE | static G4 + `stale-check.mjs`; G5 via `expiresAt` |
| STD-07 not-applicable/sunset | DONE | schema enum + `docs/sunset.md` |
| STD-09 security/privacy scope | DONE | `docs/scope-security.md` |
| STD-11 claimLevel | DONE | `evidence.schema.json`, `attestation.schema.json` |
| EVD-01 J3 invalid config | DONE (fixture-level) | `journey-config-observe.mjs` + `flow-config` fixture: field path, valid, default |
| EVD-02 J5 permissions | DONE (preflight) | `journey-disclosure-shape.mjs`: declarations + forbidden words; human review still required |
| EVD-08 doctor blocked/G4 | DONE (G4) | G4 static; doctor `blocked` is a separate repo task |
| EVD-09 report schema | DONE | `spec/schemas/report.schema.json` |
| EVD-10 reference suite | DONE | `spec/reference-suite.json` |
| EVD-12 evidence chain | DONE | `evidence/chain.jsonl` + `evidence-chain.mjs` |
| EVD-13 one-command reproduce | PARTIAL | `level-audit` + `nextActions`; no unified `dsh-levels audit` |
| EVD-14 evidence schema | DONE | `dsh-levels/1` + audience/claimLevel/render |
| EVD-18 failure taxonomy | DONE | `docs/status-taxonomy.md` |
| EVD-19 sample provenance | DONE | reference suite `provenance` |
| CRT-01 scheme | DONE | `scheme/SCHEME-v1.md` + `scheme.json` |
| CRT-02 attestation JSON | DONE | `dsh-attestation/1` |
| CRT-03 migrate one | DONE | `DSH-ATT-2026-001` (draft, self-assessed) |
| CRT-07 status machine | DONE | scheme transitions + schema |
| CRT-11 report/attestation split | DONE | report has no grade; attestation has no checks |
| CRT-12 scope/limitations | DONE | `scope.excluded` required |
| MKT-01/03/04/08/10 | DONE | portal `f882144`: 99-repo levels, attestation mirror, verify page, checks 8-11 |
| DEV-01 checklists | DONE | `CHECKLIST-{entry,flow,boost}.md` |
| DEV-03 error catalog | DONE | `ERRORS.md` |
| DEV-05 kit template | DONE | guide `e75cd9f` scaffolder + kit `9897213` manual template; `dsh.standards` not-run |
| DEV-06 single CLI | DONE | `40-checker/bin/dsh-levels.mjs audit` forwards to `level-audit` |
| DEV-08 bilingual parity | PARTIAL | translation rules; no parity script |
| DEV-09 minimal examples | DONE | `examples/boost`, fixtures, `QUICKSTART` |
| DEV-10 not-claims | DONE | `NOT-CLAIMS.md` |
| OFF-01/02/05/06/07 | DONE | BRIEF, repro, RFC, LIMITS, NO-ENDORSEMENT |
| GOV-12/14/15/16/18 | DONE | onboarding, CoC, translating, fork, AI log |
| OPS-02/04/05/06/09/10 | DONE | drift, incident, evidence, release, dependabot, privacy |

## P2 — coverage and supervision

| Task | Status | Evidence / gap |
|---|---|---|
| EVD-03 J7 observability | DONE (fixture-level) | `journey-config-observe.mjs`: start line + credential boundary |
| EVD-04 J8 client shapes | PARTIAL | shape preflight + `web-probe.mjs`; no render probe in FLOW |
| EVD-05 10 packages | DONE | 10 real packages; 4 second-wave J4 pass, 1 (`verification`) recorded FAIL |
| EVD-07 18/18 clean | PARTIAL | 10 verified / 8 partial; `fullbase/ATTRIBUTION.md` maps each partial to missing services (`agentPresets`, `connection`, `webServer`) |
| EVD-11 round-robin | DONE | `round-robin.yml` ubuntu+windows; artifact `rounds/2026Q4.json` `comparable:true` (latest main run `5bbfbc6`/`8cc8030`) |
| EVD-15 stale clock | DONE | `stale-check.mjs`; fixed-date test |
| EVD-16 negative controls | DONE | G4 + existing 5 negatives |
| EVD-17 cross-platform | DONE | `.github/workflows/cross-platform.yml` (ubuntu+windows) |
| EVD-20 benchmark entry | DONE | `bench/README.md` |
| CRT-04 appeal dry-run | DONE | `governance/disputes/DSP-2026-001.json` |
| CRT-06 surveillance | DONE | `surveillance.mjs` + `surveillance/2026Q4.json` |
| CRT-08 status history | DONE | `history[]` in schema/example |
| CRT-09 verify page | DONE | `publish/verify.mjs` + `verify.html` |
| CRT-10 rubric | DONE | `scheme/rubric.json` |
| MKT-02 verify page | DONE | `publish/verify.html` + portal `verify.html` (f882144) |
| MKT-05/06/07 catalog | DONE | catalog `a272d06`: 109-package sidecar, `withdrawn`, `/v1/levels`, `peerRange` + `dshVersion` |
| DEV-02 30-min trial | NOT DONE | protocol only (`TIME-TRIAL.md`), no 5-author data |
| DEV-04 migration card | DONE | `MIGRATION.md` |
| DEV-07 training | DONE | `TRAINING.md` |
| DEV-11 FAQ | DONE | `FAQ.md` |
| OFF-03/04/08/10 | DONE | field data, top issues, host issues, upstream |
| OPS-03 dashboard | DONE | `dashboard.mjs` + `dashboard.json` |
| OPS-07 changelog | DONE | `CHANGELOG.md` |

## Certificate → attestation migration

| Item | Status |
|---|---|
| Schema `dsh-attestation/1` | DONE |
| Directory `publish/attestations/` | DONE |
| IDs `DSH-ATT-*` | DONE |
| Checker `attestation-check.mjs` | DONE |
| Verify CLI/HTML | DONE |
| Tests | DONE |
| Historical docs banner | DONE (39/40/42/84/86/89) |
| Old paths | Removed; no compatibility alias (draft repo, no external consumers) |

## Cross-repo commits

| Repo | Commit | CI |
|---|---|---|
| `dsh-standards` | `1c60245`, `b491bda` | governance + cross-platform success |
| `dsh-plugin-portal` | `f882144` | CI success |
| `dsh-plugin-guide` | `e75cd9f` | verify-kit / plugin-doctor / pages success |
| `dsh-plugin-kit` | `9897213` | ci success |
| `dsh-catalog` | `914b793` | ci + deploy success |

## Verification

```bash
cd 40-checker && node --test          # 73 tests
node 40-checker/scripts/governance-check.mjs
node 40-checker/scripts/clause-map.mjs
node 40-checker/scripts/evidence-chain.mjs verify
node 40-checker/scripts/stale-check.mjs
node 40-checker/scripts/attestation-check.mjs
node 40-checker/scripts/claim-check.mjs
node publish/verify.mjs --id DSH-ATT-2026-001
```

## What is still genuinely open

1. J8 browser render is still not a FLOW record; J3/J7 are fixture-level runtime, not ecosystem-wide.
2. 18/18 clean (10/8 today); `ATTRIBUTION.md` explains the 8 partial rows as host-profile service gaps, not plugin code FAIL.
3. 30-minute trial with 5 authors (protocol only).
4. Independent second round-robin runner (`comparable:false` today).
5. Portal/catalog changes live in their own repos (agent output, pending commit).
6. No external official/market/developer adoption yet; the kits are “rejectable
   artifacts”, not adoption evidence.
7. `dsh-plugin-certification` keeps the historical `certified` brand; the
   standard repo’s schema/files/IDs are migrated, that separate repo is not.
8. ~~Catalog `dshVersion`~~：已补（`a272d06`）。

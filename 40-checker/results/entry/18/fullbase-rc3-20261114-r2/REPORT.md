# ENTRY 18 — full base-profile G0–G3 runtime (dsh 0.2.2-rc.3), r2

> **Status: 18/18 rows landed = 17 executed + 1 externally blocked.** On
> `@deepseek-ai/dsh@0.2.2-rc.3`, base-only: **10 G3-verified** (8 gate-admit +
> 2 whose version gate rejects), **7 partial**, **0 failed**, **0 error**,
> **1 blocked** (upstream fixture repo deleted, so the row never reached G0).
> Both workflow jobs are green: 17/17 shard jobs + the aggregate job
> (run-level success). This is the `-r2` re-run of `../fullbase-rc3-20261114/`
> (A13, the first run); the historical `../fullbase/` (0.2.2-alpha.2,
> 2026-10-31) is untouched and remains stale for rc.3.

- **Profile:** `dsh-base` only — `node_modules/@deepseek-ai/dsh-base/cordis.patch.yml`.
  No web-app layer, no `dsh web`, no client runtime.
- **Run:** [`43570668837`](https://github.com/PerryLink/dsh-standards/actions/runs/43570668837)
  (`workflow_dispatch`, ref `main`, created 2026-11-14T07:20:50Z, completed
  2026-11-14T07:23:28Z, conclusion **success**; 18 jobs = 17 shard success +
  aggregate success). Runner tree `943e67e4` = the workflow fix commit
  `ci(entry18): mark the deleted YuJunZhiXue fixture as blocked …`; the durable
  evidence is committed in a later commit (attribution: `SUPPORTED.md` A14).
- **Host:** GitHub Actions `ubuntu-latest` (`ubuntu-26.04`, image
  `20261111.196`), Node `v24.22.2` (`setup-node: 24`), DSH installed globally at
  `0.2.2-rc.3`; every executed row records `dshVersion: 0.2.2-rc.3`.
- **Anchor:** `dsh=0.2.2-rc.3` (npm `next`), tag `dsh-v0.2.2-rc.3` = `38a6a5c9…`.
- **Evidence:** 18 `<id>.json` (raw `bundle-smoke` JSON per row, same schema
  `dsh-entry18-fullbase/1` for the blocked row) + `summary.json` (aggregate with
  the added `blocked` and `coverage` fields). Per historical policy the `.log`
  files stay in the CI artifact, they are not committed; this directory is a
  byte-for-byte copy of the downloaded artifact JSON (landed with
  `40-checker/scripts/land-runtime-artifacts.mjs`).
- **asOf:** 2026-11-14 15:30 +08 (Asia/Shanghai) — landed from the run artifacts
  generated 2026-11-14T07:23Z.

## 1. The blocked row (why it is `blocked`, not `error`)

`YuJunZhiXue__dsh-purge` (name `dsh-purge`, version `1.1.85`, github source) is
the 18th ENTRY row. Its upstream GitHub repository is gone: `GET
https://api.github.com/repos/YuJunZhiXue/dsh-purge` returns **404** (checked
2026-11-14); the user exists but has **0 public repos**; there is no public fork
and the npm package `dsh-purge` only has a placeholder `0.0.0-stage`. Nothing
recoverable is published, so the fixture cannot be installed by anyone, on any
DSH version.

r1 recorded this as `error` (`fixture` stage: `git clone … could not read
Username`) and the whole run was red for an external reason. r2 changes the
outcome class, not the measurement: the shard is not run at all, and the
aggregate job synthesizes the row from the shipped manifest
(`40-checker/samples/entry18.json`) with `status: "blocked"`, `verdict:
"blocked"`, `blocked: true`, `error: {stage: "fixture", message: …}`, `host:
null` and `elapsedMs: 0`. The row is **never counted as a pass** and **never
counted as a failure of rc.3**; `summary.json.coverage` says explicitly
`rows: 18, executed: 17, blocked: 1`. Determinism: re-running the workflow
reproduces the same 17 executed rows + the same blocked row (r1 vs r2 executed
rows are identical in status/verdict/G3 numbers; see §2).

| id | stage | message |
|---|---|---|
| `YuJunZhiXue__dsh-purge` | `fixture` | `upstream repo YuJunZhiXue/dsh-purge was deleted (404 on 2026-11-14); no public fork or npm tarball exists` |

## 2. Per-package rows

| id | package | version | source | status | verdict | target/active | elapsedMs |
|---|---|---|---|---|---|---|---|
| `ci-diet` | `dsh-ci-diet` | 0.5.2 | npm | verified | verified | 1/1 | 3430 |
| `daily-log` | `@zzerx/dsh-plugin-daily-log` | 0.4.3 | npm | verified | verified | 1/1 | 2877 |
| `DDDMUC__dsh-free-search` | `dsh-free-search` | 0.9.26 | github | verified | verified | 1/1 | 2919 |
| `Ebony-Vinyl__dsh-our-free-model` | `dsh-our-free-model` | 2.1.0 | github | verified | verified | 1/1 | 2339 |
| `howmp__dsh-pentest` | `@howmp/dsh-pentest` | 0.1.0-rc.37 | github | partial | partial | 3/2 | 4319 |
| `kingcharleslzy-ai__dsh-purge` | `dsh-purge-community` | 1.6.67 | github | partial | partial | 5/4 | 3609 |
| `liguobao__ds-harness-remote` | `ds-harness-remote` | 0.6.0 | github | verified | verified | 2/2 | 3312 |
| `mmparko__dsh-purge` | `dsh-purge` | 1.1.71 | github | partial | partial | 4/3 | 2250 |
| `project-memory` | `@yolk_vat-y/dsh-project-memory` | 0.6.7 | npm | verified | verified | 1/1 | 4460 |
| `qiushi` | `qiushi-dsh-evidence-audit` | 0.1.0 | npm | verified | verified | 1/1 | 2429 |
| `SeaOf0__dsh-redteam-model` | `@dsh-external/dsh-redteam-model` | 1.1.2 | github | partial | partial | 11/0 | 3123 |
| `shaobeichen__dsh-pocket` | `dsh-pocket` | 2.12.0 | github | partial | partial | 1/0 | 2529 |
| `status-rotator` | `dsh-status-rotator` | 0.38.0 | npm | verified | verified | 1/1 | 2042 |
| `telemetry` | `dsh-telemetry-redactor` | 0.1.0 | npm | verified | verified-gate-reject | 1/1 | 2619 |
| `ui-auth` | `dsh-ui-auth` | 0.7.1 | npm | partial | partial | 1/0 | 4457 |
| `verification` | `dsh-verification-receipt` | 0.1.0 | npm | verified | verified-gate-reject | 1/1 | 2268 |
| `ysr666__dsh-vision-router` | `dsh-vision-router` | 3.1.0 | github | partial | partial | 2/1 | 5791 |
| `YuJunZhiXue__dsh-purge` | `dsh-purge` | 1.1.85 | github | **blocked**（upstream deleted） | blocked | —/— | 0 |

Totals: 18 rows; status verified 10 / partial 7 / failed 0 / error 0 /
**blocked 1**; verdicts verified 8 / verified-gate-reject 2 / partial 7 /
blocked 1. Executed denominator: **17**, coverage
`17/17 executed rows measured` (10 verified + 7 partial), one external block.

## 3. Difference from r1 (`../fullbase-rc3-20261114/`, A13)

- The 17 executed rows are **byte-for-byte equal in outcome** to r1: identical
  `status`, `verdict`, `g3Rows`/`g3Active` per package (only `startedAt`/
  `finishedAt`/`elapsedMs` differ). No new failure or flake appeared.
- The r1 row `YuJunZhiXue__dsh-purge` (`error`, fixture clone) is replaced by the
  `blocked` row: same external cause, deterministic outcome class.
- r1 run-level status: **failure** (1/18 shards red + aggregate green). r2:
  **success** (17/17 shards green + aggregate green).
- r1 `summary.json`: `error: 1`; r2: `error: 0`, `blocked: 1`, plus the
  `coverage` object. Nothing else changed in the schema.

## 4. Method

The gate definitions, the farm layout, the artifact policy and the limitations
are unchanged from `../fullbase-rc3-20261114/REPORT.md` §3 and
`../fullbase/REPORT.md` §1–§2; this run only changes the blocked-row handling
in `.github/workflows/entry18-runtime.yml` (17-row matrix + aggregate
synthesis). `G2` is still reported, not enforced; `G4` remains static only.
This report makes **no client-runtime claim** — that is
`../../webruntime-rc3-20261114-r2/`.

## 5. Recompute

```bash
python3 -c "import json;d=json.load(open('40-checker/results/entry/18/fullbase-rc3-20261114-r2/summary.json'));print(d['count'],d['present'],d['status'],d['verdicts'],d['blocked'],d['coverage'])"
# expect: 18 18 {'verified': 10, 'partial': 7, 'failed': 0, 'error': 0, 'missing': 0, 'blocked': 1} … blocked=1 executed=17
python3 -c "import json;d=json.load(open('40-checker/results/entry/18/fullbase-rc3-20261114-r2/YuJunZhiXue__dsh-purge.json'));print(d['status'],d['verdict'],d['blocked'],d['error']['stage'])"
# expect: blocked blocked True fixture
```

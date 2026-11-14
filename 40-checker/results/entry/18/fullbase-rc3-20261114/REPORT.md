# ENTRY 18 — full base-profile G0–G3 runtime (dsh 0.2.2-rc.3)

> **Status: 18/18 rows landed, 17/18 shards usable.** On `@deepseek-ai/dsh@0.2.2-rc.3`,
> base-only: **10 G3-verified** (8 gate-admit + 2 whose version gate rejects),
> **7 partial**, **0 failed**, **1 error** (fixture repo could not be cloned in CI).
> This directory is the durable copy of the uploaded CI artifacts; the historical
> `../fullbase/` (0.2.2-alpha.2, 2026-10-31) is untouched and remains stale for rc.3.

- **Profile:** `dsh-base` only — `node_modules/@deepseek-ai/dsh-base/cordis.patch.yml`.
  No web-app layer, no `dsh web`, no client runtime.
- **Run:** [`43560480242`](https://github.com/PerryLink/dsh-standards/actions/runs/43560480242)
  (`workflow_dispatch`, created 2026-11-14T05:13Z, aggregate job success, 17/18 shards success).
  The runner tree was `e73b77f9` (dsh-standards 1.6.11); the evidence is committed at
  the v1.6.12 release commit, which is the attribution used by `SUPPORTED.md` A13.
- **Host:** GitHub Actions `ubuntu-latest`, Node `v24.22.2` (runner), DSH installed
  globally at `0.2.2-rc.3`; every row records `dshVersion: 0.2.2-rc.3`.
- **Anchor:** `dsh=0.2.2-rc.3` (npm `next`), tag `dsh-v0.2.2-rc.3` = `38a6a5c9…`.
- **Evidence:** `<id>.json` (raw `bundle-smoke` JSON per package), `summary.json`
  (aggregate). Per historical policy the `.log` files stay in the CI artifact, they
  are not committed; this directory is a byte-for-byte copy of the artifact JSON.
- **asOf:** 2026-11-14 14:40 +08 (Asia/Shanghai) — landed from the workflow artifacts
  generated 2026-11-14T05:16:23Z.

## 1. Failure attribution (why one row is `error`)

| id | stage | message |
|---|---|---|
| `YuJunZhiXue__dsh-purge` | `fixture` | `git clone YuJunZhiXue/dsh-purge failed: … could not read Username for 'https://github.com': No such device or address` |

The fixture repository is not publicly cloneable from CI (no credentials are
injected into runtime runs by design). This is **not** an rc.3 incompatibility and
not a plugin FAIL: the row never reached G0–G3. Do not count it as a pass; the
surrounding shards (`kingcharleslzy-ai__dsh-purge`, `mmparko__dsh-purge`,
`dddmuc__dsh-free-search`, …) do boot on rc.3.

## 2. Per-package rows

| id | package | version | source | status | verdict | target/active | elapsedMs |
|---|---|---|---|---|---|---|---|
| `ci-diet` | `dsh-ci-diet` | 0.5.2 | npm | verified | verified | 1/1 | 1908 |
| `daily-log` | `@zzerx/dsh-plugin-daily-log` | 0.4.3 | npm | verified | verified | 1/1 | 1843 |
| `DDDMUC__dsh-free-search` | `dsh-free-search` | 0.9.26 | github | verified | verified | 1/1 | 2671 |
| `Ebony-Vinyl__dsh-our-free-model` | `dsh-our-free-model` | 2.1.0 | github | verified | verified | 1/1 | 3149 |
| `howmp__dsh-pentest` | `@howmp/dsh-pentest` | 0.1.0-rc.37 | github | partial | partial | 3/2 | 2738 |
| `kingcharleslzy-ai__dsh-purge` | `dsh-purge-community` | 1.6.67 | github | partial | partial | 5/4 | 2968 |
| `liguobao__ds-harness-remote` | `ds-harness-remote` | 0.6.0 | github | verified | verified | 2/2 | 4114 |
| `mmparko__dsh-purge` | `dsh-purge` | 1.1.71 | github | partial | partial | 4/3 | 3296 |
| `project-memory` | `@yolk_vat-y/dsh-project-memory` | 0.6.7 | npm | verified | verified | 1/1 | 5484 |
| `qiushi` | `qiushi-dsh-evidence-audit` | 0.1.0 | npm | verified | verified | 1/1 | 2192 |
| `SeaOf0__dsh-redteam-model` | `@dsh-external/dsh-redteam-model` | 1.1.2 | github | partial | partial | 11/0 | 2520 |
| `shaobeichen__dsh-pocket` | `dsh-pocket` | 2.12.0 | github | partial | partial | 1/0 | 3385 |
| `status-rotator` | `dsh-status-rotator` | 0.38.0 | npm | verified | verified | 1/1 | 2761 |
| `telemetry` | `dsh-telemetry-redactor` | 0.1.0 | npm | verified | verified-gate-reject | 1/1 | 2653 |
| `ui-auth` | `dsh-ui-auth` | 0.7.1 | npm | partial | partial | 1/0 | 4148 |
| `verification` | `dsh-verification-receipt` | 0.1.0 | npm | verified | verified-gate-reject | 1/1 | 2705 |
| `ysr666__dsh-vision-router` | `dsh-vision-router` | 3.1.0 | github | partial | partial | 2/1 | 7168 |
| `YuJunZhiXue__dsh-purge` | `dsh-purge` | 1.1.85 | github | error（fixture：fixture clone 无认证） | error | —/— | 588 |

Totals: 18 rows; status verified 10 / partial 7 / failed 0 / error 1; verdicts
verified 8 / verified-gate-reject 2 / partial 7 / error 1.

## 3. Method

The gate definitions, the farm layout, the artifact policy and the limitations
are unchanged from `../fullbase/REPORT.md` §1–§2; this run only changes the
host anchor (rc.3), the runner environment (GitHub Actions, Node v24.22.2) and the
evidence directory. `G2` is still reported, not enforced (a package can boot while
its version gate would reject it → `verified-gate-reject`). `G4` remains static
only; this report makes **no client-runtime claim** — that is the other directory
`../../webruntime-rc3-20261114/`.

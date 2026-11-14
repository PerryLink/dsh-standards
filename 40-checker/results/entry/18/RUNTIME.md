# Runtime G0–G3: run (base-only)

## Current: rc3 (2026-11-14, `dsh 0.2.2-rc.3`)

Status: **run — 18/18 rows landed, 17/18 usable** on
`@deepseek-ai/dsh@0.2.2-rc.3` (base-only, no web layer).

- Evidence: `fullbase-rc3-20261114/<id>.json` (raw `bundle-smoke` JSON per row) +
  `fullbase-rc3-20261114/summary.json`; method, per-package table and limitations:
  `fullbase-rc3-20261114/REPORT.md`.
- Result: **10 G3-verified** (8 gate-admit + 2 gate-reject), **7 partial**,
  0 failed, **1 error** (`YuJunZhiXue__dsh-purge` fixture repo is not cloneable
  from CI — not an rc3 incompatibility).
- CI: run [`43560480242`](https://github.com/PerryLink/dsh-standards/actions/runs/43560480242)
  (`workflow_dispatch`, 17/18 shards success); artifacts are uploaded **and** the
  durable copy is committed in this directory (2026-11-14, asOf 2026-11-14 14:40 +08).
- Scope: `dsh-base` only. The web/app layer is a separate evidence directory:
  `../../webruntime-rc3-20261114/` (client-module probe, 17/18 rows).

The alpha.2 run below is kept as **historical evidence at its own anchor**; it is
`stale` for rc3 (see `SUPPORTED.md` §4) and must not be cited as rc3 runtime.

## History: alpha.2 (2026-10-31, `dsh 0.2.2-alpha.2`)

Status: **run** — 18/18 shards executed against `@deepseek-ai/dsh@0.2.2-alpha.2`
on 2026-10-31, base-only (`dsh-base` patch, no web layer).

- Evidence: `fullbase/<id>.json` (raw `bundle-smoke` JSON embedded) + `<id>.log`,
  aggregate `fullbase/summary.json`.
- Method, exact commands, per-package table, limitations: `fullbase/REPORT.md`.
- Result: **10 G3-verified** (8 gate-admit + 2 gate-reject), **8 partial**,
  0 failed, 0 runner errors.
- Scope: `dsh-base` only. The four web-app-dependent packages (SeaOf0, liguobao,
  shaobeichen, ui-auth) are **not** upgraded to web-profile runtime by this
  evidence; no client runtime was measured.
- History: `ci-diet.runtime-attempt.json` is the earlier 120s-timeout attempt
  (G3 partial, target row pending). It is superseded by `fullbase/ci-diet.json`
  (G3 verified) and retained as a historical failure, not a pass.
- CI: `.github/workflows/entry18-runtime.yml` reproduces the 18 shards; artifacts
  were uploaded, not committed (the rc3 run above changed that for its own copy).

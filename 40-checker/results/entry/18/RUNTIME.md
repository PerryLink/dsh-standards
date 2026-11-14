# Runtime G0–G3: run (base-only)

## Current: rc3 r2 (2026-11-14, `dsh 0.2.2-rc.3`)

Status: **run — 18/18 rows = 17 executed + 1 externally blocked**, deterministic
on `@deepseek-ai/dsh@0.2.2-rc.3` (base-only, no web layer).

- Evidence: `fullbase-rc3-20261114-r2/<id>.json` (raw `bundle-smoke` JSON per row,
  the blocked row included) + `fullbase-rc3-20261114-r2/summary.json`
  (`blocked: 1`, `coverage.executed: 17`); method, per-package table, the
  blocked-row reason and the r1 delta: `fullbase-rc3-20261114-r2/REPORT.md`.
- Result: **10 G3-verified** (8 gate-admit + 2 gate-reject), **7 partial**,
  0 failed, 0 error, **1 blocked** (`YuJunZhiXue__dsh-purge`: its upstream GitHub
  repo was deleted (404 on 2026-11-14) and there is no public fork or npm
  tarball, so the fixture cannot exist in CI; the row is never counted as a pass
  and never as an rc.3 failure).
- CI: run [`43570668837`](https://github.com/PerryLink/dsh-standards/actions/runs/43570668837)
  (`workflow_dispatch`, run-level **success**: 17/17 shard jobs + aggregate);
  the durable copy is committed in this directory (asOf 2026-11-14 15:30 +08).
- Determinism: re-running produces the same 17 executed rows + the same blocked
  row; r1's single `error` row is now the documented `blocked` row, so the
  workflow is no longer red for a non-dsh reason.
- Scope: `dsh-base` only. The web/app layer is a separate evidence directory:
  `../../webruntime-rc3-20261114-r2/` (client-module probe, 18 rows = 14 client
  measured + 3 shell-only + 1 blocked).

## History: rc3 first run r1 (2026-11-14, A13)

Kept as history: `fullbase-rc3-20261114/` (18 rows, run
[`43560480242`](https://github.com/PerryLink/dsh-standards/actions/runs/43560480242)).
Result: 10 verified / 7 partial / 1 **error** (`YuJunZhiXue__dsh-purge` fixture
clone failed). The run was red only because of that deleted upstream repo; it is
superseded by r2 above.

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

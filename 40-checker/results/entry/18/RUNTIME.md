# Runtime G0–G3: run (base-only)

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
  are uploaded, not committed.

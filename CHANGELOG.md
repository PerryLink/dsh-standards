## 1.0.2 — 2026-11-03

- L1–L3 run in a child process and are hard-killed on timeout; a blocked event loop is reported as `not-run`, never a pass.
- `dsh.capabilities` / `dsh.labels` warnings are advisory: still reported, no longer flip the verdict.
- A `g4` client-shape failure now fails DSC-01 instead of being dropped.
- `private: true` and workspace roots report NA instead of WARN/FAIL.
- A directory without `package.json` returns exit 3 (usage), matching `dsh-levels`.

## 1.0.1 — 2026-11-03

- 打包：`files` 收窄，不再把 `40-checker/results/` 打进 npm 包（此前包含第三方插件结果、截图与本机路径）。
- 文档：`npx dsh-levels` 会装到第三方包，改为 `npx -p dsh-standards dsh-levels`；修正不存在的 `bin/` 路径；测试数 73→98。
- CLI：`dsh-standards --help` 首行显示自己的包名与版本。
- 检查器：`exports["."]` 指向缺失文件时不再回退到 `main`。

# Changelog

## 2026-11-03 — Node 24.9 baseline
- Require Node >=24.9.0 to match DeepSeek Harness 0.2.2-alpha.3.

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

# Web runtime (dsh 0.2.2-rc.3) — real Chromium client-module probe

Status: **17/18 rows measured.** Run
[`43560484422`](https://github.com/PerryLink/dsh-standards/actions/runs/43560484422)
produced 18 row artifacts on `@deepseek-ai/dsh@0.2.2-rc.3`:
**14 client-bearing rows `client-module-loaded`** (the 15th,
`YuJunZhiXue__dsh-purge`, could not be installed in CI), **4/4 web-app rows
loaded**, 2 host-gate rejections (`telemetry`, `verification`) and 1 shell-only
row without a client export (`qiushi`).

The run-level denominator gate failed for one reason only: it asserts that the
artifacts contain **15 client-bearing + 3 skipped** rows, and this run has
**14 + 4** because the private fixture row could not be installed and was recorded
as skipped instead of client-bearing. That is the same `YuJunZhiXue/dsh-purge`
fixture-clone failure as in `../../entry/18/fullbase-rc3-20261114/`; the other 17
rows are valid measurements. The historical `../webruntime/` (alpha.2,
2026-10-31) is untouched and remains stale for rc.3.

- **Run:** `workflow_dispatch`, created 2026-11-14T05:13Z; runner tree
  `e73b77f9` (dsh-standards 1.6.11); evidence committed at the v1.6.12 release
  commit (attribution: `SUPPORTED.md` A13).
- **Host:** GitHub Actions `ubuntu-latest`, Node `v24.22.2`, DSH `0.2.2-rc.3`
  installed globally; the probe records `dsh 0.2.2-rc.3` in every row.
- **Anchor:** `dsh=0.2.2-rc.3`, tag `dsh-v0.2.2-rc.3` = `38a6a5c9…`.
- **What a passing row proves:** the host composed the package's `dsh.client`
  entry into `window.__DSH_BOOT__.entries`, the browser fetched its client bundle,
  the boot marker disappeared and `#root` mounted, with no console/page errors.
  It does **not** prove UI layout, slot correctness or interactivity. Same claim
  limits as `../webruntime/REPORT.md` §1.
- **Evidence per row:** `client-export.json`, `installed-package.json`,
  `probe.json`, `shot.png`, `summary.md`; non-client rows carry only
  `probe.json` + `summary.md` (same subset as the historical layout).
- **asOf:** 2026-11-14 14:40 +08 (Asia/Shanghai).

## Per-row results

| id | webapp | client | state | bootGraph | consoleErrors | pageErrors |
|---|---|---|---|---|---|---|
| `ci-diet` |  | yes | loaded | ok | 0 | 0 |
| `daily-log` |  | yes | loaded | ok | 0 | 0 |
| `DDDMUC__dsh-free-search` |  | yes | loaded | ok | 0 | 0 |
| `Ebony-Vinyl__dsh-our-free-model` |  | yes | loaded | ok | 0 | 0 |
| `howmp__dsh-pentest` |  | yes | loaded | ok | 0 | 0 |
| `kingcharleslzy-ai__dsh-purge` |  | yes | loaded | ok | 0 | 0 |
| `liguobao__ds-harness-remote` | yes | yes | loaded | ok | 0 | 0 |
| `mmparko__dsh-purge` |  | yes | loaded | ok | 0 | 0 |
| `project-memory` |  | yes | loaded | ok | 0 | 0 |
| `qiushi` |  | skipped | skipped（no ./client export） | ok | 0 | 0 |
| `SeaOf0__dsh-redteam-model` | yes | yes | loaded | ok | 0 | 0 |
| `shaobeichen__dsh-pocket` | yes | yes | loaded | ok | 0 | 0 |
| `status-rotator` |  | yes | loaded | ok | 0 | 0 |
| `telemetry` |  | skipped | host-gate-reject | not-run | 0 | 0 |
| `ui-auth` | yes | yes | loaded | ok | 0 | 0 |
| `verification` |  | skipped | host-gate-reject | not-run | 0 | 0 |
| `ysr666__dsh-vision-router` |  | yes | loaded | ok | 0 | 0 |
| `YuJunZhiXue__dsh-purge` |  | skipped | skipped（no ./client export） | missing | 0 | 0 |

Counts: rows 18; `ok=true` 15; client-bearing measured 14/15 (1 not installable);
web-app loaded 4/4; host-gate rejections 2; shell-only/no-client 1 (qiushi);
install failure 1 (YuJunZhiXue__dsh-purge).

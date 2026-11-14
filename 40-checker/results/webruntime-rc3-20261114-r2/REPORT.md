# Web runtime (dsh 0.2.2-rc.3) — real Chromium client-module probe, r2

Status: **18/18 rows landed = 14 measured client-bearing + 3 measured
shell-only + 1 externally blocked.** Run
[`43570671265`](https://github.com/PerryLink/dsh-standards/actions/runs/43570671265)
produced 17 row artifacts (17/17 jobs success) plus the synthesized blocked row
(denominator-summary job success, run-level **success**):
**14 client-bearing rows `client-module-loaded`**, **4/4 web-app rows loaded**,
2 host-gate rejections (`telemetry`, `verification`), 1 shell-only row without a
client export (`qiushi`), and 1 blocked row (`YuJunZhiXue__dsh-purge`: its
upstream repository was deleted, so nothing could be installed). The 15th
client-bearing row is the blocked fixture: the measured coverage is **14/15
client-bearing rows (14/18 ENTRY rows) + 1 blocked**, not a green 15/15.

This is the `-r2` re-run of `../webruntime-rc3-20261114/` (A13, the first run).
The historical `../webruntime/` (alpha.2, 2026-10-31) is untouched and remains
stale for rc.3.

- **Run:** `workflow_dispatch`, ref `main`, created 2026-11-14T07:20:52Z,
  completed 2026-11-14T07:26:49Z, conclusion **success**; 18 jobs = 17 row jobs
  success + denominator-summary success. Runner tree `943e67e4` = the workflow
  fix commit `ci(entry18): mark the deleted YuJunZhiXue fixture as blocked …`;
  the durable evidence is committed in a later commit (attribution:
  `SUPPORTED.md` A14).
- **Host:** GitHub Actions `ubuntu-latest` (`ubuntu-26.04`, image
  `20261111.196`), Node `v24.22.2`, DSH `0.2.2-rc.3` installed globally; the
  probe records `dsh 0.2.2-rc.3` in every measured row.
- **Anchor:** `dsh=0.2.2-rc.3`, tag `dsh-v0.2.2-rc.3` = `38a6a5c9…`.
- **What a passing row proves:** the host composed the package's `dsh.client`
  entry into `window.__DSH_BOOT__.entries`, the browser fetched its client
  bundle, the boot marker disappeared and `#root` mounted, with no
  console/page errors. It does **not** prove UI layout, slot correctness or
  interactivity. Same claim limits as `../webruntime/REPORT.md` §1.
- **Evidence per row:** `client-export.json`, `installed-package.json`,
  `probe.json`, `shot.png`, `summary.md` for measured client rows; non-client
  measured rows carry `probe.json` + `summary.md`; the blocked row carries
  `probe.json` + `summary.md` only. All 18 row artifacts were landed with
  `40-checker/scripts/land-runtime-artifacts.mjs` (the blocked row is a normal
  `web-runtime-YuJunZhiXue__dsh-purge` artifact uploaded by the summary job).
- **asOf:** 2026-11-14 15:30 +08 (Asia/Shanghai).

## Denominator (why 14 + 4, not 15 + 3)

The 15/18 client denominator was defined when `YuJunZhiXue/dsh-purge` was still
public: 15 client-bearing ENTRY rows + 3 without a client export. The upstream
repository is now 404 (`GET /repos/YuJunZhiXue/dsh-purge`, 2026-11-14; user
exists with 0 public repos; no fork; npm has only the placeholder
`dsh-purge@0.0.0-stage`), so that 15th client row cannot be measured by anyone.
r2 therefore gates on the **reproducible** denominator:

- rows: **18** = 17 executed + 1 blocked;
- measured client-bearing: **14**/14 measured rows; the 15th client row is the
  blocked fixture;
- skipped: **4** = 3 measured shell-only (`qiushi` no `./client` export +
  `telemetry`/`verification` host-gate-reject) + 1 blocked;
- webapp: **4**/4 measured rows;
- blocked: **1**/1 (`skipped: "fixture-deleted-upstream"`, `blocked: true`,
  `ok: false`, `hasClient: false`, `error.stage: "fixture"`).

`SUPPORTED.md` stays `partial` for rc3: the blocked row makes 15/15 impossible
by construction, so this evidence cannot be promoted to `runtime` on the 15/15
criterion.

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
| `qiushi` |  | skipped（no ./client export） | loaded (shell-only) | ok | 0 | 0 |
| `SeaOf0__dsh-redteam-model` | yes | yes | loaded | ok | 0 | 0 |
| `shaobeichen__dsh-pocket` | yes | yes | loaded | ok | 0 | 0 |
| `status-rotator` |  | yes | loaded | ok | 0 | 0 |
| `telemetry` |  | skipped | host-gate-reject | not-run | 0 | 0 |
| `ui-auth` | yes | yes | loaded | ok | 0 | 0 |
| `verification` |  | skipped | host-gate-reject | not-run | 0 | 0 |
| `ysr666__dsh-vision-router` |  | yes | loaded | ok | 0 | 0 |
| `YuJunZhiXue__dsh-purge` |  | skipped（blocked） | blocked（fixture deleted upstream） | not-run | 0 | 0 |

Counts: rows 18; `ok=true` 15 (the blocked row is `ok=false` by construction);
client-bearing measured 14 (all 14 `client-module-loaded`); web-app loaded 4/4;
host-gate rejections 2; shell-only/no-client 1; **blocked 1**.

## Difference from r1 (`../webruntime-rc3-20261114/`, A13)

- The 17 executed rows have the same measured outcome as r1 (same 14/14 client
  rows loaded, same 4/4 webapp, same 2 gate rejections, same 1 shell-only row);
  only timings/screenshots differ.
- The r1 install-failure probe for `YuJunZhiXue__dsh-purge` (generic
  `skipped: "no ./client export"`, which made the denominator read 14+4) is
  replaced by the explicit blocked probe: `skipped:
  "fixture-deleted-upstream"`, `blocked: true`. The denominator gate is now
  **18 rows / 14 client-bearing / 4 skipped / 4 webapp / 1 blocked** and passes
  deterministically, instead of failing on 15/3.
- r1 run-level status: **failure** (install job red + denominator job red).
  r2: **success** (17/17 row jobs + denominator job green).

## Recompute

```bash
python3 - <<'EOF'
import json, glob, os
root = '40-checker/results/webruntime-rc3-20261114-r2'
rows = [json.load(open(os.path.join(root, d, 'probe.json'))) for d in os.listdir(root) if os.path.isfile(os.path.join(root, d, 'probe.json'))]
print(len(rows), sum(1 for r in rows if r.get('hasClient') is True), sum(1 for r in rows if r.get('hasClient') is not True),
      sum(1 for r in rows if r.get('webapp') is True), sum(1 for r in rows if r.get('blocked') is True),
      sum(1 for r in rows if r.get('ok') is True))
EOF
# expect: 18 14 4 4 1 15
```

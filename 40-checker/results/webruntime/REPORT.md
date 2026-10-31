# Web runtime evidence — real Chromium client-module probe

Status: **measured in CI.** Run
[41217382935](https://github.com/PerryLink/dsh-standards/actions/runs/41217382935)
produced 18 row artifacts: **15/15 client-bearing rows `client-module-loaded`**,
**4/4 web-app rows loaded**, 3 shell-only/skipped rows, and 2 host-gate
rejections (`telemetry`, `verification`) recorded from the install gate. Run
41218358951 re-runs the same matrix with gate rejection recorded as a row rather
than a job failure; use its artifacts for the cleaner per-row set.

Local pre-CI evidence (five rows + one negative) is in `local-pre-ci/`; it is
kept as an independent reproduction, not as the CI result.

The previous blocker was `GET /` returning `401`. That is the intended
authentication boundary. The real path is the token URL printed by the Web app:

```
dsh web: http://127.0.0.1:<port>/?token=<process-launch-token>
```

The token exchange mints the signed `dsh-auth-*` cookie and redirects to `./`;
the cookie-authenticated page is the real `index.html`. This was re-read from
`packages/client/connection/src/browser-auth.ts` and rechecked against
`.github/workflows/web-smoke.yml` (run 41215756898, commit `c0cc157`).

## 1. What a passing row means

**Claim:** `client-module-loaded`.

A passing row proves all of the following in a real browser host page:

1. the host composed the package's `dsh.client` entry into
   `window.__DSH_BOOT__.entries` (the package id is present);
2. the browser fetched the corresponding client bundle (the entry's `url` or id
   appears in `performance.getEntriesByType('resource')`);
3. the boot page marker `[data-dsh-boot]` disappeared and `#root` contains the
   mounted shell;
4. there were no console errors, no `pageerror` events, and no failed or
   non-2xx same-origin script requests.

**Not claimed:** every plugin's UI slot is visually correct, laid out correctly,
or interactive. The probe does not inspect plugin-specific DOM. Do **not** call
a passing row `UI-rendered`; it is not a pixel or slot review.

**Failure rule:** a package that is in `__DSH_BOOT__` but whose client `apply`
throws produces a `console.error`/`pageerror` and leaves the boot page visible;
the probe fails. A missing boot entry is a **real failure**, not a skip.

## 2. CI design

Workflow: `.github/workflows/web-runtime.yml`.

- `workflow_dispatch`, Ubuntu, Node 24, `timeout-minutes: 30`,
  `fail-fast: false`, `max-parallel: 4`.
- **18 rows**, one boot per package. The 4 web-app rows are the same rows
  flagged `webapp: true`; they are not booted twice.
- 15 of the 18 declare `exports["./client"]`. The workflow reads the installed
  `package.json` and records `hasClientExport`; the summary job fails unless it
  sees exactly 15 client-bearing rows, 3 skipped rows, and 4 webapp rows.
- Rows without `./client` are not failed: they are probed shell-only (empty
  `--expect`) and annotated `skipped: "no ./client export"`,
  `clientClaim: false`.
- `dsh-ui-auth` gates the whole Web UI. Its row passes
  `--login-file "$RUNNER_TEMP/dsh-ui-auth-bootstrap.txt"`; the probe performs
  `POST /auth/login` through the browser context **before** opening the token
  URL, so the token exchange reaches the real shell. Credentials are generated
  by the plugin on first boot into `$RUNNER_TEMP` (process cwd), never the repo,
  and are deleted after the probe.
- A host-gate rejection during `dsh plugin add` is recorded as
  `gateRejected: true` / `skipped: "host-gate-reject"` instead of crashing the
  step. It still produces a row artifact; the summary separately requires
  15 client-bearing rows and 4 webapp rows.

Per job:

```sh
# 1. install
npm install -g pnpm@10
npm install -g @deepseek-ai/dsh@0.2.2-alpha.2
npm install --no-save playwright@1.49.1
npx playwright install --with-deps chromium

# 2. custom profile backed by the shipped web template
export DSH_HOME="$RUNNER_TEMP/dsh-home"
dsh --profile wr --from-default-profile web --dump-config

# 3. sample install (third-party lifecycle scripts intentionally not run)
dsh plugin --profile wr add --ignore-scripts "<matrix.spec>"

# 4. boot the custom profile; there is NO trailing "web" token
cd "$RUNNER_TEMP"
dsh --profile wr --no-open --port 18770 > web.log 2>&1 &
# wait up to 180 s for: dsh web: http://127.0.0.1:18770/?token=...

# 5. real browser
node 40-checker/scripts/web-probe.mjs \
  --url "$APP_URL" --expect "<package-name>" \
  --out "$EVID/probe.json" --screenshot "$EVID/shot.png" --timeout 90000
# ui-auth only: --login-file "$RUNNER_TEMP/dsh-ui-auth-bootstrap.txt"
```

Exact dispatch command once the parent pushes:

```sh
gh workflow run web-runtime.yml --repo PerryLink/dsh-standard --ref main
```

Artifacts per row: `40-checker/results/webruntime/<id>/` containing
`probe.json`, `shot.png`, `web.log` (token/password redacted),
`client-export.json`, `installed-package.json`, `plugin-add.log`,
`dump-config.yml`, and `summary.md`. The summary job downloads all 18 and
prints the denominator table.

## 3. The four web-app rows

| row id | source | install spec | expected boot id | local pre-CI |
|---|---|---|---|---|
| `SeaOf0__dsh-redteam-model` | `SeaOf0/dsh-redteam-model` | `github:SeaOf0/dsh-redteam-model#ce24bb2…` (`1.1.2`) | `@dsh-external/dsh-redteam-model` | **PASS** (local checkout at the same commit) |
| `liguobao__ds-harness-remote` | `liguobao/ds-harness-remote` | `ds-harness-remote@0.6.0` | `ds-harness-remote` | CI pending |
| `shaobeichen__dsh-pocket` | `shaobeichen/dsh-pocket` | `dsh-pocket@2.12.0` | `dsh-pocket` | **PASS** |
| `ui-auth` | `0QwQ0/dsh-ui-auth` | `dsh-ui-auth@0.7.1` | `dsh-ui-auth` | **PASS** (with bootstrap login) |

## 4. The 15 client-bearing rows

Local manifest inspection (`local-pre-ci/client-exports.json`) confirms these 15
of the 18 identities declare `exports["./client"]`:

| # | package | version | expected boot id | local pre-CI |
|---|---|---|---|---|
| 1 | `dsh-free-search` | 0.9.26 | `dsh-free-search` | **PASS** |
| 2 | `dsh-our-free-model` | 2.1.0 | `dsh-our-free-model` | CI pending |
| 3 | `@dsh-external/dsh-redteam-model` | 1.1.2 | `@dsh-external/dsh-redteam-model` | **PASS** (local checkout) |
| 4 | `dsh-purge` (YuJunZhiXue) | 1.1.85 | `dsh-purge` | CI pending |
| 5 | `dsh-ci-diet` | 0.5.2 | `dsh-ci-diet` | CI pending |
| 6 | `@zzerx/dsh-plugin-daily-log` | 0.4.3 | `@zzerx/dsh-plugin-daily-log` | CI pending |
| 7 | `@howmp/dsh-pentest` | 0.1.0-rc.37 | `@howmp/dsh-pentest` | CI pending |
| 8 | `dsh-purge-community` (kingcharleslzy-ai) | 1.6.67 | `dsh-purge-community` | CI pending |
| 9 | `ds-harness-remote` | 0.6.0 | `ds-harness-remote` | CI pending |
| 10 | `dsh-purge` (mmparko) | 1.1.71 | `dsh-purge` | CI pending |
| 11 | `@yolk_vat-y/dsh-project-memory` | 0.6.7 | `@yolk_vat-y/dsh-project-memory` | CI pending |
| 12 | `dsh-pocket` | 2.12.0 | `dsh-pocket` | **PASS** |
| 13 | `dsh-status-rotator` | 0.38.0 | `dsh-status-rotator` | CI pending |
| 14 | `dsh-ui-auth` | 0.7.1 | `dsh-ui-auth` | **PASS** (with bootstrap login) |
| 15 | `dsh-vision-router` | 3.1.0 | `dsh-vision-router` | CI pending |

The 3 identities without `./client` are probed shell-only and recorded as
skipped, not failed:

| package | version | disposition |
|---|---|---|
| `qiushi-dsh-evidence-audit` | 0.1.0 | shell-only **PASS**, `skipped: "no ./client export"` |
| `dsh-telemetry-redactor` | 0.1.0 | skipped for client claim |
| `dsh-verification-receipt` | 0.1.0 | skipped for client claim |

This is why the denominator is **15/18 client-bearing**, not 18/18.

## 5. Local pre-CI browser evidence

Real Chromium 131, not a jsdom/mock. The WSL image lacked three shared
libraries; their `.deb` payloads were extracted under `/tmp` and supplied via
`LD_LIBRARY_PATH`. CI does not need this workaround (`--with-deps` installs
them). Raw sanitized JSON is in `local-pre-ci/`.

| probe | result | boot entries | loaded | console/page | root | boot page |
|---|---|---|---|---|---|---|
| `dsh-ui-auth@0.7.1` + login | **ok** | 72 | 1/1 | 0/0 | 1 child | gone |
| `dsh-free-search@0.9.26` | **ok** | 72 | 1/1 | 0/0 | 1 child | gone |
| `@dsh-external/dsh-redteam-model@1.1.2` (local checkout) | **ok** | 72 | 1/1 | 0/0 | 1 child | gone |
| `dsh-pocket@2.12.0` | **ok** | 72 | 1/1 | 0/0 | 1 child | gone |
| `qiushi-dsh-evidence-audit@0.1.0` (shell-only) | **ok** | 71 | n/a | 0/0 | 1 child | gone |
| `dsh-ui-auth` without login (negative) | **fail** | 0 / missing | n/a | 1 console | 0 | n/a |

The negative run lands on `/auth/login` (`<title>登录 · DeepSeek Harness</title>`)
and has no `__DSH_BOOT__`, which is exactly why the workflow passes
`--login-file` for that row. A second negative check expecting
`dsh-pocket` in the `dsh-free-search` profile failed with
`missingEntries: ["dsh-pocket"]`, proving missing boot entries are failures.

## 6. Validation performed

- `node --check 40-checker/scripts/web-probe.mjs` passes.
- Python `yaml.safe_load` parses the workflow; 18 matrix rows, 4 webapp flags,
  1 login row, unique ids.
- `bash -n` on all 11 `run:` blocks (GitHub expressions replaced by
  placeholders) — 0 syntax failures.
- Pure parser fixture: `summarizeBootGraph` on a synthetic graph returns
  `bootGraph: "ok"`, the expected `bootIds`, one loaded entry, and a missing
  entry; `null` returns `bootGraph: "missing"`.
- The annotation script was run against real and synthetic result JSON; the
  summary script was run against a synthetic 18-row artifact tree and produced
  `15/15 client, 3/3 skipped, 4/4 webapp`, exit 0.
- Real browser probes as listed in §5.

## 7. Uncertainties / VERIFY notes

1. **GitHub install specs.** `github:SeaOf0/dsh-redteam-model#<sha>` and the
   three `dsh-purge` forks are pinned to commits whose local `package.json`
   versions match the matrix. A local `dsh plugin add github:…` attempt timed
   out on this WSL network; the package content was instead validated from the
   local checkout at the same commit. GitHub-hosted runners should fetch these
   normally.
2. **`--ignore-scripts`.** Third-party lifecycle scripts are deliberately not
   run in CI. If a package depends on `postinstall` to insert its root row
   (notably `YuJunZhiXue/dsh-purge`), the client entry may be absent from
   `__DSH_BOOT__` and that row will fail. That is an honest artifact-level
   result under a scripts-disabled install, not a probe bug.
3. **`dsh-ui-auth` login.** The probe hardcodes `POST /auth/login`, the
   documented first-run form, and reads the credential file the plugin writes
   into its process cwd (`$RUNNER_TEMP`). If a future version moves the route or
   the file, that one row fails loudly.
4. **Custom profile syntax.** Verified locally:
   `dsh --profile wr --from-default-profile web --dump-config` creates the
   profile from the shipped web template, and the boot command is
   `dsh --profile wr --no-open --port 18770` (no trailing `web`). `--profile`
   precedes the app arguments.
5. **Port.** Each row uses `18770` on its own runner; no cross-row conflict. A
   local port conflict produced `EADDRINUSE`, which the workflow would surface
   as "did not print its URL within 180 s" with the boot log attached.

## 8. Next step

Push and dispatch the workflow, then collect the 18 artifacts. Only after that
run may the report claim a CI denominator (expected: 15 client rows, 3 skipped,
4 webapp rows). Local evidence above is pre-CI only.

---

## 8. Final CI run (2026-11-01)

Run [41218358951](https://github.com/PerryLink/dsh-standards/actions/runs/41218358951)
(`web-runtime`, commit `d68e817`): **19/19 jobs success** (18 rows + denominator
summary), 0 failures.

| Metric | Result |
|---|---|
| rows | **18/18** |
| client-bearing rows | **15/15** |
| client rows `client-module-loaded` | **15/15** |
| web-app rows | **4/4** |
| web-app rows loaded | **4/4** |
| shell-only rows | **1/1** (`qiushi`, no `./client` export) |
| host-gate rejections | **2/2** (`telemetry`, `verification`) — install gate, recorded as rows |
| console errors / page errors on the 16 loaded rows | **0 / 0** |

`4/4` web-app rows: `SeaOf0/dsh-redteam-model`, `liguobao/ds-harness-remote`,
`shaobeichen/dsh-pocket`, `dsh-ui-auth` (the last one after the bootstrap login).
The two gate rows are **not** probe failures: the host install gate refuses their
stale peer ranges before boot, which is the correct behavior recorded by the
`--ignore-scripts` path.

Per-row evidence is in `summary.json`, and each `<id>/` directory has
`probe.json`, `summary.md`, `shot.png`, `web.log`, `client-export.json`.
The claim remains **`client-module-loaded`**, not `UI-rendered`.

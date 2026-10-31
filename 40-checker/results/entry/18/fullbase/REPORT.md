# ENTRY 18 — full base-profile G0–G3 runtime

> **Status: 18/18 shards executed.** On `@deepseek-ai/dsh@0.2.2-alpha.2`, base-only:
> **10 G3-verified** (8 gate-admit + 2 whose version gate rejects), **8 partial**,
> **0 failed**, **0 runner errors**. This directory replaces the
> "runtime not-run / boot >160s" note in `../RUNTIME.md`.

- **Profile:** `dsh-base` only — `node_modules/@deepseek-ai/dsh-base/cordis.patch.yml`.
  No web-app layer, no `dsh web`, no client runtime.
- **Run window:** 2026-10-31T15:54:46Z – 15:58:11Z (23:54–23:58 Asia/Shanghai). CI rerun: [41219602842](https://github.com/PerryLink/dsh-standards/actions/runs/41219602842), 19/19 jobs success; aggregate identical to the local run.
- **Host:** WSL2 Ubuntu 24.04.4 LTS, Node v24.22.1, npm 11.19.1.
- **Anchor:** `@deepseek-ai/dsh@0.2.2-alpha.2`, WSL-local install at
  `/tmp/dsh022/node_modules/@deepseek-ai/dsh` (hoisted dependency layout). The CI
  workflow installs the same version globally; the script resolves either layout.
- **Evidence:** `fullbase/<id>.json` (one row per package, raw `bundle-smoke` JSON
  embedded), `fullbase/<id>.log` (full stage log; matched by `*.log`, so not
  committed, uploaded by CI), `fullbase/summary.json`.

## 1. What "verified" means here

| Gate | Check in this run | Evidence |
|---|---|---|
| G0 | `dsh.bundle.patch` parses | `smoke.g0` |
| G1 | base + sample compose; target rows resolve to names | `smoke.g1` |
| G2 | `evaluatePluginCompatibility(manifest, {}, runtimeVersion)` | `smoke.g2` |
| G3 | real `boot()`; every target row `state === 2` or `disabled === true` | `smoke.g3` |
| G4 | static client shape: `dsh.client`, `exports["./client"]`, package-root row | `smoke.g4` |

`status` is the smoke's G3 state, not a composite. `bundle-smoke` **reports** G2
without enforcing it, so a package can boot while the host version gate would
reject it. Those rows are `status: verified` but `verdict: verified-gate-reject`.
G4 is static only; this report makes **no client-runtime claim**.

## 2. Method

### 2.1 Farm (a real directory, not a symlink to `node_modules`)

```
<farm>/node_modules/<entry>       symlink -> <deps-root>/<entry>   (one per entry)
<farm>/plugins/<id>               extracted tarball or git clone
<farm>/node_modules/<pkg-name>    symlink -> ../plugins/<id>
```

`<farm>/node_modules` is created as a **real directory**; only each entry of the
installed DSH dependency root is symlinked into it. Symlinking the directory
itself would make `npm install` write into the global install. The dependency
root is `<dsh-package>/node_modules` for nested/bundled installs (the Windows
global 0.2.1 layout) or the hoisted parent for local/global npm installs (the
0.2.2 layout used here); `inspectDshRoot()` accepts either and the JSON row
records the resolved `host.depsRoot`. Locally 202 entries were linked.

### 2.2 Artifact policy

- `source: npm` → the published tarball at the exact version, required.
- `source: github` → prefer the published tarball at the exact version when it
  exists **and** its `repository` matches the manifest `spec` (or the tarball
  declares no repository); otherwise `git clone --depth 1`.
- After extraction/clone the copied `package.json` name and version are checked
  against the manifest. A version mismatch is recorded (`artifact.versionMatches`)
  and does not get erased.

Result: 14 published tarballs, 4 shallow clones (SeaOf0, YuJun, kingcharleslzy,
mmparko — no matching npm version). No artifact was rebuilt from source.

### 2.3 Install (third-party install scripts never run)

The copied `package.json` is first stripped of `devDependencies` and `scripts`
(dev-only `workspace:*` specs and dev peer pins made several published packages
unresolvable standalone: `EUNSUPPORTEDPROTOCOL` / `ERESOLVE`). Then:

```bash
npm install --omit=dev --ignore-scripts --legacy-peer-deps --no-package-lock --no-audit --no-fund
```

The registry artifact and the repository are **not** modified; the rewrite happens
only in the disposable farm copy and every row records `manifestRewrite`
(15 × `removed devDependencies+scripts`, 3 × `removed scripts`) plus
`installScripts: "skipped"` and `install.status: "ok"`.

### 2.4 Boot

```bash
node 40-checker/scripts/bundle-smoke.mjs \
  --package "$FARM/plugins/<id>" \
  --host  "$DSH/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js" \
  --base  "$DSH/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml" \
  --bare  "$FARM/" --timeout 150000 --json
```

`bundle-smoke` forces its process to exit after flushing the JSON and matches
target rows by inserted package name as well as id. The full JSON is embedded in
each row as `smoke`; `status` is exactly `smoke.g3.state`.

## 3. Exact commands

Local (0.2.2 WSL install; `--dsh-root` replaces the CI `npm root -g` lookup):

```bash
D=/tmp/dsh022/node_modules/@deepseek-ai/dsh
node 40-checker/scripts/entry18-ci.mjs --only ci-diet \
  --dsh-root "$D" --expected-dsh-version 0.2.2-alpha.2
```

All 18 sequentially, then the aggregate:

```bash
node 40-checker/scripts/entry18-ci.mjs --all \
  --dsh-root "$D" --expected-dsh-version 0.2.2-alpha.2
node 40-checker/scripts/entry18-ci.mjs --summary
```

The 18 local rows were produced as 18 parallel `--only` shards (parallelism 5,
each shard with its own farm, which is how the CI matrix runs); Ebony was re-run
alone at the end of the same window after a fixture-selection fix.

CI (`.github/workflows/entry18-runtime.yml`, manual dispatch):

```bash
npm install -g @deepseek-ai/dsh@0.2.2-alpha.2
node 40-checker/scripts/entry18-ci.mjs --only <id> --expected-dsh-version 0.2.2-alpha.2
```

## 4. Results

| # | id | package@version | source | fixture | G0 | G1 target | G2 | G3 active/target (state) | G4 | elapsed | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `DDDMUC__dsh-free-search` | `dsh-free-search@0.9.26` | github | published-tarball | parsed | 1 | admit | 1/1 (verified) | ok | 1978 ms | verified |
| 2 | `Ebony-Vinyl__dsh-our-free-model` | `dsh-our-free-model@2.1.0` | github | published-tarball | parsed | 1 | admit | 1/1 (verified) | ok | 2024 ms | verified |
| 3 | `SeaOf0__dsh-redteam-model` | `@dsh-external/dsh-redteam-model@1.1.2` | github | git-clone | parsed | 11 | admit | 0/11 (partial) | ok | 84550 ms | partial |
| 4 | `YuJunZhiXue__dsh-purge` | `dsh-purge@1.1.85` | github | git-clone | parsed | 3 | admit | 2/3 (partial) | fail (no root row) | 26899 ms | partial |
| 5 | `ci-diet` | `dsh-ci-diet@0.5.2` | npm | published-tarball | parsed | 1 | admit | 1/1 (verified) | ok | 2392 ms | verified |
| 6 | `daily-log` | `@zzerx/dsh-plugin-daily-log@0.4.3` | npm | published-tarball | parsed | 1 | admit | 1/1 (verified) | ok | 1638 ms | verified |
| 7 | `howmp__dsh-pentest` | `@howmp/dsh-pentest@0.1.0-rc.37` | github | published-tarball | parsed | 3 | admit | 2/3 (partial) | ok | 2660 ms | partial |
| 8 | `kingcharleslzy-ai__dsh-purge` | `dsh-purge-community@1.6.67` | github | git-clone | parsed | 5 | admit | 4/5 (partial) | ok | 143803 ms | partial |
| 9 | `liguobao__ds-harness-remote` | `ds-harness-remote@0.6.0` | github | published-tarball | parsed | 2 | admit | 2/2 (verified) | ok | 2648 ms | verified |
| 10 | `mmparko__dsh-purge` | `dsh-purge@1.1.71` | github | git-clone | parsed | 4 | admit | 3/4 (partial) | ok | 24704 ms | partial |
| 11 | `project-memory` | `@yolk_vat-y/dsh-project-memory@0.6.7` | npm | published-tarball | parsed | 1 | admit | 1/1 (verified) | ok | 2952 ms | verified |
| 12 | `qiushi` | `qiushi-dsh-evidence-audit@0.1.0` | npm | published-tarball | parsed | 1 | admit | 1/1 (verified) | n/a (no client) | 1722 ms | verified |
| 13 | `shaobeichen__dsh-pocket` | `dsh-pocket@2.12.0` | github | published-tarball | parsed | 1 | admit | 0/1 (partial) | ok | 2223 ms | partial |
| 14 | `status-rotator` | `dsh-status-rotator@0.38.0` | npm | published-tarball | parsed | 1 | admit | 1/1 (verified) | ok | 1836 ms | verified |
| 15 | `telemetry` | `dsh-telemetry-redactor@0.1.0` | npm | published-tarball | parsed | 1 | reject | 1/1 (verified) | n/a (no client) | 1646 ms | verified-gate-reject |
| 16 | `ui-auth` | `dsh-ui-auth@0.7.1` | npm | published-tarball | parsed | 1 | admit | 0/1 (partial) | ok | 2351 ms | partial |
| 17 | `verification` | `dsh-verification-receipt@0.1.0` | npm | published-tarball | parsed | 1 | reject | 1/1 (verified) | n/a (no client) | 1785 ms | verified-gate-reject |
| 18 | `ysr666__dsh-vision-router` | `dsh-vision-router@3.1.0` | github | published-tarball | parsed | 2 | admit | 1/2 (partial) | ok | 3600 ms | partial |

### 4.1 Counts

- Rows produced: **18/18** (every shard wrote a JSON row; no `missing`).
- G3 state: **10 verified, 8 partial, 0 failed**; verdicts: **8 verified,
  2 verified-gate-reject, 8 partial**.
- G2: 16 admit, 2 reject (telemetry, verification).
- G0: 18/18 parsed, 1 patch file each. G1 target rows: 1–11 per package.
- G4: 15 packages declare a client; 14 have a package-root row. `qiushi`,
  `telemetry`, `verification` declare no client (G4 n/a). YuJun fails G4: its
  patch inserts no `name: dsh-purge` package-root row.
- Fixtures: 14 published tarballs, 4 git clones. Install: 18/18 `ok`, zero
  install scripts executed.
- Sum of per-shard `elapsedMs` is 311,411 ms (wall window 3 m 25 s at
  parallelism 5). Clone-backed shards dominate: 24.7–143.8 s; tarball-backed
  shards were 1.6–3.6 s. These are local wall times, not a benchmark.

### 4.2 Partial rows — what did not become ACTIVE

Attribution to a missing host service comes from the earlier manual analysis in
`92-兼容运行时实测.md`; this run records row ids/states, not the service each row
waits for. All pending rows are `state: 0`.

| id | active/target | pending row(s) | attributed missing service (from 92) |
|---|---|---|---|
| `SeaOf0__dsh-redteam-model` | 0/11 | `dsh-redteam-model` + all 10 `preset-*` rows | `connection`, `agentPresets` |
| `YuJunZhiXue__dsh-purge` | 2/3 | `dsh-purge-redteam-ui` | `webServer` |
| `howmp__dsh-pentest` | 2/3 | `pentest-preset-root` | `agentPresets` |
| `kingcharleslzy-ai__dsh-purge` | 4/5 | `dsh-purge-redteam-ui` | `webServer` |
| `mmparko__dsh-purge` | 3/4 | `dsh-purge-redteam-ui` | `webServer` |
| `shaobeichen__dsh-pocket` | 0/1 | `dsh-pocket` (package root) | `connection`, `webServer` |
| `ui-auth` | 0/1 | `dsh-ui-auth` (package root) | `connection`, `webServer` |
| `ysr666__dsh-vision-router` | 1/2 | `vision-router-web-connection-ready` | `webStartup`, `webServer` |

`liguobao__ds-harness-remote` counts 2/2 because its TUI row is disabled by the
patch's own `!!js` expression; the smoke rule counts `disabled === true` as
satisfied. That is a base-profile result, not evidence for the TUI.

### 4.3 G2 gate rejects

The smoke reports only `reject`; the declared peer ranges in the published
manifests explain it (checked with `npm view`, not re-evaluated here):

- `dsh-telemetry-redactor@0.1.0`: `@deepseek-ai/dsh-session-telemetry >=0.1.0-rc.5 <0.2.0`
  excludes host `0.2.2-alpha.2`.
- `dsh-verification-receipt@0.1.0`: `@deepseek-ai/dsh-session >=0.1.0-rc.5 <0.1.0`
  cannot match a `0.2.x` host.

They boot under base because the smoke does not enforce G2. A real profile gate
would skip them; do not cite them as admissible without an exemption.

## 5. The four web-app packages — do not upgrade on this evidence

The packages previously classified as needing the web-app bundle are
SeaOf0/redteam, liguobao/remote, shaobeichen/pocket and ui-auth. Base-only here:
redteam, pocket and ui-auth are **partial**; liguobao is **verified** with the TUI
row disabled. None of this proves `dsh web` behavior (`connection`, `webServer`,
`webStartup`, `agentPresets` are not mounted in this profile). These four — and
every partial row above — must **not** be upgraded to web-profile
`interop-runtime` from this evidence.

This run is also not a revision of the earlier `7/18` profile-gated figure in
`92-兼容运行时实测.md`: the fixture method, host build and gate differ. Treat this
directory as **base-only runtime evidence for 0.2.2-alpha.2**, not as a new
profile verdict.

## 6. Limitations

1. **Base-only.** No web profile, no HTTP server, no client bundle execution.
   Packages that need `connection`/`webServer`/`webStartup`/`agentPresets` stay
   partial by construction.
2. **G2 is reported, not enforced.** `verified-gate-reject` rows boot here but
   would be skipped by a real profile gate.
3. **G4 is static.** File/export/root-row presence only; zero client-runtime
   evidence.
4. **Install scripts are skipped.** A package that needs `postinstall` to produce
   runtime files is judged without it. That is deliberate CI safety, not a pass.
5. **Fixture rewrite.** `devDependencies` and `scripts` are removed from the
   copied manifest before install. This changes only the disposable farm; the
   registry tarball/repo is untouched. It is fixture hygiene for standalone
   installs, not a package change.
6. **Fixture drift.** Four packages are cloned at HEAD (`--depth 1`). Version was
   checked at clone time (`artifact.versionMatches: true` for all four), but a
   later re-run can clone different content.
7. **Single run per package.** No repeat/stability measurement, no restart or
   unload checks. Timings are WSL2 `/tmp` wall times and will differ on CI.
8. **Environment mixing.** Committed rows are `environment: "local"` with
   `/tmp/dsh022` host paths. CI artifacts will say `environment:
   "github-actions"` with runner paths; compare `dshVersion` and `environment`
   before merging evidence.
9. **Target-row matching heuristic.** The patched smoke matches inserted ids and
   package names to handle `include:` wrappers; name matching could include a row
   that the id set would not. Raw rows are embedded so the match can be audited.
10. **Logs are not committed.** `.gitignore` has `*.log`; `<id>.log` exists
    locally beside each JSON and is uploaded as a CI artifact. The JSON is the
    committed evidence.
11. **`summary.json` counts what is on disk.** The CI summary job resets the
    result directory before downloading artifacts, and every shard deletes its
    own stale row before running, so a committed local row cannot be counted as
    fresh CI evidence.

## 7. Files, reproduction, CI

| Path | Role |
|---|---|
| `40-checker/samples/entry18.json` | 18-row manifest: id, name, version, source, spec |
| `40-checker/scripts/entry18-ci.mjs` | farm + install + smoke runner (`--only`, `--all`, `--summary`) |
| `.github/workflows/entry18-runtime.yml` | manual 18-shard matrix, Node 24, DSH 0.2.2-alpha.2, artifacts always |
| `40-checker/results/entry/18/fullbase/<id>.json` | one result row, raw smoke JSON included |
| `40-checker/results/entry/18/fullbase/<id>.log` | full stage log (local only; CI uploads it) |
| `40-checker/results/entry/18/fullbase/summary.json` | aggregate of the rows present |

Re-run locally: the two commands in §3. Re-run in CI: Actions → **entry18-runtime**
→ Run workflow. Each matrix job has a 20-minute timeout, `fail-fast: false`,
`max-parallel: 6`; JSON and log are uploaded with `if: always()`, and the
`aggregate` job downloads all shards and writes `summary.json`. The workflow does
not check out the DSH source; the only 0.2.2 provider is the npm global install.

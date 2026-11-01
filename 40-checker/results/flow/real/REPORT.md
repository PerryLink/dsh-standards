# FLOW real-package evidence (J1/J2/J4, one J6)

Generated: 2026-11-01 (Asia/Shanghai)
Scope: a **representative sample of 10** of the 18 packages in `40-checker/samples/entry18.json`.
This is **not** a run over all 18, and it is **not** full FLOW coverage.

> **Second wave (2026-11-02)**: 5 more npm packages were added (`daily-log`, `project-memory`, `qiushi`, `status-rotator`, `verification`). All 10 samples now use the same anchor, `dsh 0.2.2-alpha.2`. The one verification failure is recorded as a failure, not rewritten.

## Environment

| Item | Value |
|---|---|
| Host | WSL2 Linux, `x86_64` |
| `dsh` | `/tmp/dsh022/node_modules/@deepseek-ai/dsh/lib/bin.js` — **0.2.2-alpha.2** |
| Node | `v24.22.1` |
| pnpm | `12.15.0` |
| npm | `11.19.1` |
| Registry | `https://registry.npmmirror.com` (npm default in this environment) |
| Probe | `40-checker/scripts/journey-runtime.mjs` (unmodified) |
| Driver | `40-checker/scripts/flow-sample-ci.mjs` (new) |
| Raw evidence | `40-checker/results/flow/real/<id>.json` + `index.json` |

Each `<id>.json` is a `dsh-flow-real/1` envelope. The unmodified probe output is
under `.journey.result`; synthesized checks (the blocked gate) are under `.checks`.
No sample repo was edited. Dependencies were installed in the `/tmp` copies only.

## Samples and why they were chosen

| id | package@version | source | why |
|---|---|---|---|
| `ci-diet` | `dsh-ci-diet@0.5.2` | npm tarball | simple npm bundle; a published `0.5.1` also exists, so J6 is runnable |
| `DDDMUC__dsh-free-search` | `dsh-free-search@0.9.26` | shallow git clone | GitHub bundle |
| `ui-auth` | `dsh-ui-auth@0.7.1` | npm tarball | bundle with a client (`dsh.client` + `lib/client.js`) |
| `telemetry` | `dsh-telemetry-redactor@0.1.0` | npm tarball | expected host compatibility-gate rejection; recorded as **blocked** |
| `YuJunZhiXue__dsh-purge` | `dsh-purge@1.1.85` (clone HEAD package version is **1.1.86**) | shallow git clone | has a `postinstall` that writes the profile body insert |
| `daily-log` | `@zzerx/dsh-plugin-daily-log@0.4.3` | npm tarball | second wave |
| `project-memory` | `@yolk_vat-y/dsh-project-memory@0.6.7` | npm tarball | second wave |
| `qiushi` | `qiushi-dsh-evidence-audit@0.1.0` | npm tarball | second wave |
| `status-rotator` | `dsh-status-rotator@0.38.0` | npm tarball | second wave |
| `verification` | `dsh-verification-receipt@0.1.0` | npm tarball | second wave; expected host edge |

`YuJunZhiXue/dsh-purge` HEAD was `1bdf2399701ddea298adac8d0fad52314251ca7b`
("version 1.1.86"), but `entry18.json` records 1.1.85. The actual installed
version is reported in the JSON (`version: 1.1.86`), not silently rewritten.

## Per-package results

Legend: **PASS** = the probe's own check passed; **FAIL** = a real failure;
**BLOCKED** = the host gate refused the install (not a pass); **partial** =
the probe passed but did not model the package's real install path;
**not-run** = deliberately not executed.

| id | J1 install/remove | J2 disable/enable | J4 keyless tree-load | J6 upgrade/rollback | Adjudication |
|---|---|---|---|---|---|
| `ci-diet` | **PASS** (6/6) | **PASS** (2/2) | **PASS** | **PASS** (3/3) | 12 PASS, 0 FAIL, 4 not-run |
| `DDDMUC__dsh-free-search` | **PASS** (6/6) | **PASS** (2/2) | **PASS** | not-run (no second version) | 9 PASS, 0 FAIL, 6 not-run |
| `ui-auth` | **PASS** (6/6) | **PASS** (2/2) | **PASS** (with activation caveat) | not-run (no second version) | 9 PASS, 0 FAIL, 6 not-run |
| `telemetry` | **BLOCKED** at install | not-run (nothing installed) | not-run (nothing installed) | not-run | 1 PASS, 1 BLOCKED, 13 not-run |
| `YuJunZhiXue__dsh-purge` | **partial** (probe 6/6, postinstall skipped) | **partial** (only `dsh-purge-redteam`) | **PASS** (tree-load only; main plugin absent) | not-run | 9 PASS, 0 FAIL, 6 not-run; J1/J2 partial |

### `ci-diet` — dsh-ci-diet 0.5.2

- J1: profile create, `plugin add`, dump, layer, remove, clean — all PASS.
- J2: row `ciDiet.bootstrap` found from `--dump-config`; disable and enable both PASS.
- J4: keyless boot reached `MISSING_CREDENTIAL` — PASS (tree-load only).
- J6: **PASS**, using the published `0.5.1` tarball as `--previous`:
  `0.5.1 → 0.5.2 → 0.5.1`; installed version read from the profile each time.
- No failure. Caveat: J6 did **not** exercise persisted data or a migration.
- Raw probe summary: `{pass: 12, warn: 0, fail: 0, notRun: 4}`.

### `DDDMUC__dsh-free-search` — dsh-free-search 0.9.26

- Clone HEAD `7c30dd059e1d9de4ffc8b779978b2152af84b0ec`.
- J1/J2/J4 all PASS; J2 row `web-search-free` toggled correctly.
- J6 `not-run`: only one version was fetched. No second version was invented.
- Raw probe summary: `{pass: 9, warn: 0, fail: 0, notRun: 6}`.

### `ui-auth` — dsh-ui-auth 0.7.1

- J1/J2/J4 all PASS; J2 row `dsh-ui-auth` toggled correctly.
- J4 reached `MISSING_CREDENTIAL`, but the probe stderr contains:

  ```text
  dsh: warning: 1 entry did not activate
  dsh-ui-auth (dsh-ui-auth): pending (waiting for services: webServer, connection)
  dsh: MISSING_CREDENTIAL: llm-deepseek: no API key ...
  ```

  This is a **tree-load PASS**, not proof that the client-side UI works. The
  headless profile has no `webServer`/`connection` services, so the host entry
  is pending. J8 (client shapes) remains not-run.
- J6 `not-run`: no second version.
- Raw probe summary: `{pass: 9, warn: 0, fail: 0, notRun: 6}`.

### `telemetry` — dsh-telemetry-redactor 0.1.0 (BLOCKED)

The install was refused by the host compatibility gate. **No exemption was
requested or granted**, and the preflight never called `allow-version`; the
`compatibility.json` file was absent after the attempt.

Exact command and result:

```console
$ /tmp/dsh022/node_modules/@deepseek-ai/dsh/lib/bin.js plugin \
    --profile flow-gate add /tmp/flow-sample/telemetry
exit=1
dsh: installation rejected: Plugin dsh-telemetry-redactor@0.1.0 is incompatible
with dsh 0.2.2-alpha.2: requirements
{"@deepseek-ai/dsh-session-telemetry":">=0.1.0-rc.5 <0.2.0"}.
...
dsh: nothing was installed.
```

The host has `@deepseek-ai/dsh-session-telemetry@0.2.2-alpha.2`, which is
outside the plugin's `<0.2.0` peer range. This is a **host gate**, not a plugin
defect and not a fixture PASS. J2/J4 were not run because nothing was installed.
The hint printed by the gate (`dsh plugin allow-version ... --accept-risk`) was
deliberately **not** executed.

### `YuJunZhiXue__dsh-purge` — dsh-purge 1.1.86 (J1/J2 partial)

The probe's raw J1/J2 checks passed, but the probe's `plugin add` installs a
**local link**, and the package's `postinstall` was deliberately skipped
(`--ignore-scripts`). The package's `cordis.patch.yml` says the main
`dsh-purge` insert is written by the postinstall/user layer; without it, the
main row is absent. A separate layer probe recorded:

- `mainRowPresent: false`
- `profileBundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless", "dsh-purge"]`
  (the bundle is selected, but its body insert is missing)
- rows present: `dsh-purge-redteam`, `dsh-purge-redteam-store`, `dsh-purge-redteam-ui`
- dump stderr: `entry "dsh-purge" not found`, plus five legacy redteam rows

Therefore:

- **J1 = partial**: add/dump/remove/clean work, but the profile layer the plugin
  documents is incomplete. The probe's `J1.layer` substring check would
  otherwise be a false PASS (the string `dsh-purge` appears in the redteam rows).
- **J2 = partial**: the overlay toggled `dsh-purge-redteam`; it did not toggle
  the main `dsh-purge` row, which does not exist.
- **J4 = PASS with caveat**: boot reached `MISSING_CREDENTIAL`, but only the
  redteam UI entry was pending; the main plugin was not mounted.
- J6 `not-run`: no second version was fetched.

This is a **harness/fixture limitation**, not a confirmed plugin defect. The
plugin expects a real profile install; the probe cannot run third-party
postinstall scripts by policy. The version mismatch (entry18 1.1.85 vs clone
1.1.86) is recorded as drift.

## Aggregate counts

### Raw probe checks (all saved checks, 5 packages)

| PASS | FAIL | BLOCKED | WARN | not-run | total |
|---:|---:|---:|---:|---:|---:|
| 40 | 0 | 1 | 0 | 35 | 76 |

The single `telemetry` PASS in this row is `J1.profile` (fresh profile creation);
its `J1.install` is the BLOCKED check. It is **not** an install pass.

### Package-level verdicts (J1/J2/J4/J6 × 5 packages = 20 cells)

| Check | PASS | FAIL | BLOCKED | partial | not-run | total |
|---|---:|---:|---:|---:|---:|---:|
| J1 install/remove | 3 | 0 | 1 | 1 | 0 | 5 |
| J2 disable/enable | 3 | 0 | 0 | 1 | 1 | 5 |
| J4 keyless tree-load | 4 | 0 | 0 | 0 | 1 | 5 |
| J6 upgrade/rollback | 1 | 0 | 0 | 0 | 4 | 5 |
| **Total** | **11** | **0** | **1** | **2** | **6** | **20** |

`ci-diet` is the only package with a real J6 run. `telemetry` contributes the
one BLOCKED; `YuJunZhiXue__dsh-purge` contributes the two partials. **There is
no FAIL in this sample, and there is no invented PASS.**

## What this proves

- On dsh 0.2.2-alpha.2, four real packages (`ci-diet`, `dsh-free-search`,
  `dsh-ui-auth`, `dsh-purge`) can be added to a fresh headless profile, appear
  in `--dump-config`, be removed, and leave no layer/dependency residue.
- For three of them, the inserted row id is discoverable from the dump and a
  `--patch` overlay can disable and re-enable it.
- Four real packages load far enough, with no API key, to reach the
  `MISSING_CREDENTIAL` boundary — including a client bundle (`ui-auth`). This
  proves tree-load, not a successful task.
- One real upgrade/rollback works with two published versions
  (`dsh-ci-diet` 0.5.1 ↔ 0.5.2).
- One real host-gate rejection is recorded honestly as **BLOCKED**, with the
  exact incompatibility and no exemption.

## What this does not prove

- **J3, J5, J7 and J8 are still not covered.** No invalid-config harness, no
  permissions/disclosure review, no observability probe, and no client-shape
  probe was run. This evidence must not be used to claim `FLOW=runtime` or
  full J1–J8 coverage for any package.
- **The install path is a local directory link, not a registry tarball.**
  Every journey run used `dsh plugin add /tmp/flow-sample/<id>`. pnpm `link:`
  semantics differ from installing a packed tarball: peer resolution, lifecycle
  scripts and postinstall behavior are not exercised. This is exactly why
  `dsh-purge` is partial.
- **No third-party lifecycle scripts were run.** All dependency installs used
  `--ignore-scripts`; `dsh-purge`'s `postinstall` was not executed.
- **No credential/real-task success.** J4 only proves the tree reaches the
  credential boundary; it does not prove a first successful task.
- **Headless only.** The web/client runtime, `webServer` services and the
  Windows host were not tested.
- **Not representative of all 18.** Five packages were chosen to cover
  npm/GitHub/client/gate/postinstall cases; this is not a random or complete
  sample. `dsh-ci-diet` has a client too, so the "client" coverage is not
  limited to `ui-auth`.

## J3/J5/J7/J8 status

**J3 (config validation), J5 (permissions), J7 (observability) and J8 (client
shapes) remain `not-run` in every JSON.** The probe marks them `not-run` with
the reasons `invalid-config harness not implemented`, `permissions/disclosure
review is manual`, `observability probe not implemented`, and `client-shape
probe not implemented`. This report does not upgrade them.

## Classification: plugin defect vs host gate vs fixture

| Package | Classification | Reason |
|---|---|---|
| `ci-diet` | clean | all J1/J2/J4/J6 checks PASS; no defect observed |
| `dsh-free-search` | clean | all J1/J2/J4 checks PASS; J6 not attempted |
| `dsh-ui-auth` | clean (with caveat) | install/toggle/tree-load PASS; client activation unproven (J8 not-run) |
| `dsh-telemetry-redactor` | **host gate** | peer `@deepseek-ai/dsh-session-telemetry <0.2.0` vs host 0.2.2-alpha.2; nothing installed |
| `dsh-purge` | **harness/fixture partial** | local link + skipped postinstall; main profile insert absent; not confirmed as a plugin defect |
| `journey-runtime.mjs` | no edit | no confirmed bug; two harness limitations observed |

### Harness limitations observed (not edited)

1. `journey-runtime.mjs` automatically calls `allow-version --accept-risk` when
   `plugin add` prints `installation rejected`. That would have converted the
   telemetry gate rejection into an exemption and a retry. The driver therefore
   performs its own preflight for that sample and **never runs the probe** on a
   known-rejected package. If the probe is to be used for gate evidence, this
   behavior needs an explicit opt-out flag; it was not changed here.
2. `J1.layer` is a substring check (`dump.includes(manifest.name)`), so it
   reports PASS for `dsh-purge` even though the main row is absent. The driver
   adds a separate dump probe for that sample; the probe itself was not changed.
3. `rowIdFromDump` also accepts **any** row whose `name` starts with `./` (or
   merely contains the package name), so a different local row could be
   selected first. No mismatch was observed in this sample, but it is a
   heuristic, not an identity check.

No real bug in `journey-runtime.mjs` justified changing semantics, so the file
is untouched.

## Exact commands (rerun)

Run the whole sample set (downloads, dependency installs, journey probes, the
gate preflight and the purge layer probe):

```bash
cd <standards>
node 40-checker/scripts/flow-sample-ci.mjs
```

Useful flags: `--only ci-diet,ui-auth`, `--refresh` (delete/re-fetch the
`/tmp/flow-sample/<id>` copies only), `--dsh <bin>`, `--out <dir>`,
`--timeout <ms>`.

Per-package raw probe command (the saved JSON wraps this output):

```bash
node 40-checker/scripts/journey-runtime.mjs \
  --package /tmp/flow-sample/ci-diet \
  --previous /tmp/flow-sample/ci-diet-v0.5.1 \
  --dsh /tmp/dsh022/node_modules/@deepseek-ai/dsh/lib/bin.js --json
```

Other packages use the same command without `--previous`:
`/tmp/flow-sample/DDDMUC__dsh-free-search`, `/tmp/flow-sample/ui-auth`,
`/tmp/flow-sample/YuJunZhiXue__dsh-purge`.

Gate preflight for `telemetry` (no `allow-version`; replace the home with a new
`mktemp -d`):

```bash
DSH_HOME=/tmp/dsh-flow-gate-manual \
  /tmp/dsh022/node_modules/@deepseek-ai/dsh/lib/bin.js \
  --profile flow-gate --from-default-profile headless --dump-config
DSH_HOME=/tmp/dsh-flow-gate-manual \
  /tmp/dsh022/node_modules/@deepseek-ai/dsh/lib/bin.js \
  plugin --profile flow-gate add /tmp/flow-sample/telemetry
# exit=1, "installation rejected"; do NOT run the printed allow-version hint
```

Download/install commands used by the driver:

```bash
# npm samples
npm pack dsh-ci-diet@0.5.2 --pack-destination /tmp/flow-sample/_cache
tar -xzf /tmp/flow-sample/_cache/dsh-ci-diet-0.5.2.tgz \
  -C /tmp/flow-sample/ci-diet --strip-components=1
npm install --omit=dev --ignore-scripts --legacy-peer-deps --no-package-lock
# GitHub samples
git clone --depth 1 https://github.com/DDDMUC/dsh-free-search.git \
  /tmp/flow-sample/DDDMUC__dsh-free-search
git clone --depth 1 https://github.com/YuJunZhiXue/dsh-purge.git \
  /tmp/flow-sample/YuJunZhiXue__dsh-purge
```

Read the envelope:

```bash
node -e "const r=require('./40-checker/results/flow/real/ci-diet.json');
  console.log(r.verdicts, r.summary, r.journey.result.checks)"
```

## Files

- [`40-checker/scripts/flow-sample-ci.mjs`](../../../scripts/flow-sample-ci.mjs) — driver; writes the envelopes and `index.json`.
- [`ci-diet.json`](./ci-diet.json)
- [`DDDMUC__dsh-free-search.json`](./DDDMUC__dsh-free-search.json)
- [`ui-auth.json`](./ui-auth.json)
- [`telemetry.json`](./telemetry.json)
- [`YuJunZhiXue__dsh-purge.json`](./YuJunZhiXue__dsh-purge.json)
- [`index.json`](./index.json)

No commit or push was made. `journey-runtime.mjs` is unmodified.


## Second-wave summary (2026-11-02)

| id | J1 | J2 | J4 | J6 | Note |
|---|---|---|---|---|---|
| `daily-log` | PASS | PASS | PASS | not-run | — |
| `project-memory` | PASS | PASS | PASS | not-run | — |
| `qiushi` | PASS | PASS | PASS | not-run | — |
| `status-rotator` | PASS | PASS | PASS | not-run | — |
| `verification` | FAIL | not-run | FAIL | not-run | install failure; no PASS invented |

Aggregate over all 10 packages: **78 PASS / 4 FAIL / 2 BLOCKED / 66 not-run** checks (see `index.json`). The single second-wave failure (`verification`) is recorded as `FAIL`; the other four second-wave packages pass J1/J2/J4.

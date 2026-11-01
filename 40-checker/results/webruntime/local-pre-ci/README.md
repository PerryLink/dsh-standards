# Local pre-CI evidence (not a CI result)

These JSON files were produced by `40-checker/scripts/web-probe.mjs` against a
real Chromium on WSL Ubuntu 24.04 on 2026-10-31. They are **pre-CI evidence
only**; the consolidated 18-row matrix result must come from
`.github/workflows/web-runtime.yml`.

## Environment

- Node `v24.22.1`; DSH `0.2.2-alpha.2` from
  `/tmp/dsh022/node_modules/@deepseek-ai/dsh/lib/bin.js`.
- Playwright `1.49.1`; Chromium `131.0.6778.33`
  (`<home>/.cache/ms-playwright/chromium-1148/chrome-linux/chrome`).
- The WSL image lacked `libnss3`/`libnspr4`/`libasound2`; the `.deb` payloads
  were extracted to `/tmp/chromedeps/root` and used through `LD_LIBRARY_PATH`.
  This is a local workaround only. CI uses
  `npx playwright install --with-deps chromium`, which provisions them.
- Every profile used an isolated `DSH_HOME`; no host `~/.dsh` state was touched.

## Rows

| file | row | install source | result |
|---|---|---|---|
| `ui-auth.probe.json` | `dsh-ui-auth@0.7.1` (webapp, login) | npm | **ok**, 72 boot entries, loaded 1/1, 0 errors |
| `dsh-free-search.probe.json` | `dsh-free-search@0.9.26` | npm | **ok**, 72 boot entries, loaded 1/1, 0 errors |
| `dsh-redteam-model.probe.json` | `@dsh-external/dsh-redteam-model@1.1.2` (webapp) | local checkout at `ce24bb25…` | **ok**, 72 boot entries, loaded 1/1, 0 errors |
| `dsh-pocket.probe.json` | `dsh-pocket@2.12.0` (webapp) | npm | **ok**, 72 boot entries, loaded 1/1, 0 errors |
| `qiushi-shell-only.probe.json` | `qiushi-dsh-evidence-audit@0.1.0` | npm | **ok**, 71 boot entries, shell-only (no `./client`) |
| `ui-auth-no-login.fail.json` | `dsh-ui-auth@0.7.1` without login | npm | **fail**, token URL lands on `/auth/login`, no `__DSH_BOOT__` |

The local chromium run used `--executable` because the managed headless shell
was not downloaded. CI does not pass `--executable`.

## Exact local command shape

```sh
export DSH_HOME=/tmp/dshhome-uifresh
node /tmp/dsh022/node_modules/@deepseek-ai/dsh/lib/bin.js \
  --profile wr5 --from-default-profile web --dump-config
node /tmp/dsh022/node_modules/@deepseek-ai/dsh/lib/bin.js \
  plugin --profile wr5 add --ignore-scripts dsh-ui-auth@0.7.1
cd /tmp/ui-cwd2   # dsh-ui-auth writes dsh-ui-auth-bootstrap.txt here
node /tmp/dsh022/node_modules/@deepseek-ai/dsh/lib/bin.js \
  --profile wr5 --no-open --port 18770 > /tmp/ui-cwd2/web.log 2>&1 &
# wait for the log line "dsh web: http://127.0.0.1:18770/?token=..."
U=$(sed -n 's/^dsh web: \(http[^ ]*\)$/\1/p' /tmp/ui-cwd2/web.log | head -1)
cd <standards>
LD_LIBRARY_PATH=/tmp/chromedeps/root/usr/lib/x86_64-linux-gnu \
  node 40-checker/scripts/web-probe.mjs \
    --url "$U" --expect dsh-ui-auth \
    --out /tmp/probe-ui3.json --screenshot /tmp/probe-ui3.png \
    --login-file /tmp/ui-cwd2/dsh-ui-auth-bootstrap.txt \
    --executable <home>/.cache/ms-playwright/chromium-1148/chrome-linux/chrome
```

`client-exports.json` is a manifest inspection of all 18 identities: 15 declare
`exports["./client"]`; `qiushi-dsh-evidence-audit`, `dsh-telemetry-redactor`, and
`dsh-verification-receipt` do not.

## Caveats

- The `github:` install spec for `SeaOf0/dsh-redteam-model` timed out from this
  WSL network (not a package error). The probe above used the local checkout at
  the same pinned commit `ce24bb25e35df8c8514e00e0d98f1a36d2e2a562`, whose
  `package.json` is version `1.1.2`.
- These rows do **not** prove the CI matrix passed; they prove the probe and
  the login/boot-page logic against real pages before CI.

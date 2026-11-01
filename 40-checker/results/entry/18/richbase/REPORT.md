# ENTRY 18 — rich (web-layer) experiment

> **Status: BLOCKED (host profile), not a plugin FAIL.** This was a time-boxed
> experiment; it did not promote any row and did not produce a clean 18/18.
>
> **Follow-up:** the real web profile runner in `../realweb/REPORT.md` did
> activate all 8 former partials (8/8 `verified`; combined 16 clean + 2
> `verified-gate-reject`). The `bundle-smoke --web` result below remains the
> historical blocked experiment; it is not superseded as a hash-chained record.

## What ran

```bash
node 40-checker/scripts/entry18-ci.mjs \
  --only SeaOf0__dsh-redteam-model \
  --web \
  --dsh-root /tmp/dsh022/node_modules/@deepseek-ai/dsh \
  --expected-dsh-version 0.2.2-alpha.2 \
  --out 40-checker/results/entry/18/richbase
```

Method: `dsh-base/cordis.patch.yml` plus
`@deepseek-ai/dsh-web-app/cordis.patch.yml` in `bundle-smoke`, one shard, then
stop. The shard was chosen because the base-only run had it at `partial` with
missing `agentPresets`/`connection`.

## Result

The web layer still requires a real web launcher that `bundle-smoke` does not
provide. `bundle-smoke` exited `3` with:

```text
startup failed: 3 required plugins did not activate

webserver (required)    webStartup
web-runtime (required)  webServer, webStartup
connection (required)   webStartup
```

13 plugins were waiting for `connection`, `webServer`, `webStartup`,
`cmdlineArgs`, `webApp`, `fileUploads`, or `sessionController`. The raw row is
`status: error` with `error.stage: smoke` (the runner’s error bucket); the
experiment status is `blocked` because the missing pieces are host-profile
services, not the package’s own rows.

## What is not claimed

- Not `18/18 clean`; the base result remains **10 verified / 8 partial**.
- No row was promoted to `verified` by this experiment.
- `bundle-smoke` is not a real web launcher. A proper rich-profile runner would
  need the real `webStartup`/`cmdlineArgs`/`webApp` path (the `web-runtime`
  workflow uses the real web app and a browser probe, but it records
  `client-module-loaded`, not full G0–G3 rows).
- The time box stopped after the first shard; this does not prove that every
  remaining `partial` would fail the same way. It does show the web patch alone
  is not enough.

## Evidence

- `SeaOf0__dsh-redteam-model.json` — raw row (`dsh-entry18-web/1`).
- `SeaOf0__dsh-redteam-model.log` — clone/install/smoke log with the full
  missing-service list.
- Host clock at run time: `2026-11-01T10:30Z`; repo docs use `2026-11-02` as the
  logical date.

## Next step (not done)

If this is worth pursuing, add a runner that boots the real web profile and
reads the composed rows, instead of `bundle-smoke --web`. That is a separate
project; do not mark `18/18 clean` until every row is actually `verified`.

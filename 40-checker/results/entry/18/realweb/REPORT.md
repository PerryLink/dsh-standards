# ENTRY 18 — real web profile (follow-up to richbase)

> **Result: 8/8 former `partial` rows are `verified` in the real DSH web profile.**
> Combined with the base result: **18/18 `verified`, 16 clean + 2 `verified-gate-reject`**.
> **18/18 clean is still not claimed** (`telemetry` and `verification` remain gate-reject).

## What ran

```bash
node 40-checker/scripts/entry18-web.mjs \
  --id <id> --spec <spec> --pkg <name> --version <version> \
  --dsh-root /tmp/dsh022/node_modules/@deepseek-ai/dsh \
  --out 40-checker/results/entry/18/realweb
```

`entry18-web.mjs` boots the **real web profile** through
`@deepseek-ai/dsh/lib/profile-boot.js` `runProfile`, then reads
`ctx.loader.entries()`. This provides the launcher services (`webStartup`,
`cmdlineArgs`, `webApp`, `fileUploads`, `connection`) that `bundle-smoke --web`
does not; the earlier `bundle-smoke` attempt is recorded as `blocked` in
`../richbase/REPORT.md`.

The sample is linked into the profile's `node_modules` and added to
`dsh.profile.bundles` manually. This avoids a pnpm/GitHub install dependency in
the experiment; it is recorded as `install: manual-profile-symlink`. The boot
itself is the real web app, not a mock.

## Result

| id | base G3 | real-web G3 | G2 | verdict |
|---|---|---|---|---|
| `SeaOf0__dsh-redteam-model` | 0/11 | 11/11 | admit (base) | verified |
| `YuJunZhiXue__dsh-purge` | 2/3 | 3/3 | admit (base) | verified |
| `howmp__dsh-pentest` | 2/3 | 3/3 | admit (base) | verified |
| `kingcharleslzy-ai__dsh-purge` | 4/5 | 5/5 | admit (base) | verified |
| `mmparko__dsh-purge` | 3/4 | 4/4 | admit (base) | verified |
| `shaobeichen__dsh-pocket` | 0/1 | 1/1 | admit (base) | verified |
| `ui-auth` | 0/1 | 1/1 | admit (base) | verified |
| `ysr666__dsh-vision-router` | 1/2 | 2/2 | admit (realweb) | verified |

`summary.json` is the machine record; it includes each row's SHA-256, the base
row used for G2, and `targetSetMatches: true` for all 8 (the real-web target
count equals the base `g3Rows`).

## G2 note

The first version of `entry18-web.mjs` evaluated `evaluatePluginCompatibility`
before importing the host module, so 7 rows recorded `compatibility: error`
(`Cannot access 'evaluatePluginCompatibility' before initialization`). The
summary takes G2 from the base `fullbase` row for those 7
(`compatibilitySource: "fullbase"`); the base rows all say `admit`. The script
was fixed and `ysr666__dsh-vision-router` re-ran with `compatibilitySource:
"realweb"` and `admit`. The raw `compatibilityError` remains visible in the
summary for audit.

## What is not claimed

- **Not 18/18 clean.** `telemetry` and `verification` are `verified` but the
  host gate rejects them (`verified-gate-reject`). `18/18 clean` would require
  a version exemption or a compatible release; neither is claimed.
- Not a UI render/visual review. This is server-row activation and a real web
  boot; the client-module/UI evidence is separate (`web-runtime`).
- Not a security, production, or official-endorsement claim.
- The manual profile symlink is not the `dsh plugin add` path. A CI rerun should
  use `dsh plugin add` (or document the same deviation) before treating this as
  the canonical install method.

## Evidence

- `summary.json` — aggregate manifest with row hashes and base G2 references.
- `<id>.json` — raw real-web rows (`dsh-entry18-web/1`).
- `../richbase/REPORT.md` — the earlier `bundle-smoke --web` blocked result.
- Host clock: `2026-11-01`; repo logical date: `2026-11-02`.

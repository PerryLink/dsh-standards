# ENTRY checklist (G0–G5)

> Goal: a **record**, not a “pass”. If a gate is not run, write `not-run`; if the
> host/profile is missing, write `blocked`. `static` is not `runtime`.

## Before you start

```bash
cd <standards>
node 40-checker/scripts/level-audit.mjs <plugin-dir> --format json
```

Use the JSON, not a badge. The top-level `status` is one of
`recognized | static | runtime | blocked | failed | not-run | stale`.

## G0 — bundle patch parses

- [ ] `dsh.bundle.patch` exists and is valid YAML (or there is no patch).
- [ ] Every row has a stable `id`.
- [ ] Command: `node 40-checker/bin/dsh-plugin-verify.mjs <dir> --scope entry --entry-claim static`
- [ ] Expected: no parse error; G0 `PASS`.
- [ ] If it fails: fix YAML indentation/quoting first; do not add a fake row.

## G1 — base + sample compose

- [ ] The inserted row name resolves against the package (`name` or `./entry`).
- [ ] No duplicate row id.
- [ ] Expected: G1 `PASS`; else `name`/`id` mismatch is the usual cause.

## G2 — compatibility gate

- [ ] `peerDependencies` / `engines` admit the pinned `dsh` and `cordis`.
- [ ] An exact-version exemption is **not** silently granted; a gate rejection is
      `BLOCKED`, not PASS.
- [ ] Command: same as G0, with the pinned versions in `scope`.
- [ ] If it fails: widen the range or document the exact pin; do not fake the
      version.

## G3 — real boot

- [ ] Requires a host (`--host <app-boot/lib/index.js>`, `--base`, `--bare`).
- [ ] Every target row is `ACTIVE` or explicitly `disabled`.
- [ ] Expected: `runtime`; without a host, `static` (not runtime).
- [ ] If a host/profile service is missing: `blocked`, not `failed`.

## G4 — client static shape

- [ ] If `dsh.client` exists, `exports["./client"]` exists.
- [ ] There is a package-root client row, not only a nested file.
- [ ] Expected: G4 `PASS` when the client shape is declared; `not-run` when no
      client.
- [ ] `client-module-loaded` is **not** “UI rendered”.

## G5 — freshness

- [ ] The record carries `dsh`, `cordis`, `commit`/artifact mtime.
- [ ] `validity.generatedAt` and `expiresAt` are present (entry ≤90 days).
- [ ] Expected: a reader can recompute `stale` from `expiresAt`.
- [ ] A new date does not make old evidence new.

## J5 — README permissions (author aid)

- [ ] README has a `Permissions & data access` section: reads/writes/network/credentials/background.
- [ ] It matches the actual code; do not claim "no permissions" when it reads/writes.
- [ ] This is **not** an ENTRY gate; it is J5 evidence for FLOW.

## Final record

```json
{
  "level": "entry",
  "status": "static|runtime|blocked|failed|not-run",
  "scope": { "dsh": "...", "cordis": "..." },
  "method": { "tool": "dsh-plugin-verify", "version": "..." },
  "evidence": [{ "id": "G0", "result": "PASS", "artifact": "..." }],
  "validity": { "generatedAt": "YYYY-MM-DD", "expiresAt": "YYYY-MM-DD", "rule": "entry<=90d" }
}
```

Do not write `certified`, `official`, `secure`, or `recommended`.

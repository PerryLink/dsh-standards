# Migration card: old plugin → first ENTRY record

> Target: ≤3 changes. If you need more, open an issue with the diff; do not fork
> the standard.

## 1. Manifest

- [ ] `package.json` has `name`, exact `version`, `license`, `engines.dsh`.
- [ ] If you have a bundle patch, `dsh.bundle.patch` points to a file inside the
      package and is in `files`.
- [ ] If you have a client, add `dsh.client` and `exports["./client"]`.

## 2. Entry

- [ ] `exports["."]` or `main` points to a file that exports `apply` (or a
      default class).
- [ ] No `workspace:` dependency in the published package.
- [ ] No boot-critical `postinstall`.

## 3. Record

```bash
node <standards>/40-checker/scripts/level-audit.mjs . --format json --out evidence.json
```

- [ ] `status` is `recognized`/`static`, not `runtime`, unless you ran a host.
- [ ] `validity.expiresAt` is set (entry ≤90 days).
- [ ] `notClaimed` still says security/UI/production are not covered.

## Rollback

If the migration makes boot worse, revert the three files; the record is not a
contract and can be withdrawn. Do not “fix” the record by editing a PASS.

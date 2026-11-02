# dsh-plugin-template

Minimal **first-party** DSH plugin skeleton. It is a starting point, not a
claim: the `dsh` block carries no evidence and the audit starts at `recognized`
or `not-run` depending on what you run.

## Use

```bash
cp -r <standards>/examples/plugin-template my-plugin
cd my-plugin
# edit package.json: name, description, license
node <standards>/40-checker/bin/dsh-levels.mjs audit . --format json
```

Do **not** use `npx dsh-plugin-kit` or `npx dsh-levels`: those bare npm names
are not this project's packages. The first-party entry points are the files in
this repository (`40-checker/bin/dsh-levels.mjs`) and the companion packages
documented in `49-配套包改名迁移记录-2026-11-02.md`.

## What it proves

A `recognized` ENTRY result means the package is structurally identifiable. It
does not prove G0-G3 boot, FLOW, BOOST, security, or production readiness. Run a
host-backed ENTRY check before claiming runtime.

## Permissions & data access

- Reads: <files/config/services>
- Writes: <files/storage/profile>
- Network: <domains; or "none">
- Credentials/secrets: <which; or "none">
- Background/processes: <timers/children/ports; or "none">

See `adoption/developer/PERMISSIONS.md`; this section is a J5 author aid, not an ENTRY gate.

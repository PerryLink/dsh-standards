# J3 host config repro (2026-11-02)

> Host-level observation from the pilot. 非官方 · 不点名宿主 · 不公开失败插件名.

## Observation

`J3` expected an invalid config to fail with a field path. The pilot host (0.2.1-rc.5) silently ignored it and kept booting. This is a **host behavior/capability gap**, not a plugin standard change.

## Minimal repro protocol

Use a temporary host/profile; do not touch the real profile.

1. Create a temp `DSH_HOME` and profile; install one plugin with a config schema (use a local copy; no registry write).
2. Apply three invalid configs, one at a time:
   - unknown key: `unknownKey: true`
   - wrong type: a number field set to `"not-a-number"`
   - out of range: an enum value not in the schema
3. For each, run:
   - `dsh --profile <p> --dump-config`
   - `dsh --profile <p> --no-open --port 0`
4. Record exit code, stdout/stderr, whether the plugin row is disabled, and whether the field path is printed.
5. Expected: non-zero exit or explicit `FAILED` with the field path; actual: note exactly what happened.

## What to report

- Host version/Cordis version/OS; command; config; expected; actual; log excerpt.
- Send privately to the host maintainer first; do not open a public issue with a plugin name.
- Do not change the plugin to hide the host behavior.

## Not claimed

This record does not prove a host bug across versions; it is a reproducible observation. If the host team says the behavior is intentional, document the contract and move J3 to a documented host limitation.

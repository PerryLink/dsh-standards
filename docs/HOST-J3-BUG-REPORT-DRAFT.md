# Private host report draft — bundle entry config validation

> **Do not post publicly.** Send privately to the host maintainer. No plugin names, no host logs, no internal paths. Remove this file from any public artifact.

## Subject

Config validation for bundle-inserted entries: wrong type/enum silently accepted?

## Body

Hello — we found one reproducible case while testing a plugin bundle in an isolated profile.

- Host: `dsh 0.2.1-rc.5`, `cordis 4.0.5`, Linux x64.
- Setup: temporary `DSH_HOME`; one bundle entry with a Schemastery config schema (`maxTokens: number`, `budgetLog: 'off'|'once'|'all'`).
- Observed: `maxTokens: "not-a-number"` and `budgetLog: "loud"` are accepted by `--dump-config` and by boot; no `ValidationError`, no field path.
- The same schema parsed directly with `@deepseek-ai/schemastery` throws with `$.maxTokens` / `$.budgetLog`.
- A built-in `webserver` invalid config does fail, but our first control also had a missing host, so it reported `$.host`; we are rerunning a clean control with a valid host and only an invalid port.

Question: should bundle-inserted entries go through the same config resolution/validation as built-in entries? If yes, could the host surface a field path (or at least a warning) for wrong type/enum? If this is intentional, we will document it as a host limitation and will not ask plugins to compensate.

We are not asking for a public issue or a security label; this is a private reproduction. Happy to share the minimal profile and logs privately.

## Attachments to prepare

- `J3-CLEAN.md` with the matched control result.
- Redacted `cordis.patch.yml` and boot log.
- Host/Cordis/OS versions and exact commands.

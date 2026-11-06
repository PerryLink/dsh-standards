# FLOW

Usability surface: install, configure, first success, permissions, upgrade,
uninstall, diagnostics, client/server states.

- Normative text: [../../32-DSH-FLOW顺畅规范.md](../../32-DSH-FLOW顺畅规范.md)
- Journeys: J1–J8 (R1–R8 in the normative text).
- Runtime probe: `40-checker/scripts/journey-runtime.mjs` (J1/J2/J4/J6); J3/J5/J7/J8
  are static preflight or manual and never count as a runtime pass.
- Evidence: `dsh-flow-evidence/2` ([../flow-evidence.schema.json](../flow-evidence.schema.json)).
  Collect it with `node 40-checker/bin/dsh-flow-collect.mjs --package <dir> --out flow-evidence.json`.

## Evidence chain rules

- `level-audit.mjs --flow-evidence` accepts only `dsh-flow-evidence/2`. v1
  (`dsh-flow-journey/1`, `dsh-flow-runtime/1`) and bare `{ "J1": { "status": "pass" } }`
  rows are reported `deprecated` and never count as a pass.
- A journey counts as pass only when it has at least one `checks[]` element,
  every check has `exitCode === 0`, every assertion holds, and at least one
  check is an observed (non-`static`) command. `warn`, `blocked`, `na`,
  `static` and `not-run` never count toward 8/8.
- `static` preflight is not runtime: a static PASS is a preflight result only.
- The collector copies the package to a temp dir, runs against the copy, and
  records `subject.treeSha256` before/after; a changed tree fails the run.
- Child environments are built from an allowlist; tokens/keys/secrets never
  reach the inspected plugin.
- `claims.claimLevel` is `self-attested` for a local collector run,
  `ci-attested` with `--ci`. Neither is `verified`, a certification, or a
  security audit; only a sandbox run may be described as runtime-attested.

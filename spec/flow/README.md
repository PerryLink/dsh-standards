# FLOW

Usability surface: install, configure, first success, permissions, upgrade,
uninstall, diagnostics, client/server states.

- Normative text: [../../32-DSH-FLOW顺畅规范.md](../../32-DSH-FLOW顺畅规范.md)
- Journeys: J1–J8 (R1–R8 in the normative text).
- Runtime probe: `40-checker/scripts/journey-runtime.mjs` (J1/J2/J4/J6); J3/J5/J7/J8
  are static preflight or manual and never count as a runtime pass.
- Evidence: `dsh-flow-evidence/2` ([../flow-evidence.schema.json](../flow-evidence.schema.json)).
  Collect it with `node 40-checker/bin/dsh-flow-collect.mjs --package <dir> --out flow-evidence.json`.
  Use `--sandbox` (or `dsh-levels flow sandbox`) to run the runtime probe under
  `unshare` (network), `prlimit` (nproc/as) and a process-group timeout that
  kills the whole tree with an allowlisted, token-free environment.

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
  records `subject.treeSha256` before/after. A changed tree
  (`treeStable: false` or a differing `treeSha256After`) is structurally
  invalid, not just a warning.
- Child environments are built from an allowlist; tokens/keys/secrets never
  reach the inspected plugin. The sandbox mode additionally asserts that
  `GH_TOKEN`, `NPM_TOKEN` and `GITHUB_TOKEN` are absent and aborts if one
  survives.
- `claims.claimLevel` is `self-attested` for a local collector run,
  `ci-attested` with `--ci`, and `sandbox-attested` only for `--sandbox` when
  every isolation item is effective. None of them is a certification or a
  security audit.
- `producer.kind` is `sandbox` only when the sandbox report has an empty
  `degraded` list. Any missing item (`unshare-missing`, `prlimit-missing`,
  `env-token-present`, `home-not-isolated`) switches it to `sandbox-degraded`;
  that document remains structurally valid but is never FLOW runtime.
- `level-audit.mjs` reports FLOW `runtime` only when `claims.claimLevel` is
  `sandbox-attested` or `producer.kind` is `sandbox`. A `self-attested`/
  `ci-attested`/`sandbox-degraded` document keeps its `passed` count but is
  reported `not-run` (or its honest fail/blocked state), with the degraded
  reasons in the audit reason.

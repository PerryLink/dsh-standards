# FLOW runtime evidence

`journey-runtime.mjs` now runs on a real headless profile:

| Check | Fixture `bundle` + `bundle-v0` | Meaning |
|---|---|---|
| J1.profile/install/dump/layer/remove/clean | PASS | install → dump → remove, no residue |
| J2.disable/enable | PASS | row id found from `--dump-config`; overlay disables and re-enables |
| J4.tree-load | PASS | keyless boot reaches `MISSING_CREDENTIAL`, so the tree loaded |
| J6.upgrade/upgrade-current/rollback | PASS | 0.9.0 → 1.0.0 → 0.9.0, installed version read from the profile |
| J3.config | not-run | invalid-config harness not implemented |
| J5.permissions | not-run | manual review |
| J7.observe | not-run | no observability probe |
| J8.client | not-run | no client-shape probe |

Raw JSON: `journey-fixture-j1-j2-j4-j6.json` (12 PASS, 0 FAIL, 4 not-run).
The fixture is synthetic; this is a harness proof, not a claim about the 18
packages. Do not write `FLOW=runtime` for a real plugin until its own J1–J8
evidence exists.

# Release checklist

1. `node --test 40-checker/test` — 0 fail.
2. `governance-check`, `attestation-check`, `claim-check`, `clause-map`,
   `evidence-chain verify`, `stale-check` — 0 error.
3. Regenerate `dashboard.json` and the attestation index; do not hand-edit a PASS.
4. Update `CHANGELOG.md` and the version in `spec/levels.json`/`scheme.json`.
5. Tag `vX.Y.Z`; push; wait for `governance` CI.
6. Publish npm/PyPI only after the tag; verify with a registry read.
7. Record the result in `governance/decision-log.md`.

## Rollback

- Revert the tag/commit; keep the evidence.
- Mark affected attestations `stale` or `withdrawn`; never delete them.
- If a publish is bad, deprecate the version; do not reuse the version number.

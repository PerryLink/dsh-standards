# P0 adversarial self-review — 2026-11-02

**Status: fresh-context adversarial review, not an independent reviewer.** The same owner built these artifacts, so this review does **not** upgrade any claim to `verified`, does not create an independent attestation, and cannot be cited as third-party review. It is a deliberate attempt to find the defects before a partner does.

## Scope

- `level-audit` evidence-card gate.
- ENTRY C1-C8 checklist, `entry-validate`, fixtures, and `entry-scan`.
- Label schema, `label-sync` / `label-drift` / `label-verify`, sample index, render contract.

## Findings

1. **C3 is not-run on all ten real plugins.** No host install line was tested. The result is `incomplete`, not `pass`; that is correct. A pass would require a real host installation, not a README claim.
2. **One real failure:** `omdsh-dev/dsh-llm-fallbacks` has no `license` field (C6). That is a real market-readiness gap, not a checker bug.
3. **C4 is absent on most real plugins.** It is now a warning, not a failure. That is deliberate: many markets do not require `engines.dsh`; the checklist must not invent a gate.
4. **C5/C6 build-output warnings are correct.** Top plugins declare `lib/*` entries but do not commit the build output. A static audit cannot prove the build; the warning says exactly that.
5. **C6 repository is optional.** `dsh-web` has no `repository` field; C1 supplies the repo URL. The warning is informational, not a hard fail.
6. **BOOST cards now require `issuer` and `selfAssessed`.** Status-only rows are downgraded to `not-measured`; expired cards are `stale`. This closes the status-counting false positive. It does not prove the card is truthful; a self-assessed card remains self-assessed.
7. **Label records are structurally sound.** The sample index validates, the canonical hash is stable, `label-drift` catches stale at a future date, and `label-verify` returns 404 for an unknown hash. There is no grade or ranking field.
8. **The scan is static.** `entry-scan` reads `package.json` and uses the GitHub tree API for file existence; it does not execute plugin code, run the installer, or inspect runtime behavior. The report is not external adoption.

## Ten-plugin scan result

- 10 public plugins scanned.
- 0 pass, 0 pass-with-warnings, 9 incomplete, 1 fail.
- All 10: C3 `not-run`.
- 1 fail: `omdsh-dev/dsh-llm-fallbacks` (C6 missing license).
- Warnings: C4 (no declared range), C5 (declared but uncommitted client output), C6 (missing repository or build output).

Report: `adoption/entry/real-scan-2026-11-02.json`.

## Verdict

The toolchain is **pilot-ready for static checks**, not standard-ready:

- It can tell an author “these declarations are missing/broken” today.
- It cannot say “this plugin passes ENTRY” without a host install (C3) and a human sample (C6 code reality).
- It cannot say “verified”; there is no independent reviewer.
- It must not be presented as a market acceptance, certification, security audit, or consensus.

## Next fixes

1. Add a real host install test for C3; until then keep `not-run`.
2. Keep C6 license as a hard failure; do not add more checks until C3 is testable.
3. Add `suiteVersion`/`signature` only when there is a verifier who can use them; do not add fields that imply verification.
4. Use the scan as a conversation artifact with dsh-desktop (Fabric RFC 0004) and dsh-market (detail sidecar); ask for 15-minute review and a 2-week 10-entry pilot, not adoption.
5. Keep all labels `claimLevel=reference` and all attestations self-assessed until a real independent reviewer exists.

## Non-claims

非官方 · 非认证 · 非安全审计 · 非背书 · 无担保。No ranking. No external adoption. No independent reviewer.

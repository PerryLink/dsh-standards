# P0 execution — 2026-11-02

This is an execution note, not a claim. It records what was built and what was not.

## Built

- `40-checker/scripts/level-audit.mjs`: a BOOST row is `measured` only with a valid evidence card (subject/host/method/scope/command/result/negativeControl/generatedAt/expiresAt/recordHash/claimLevel); a status-only row is downgraded to `not-measured`; expired cards are `stale`.
- `adoption/entry/checklist.json` + `40-checker/scripts/entry-validate.mjs`: C1-C8 static entry checks. C1/C3/C7 are `not-run` without `--meta`; C5 is `not-applicable` without a client; C6 checks the entry file and metadata only; C8 rejects grade/rank/endorsement fields.
- `adoption/entry/fixtures/`: twelve fixtures (one pass, one incomplete, one build-output pass-with-warnings, one ordered patch-list pass, seven failures, one peer-range pass) and `40-checker/test/entry-validate.test.mjs`.
- `adoption/market/label.schema.json`: required `claimLevel`, `issuer`, `recordHash`, `subject.version`, `subject.commit`; added `revokedAt`/`supersedes`.
- `40-checker/src/label.mjs` + `label-sync.mjs` / `label-drift.mjs` / `label-verify.mjs`: canonical recordHash, stale/withdrawn effective status, no grade/ranking, static index.
- `adoption/market/RENDER.md`, `sample-source.json`, `sample-index.json`.
- `40-checker/test/label.test.mjs`.

## Verified

- `cd 40-checker && npm test`: 98/98 pass.
- `governance-check`, `attestation-check`, `claim-check`, `stale-check`, `evidence-chain verify`, `doc-commands-check`, `dependabot-check`: 0 errors.
- `label-sync` / `label-drift` / `label-verify`: pass on the sample, stale at 2028-01-01, unknown hash is a 404.

## Not done

- Ten **real third-party** entries were scanned read-only. C2 also accepts an ordered `dsh.bundle.patch` list (the reference template contract). Result: 0 pass, 0 pass-with-warnings, 9 incomplete (C3 not-run), 1 fail (`omdsh-dev/dsh-llm-fallbacks` has no license). The first five exposed C4/C5/C6 false positives; fixed: C4 absent is a warning; C5/C6 build output is a warning; C6 repository is optional. A scan is not external adoption and C3 still needs a real host install.
- Partner 1:1, host smoke, BOOST B1-B6, council, legal pack, official/group outreach.
- No independent reviewer; no `verified` claim. The `reviews/2026-11-02-p0-self-review.md` is an adversarial self-review, not independent.

## Next

0a. C3 is flow-only after the 2026-11-02 pilot; see `adoption/entry/C3-DECISION-2026-11-02.md`. C6 license is A7 advisory; see `adoption/entry/C6-DECISION-2026-11-02.md`. J3/J5/BOOST protocols: `docs/HOST-J3-CONFIG-REPRO-2026-11-02.md`, `adoption/developer/PERMISSIONS.md`, `docs/BOOST-FIXTURES-2026-11-02.md`.
0b. The 30-project corpus baseline is in `/mnt/d/Projects/dsh/deepseek-community-hub/00-live/study-2026-11-02/corpus-baseline.jsonl`; it has no PerryLink plugins and uses 15/10/5.
0. Read `docs/full-test-plan-2026-11-02.md` for the 8–12 week pilot protocol (freeze, pre-register, C3, market difference table, communication).
1. Run `entry-validate` on ten real public plugins; record false positives/negatives. The first five already exposed three false positives; fix before adding checks.
2. One 1:1 with dsh-desktop (Fabric RFC 0004) and one with dsh-market (detail sidecar); no standard/co-management ask.
3. Fix the first false positive before adding more checks.

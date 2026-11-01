# RFC: three levels as a frontier experiment

> Status: draft for comment. This is not a request for endorsement, adoption, or
> a meeting. A “no” is a valid outcome.

## Problem

DSH plugins have no shared, reproducible definition of “loads”, “works for a
user”, or “uses Cordis well”. Authors guess; markets show stars; officials have no
field data.

## Proposal

Three **adoption depths**, not grades:

- ENTRY: can be recognized, installed, booted (G0–G5).
- FLOW: can be installed, configured, used, recovered, upgraded, removed (J1–J8).
- BOOST: uses Cordis efficiently (LEV-1–8), guidance only.

A–D quality grade is a separate axis and never converts.

## Alternatives

1. One checklist only → loses the difference between “loads” and “usable”.
2. Market gate only → the standard becomes a ranking; rejected.
3. Formal standard body → no entity, no consensus; rejected for now.

## Acceptance

- A third party can run one command and get the same record (allow runId/time diff).
- A record names its scope, method, evidence, and expiry.
- A skipped check is `not-run`, never PASS.
- The experiment can be stopped without breaking any plugin.

## Risks

- Being read as an official standard. Mitigation: `NO-ENDORSEMENT.md`, disclaimers.
- Being read as a security audit. Mitigation: `docs/scope-security.md`.
- Gaming BOOST numbers. Mitigation: label synthetic; no “faster” claim.
- One maintainer. Mitigation: forkable, 90-day review, AI-runnable checks.

## What we ask (optional)

1. Run `adoption/official/repro.sh` once; send the diff, including failure.
2. Point to a host-level blocker with a minimal reproduction.
3. Cite a record without calling it “approved”.

## Rollback

Delete the labels, keep the evidence; mark every attestation `stale`; no plugin
is uninstalled or blocked by this experiment.

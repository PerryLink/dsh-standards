# Maintainers

## Current

- **PerryLink** — sole maintainer, 2026-10-31.

There is **no** 7-seat council, no legal entity, no bank account, and no signed
governance. Do not describe this project as an official standard or as having a
committee.

## Bus factor

Bus factor = **1**. This is a known risk. See `CONTINUITY.md` for decision
rights, release steps, succession, and the access-granting checklist.

Mitigations:

- Everything is forkable; no CLA.
- Every claim/evidence is bound to a commit and expires.
- 90-day review; stale evidence is marked `stale`.
- `.github/CODEOWNERS` names the current owner; `.github/workflows/drift.yml`
  runs the checker tests weekly without a human trigger.
- We are actively looking for 1–2 co-maintainers from adopters. The publishable
  ask is `40-checker/results/governance/co-maintainer-packet.md`.

## Becoming a co-maintainer

Open an issue with:

- your GitHub handle;
- 1–3 concrete contributions (checker, spec text, sample, benchmark, docs);
- which area you want to own;
- disclosure of conflicts.

No fee, no ranking, no certification.

## Review rule

Until there are ≥2 maintainers, spec changes are marked `provisional` and
expire after 90 days. A single maintainer cannot claim consensus.

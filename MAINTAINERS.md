# Maintainers and roles

## Current (Stage 0: solo + AI staff)

| Role | Who | Status |
|---|---|---|
| Organizer (创建者/组织者) | **PerryLink** | active |
| Maintainer (管理者) | none | — |
| Reviewer (评审员) | PerryLink | provisional, expires 2027-02-01 |
| AI staff | not configured as GitHub bots yet | roles defined in `governance/ai-agents.md` |
| Contributor | PerryLink | trusted (DCO signed) |

There is **no** 7-seat council, no legal entity, no bank account, no
accreditation, and no independent third party. Do not describe this project as
an official standard, a certification body, or a committee.

## Role ladder

The machine-readable version is `governance/roles.json`. The short version:

```text
user → contributor (DCO + terms) → reviewer (invited, scoped, 6 months)
     → maintainer (appointed, 6 months, merge/release in an area)
     → organizer (creator; final signature, certificate issue, external voice)
```

- **Contributor**: `signed` after DCO + terms; `verified` after one merged
  contribution; `trusted` after three merged contributions and two shadow
  reviews. This is a record, not a certificate.
- **Reviewer**: invited after 3 merged contributions or a documented shadow
  review; scope and expiry in `governance/reviewers.json`; must disclose COI.
- **Maintainer**: appointed by the organizer after a supervised release;
  cannot issue certificates or change level semantics alone.
- **Organizer**: the creator. Final `A` on name/scope, certificate issue/revoke,
  mark policy, legal statements, and role appointment.

## Decision rule while solo

Until there are ≥2 human maintainers:

- spec changes are `provisional` and expire after **90 days**;
- a single person cannot claim consensus;
- Class A decisions are the organizer's, recorded in `governance/decision-log.md`;
- Class B needs a 7-day public comment window, then the organizer decides;
- AI can draft and run checks, but never issues a certificate or decides an appeal.

## Becoming a maintainer

Self-serve path:

1. Merge 3 substantive contributions (checker, spec text, sample, benchmark, docs).
2. Shadow 2 reviews and record them in `governance/reviewers.json`.
3. Disclose employer/funding/own plugins in `governance/coi.json`.
4. Open an issue with the handle, areas, and conflicts. The organizer reviews one
   contribution end-to-end and appoints you with **write** (not admin) access.

No fee, no ranking, no certification. AI cannot nominate or appoint a human.

## Bus factor

Bus factor = **1**. Known risk. Mitigations:

- Everything is forkable; no copyright-assignment CLA; no proprietary dependency.
- Every claim/evidence is bound to `(repo, commit, scanner, dsh, cordis)` and expires.
- 90-day review; stale evidence is marked `stale`, never reused as PASS.
- `.github/CODEOWNERS` names the current owner; `drift.yml` runs weekly without a human trigger.
- Succession steps and access checklist are in `CONTINUITY.md`.
- `governance/ai-agents.md` defines what AI may continue to do if the organizer is unavailable.

## Review rule

A reviewer with a conflict must recuse. The organizer cannot independently
review their own plugin; such an entry must carry `selfAssessed: true` and a COI
note. A green CI is necessary, not sufficient.

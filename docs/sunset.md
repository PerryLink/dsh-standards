# Level sunset and retirement

> A level is a **draft practice**, not a permanent standard. It can be frozen,
> superseded, or retired. Retirement is a normal outcome, not a failure.

## States

| State | Meaning | Display |
|---|---|---|
| `draft` | current, provisional | label allowed with `draft` |
| `frozen` | no new clauses; existing evidence stays valid until expiry | label + `frozen` |
| `deprecated` | superseded; new claims discouraged | label + `deprecated`; no new attestation |
| `retired` | no longer maintained | historical only; `stale` |

## Triggers

- host minor changes make a gate unjudgeable;
- a clause is proven wrong by a counterexample;
- no adopter for 12 months and no maintainer;
- a replacement level is adopted;
- the project loses its maintainer (bus factor event).

## Procedure

1. `ai-clerk` opens a sunset proposal with the clause IDs and evidence.
2. 7-day public comment (Class B); record objections.
3. Organizer decides: `frozen` / `deprecated` / `retired`.
4. Existing attestations are not deleted; they are marked `stale` or
   `superseded` at their expiry.
5. New claims stop on the decision date; a later claim must use the replacement.

## What must not happen

- silently deleting a level or its evidence;
- keeping a `retired` label in the “valid” filter;
- converting old grades/levels to a new scheme without a new record;
- claiming “consensus” for a solo decision.

## Machine support

- `spec/levels.json` carries `review` and `expiryDays`;
- `scripts/stale-check.mjs` recomputes expiry;
- `governance/decision-log.md` records the sunset decision;
- `publish/attestations/index.json` keeps the historical record.

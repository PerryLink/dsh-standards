# Reviewer training (not a certificate)

> Goal: a reviewer can tell a record from a claim. This is not an accredited
> course and does not issue a qualification.

## 10 known-answer exercises

1. `status: static` + `runtime` label → wrong; static is not runtime.
2. `client-module-loaded` → wrong to call UI rendered.
3. `grade A` + `level: entry` in one JSON → wrong; axes are orthogonal.
4. `measured` on an ENTRY record → wrong enum.
5. `expiresAt` in the past + `active` → wrong; must be expired/stale.
6. `PASS` with no command/artifact → wrong; it is `not-run`.
7. `blocked` recorded as `failed` → wrong; host gate is not plugin code.
8. author = reviewer, no COI, `selfAssessed: false` → wrong.
9. `official` in a market label → wrong; must be non-official.
10. `withdrawn` still in the “valid” filter → wrong.

## 2 shadow reviews

- Shadow a real review; write the record; the lead reviewer signs.
- Record `shadowReviews` in `governance/reviewers.json`.

## What this does not do

- It does not make you a “certified auditor”.
- It does not authorize you to issue an attestation.
- It does not replace the organizer’s appointment.

# Onboarding / offboarding checklist

> Access is granted per role, per scope, for a fixed term. No shared passwords.

## Onboarding

- [ ] Read `GOVERNANCE.md`, `44`, `governance/contribution-terms.md`.
- [ ] Sign DCO + DCT; `ai-clerk` adds `contributors.json`.
- [ ] Disclose employer/funding/own plugins in `coi.json`.
- [ ] Enable 2FA; use your own token (never a shared one).
- [ ] Role recorded in `roles.json`/`reviewers.json` with `expiresAt`.
- [ ] For maintainers: one supervised release before write access.
- [ ] For reviewers: 10 known answers + 2 shadow reviews.

## Offboarding

- [ ] Remove write access; keep the historical review/decision records.
- [ ] Set role `dormant`/`emeritus`; do not delete contributions.
- [ ] Rotate any token the person could read.
- [ ] Record the change in `decision-log.md`.
- [ ] If the organizer leaves: follow `CONTINUITY.md`; no AI inherits ownership.

## Access inventory

Keep this in a private file, never in git: GitHub, npm, PyPI, CI secrets, domain,
and recovery codes. The public repo only records **who has which role**, not the
secrets.

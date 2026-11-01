# Continuity and decision rights

This document exists because the project currently has **one maintainer**
(bus factor = 1). It describes how decisions are made, how releases happen, and
how a second maintainer is added without sharing credentials.

## Current state

| Item | State | Risk | Mitigation |
|---|---|---|---|
| Maintainer | `PerryLink`, sole | bus factor = 1 | recruit 1–2 co-maintainers; this document |
| Repository | `PerryLink/dsh-standards`, **public** (2026-11-01) | public audience can read/fork; history contains local paths (sanitized in tree, not history) | keep the non-official disclaimer; review before citing |
| GitHub auth | fine-grained/classic PAT loaded from a local credential file, never committed | token loss blocks pushes | rotate from the credential file; a co-maintainer uses **their own** token |
| npm | `dsh-standards@0.0.3`, `@perrylink/dsh-standard@0.0.2` | publishing depends on one npm account | add a second npm owner, not a shared password |
| PyPI | `dsh-standard@0.0.2`, `dsh-standards@0.0.2` | same | add a second PyPI owner |
| CI | GitHub Actions; sample60/sample20/web-smoke/entry18/web-runtime | one person reads failures | scheduled drift check + documented rerun commands |
| Spec review | provisional while <2 maintainers | a single person can claim consensus | 90-day expiry; `provisional` label in `MAINTAINERS.md` |

## Decision rights

1. **Evidence beats preference.** A clause change needs a reproducible result
   bound to `(repo, commit, scanner, dsh, cordis)`. Unsupported claims stay
   `待证` / `not-measured`.
2. **No self-certification.** A maintainer's own plugin gets the same checker
   path; no manual PASS.
3. **Provisional while solo.** Spec text is `provisional` until a second
   maintainer reviews it, and expires after 90 days unless re-confirmed.
4. **No official claims.** Nothing here is an official standard, certification,
   security audit, or endorsement by DeepSeek.
5. **Reversibility.** A disputed change can be reverted to the last
   evidence-bound commit; the evidence files are the anchor.

## Release steps

1. Run `node --test 40-checker/tests` (checker tests) and record the count.
2. Regenerate the affected evidence under `40-checker/results/`; never hand-edit
   a PASS.
3. Update the version string and the changelog/status file in one commit.
4. Tag the commit; push to `PerryLink/dsh-standards`.
5. Publish npm/PyPI only after the tag exists; verify with a direct registry
   read, not `npm view` alone.
6. Record the platform result in `PUBLISHING.md`; a 403 is a result, not a
   reason to rename silently.

## Adding a co-maintainer

There is no active recruitment issue at this time; the long-form ask is
`40-checker/results/governance/co-maintainer-packet.md`. The table above stays
accurate until a named person accepts and is added to `.github/CODEOWNERS`.

1. Candidate opens an issue with handle, 1–3 concrete contributions, area of
   ownership, and conflict disclosure.
2. Existing maintainer reviews at least one contribution end-to-end.
3. Candidate enables 2FA; maintainer adds them as a GitHub collaborator with
   **write** (not admin) access.
4. Add them to `.github/CODEOWNERS` and `MAINTAINERS.md` in the same commit.
5. Grant release rights only after one supervised release; each person uses
   their own npm/PyPI token, never a shared one.
6. After two maintainers exist, remove the `provisional` marker from spec text
   at the next review.

## If the maintainer becomes unavailable

- The repository remains forkable; no copyright-assignment CLA and no proprietary dependency (DCO + DCT v1).
- A named successor in `MAINTAINERS.md` (once recruited) can request GitHub
  ownership transfer through GitHub Support with the existing credentials.
- If no successor accepts within 90 days, mark the repository `archived` rather
  than leaving stale PASS claims online.
- Evidence files carry timestamps; stale evidence must be marked `stale`, not
  silently reused.

# Adoption kits

> Three audiences, three rejectable artifacts. One evidence record, three
> projections. Non-official; not a certification, not an accreditation, not a
> security audit.

| Directory | Audience | What they get | Success |
|---|---|---|---|
| `official/` | DeepSeek/Cordis team | a 30-minute reproducible experiment, field data, limits, open issues | they can re-run and refute without trusting us |
| `market/` | plugin directories/portals | a read-only label format, verify URL, status, disclaimer, revocation | they can render without auditing, and withdraw in one cycle |
| `developer/` | plugin authors | a 30-minute path, three checklists, error catalog, not-claims | first evidence record in ≤30 minutes |

## What is shared

- `spec/levels.json` — the three levels and their gates.
- `spec/schemas/evidence.schema.json` — one record per subject/level/run.
- `publish/level-labels.example.json` — market label example.
- `governance/mark-policy.md` — what a mark must and must not say.

## What is not shared

- The official kit does not ask for endorsement.
- The market kit does not ask the market to audit.
- The developer kit does not promise a pass.

## What exists now

- `developer/`: `QUICKSTART.md`, `CHECKLIST-entry.md`, `CHECKLIST-flow.md`,
  `CHECKLIST-boost.md`, `ERRORS.md`, `NOT-CLAIMS.md`.
- `official/`: `BRIEF.md`, `repro.sh` (smoke-tested on a fixture), `LIMITS.md`.
- `market/`: `DISCLAIMER.md`, `label.schema.json`, `REVOCATION.md`.
- `publish/verify.mjs`: look up a certificate/attestation ID, validate it, and
  print status/scope/expiry; `--online` checks evidence URLs.

## Status

These are **skeletons with fixed rules**, not a finished product. The gap list
and the 90-day plan are in `43`; the per-audience design is in `45`. Anything
without a command or a link is marked `not-run`, not “done”.

# DSH three levels — one-page brief for an official team

> **Non-official.** This is a community draft. It does not ask for endorsement,
> adoption, hosting, or a meeting. You can re-run it, refute it, or ignore it.

## What this is

Three levels of **adoption depth**, not a grade:

| Level | Question | Evidence state |
|---|---|---|
| **DSH-ENTRY** | Can an existing plugin be recognized, installed, and booted without code changes? | `static` or `runtime` (G0–G3), never “certified” |
| **DSH-FLOW** | Can a user install, configure, use, recover, upgrade, and uninstall it without surprises? | `manual` or `runtime` (J1–J8) |
| **DSH-BOOST** | Does it use Cordis efficiently (effects, inject, volatile, events, isolation)? | `measured` (LEV-1–8), synthetic/loader level unless stated |

A plugin can be ENTRY without FLOW; BOOST is **guidance**, not “advanced”.
The A–D quality grade is orthogonal; it never converts to a level.

## What we do not claim

- Not an official standard, not a GB/GB-T/GB-Z instrument, not a certification,
  not an accreditation, not a security audit, not production readiness.
- No legal entity, no insurance, no enforcement, no market access gate.
- A green check is a record of a run, not a warranty.

## The 30-minute experiment

```bash
export DSH_HOME=$(mktemp -d)
git clone <this-repo> /tmp/dsh-standard
cd /tmp/dsh-standard
git checkout <pinned-commit>

# static, no host needed
node 40-checker/scripts/level-audit.mjs <plugin-dir> --format json
```

Expected: a JSON record with `level`, `status`, `scope`, `method`, `evidence`,
`validity`. Differences in `runId`/timestamps are fine; differences in
`status` or gates are findings.

## What we want from you (optional)

1. Run it once and tell us the `diff`, including “it failed”.
2. Point to a host-level blocker with a minimal reproduction.
3. Cite a record if it is useful; do not call it “approved”.

## Limits

- The checker covers load-time consistency and declared surfaces, not runtime
  isolation, UI correctness, or security.
- 18-package base: 10 G3 verified, 8 partial (host/profile limits).
- FLOW: J1/J2/J4/J6 automated on a fixture and 5 real packages; J3/J5/J7/J8
  are `not-run`. Do not read “FLOW” as fully covered.
- BOOST: 8/8 measured, but synthetic/loader/provider-capture, not a production
  billing baseline.

Full gap list: `43`. Machine contracts: `spec/schemas/`. License: text CC BY 4.0,
code Apache-2.0. No endorsement is requested or implied.

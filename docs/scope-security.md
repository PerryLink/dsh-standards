# Scope and security boundary (per level)

> **Not a security audit.** This page exists so a reader cannot mistake a level
> record for a safety, privacy, or production claim.

## ENTRY

**What it covers:** manifest/patch parse (G0), compose/row resolution (G1), host
compatibility input (G2), real boot to ACTIVE/disabled (G3), client static shape
(G4), freshness anchor (G5).

**What it does not cover:**

- vulnerability scanning, dependency CVE status, runtime isolation;
- UI rendering or interaction;
- data handling/privacy;
- production load, cost, or provider behavior;
- “safe to install”.

**Security is not an ENTRY gate.** Security/brand findings are WARN-only in the
gate; they are escalated to FLOW/governance, not used to fail ENTRY.

## FLOW

**What it covers:** install/remove (J1), enable/disable (J2), configuration (J3),
first success (J4), permissions/disclosure (J5), upgrade/rollback/uninstall (J6),
observability (J7), client/server shapes (J8).

**What it does not cover:**

- whether a disclosed permission is ethically acceptable;
- secrets management beyond “no credential in the repo”;
- multi-user isolation;
- accessibility, i18n, visual design;
- every platform combination.

J5 is a **disclosure** check, not a security review.

## BOOST

**What it covers:** effect cleanup, inject/wait, volatile config, event modes,
seam/isolate/group, prefix stability, bounded parallelism/jobs, composition.

**What it does not cover:**

- production latency/cost (unless a real provider baseline is recorded);
- correctness of the feature;
- security of the optimization;
- “faster” as a general claim.

## All levels

- no official endorsement, no accreditation, no certification body;
- no legal warranty, no insurance, no damages;
- evidence expires; `stale` is not valid;
- a `PASS` without a command/artifact is a bug.

## How to report a security issue

Do **not** open a public issue with exploit details. Use the repository’s
private security channel (`SECURITY.md`). This project is not a CVE authority
and cannot coordinate disclosure for third-party plugins.

# Security policy

This repository is a **non-official draft standard and a checker**. It is not a
security audit, not a certification, and not a warranty for any plugin.

## What to report

- A checker rule that can be bypassed to mark an unsafe plugin as PASS.
- A false negative that would let a plugin with a known-dangerous trigger
  (`credentials:*`, `network:egress`, shell/exec, filesystem writes outside the
  workspace) pass ENTRY without a label.
- A vulnerability in the checker's own code or CI workflows.
- A leaked credential in this repository.

## How to report

Open a private security advisory on `PerryLink/dsh-standards` if advisories are
enabled; otherwise contact the maintainer listed in `MAINTAINERS.md` through the
contact method on their GitHub profile. Do not open a public issue containing a
working exploit or a credential.

There is no bug bounty. There is no response-time SLA. The current bus factor is
1; see `CONTINUITY.md`.

## Scope boundary

Plugin authors remain responsible for their own code. A DSH-ENTRY "recognized"
result means the package passed the listed static/runtime checks at the recorded
commit and version; it does not mean the plugin is secure, correct, or endorsed.

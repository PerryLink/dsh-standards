# Publish labels (example only)

This directory shows how to attach **non-official** conformance labels to a
format-1 market index. It does not claim official endorsement, certification,
or a security audit.

Label grammar (free-form strings; the host drops undefined metadata members):

- `dsh-entry:recognized` — static manifest/entry check only; no runtime claim.
- `dsh-entry:runtime` — G0–G3 target rows ACTIVE against the pinned anchor.
- `dsh-entry:unavailable` — host/profile services missing; not pass.
- `dsh-flow:draft` — only J1 install/remove has run; J2–J8 not-run.
- `dsh-boost:lev7` — LEV-7 reference benchmark only; not a general speed claim.

Do **not** put `official`, `certified`, `secure`, or `recommended` in labels.
The host validates index format, not the truth of these claims.

## Three-level labels

`level-labels.example.json` is the machine-readable companion to `34`/`35`.
A label is a **claim with a scope**, not a certification:

| Label | Meaning |
|---|---|
| `dsh-entry:recognized` / `static` | ENTRY static only; no runtime claim |
| `dsh-entry:runtime` | ENTRY G0–G3 passed at the recorded dsh/cordis versions |
| `dsh-entry:blocked` / `failed` / `not-run` | the real state; never upgrade to pass |
| `dsh-flow:manual` / `runtime` / `not-run` | J1–J8 recorded manually / automated / not run |
| `dsh-boost:measured` / `not-measured` | LEV evidence card exists / not measured |

Rules:

- Every label carries a status, scope (`dsh`, `cordis`), and an evidence link,
  or an explicit `not-run` / `not-measured`.
- Certification grades A–D are **orthogonal**; never emit `dsh-entry:*` from a
  grade.
- The host validates the index format, not the truth of a label. A market that
  displays these labels must link the evidence.

# Publish labels (example only)

This directory shows how to attach **non-official** conformance labels to a
format-1 market index. It does not claim official endorsement, certification,
or a security audit.

Label grammar (free-form strings; the host drops undefined metadata members):

- `dsh-entry:recognized` / `dsh-entry:static` — static manifest/entry check only; no runtime claim.
- `dsh-entry:runtime` — G0–G3 target rows ACTIVE against the pinned anchor.
- `dsh-entry:blocked` / `dsh-entry:failed` / `dsh-entry:not-run` — the real state; host/profile
  services missing is `blocked`, not pass.
- `dsh-flow:manual` / `dsh-flow:runtime` / `dsh-flow:not-run` — the same three states the
  `spec/levels.json` vocabulary allows for FLOW; there is no `draft` label.
- `dsh-boost:measured` / `dsh-boost:not-measured` — an LEV evidence card exists / it does not;
  there is no per-LEV label such as `lev7`.

These are the only labels in the `spec/levels.json` evidence vocabulary. Labels that are not
listed there (`draft`, `lev7`, `unavailable`, …) are not emitted.

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

Examples here use the rc.3 anchor (`dsh 0.2.2-rc.3` / vendored `cordis 4.1.0` / node
`>=24.9.0`). As of 2026-11-14 no committed result carries an rc.3 anchor, so the sample
label sets stay at `not-run` / `not-measured` rather than showing a runtime claim.

Rules:

- Every label carries a status, scope (`dsh`, `cordis`), and an evidence link,
  or an explicit `not-run` / `not-measured`.
- Certification grades A–D are **orthogonal**; never emit `dsh-entry:*` from a
  grade.
- The host validates the index format, not the truth of a label. A market that
  displays these labels must link the evidence.

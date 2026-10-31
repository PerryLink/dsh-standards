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

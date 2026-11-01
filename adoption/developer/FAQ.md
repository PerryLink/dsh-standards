# FAQ (false positives and edge cases)

**Q: The checker says WARN for C-11/C-13. Is that a failure?**
A: No. In ENTRY they are transitional WARN; they do not block loadability. Do not
edit them to PASS.

**Q: I have no host. Can I claim runtime?**
A: No. Use `static`/`recognized`; runtime needs a real boot.

**Q: `doctor` passed. Is that an attestation?**
A: No. Doctor produces a report; attestation is a separate document with a
different schema and a human signer.

**Q: My certificate says grade A but ENTRY is not-run. Is that contradictory?**
A: No. A–D is quality evidence; ENTRY/FLOW/BOOST is adoption depth. They are
orthogonal; neither converts.

**Q: The record expired. Can I just change the date?**
A: No. Re-run and issue a new record; append a new evidence-chain entry.

**Q: I am the author. Can I self-review?**
A: Only as `selfAssessed: true` / `claimLevel: self-reported`. Not `verified`.

**Q: A market shows my label after I withdrew it.**
A: Ask the market to apply `REVOCATION.md`; the project can publish the
withdrawal but cannot force a third-party page.

**Q: Why is J3/J5/J7/J8 `not-run`?**
A: The harness does not exist yet. The checklist is manual; do not fill it with
PASS.

**Q: Can I use the badge in a paid ad?**
A: No. The mark policy forbids paid ranking and endorsement implications.

**Q: Is this an official standard?**
A: No. It is a community draft; see `NO-ENDORSEMENT.md`.

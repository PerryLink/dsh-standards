# Limits: what this cannot tell you

> These are not footnotes. If a decision depends on one of these, the record is
> not enough.

1. **Not a security audit.** No vulnerability scan, no runtime isolation proof,
   no supply-chain attestation. `static`/`runtime` are load-time consistency.
2. **Not production readiness.** A green record can still fail under load, with
   a real key, a different provider, or a different OS.
3. **Not UI correctness.** `client-module-loaded` means the module loaded; it
   does not mean the panel renders or the interaction works.
4. **Not a quality grade.** A–D is a separate axis; it does not convert to
   ENTRY/FLOW/BOOST.
5. **Not a full FLOW.** J3/J5/J7/J8 are `not-run`; J1/J2/J4/J6 are partial and
   were measured on a fixture plus five real packages.
6. **BOOST is synthetic/loader-level.** LEV-1–8 have measured evidence, but not a
   production billing baseline; latency/token numbers are not a quote.
7. **Host-gate rejects are not plugin faults.** `telemetry`/`verification` were
   rejected by the host compatibility gate; that is `blocked`/`reject`, not a
   code FAIL.
8. **8/18 base packages are partial.** The other 10 are G3 verified; “18/18
   recognized” is static recognition, not 18/18 runtime.
9. **No accreditation, no certification, no legal entity.** A record is not a
   certificate, not a warranty, and not an official statement.
10. **No identity verification.** DCO/DCT are attestations; the project does not
    verify legal capacity, employment, or patent status.
11. **Evidence can expire or be withdrawn.** A `stale` or `withdrawn` record must
    not be read as valid; the clock is in the reader.
12. **One maintainer, bus factor 1.** AI can continue routine checks, but it
    cannot inherit legal responsibility or sign for a human.

## How to use a record honestly

- Quote the `status`, `scope`, `date`, and the limitation together.
- Never quote a `PASS` without its command/artifact.
- If you need a decision the record cannot support, ask for a new run; do not
  infer.

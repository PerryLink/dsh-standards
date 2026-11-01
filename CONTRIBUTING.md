# Contributing

This is a **non-official** draft. Contributions are welcome; nothing here is a
certification, a security audit, an accreditation, or an official endorsement.

## Before your first PR

1. Read `governance/contribution-terms.md` (DCT v1, `dsh-ct/1`). It is a
   **licence + attestation**, not a copyright assignment and not a contract.
2. Sign every commit:

   ```bash
   git commit -s -m "docs: fix the J3 example"
   ```

   The `Signed-off-by` line must be a human, using a reachable identity. AI
   agents must never add it.
3. In the PR body, tick:

   ```text
   - [ ] I agree to the DSH Contribution Terms v1 (dsh-ct/1)
   ```

4. If you used generative AI, add `AI-Assisted: yes` and `AI-Tool: <name>` to
   the commit or PR. You remain responsible for the result.

## What helps

- A real plugin sample with a reproducible result.
- A false positive/false negative in the checker.
- A counterexample to a clause.
- A benchmark with environment/input/command/result.
- A docs fix that makes a user journey shorter.
- A translation that keeps the normative terms identical.

## What not to do

- Do not add `official`, `certified`, `secure`, `recommended`, or ranking claims.
- Do not send credentials, session data, private plugin code, or personal data.
- Do not submit an empty package to reserve a name.
- Do not let an AI agent sign the DCO, approve its own PR, or merge spec/
  governance/checker files.

## Entity contributions

If you contribute on behalf of an employer, add `On-Behalf-Of: <org>`, or if a
single PR adds more than 300 non-doc lines, or changes a normative clause, a
one-page Entity CLA is required (`governance/entity-cla-template.md`). An
individual contributor does **not** need a corporate CLA.

## Evidence

Bind claims to `(repo, commit, scanner, dsh, cordis)`. Unsupported claims are
marked `待证` / `not-run` / `not-measured`, never PASS. A `PASS` without a
command output is a bug.

## Review

- One human reviewer is enough for docs and samples; two for spec semantics.
- Reviewers must disclose conflicts; see `governance/coi.json`.
- AI can draft, run checks, and comment; it cannot be the approving reviewer.

## License

- Text/spec/docs/translations: **CC BY 4.0** (`LICENSE-CC-BY`).
- If you modify and republish text, include a **Change Notice** per
  `MODIFICATION-POLICY.md` (source commit, sections, what changed, why, date).
- Code/scripts/schemas: **Apache-2.0** (`LICENSE-APACHE`).
- Marks/badges: separate, see `governance/mark-policy.md`.
- Contributions: DCO 1.1 + DCT v1 (`dsh-ct/1`), no copyright assignment.

# Evidence ledger

This directory is an **append-only, hash-chained index** of selected records. It
does not make them immutable; it makes a rewrite detectable.

- `chain.jsonl` — one JSON per line: `seq`, `prev`, `record`, `recordSha256`,
  `ts`, `entrySha256`.
- `SHA256SUMS` — hashes of the chain and the referenced records.
- `RERUN.md` — how to reproduce each record.

Rules:

1. Append, never edit. A correction is a new record + a new chain entry.
2. A chain entry without a record path/hash is invalid.
3. The chain is not a certificate; it only says “this file had this hash at this
   time”.
4. Retention ≥2 years; GitHub Actions artifacts (90 days) are not the archive.

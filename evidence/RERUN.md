# How to re-run the records

```bash
# attestation (draft, self-assessed)
node publish/verify.mjs --id DSH-ATT-2026-001

# flow real-package index (5 packages)
node -e "const r=require('./40-checker/results/flow/real/index.json'); console.log(r.summary || r)"

# checker + governance
cd 40-checker && node --test
node scripts/governance-check.mjs
node scripts/attestation-check.mjs
node scripts/claim-check.mjs
node scripts/evidence-chain.mjs verify
```

If a record is missing, do not recreate it from memory; rerun the command and
append a new chain entry.

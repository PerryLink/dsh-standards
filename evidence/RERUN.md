# How to re-run the records

```bash
# attestation (active, self-assessed)
node publish/verify.mjs --id DSH-ATT-2026-001

# flow real-package index (10 packages; 78 pass / 4 fail / 2 blocked / 66 not-run)
node -e "const r=require('./40-checker/results/flow/real/index.json'); console.log(r.totals)"

# ENTRY 18 base profile (re-run all 18, then append a new chain entry)
node 40-checker/scripts/entry18-ci.mjs --all --out 40-checker/results/entry/18/fullbase

# ENTRY 18 web layer (time-boxed; only if the web patch exists)
node 40-checker/scripts/entry18-ci.mjs --all --web --out 40-checker/results/entry/18/richbase

# ENTRY 18 real web profile (one row per id, then the manifest summary)
node 40-checker/scripts/entry18-web.mjs --id <id> --spec <spec> --pkg <pkg> --version <v> --dsh-root <dsh-root> --out 40-checker/results/entry/18/realweb
node 40-checker/scripts/entry18-realweb-summary.mjs 40-checker/results/entry/18/realweb

# BOOST 5-practice card + separate LEV-3/6/7 cards
node examples/boost/lev12458-bench.mjs --runs 5

# checker + governance
cd 40-checker && node --test
node scripts/governance-check.mjs
node scripts/attestation-check.mjs
node scripts/claim-check.mjs
node scripts/doc-commands-check.mjs
node scripts/dependabot-check.mjs
node scripts/evidence-chain.mjs verify
```

If a record is missing, do not recreate it from memory; rerun the command and
append a new chain entry. Never edit an existing chain entry.

# Benchmark entry

> This is a harness, not a leaderboard. A number without an environment, input,
> command, and limitation is not evidence.

## What to run

- ENTRY: `40-checker/scripts/level-audit.mjs <dir> --format json`.
- FLOW: `40-checker/scripts/journey-runtime.mjs --package <dir> --json`.
- BOOST: `examples/boost/lev7-bench.mjs` and the LEV fixtures; report the
  synthetic/loader label.

## What to submit

```json
{
  "schema": "dsh-bench/1",
  "subject": "repo@version",
  "environment": { "os": "...", "node": "...", "dsh": "...", "cordis": "..." },
  "command": "...",
  "input": "...",
  "result": { "metric": "value", "unit": "..." },
  "limitations": ["synthetic", "single machine", "..."]
}
```

## Rules

- No cross-machine comparison without the same anchor.
- No “faster” claim from a synthetic timer.
- No cherry-picked run; report the median and the count.
- A failed run is a result; do not delete it.

## Current evidence

- LEV-7: 8.24× on a synthetic bounded-parallelism fixture (not production).
- LEV-3: volatile 0/20 remount vs control 20/20.
- LEV-6: stable prefix 100% vs volatile 0%.
- ENTRY/FLOW: see `40-checker/results/`.

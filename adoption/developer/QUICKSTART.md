# 30-minute path: from template to the first evidence record

> Goal: one non-`not-run` record in ≤30 minutes (median), not a “pass”.
> If a command below is not available yet, the gap is tracked in `43` (DEV-02/06).

## 0–5 min: get a template

```bash
npx dsh-plugin-kit create my-plugin
cd my-plugin
```

If the kit is not installed, use any DSH plugin skeleton; the only required
fields are `name`, `apply(ctx, config)`, and a `dsh` manifest entry.

## 5–15 min: static ENTRY

```bash
node <standards>/40-checker/scripts/level-audit.mjs . --format json
```

Read the JSON, not the badge:

- `level: "entry"`, `status: "static"` or `"runtime"`;
- `gates.G0..G5` with `PASS/FAIL/NOT-RUN`;
- `notClaimed` tells you what this does **not** prove.

## 15–25 min: fix the first three failures

| Symptom | Likely fix |
|---|---|
| `G0` patch parse | `dsh.bundle.patch` is not valid YAML, or the row lacks `id` |
| `G1` compose/row | inserted row name does not resolve; check `id`/`name` |
| `G2` compatibility | peer range does not admit the pinned dsh/cordis; widen or pin |
| `G4` client | `dsh.client` exists but `exports["./client"]` or package-root row is missing |
| `G5` freshness | record has no `dsh`/`cordis` version or `expiresAt` |

Re-run after each fix. A skip stays `not-run`; do not edit the JSON to make it
green.

## 25–30 min: write the record

```bash
node <standards>/40-checker/scripts/level-audit.mjs . \
  --format json --out evidence.json
```

Then:

- keep `method.command` and `method.version`;
- set `validity.generatedAt` / `expiresAt` (entry ≤90 days);
- add the evidence URL or artifact path;
- commit with `Signed-off-by` and `DSH-Contribution: dsh-ct/1`.

## What to do next

- Want FLOW? Run `journey-runtime.mjs` for J1/J2/J4/J6; J3/J5/J7/J8 are still
  `not-run` (see `43`).
- Want BOOST? Read `33` and run the LEV benchmarks that apply; otherwise write
  `not-measured`, not “optimized”.
- Do not write “certified”, “official”, “secure”, or “recommended”.

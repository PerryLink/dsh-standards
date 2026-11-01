# 30-minute path: from template to the first evidence record

> Goal: one non-`not-run` record in ≤30 minutes (median), not a “pass”.
> The commands below are first-party and runnable from this repo. The 30-minute median remains `not-run` until external timings exist.

## 0–5 min: get a template

```bash
cp -r <standards>/examples/plugin-template my-plugin
cd my-plugin
# edit package.json: name, description, license
```

The template is first-party (`examples/plugin-template`). Do **not** use
`npx dsh-plugin-kit`: that bare npm name is a different project. If you already
have a skeleton, the only required fields are `name`, `apply(ctx, config)`, and
a `dsh` manifest entry.

## 5–15 min: static ENTRY

```bash
node <standards>/40-checker/bin/dsh-levels.mjs audit . --format json
```

Do not add `--level` / `--claim`: those are `dsh-plugin-verify` flags, not
`dsh-levels` flags.

Read the JSON, not the badge:

- `levels.entry.state`: `recognized` (static) or `runtime`;
- `levels.entry.checkerStatus` / `warnings`: what to fix next;
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
node <standards>/40-checker/bin/dsh-levels.mjs audit . \
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

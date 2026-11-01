#!/usr/bin/env node
/**
 * flow-index.mjs — rebuild 40-checker/results/flow/real/index.json from all
 * per-package result files. It never reruns a journey and never upgrades a
 * verdict; it only aggregates what is on disk.
 *
 * Usage: node 40-checker/scripts/flow-index.mjs [--dir <dir>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const DEFAULT_DIR = path.join(ROOT, '40-checker', 'results', 'flow', 'real')

export function buildFlowIndex(dir = DEFAULT_DIR, environment = null) {
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json') && name !== 'index.json').sort()
  const rows = []
  for (const name of files) {
    let row
    try { row = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) } catch { continue }
    if (row?.schema !== 'dsh-flow-real/1') continue
    rows.push(row)
  }
  const totals = {
    packages: rows.length,
    checks: { pass: 0, warn: 0, fail: 0, blocked: 0, partial: 0, notRun: 0 },
    verdicts: { pass: 0, fail: 0, blocked: 0, partial: 0, notRun: 0 },
    classifications: {},
  }
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.summary?.checks || {})) totals.checks[key] += value
    for (const [key, value] of Object.entries(row.summary?.verdicts || {})) totals.verdicts[key] += value
    totals.classifications[row.classification] = (totals.classifications[row.classification] || 0) + 1
  }
  return {
    schema: 'dsh-flow-real-index/1',
    generatedAt: new Date().toISOString(),
    environment,
    samples: rows.map((row) => ({
      id: row.id,
      package: row.package,
      version: row.version,
      source: row.source,
      why: row.why,
      verdicts: row.verdicts,
      classification: row.classification,
      conclusion: row.conclusion,
      checks: row.summary?.checks ?? null,
      caveats: row.caveats,
      file: path.join(dir, `${row.id}.json`),
    })),
    totals,
    coverage: { J1: 'runtime', J2: 'runtime', J3: 'not-run', J4: 'runtime (tree-load only)', J5: 'not-run', J6: 'runtime for ci-diet only', J7: 'not-run', J8: 'not-run' },
    notes: [
      'A gate rejection is recorded as BLOCKED, never as PASS; this index never calls allow-version.',
      'The purge sample is J1/J2 partial because its postinstall was deliberately not run.',
      'J3/J5/J7/J8 remain not-run: this evidence does not claim full FLOW coverage.',
      'Second-wave npm samples are real packages, not fixtures; their J4 failure is recorded, not hidden.',
    ],
  }
}

export function main(argv = process.argv.slice(2)) {
  let dir = DEFAULT_DIR
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dir') dir = path.resolve(argv[++i])
    else if (argv[i] === '--help' || argv[i] === '-h') { console.log('usage: flow-index.mjs [--dir <dir>]'); return 0 }
    else { console.error(`unknown argument: ${argv[i]}`); return 2 }
  }
  const old = fs.existsSync(path.join(dir, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) : null
  const index = buildFlowIndex(dir, old?.environment ?? null)
  fs.writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
  console.log(JSON.stringify(index.totals))
  console.log(`wrote ${path.join(dir, 'index.json')}`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}

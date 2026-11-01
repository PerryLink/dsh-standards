#!/usr/bin/env node
/**
 * Self-serve time trial: measure one machine run from "start" to "first record".
 * It does not replace a 5-author human trial; it gives a reproducible baseline
 * and a format for authors to submit their own numbers.
 *
 * Usage: node adoption/developer/time-trial.mjs --package <dir> [--out trial.json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const AUDIT = path.join(ROOT, '40-checker', 'scripts', 'level-audit.mjs')

function main() {
  let pkg = null
  let out = null
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === '--package') pkg = path.resolve(process.argv[++i])
    else if (process.argv[i] === '--out') out = path.resolve(process.argv[++i])
    else if (process.argv[i] === '--help' || process.argv[i] === '-h') { console.log('usage: time-trial.mjs --package <dir> [--out <file>]'); return 0 }
  }
  if (!pkg) { console.error('--package is required'); return 2 }
  const started = Date.now()
  const run = spawnSync(process.execPath, [AUDIT, pkg, '--format', 'json'], { encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024 })
  const minutes = Number(((Date.now() - started) / 60_000).toFixed(2))
  let record = null
  try { record = JSON.parse(run.stdout) } catch { /* keep null */ }
  const result = {
    schema: 'dsh-time-trial/1',
    generatedAt: new Date().toISOString(),
    package: path.basename(pkg),
    minutes,
    exit: run.status,
    entry: record?.levels?.entry?.state ?? 'not-run',
    flow: record?.levels?.flow?.state ?? 'not-run',
    boost: record?.levels?.boost?.state ?? 'not-run',
    note: 'machine dry run only; a 5-author human trial is still required for a median claim',
  }
  if (out) fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result, null, 2))
  return 0
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()

#!/usr/bin/env node
/** label-drift — validate a published label index, hashes, expiry, and forbidden fields. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { effectiveStatus, validateIndex } from '../src/label.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')

function usage() {
  console.log(`label-drift — check a label index for schema/hash/expiry/forbidden-word drift

Usage:
  node 40-checker/scripts/label-drift.mjs --index <index.json> [--now YYYY-MM-DD] [--json]

Exit: 0 no issues, 1 drift found, 3 input error.`)
}

function parseArgs(argv) {
  const options = { index: path.join(STD, 'publish', 'labels', 'index.json'), now: new Date().toISOString().slice(0, 10), json: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      i += 1
      return value
    }
    if (arg === '--index') options.index = path.resolve(next())
    else if (arg === '--now') options.now = next()
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.now)) throw new Error('--now must be YYYY-MM-DD')
  return options
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const index = JSON.parse(fs.readFileSync(options.index, 'utf8'))
  const validation = validateIndex(index)
  const issues = [...validation.errors]
  const now = new Date(`${options.now}T00:00:00Z`)
  let stale = 0
  let withdrawn = 0
  for (const [i, record] of (index.records ?? []).entries()) {
    const effective = effectiveStatus(record, now)
    if (effective === 'stale') { stale += 1; issues.push(`records[${i}]: stale at ${options.now}`) }
    if (effective === 'withdrawn') withdrawn += 1
  }
  const result = {
    schema: 'dsh-label-drift/1',
    checkedAt: options.now,
    index: path.relative(STD, options.index),
    total: (index.records ?? []).length,
    stale,
    withdrawn,
    issues,
    ok: issues.length === 0,
  }
  if (options.json) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`label-drift ${result.ok ? 'PASS' : 'FAIL'} — ${result.total} record(s), stale ${stale}, withdrawn ${withdrawn}`)
    for (const issue of issues) console.log(`  - ${issue}`)
  }
  process.exit(result.ok ? 0 : 1)
}

try { main() } catch (error) {
  console.error(`label-drift: ${error.message}`)
  process.exit(3)
}

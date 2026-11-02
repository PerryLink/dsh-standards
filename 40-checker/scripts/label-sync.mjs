#!/usr/bin/env node
/** label-sync — validate immutable labels, compute recordHash, emit a static index. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { labelId, normalizeLabel, validateLabel } from '../src/label.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')

function usage() {
  console.log(`label-sync — validate labels and write publish/labels/<id>.json + index.json

Usage:
  node 40-checker/scripts/label-sync.mjs --source <labels.json> [--out <dir>] [--check]

Source: an array of labels, or { "records": [ ... ] }.
--check validates and prints a summary without writing.
Exit: 0 valid, 1 invalid, 3 input error.`)
}

function parseArgs(argv) {
  const options = { source: null, out: path.join(STD, 'publish', 'labels'), check: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      i += 1
      return value
    }
    if (arg === '--source') options.source = next()
    else if (arg === '--out') options.out = path.resolve(next())
    else if (arg === '--check') options.check = true
    else if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (!options.source) throw new Error('--source is required')
  options.source = path.resolve(options.source)
  return options
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const raw = JSON.parse(fs.readFileSync(options.source, 'utf8'))
  const records = Array.isArray(raw) ? raw : Array.isArray(raw.records) ? raw.records : null
  if (!records) throw new Error('source must be an array or { records: [...] }')
  const errors = []
  const out = []
  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== 'object') { errors.push(`[${index}] not an object`); continue }
    const provided = record.recordHash
    const normalized = normalizeLabel(record)
    const validation = validateLabel(normalized)
    if (provided && provided !== normalized.recordHash) errors.push(`[${index}] recordHash does not match canonical record`)
    for (const error of validation.errors) errors.push(`[${index}] ${error}`)
    if (validation.valid) out.push(normalized)
  }
  if (errors.length > 0) {
    console.error(`label-sync: ${errors.length} error(s)`)
    for (const error of errors) console.error(`  - ${error}`)
    process.exit(1)
  }
  const index = {
    schema: 'dsh-label-index/1',
    generatedAt: new Date().toISOString().slice(0, 10),
    source: path.relative(STD, options.source),
    spec: { labels: 'dsh-market-label/1', checklist: 'dsh-entry-checklist/1' },
    records: out,
  }
  if (options.check) {
    console.log(`PASS label-sync: ${out.length} record(s); no files written (--check)`)
    return
  }
  fs.mkdirSync(options.out, { recursive: true })
  for (const record of out) {
    const file = path.join(options.out, `${labelId(record)}.json`)
    fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  }
  fs.writeFileSync(path.join(options.out, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
  console.log(`PASS label-sync: ${out.length} record(s) -> ${path.relative(STD, options.out)}`)
}

try { main() } catch (error) {
  console.error(`label-sync: ${error.message}`)
  process.exit(3)
}

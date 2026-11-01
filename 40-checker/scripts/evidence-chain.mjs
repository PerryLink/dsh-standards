#!/usr/bin/env node
/**
 * evidence-chain.mjs — append-only, hash-chained evidence index.
 *
 * It does not make evidence immutable. It makes a change detectable: each line
 * contains the previous line's hash and the record's sha256. A rewrite breaks
 * the chain.
 *
 * Usage:
 *   node 40-checker/scripts/evidence-chain.mjs append --record publish/attestations/DSH-ATT-2026-001.json
 *   node 40-checker/scripts/evidence-chain.mjs verify
 *   node ... append --chain <file> --record <file> --ts <date>
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const DEFAULT_CHAIN = path.join(ROOT, 'evidence', 'chain.jsonl')

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')
const entryHash = ({ seq, prev, record, recordSha256, ts }) => sha256(`${seq}\n${prev}\n${record}\n${recordSha256}\n${ts}\n`)

export function verifyChain(lines, { root = null } = {}) {
  const errors = []
  let prev = 'GENESIS'
  let expectedSeq = 1
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue
    let entry
    try { entry = JSON.parse(line) } catch { errors.push(`line ${index + 1}: not JSON`); continue }
    if (entry.seq !== expectedSeq) errors.push(`line ${index + 1}: seq ${entry.seq} != ${expectedSeq}`)
    if (entry.prev !== prev) errors.push(`line ${index + 1}: prev does not match the previous entry`)
    const expected = entryHash(entry)
    if (entry.entrySha256 !== expected) errors.push(`line ${index + 1}: entry hash mismatch`)
    if (entry.recordSha256 && !/^[0-9a-f]{64}$/.test(entry.recordSha256)) errors.push(`line ${index + 1}: bad record sha256`)
    if (root && entry.record) {
      const file = path.join(root, entry.record)
      if (!fs.existsSync(file)) errors.push(`line ${index + 1}: record not found: ${entry.record}`)
      else if (entry.recordSha256 !== sha256(fs.readFileSync(file))) errors.push(`line ${index + 1}: record sha256 does not match ${entry.record}`)
    }
    prev = entry.entrySha256
    expectedSeq += 1
  }
  return { errors, entries: expectedSeq - 1 }
}

export function appendRecord({ chain = DEFAULT_CHAIN, record, ts = new Date().toISOString() }) {
  const absolute = path.isAbsolute(record) ? record : path.join(ROOT, record)
  if (!fs.existsSync(absolute)) throw new Error(`record not found: ${absolute}`)
  const relative = path.relative(ROOT, absolute).split(path.sep).join('/')
  const recordSha256 = sha256(fs.readFileSync(absolute))
  const lines = fs.existsSync(chain) ? fs.readFileSync(chain, 'utf8').split('\n').filter((line) => line.trim()) : []
  const previous = lines.length > 0 ? JSON.parse(lines[lines.length - 1]) : null
  const entry = {
    seq: lines.length + 1,
    prev: previous ? previous.entrySha256 : 'GENESIS',
    record: relative,
    recordSha256,
    ts,
  }
  entry.entrySha256 = entryHash(entry)
  fs.mkdirSync(path.dirname(chain), { recursive: true })
  fs.appendFileSync(chain, `${JSON.stringify(entry)}\n`)
  return entry
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv
  let chain = DEFAULT_CHAIN
  let record = null
  let ts = new Date().toISOString()
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--chain') chain = path.resolve(rest[++i])
    else if (rest[i] === '--record') record = rest[++i]
    else if (rest[i] === '--ts') ts = rest[++i]
    else { console.error(`unknown argument: ${rest[i]}`); return 2 }
  }
  if (command === 'append') {
    if (!record) { console.error('append needs --record'); return 2 }
    const entry = appendRecord({ chain, record, ts })
    console.log(JSON.stringify(entry, null, 2))
    return 0
  }
  if (command === 'verify') {
    if (!fs.existsSync(chain)) { console.error(`chain not found: ${chain}`); return 2 }
    const result = verifyChain(fs.readFileSync(chain, 'utf8').split('\n'), { root: ROOT })
    for (const error of result.errors) console.log(`FAIL ${error}`)
    console.log(`${result.errors.length === 0 ? 'PASS' : 'FAIL'} evidence chain: ${result.entries} entries`)
    return result.errors.length === 0 ? 0 : 2
  }
  console.error('usage: evidence-chain.mjs append --record <file> | verify [--chain <file>]')
  return 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}

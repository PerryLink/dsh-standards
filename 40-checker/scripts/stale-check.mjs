#!/usr/bin/env node
/**
 * stale-check.mjs — recompute expiry in the reader's clock.
 *
 * The writer's `status: active` is not trusted. If `expiresAt` is in the past,
 * the effective status is `expired` (and the display must show `stale`).
 *
 * Usage:
 *   node 40-checker/scripts/stale-check.mjs [--index publish/attestations/index.json] [--now 2027-01-01] [--json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const DEFAULT_INDEX = path.join(ROOT, 'publish', 'attestations', 'index.json')

export function effective(entry, now = new Date()) {
  const expires = Date.parse(`${entry.expiresAt}T23:59:59Z`)
  const expired = Number.isFinite(expires) && expires < now.getTime()
  if (entry.status === 'withdrawn') return { status: 'withdrawn', stale: true, reason: 'withdrawn' }
  if (entry.status === 'expired' || expired) return { status: 'expired', stale: true, reason: expired ? 'expiresAt passed' : 'declared expired' }
  if (entry.status === 'draft') return { status: 'draft', stale: false, reason: 'draft is not valid' }
  return { status: entry.status, stale: false, reason: 'within validity' }
}

export function checkIndex(index, now = new Date()) {
  const results = []
  for (const entry of index.attestations || []) {
    results.push({ attestationId: entry.attestationId, declared: entry.status, expiresAt: entry.expiresAt, ...effective(entry, now) })
  }
  return { checkedAt: now.toISOString(), results, stale: results.filter((r) => r.stale).length }
}

export function main(argv = process.argv.slice(2)) {
  let index = DEFAULT_INDEX
  let now = new Date()
  let json = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--index') index = path.resolve(argv[++i])
    else if (argv[i] === '--now') now = new Date(`${argv[++i]}T00:00:00Z`)
    else if (argv[i] === '--json') json = true
    else if (argv[i] === '--help' || argv[i] === '-h') { console.log('usage: stale-check.mjs [--index <file>] [--now YYYY-MM-DD] [--json]'); return 0 }
    else { console.error(`unknown argument: ${argv[i]}`); return 2 }
  }
  if (!fs.existsSync(index)) { console.error(`index not found: ${index}`); return 2 }
  const result = checkIndex(JSON.parse(fs.readFileSync(index, 'utf8')), now)
  if (json) console.log(JSON.stringify(result, null, 2))
  else {
    for (const row of result.results) console.log(`${row.attestationId} declared=${row.declared} effective=${row.status}${row.stale ? ' STALE' : ''} — ${row.reason}`)
    console.log(`${result.stale} stale/expired record(s) at ${result.checkedAt}`)
  }
  return result.stale > 0 ? 2 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}

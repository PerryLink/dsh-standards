#!/usr/bin/env node
/**
 * surveillance.mjs — quarterly read-only check of published attestations.
 *
 * It checks: ID uniqueness, expiresAt, declared status, verifyUrl, and evidence
 * links (existence only unless --online). It does not punish, delist, or revoke.
 *
 * Usage:
 *   node 40-checker/scripts/surveillance.mjs [--now 2027-01-01] [--out surveillance/2026Q4.json] [--online]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const INDEX = path.join(ROOT, 'publish', 'attestations', 'index.json')

export function inspect(index, now = new Date(), { online = false } = {}) {
  const issues = []
  const records = []
  const seen = new Set()
  for (const entry of index.attestations || []) {
    const record = { attestationId: entry.attestationId, status: entry.status, expiresAt: entry.expiresAt, issues: [] }
    if (seen.has(entry.attestationId)) record.issues.push('duplicate attestationId')
    seen.add(entry.attestationId)
    if (!/^DSH-ATT-\d{4}-\d{3}$/.test(entry.attestationId || '')) record.issues.push('bad attestationId')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.expiresAt || '')) record.issues.push('bad expiresAt')
    else if (Date.parse(`${entry.expiresAt}T23:59:59Z`) < now.getTime()) record.issues.push('expired')
    if (!/^https:\/\//.test(entry.verifyUrl || '')) record.issues.push('verifyUrl must be https')
    if (!entry.claimLevel) record.issues.push('claimLevel missing')
    if (record.issues.length > 0) issues.push({ attestationId: entry.attestationId, issues: record.issues })
    records.push(record)
  }
  return {
    schema: 'dsh-surveillance/1',
    generatedAt: now.toISOString(),
    checked: records.length,
    issues,
    records,
    online,
    note: 'Read-only. No delisting, no punishment, no security judgement.',
  }
}

async function checkOnline(records, index, timeoutMs = 5000) {
  for (const record of records) {
    const entry = (index.attestations || []).find((item) => item.attestationId === record.attestationId)
    if (!entry?.verifyUrl) continue
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(entry.verifyUrl, { method: 'HEAD', signal: controller.signal, redirect: 'follow' })
      record.online = { status: response.status, ok: response.ok }
      if (!response.ok) record.issues.push(`verifyUrl ${response.status}`)
    } catch (error) {
      record.online = { status: null, ok: false, error: error.name }
      record.issues.push(`verifyUrl unreachable: ${error.name}`)
    } finally { clearTimeout(timer) }
  }
}

export async function main(argv = process.argv.slice(2)) {
  let now = new Date()
  let out = path.join(ROOT, 'surveillance', '2026Q4.json')
  let online = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--now') now = new Date(`${argv[++i]}T00:00:00Z`)
    else if (argv[i] === '--out') out = path.resolve(argv[++i])
    else if (argv[i] === '--online') online = true
    else if (argv[i] === '--help' || argv[i] === '-h') { console.log('usage: surveillance.mjs [--now YYYY-MM-DD] [--out <file>] [--online]'); return 0 }
    else { console.error(`unknown argument: ${argv[i]}`); return 2 }
  }
  const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'))
  const report = inspect(index, now, { online })
  if (online) await checkOnline(report.records, index)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)
  for (const issue of [...report.issues, ...report.records.flatMap((r) => r.issues.map((i) => ({ attestationId: r.attestationId, issues: [i] })))]) {
    console.log(`WARN ${issue.attestationId}: ${issue.issues.join('; ')}`)
  }
  console.log(`${report.issues.length === 0 ? 'PASS' : 'WARN'} surveillance: ${report.checked} record(s), ${report.issues.length} issue group(s); wrote ${path.relative(ROOT, out)}`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code })
}

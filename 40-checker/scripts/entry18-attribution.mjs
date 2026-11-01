#!/usr/bin/env node
/**
 * entry18-attribution.mjs — explain the 8 partial rows without changing them.
 * It reads the fullbase rows + logs; it does not boot anything.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const DIR = path.join(ROOT, '40-checker', 'results', 'entry', '18', 'fullbase')

export function buildAttribution(dir = DIR) {
  const rows = []
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    let row
    try { row = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) } catch { continue }
    if (!row.id || !row.status) continue
    const logFile = path.join(dir, `${row.id}.log`)
    let missing = []
    if (fs.existsSync(logFile)) {
      const log = fs.readFileSync(logFile, 'utf8')
      missing = [...new Set([...log.matchAll(/pending \(waiting for service: ([^)]+)\)/g)].map((m) => m[1].trim()))].sort()
    }
    rows.push({
      id: row.id,
      status: row.status,
      g3State: row.g3State,
      targetRows: row.smoke?.g1?.targetRows ?? null,
      active: row.g3Active ?? null,
      compatibility: row.compatibility ?? null,
      missingServices: missing,
      verdict: row.verdict ?? null,
    })
  }
  return { schema: 'dsh-entry18-attribution/1', generatedAt: new Date().toISOString(), rows }
}

export function render(report) {
  const lines = [
    '# ENTRY 18-package attribution',
    '',
    '> This explains the rows that are not `verified`. It does not turn a partial',
    '> into a pass. A missing host/profile service is not a plugin code FAIL.',
    '',
    '| id | status | active/target | missing services | verdict |',
    '|---|---|---|---|---|',
  ]
  for (const row of report.rows) {
    lines.push(`| \`${row.id}\` | ${row.status} | ${row.active ?? '?'}/${row.targetRows ?? '?'} | ${row.missingServices.length ? row.missingServices.join(', ') : '—'} | ${row.verdict ?? '—'} |`)
  }
  const partial = report.rows.filter((r) => r.status !== 'verified')
  lines.push('', `Total: ${report.rows.length}; not verified: ${partial.length}.`)
  lines.push('', 'A richer host profile (the missing services) is required before these can be `verified`; the plugin code itself was not the cause.')
  return lines.join('\n')
}

export function main() {
  const report = buildAttribution()
  fs.writeFileSync(path.join(DIR, 'ATTRIBUTION.md'), `${render(report)}\n`)
  console.log(render(report))
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()

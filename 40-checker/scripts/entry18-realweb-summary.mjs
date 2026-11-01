#!/usr/bin/env node
/**
 * entry18-realweb-summary.mjs — aggregate the real-web-profile ENTRY rows.
 *
 * The summary is a manifest: each row's SHA-256 is recorded so the evidence
 * chain can hash one file without losing the per-row identity. Missing rows are
 * `missing`, never a pass.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STANDARDS = path.resolve(HERE, '..', '..')
const dir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(STANDARDS, '40-checker', 'results', 'entry', '18', 'realweb')
if (!fs.existsSync(dir)) {
  console.error(`entry18-realweb-summary: not found: ${dir}`)
  process.exit(2)
}
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const rows = fs.readdirSync(dir)
  .filter((name) => name.endsWith('.json') && name !== 'summary.json')
  .sort()
  .map((name) => {
    const file = path.join(dir, name)
    const row = JSON.parse(fs.readFileSync(file, 'utf8'))
    const baseFile = path.join(STANDARDS, '40-checker', 'results', 'entry', '18', 'fullbase', `${row.id}.json`)
    const base = fs.existsSync(baseFile) ? JSON.parse(fs.readFileSync(baseFile, 'utf8')) : null
    const localCompat = row.compatibility && row.compatibility !== 'error' ? row.compatibility : null
    const compatibility = localCompat ?? base?.compatibility ?? null
    const compatibilitySource = localCompat ? 'realweb' : base ? 'fullbase' : 'unknown'
    const verdict = row.status === 'verified' && compatibility === 'reject' ? 'verified-gate-reject' : row.status
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      spec: row.spec,
      status: row.status,
      verdict,
      compatibility,
      compatibilitySource,
      compatibilityError: row.compatibilityError ?? null,
      targetRows: row.targetRows ?? 0,
      active: row.active ?? 0,
      baseTargetRows: base?.g3Rows ?? null,
      baseActive: base?.g3Active ?? null,
      targetSetMatches: base?.g3Rows === (row.targetRows ?? 0),
      entries: row.entries ?? 0,
      error: row.error ?? null,
      record: path.relative(STANDARDS, file).split(path.sep).join('/'),
      recordSha256: sha256(file),
      baseRecord: base ? path.relative(STANDARDS, baseFile).split(path.sep).join('/') : null,
      baseRecordSha256: base ? sha256(baseFile) : null,
    }
  })
const counts = {}
for (const row of rows) counts[row.verdict] = (counts[row.verdict] ?? 0) + 1
const summary = {
  schema: 'dsh-entry18-realweb-summary/1',
  generatedAt: new Date().toISOString(),
  profile: 'web',
  method: 'real dsh web profile via runProfile; manual profile symlink; redacted launch token',
  rowCount: rows.length,
  status: counts,
  rows,
  notClaimed: ['18/18 clean', 'UI correctness', 'security', 'production readiness', 'official endorsement'],
  note: 'A missing row is missing, not a pass. Compatibility is G2; a reject stays verified-gate-reject.',
}
fs.writeFileSync(path.join(dir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify({ rowCount: rows.length, status: counts, out: path.join(dir, 'summary.json') }, null, 1))

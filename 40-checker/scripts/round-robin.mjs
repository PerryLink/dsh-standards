#!/usr/bin/env node
/**
 * round-robin.mjs — compare two independent runs against frozen known answers.
 *
 * A comparison is `comparable: true` only when:
 *   - both runs produced a real status (not not-run/blocked/error);
 *   - both statuses match the frozen expected status;
 *   - the two runners are not the same identifier.
 *
 * Two machines both returning `not-run` prove nothing. It is not a proficiency
 * test and not an accreditation.
 *
 * Usage:
 *   node 40-checker/scripts/round-robin.mjs --a runner-a.json --b runner-b.json \
 *     --expected 40-checker/fixtures/known-answer/expected.json --out rounds/2026Q4.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')

const REAL = new Set(['pass', 'warn', 'fail', 'recognized', 'runtime', 'static', 'measured', 'manual'])

export function compare({ a, b, expected }) {
  const rows = []
  const ids = new Set([...Object.keys(expected), ...Object.keys(a.results || {}), ...Object.keys(b.results || {})])
  for (const id of [...ids].sort()) {
    const ae = a.results?.[id]
    const be = b.results?.[id]
    const exp = expected[id]
    const aStatus = ae?.status ?? 'missing'
    const bStatus = be?.status ?? 'missing'
    const ignored = exp?.ignored === true
    const comparable = ignored ? true : Boolean(
      exp && REAL.has(aStatus) && REAL.has(bStatus) &&
      aStatus === bStatus && aStatus === exp.expected &&
      a.runner !== b.runner,
    )
    const problems = []
    if (!exp) problems.push('no frozen expected status')
    if (!REAL.has(aStatus)) problems.push(`runner A status ${aStatus}`)
    if (!REAL.has(bStatus)) problems.push(`runner B status ${bStatus}`)
    if (aStatus !== bStatus) problems.push(`status mismatch: ${aStatus} vs ${bStatus}`)
    if (a.runner === b.runner) problems.push('same runner identifier; not independent')
    rows.push({ id, expected: exp?.expected ?? null, ignored, a: aStatus, b: bStatus, comparable, problems })
  }
  return {
    schema: 'dsh-round-robin/1',
    generatedAt: new Date().toISOString(),
    a: { runner: a.runner, anchor: a.anchor ?? null },
    b: { runner: b.runner, anchor: b.anchor ?? null },
    comparable: rows.length > 0 && rows.every((r) => r.comparable),
    rows,
    note: 'Known-answer comparison only; not a proficiency test, not an accreditation, not a certification.',
  }
}

function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function main(argv = process.argv.slice(2)) {
  let a = null
  let b = null
  let expected = null
  let out = path.join(ROOT, 'rounds', '2026Q4.json')
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--a') a = path.resolve(argv[++i])
    else if (argv[i] === '--b') b = path.resolve(argv[++i])
    else if (argv[i] === '--expected') expected = path.resolve(argv[++i])
    else if (argv[i] === '--out') out = path.resolve(argv[++i])
    else if (argv[i] === '--help' || argv[i] === '-h') { console.log('usage: round-robin.mjs --a <json> --b <json> --expected <json> [--out <file>]'); return 0 }
    else { console.error(`unknown argument: ${argv[i]}`); return 2 }
  }
  if (!a || !b || !expected) { console.error('--a, --b, --expected are required'); return 2 }
  const report = compare({ a: read(a), b: read(b), expected: read(expected) })
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)
  for (const row of report.rows) console.log(`${row.comparable ? 'PASS' : 'FAIL'} ${row.id}: expected=${row.expected} a=${row.a} b=${row.b}${row.problems.length ? ` (${row.problems.join('; ')})` : ''}`)
  console.log(`${report.comparable ? 'PASS' : 'FAIL'} comparable=${report.comparable}; wrote ${path.relative(ROOT, out)}`)
  return report.comparable ? 0 : 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}

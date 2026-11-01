import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateClauseMap } from '../scripts/clause-map.mjs'
import { effective } from '../scripts/stale-check.mjs'
import { appendRecord, verifyChain } from '../scripts/evidence-chain.mjs'
import { buildDashboard } from '../scripts/dashboard.mjs'
import { inspect } from '../scripts/surveillance.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))

test('clause map: the checked-in map covers every gate', () => {
  const result = validateClauseMap({ levels: read('spec/levels.json'), clauses: read('spec/clauses.json') })
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.covered.entry.sort(), ['G0', 'G1', 'G2', 'G3', 'G4', 'G5'])
})

test('clause map: a missing gate is an error', () => {
  const levels = read('spec/levels.json')
  const clauses = read('spec/clauses.json')
  clauses.clauses = clauses.clauses.filter((c) => !c.gates.includes('G4'))
  const result = validateClauseMap({ levels, clauses })
  assert.ok(result.errors.some((e) => /G4/.test(e)))
})

test('stale: an active expired record is expired', () => {
  const r = effective({ status: 'active', expiresAt: '2020-01-01' }, new Date('2026-11-01T00:00:00Z'))
  assert.equal(r.status, 'expired')
  assert.equal(r.stale, true)
})

test('stale: a draft is not valid but not “stale”', () => {
  const r = effective({ status: 'draft', expiresAt: '2030-01-01' }, new Date('2026-11-01T00:00:00Z'))
  assert.equal(r.status, 'draft')
  assert.equal(r.stale, false)
})

test('evidence chain: append then verify', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-chain-'))
  const record = path.join(dir, 'record.json')
  fs.writeFileSync(record, '{"ok":true}')
  const chain = path.join(dir, 'chain.jsonl')
  appendRecord({ chain, record, ts: '2026-11-02T00:00:00Z' })
  appendRecord({ chain, record, ts: '2026-11-02T00:00:01Z' })
  const result = verifyChain(fs.readFileSync(chain, 'utf8').split('\n'))
  assert.deepEqual(result.errors, [])
  assert.equal(result.entries, 2)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('evidence chain: tampering is detected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-chain-'))
  const record = path.join(dir, 'record.json')
  fs.writeFileSync(record, '{"ok":true}')
  const chain = path.join(dir, 'chain.jsonl')
  appendRecord({ chain, record, ts: '2026-11-02T00:00:00Z' })
  const lines = fs.readFileSync(chain, 'utf8').split('\n')
  lines[0] = lines[0].replace(/("recordSha256":")([0-9a-f])/, (m, a, b) => a + (b === '0' ? '1' : '0'))
  const result = verifyChain(lines)
  assert.ok(result.errors.length > 0)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('dashboard: never claims official/security/production', () => {
  const d = buildDashboard(ROOT)
  assert.equal(d.schema, 'dsh-dashboard/1')
  assert.ok(d.notClaimed.includes('security audit'))
  assert.equal(d.flow.packages, 10)
})

test('surveillance: expired record becomes an issue', () => {
  const report = inspect({ attestations: [{ attestationId: 'DSH-ATT-2020-001', status: 'active', expiresAt: '2020-01-01', verifyUrl: 'https://example.com', claimLevel: 'self-reported' }] }, new Date('2026-11-01T00:00:00Z'))
  assert.ok(report.issues.some((i) => i.issues.includes('expired')))
})

test('round-robin: independent matching runs are comparable', async () => {
  const { compare } = await import('../scripts/round-robin.mjs')
  const expected = { good: { expected: 'warn' }, bad: { expected: 'fail' } }
  const r = compare({
    a: { runner: 'runner-a', results: { good: { status: 'warn' }, bad: { status: 'fail' } } },
    b: { runner: 'runner-b', results: { good: { status: 'warn' }, bad: { status: 'fail' } } },
    expected,
  })
  assert.equal(r.comparable, true)
})

test('round-robin: two not-run results are not comparable', async () => {
  const { compare } = await import('../scripts/round-robin.mjs')
  const r = compare({
    a: { runner: 'runner-a', results: { good: { status: 'not-run' } } },
    b: { runner: 'runner-b', results: { good: { status: 'not-run' } } },
    expected: { good: { expected: 'warn' } },
  })
  assert.equal(r.comparable, false)
})

test('flow index: aggregates result files without upgrading a verdict', async () => {
  const { buildFlowIndex } = await import('../scripts/flow-index.mjs')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-flow-index-'))
  const row = (id, pass, fail) => ({
    schema: 'dsh-flow-real/1', id, package: id, version: '1.0.0', source: 'fixture', why: 'test',
    verdicts: { J1: pass ? 'pass' : 'fail', J2: 'not-run', J4: 'not-run', J6: 'not-run' },
    classification: 'clean', conclusion: 'partial', caveats: [], summary: { checks: { pass, fail, blocked: 0, notRun: 6 }, verdicts: { pass: pass ? 1 : 0, fail: fail, blocked: 0, partial: 0, notRun: 3 } },
  })
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(row('a', 1, 0)))
  fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify(row('b', 0, 1)))
  const index = buildFlowIndex(dir)
  assert.equal(index.totals.packages, 2)
  assert.equal(index.totals.checks.fail, 1)
  assert.equal(index.totals.verdicts.fail, 1)
  fs.rmSync(dir, { recursive: true, force: true })
})

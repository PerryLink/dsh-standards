import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { buildReport } from '../src/report.mjs'
import { evidenceHash, finalizeEvidence, validateFlowEvidence } from '../src/flow-evidence.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const readJson = relative => JSON.parse(fs.readFileSync(path.join(STD, relative), 'utf8'))
const readText = relative => fs.readFileSync(path.join(STD, relative), 'utf8')

const DSC_IDS = Array.from({ length: 14 }, (_, index) => `DSC-${String(index + 1).padStart(2, '0')}`)
const CLAUSE_OF = {
  'DSC-01': ['C-1', 'L0'],
  'DSC-02': ['C-2', 'L0'],
  'DSC-03': ['C-3', 'L0'],
  'DSC-04': ['C-4', 'L1'],
  'DSC-05': ['C-5', 'L1'],
  'DSC-06': ['C-6', 'L1+L2'],
  'DSC-07': ['C-7', 'L2'],
  'DSC-08': ['C-8', 'L3'],
  'DSC-09': ['C-9', 'L1'],
  'DSC-10': ['C-10', 'L0'],
  'DSC-11': ['C-11', 'L0'],
  'DSC-12': ['C-12', 'L0'],
  'DSC-13': ['C-13', 'L0'],
  'DSC-14': ['C-14', 'L1'],
}
const BOOST_CARD_FIELDS = [
  'subject', 'host', 'method', 'scope', 'command', 'result', 'negativeControl',
  'generatedAt', 'expiresAt', 'recordHash', 'claimLevel', 'issuer', 'selfAssessed',
]
const COVERAGE_FIELDS = [
  'total', 'checked', 'pass', 'warn', 'advisory', 'fail', 'na', 'notRun', 'error',
]

function syntheticChecks() {
  return DSC_IDS.map((id, index) => {
    const [clause, layer] = CLAUSE_OF[id]
    const base = { id, clause, layer, coverage: 'full', reason: '', evidence: [], details: [], method: 'M', advisory: false }
    if (id === 'DSC-03') return { ...base, result: 'NA', coverage: 'not-run', reason: 'install spec not supplied' }
    if (id === 'DSC-04') return { ...base, result: 'ERROR', coverage: 'not-run', reason: 'no runtime' }
    if (id === 'DSC-13') return { ...base, result: 'WARN', reason: 'labels missing', details: [{ item: 'C-13.1', result: 'WARN', reason: 'dsh.labels is not declared', evidence: ['package.json#dsh.labels'] }] }
    return { ...base, result: 'PASS', reason: index === 0 ? 'ok' : '' }
  })
}

test('conformance schema: top-level shape and actual buildReport output agree', () => {
  const schema = readJson('spec/schemas/conformance.schema.json')
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.equal(schema.type, 'object')
  const expected = ['subject', 'anchor', 'coverage', 'checks', 'buckets', 'metrics', 'conclusion']
  for (const key of expected) {
    assert.ok(schema.required.includes(key), `required is missing ${key}`)
    assert.ok(schema.properties[key], `properties is missing ${key}`)
  }
  assert.equal(schema.properties.schema.const, 'dsh-conformance/1')
  assert.ok(schema.properties.advice, 'advice is an additive top-level field')
  assert.ok(schema.$defs.check.required.includes('details'), 'check requires details')
  assert.ok(schema.$defs.detail.required.includes('item'))
  assert.ok(schema.$defs.coverage.required.includes('entryBlocking'))
  for (const field of COVERAGE_FIELDS) assert.ok(schema.$defs.coverage.required.includes(field), `coverage is missing ${field}`)

  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, kindEvaluated: 'plugin', name: '@acme/x', version: '1.0.0', path: '/tmp/x' },
    anchor: { repo: 'deepseek-ai/deepseek-harness', commit: 'a'.repeat(40), scanner: 'dsh-plugin-verify@0.1.0', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null, runtimeSource: 'host', hostVersion: '0.2.2-alpha.2', suspect: false },
    checks: syntheticChecks(),
    g4: null,
    scope: 'ds-c',
    profile: 'package',
    kind: 'plugin',
    advice: false,
  })
  assert.equal(report.schema, 'dsh-conformance/1')
  for (const key of schema.required) assert.ok(Object.hasOwn(report, key), `report is missing required ${key}`)
  for (const check of report.checks) {
    for (const key of schema.$defs.check.required) assert.ok(Object.hasOwn(check, key), `check ${check.id} is missing ${key}`)
  }
  assert.equal(report.coverage.total, report.checks.length)
  assert.equal(report.coverage.checked, report.coverage.pass + report.coverage.warn + report.coverage.fail)
  assert.ok(report.coverage.error <= report.coverage.notRun)
  assert.ok(report.coverage.advisory <= report.coverage.warn)
  assert.equal(report.coverage.na, 1)
  assert.equal(report.coverage.notRun, 1, 'DSC-03 is NA (not notRun); DSC-04 is the only ERROR/not-run')
  assert.equal(report.coverage.checked + report.coverage.na + report.coverage.notRun, report.coverage.total)
  for (const row of [...report.buckets.blocking, ...report.buckets.hygiene, ...report.buckets.notChecked]) {
    assert.ok(Object.hasOwn(row, 'id'))
    assert.ok(Object.hasOwn(row, 'result'))
  }
})

test('advice schema: 13 required fields match the embedded conformance definition', () => {
  const advice = readJson('spec/schemas/advice.schema.json')
  const conformance = readJson('spec/schemas/conformance.schema.json')
  assert.equal(advice.type, 'array')
  assert.equal(advice.items.required.length, 13)
  assert.deepEqual([...conformance.$defs.advice.required].sort(), [...advice.items.required].sort())
  for (const field of ['key', 'gate', 'severity', 'title', 'why', 'fix', 'docsUrl', 'source', 'version', 'evidence', 'reason', 'occurrences', 'advisory']) {
    assert.ok(advice.items.required.includes(field), `advice is missing ${field}`)
  }
})

test('boost-card schema: exactly the 13 level-audit fields, and the example round-trips', () => {
  const schema = readJson('spec/schemas/boost-card.schema.json')
  assert.equal(schema.type, 'object')
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual([...schema.required].sort(), [...BOOST_CARD_FIELDS].sort())
  for (const field of BOOST_CARD_FIELDS) assert.ok(schema.properties[field], `boost-card is missing ${field}`)
  assert.match(schema.properties.recordHash.pattern, /sha256/)
  assert.deepEqual(schema.properties.claimLevel.enum, ['self-reported', 'self-assessed', 'host-reviewed', 'independent', 'reference'])
  assert.equal(schema.properties.selfAssessed.type, 'boolean')

  // The corrected example is owned by this contract, not by 33 (F3 owns 33).
  const card = readJson('spec/examples/boost-card.example.json')
  assert.deepEqual(Object.keys(card).sort(), [...BOOST_CARD_FIELDS].sort())
  assert.match(card.recordHash, /^sha256:[0-9a-f]{64}$/)
  assert.match(card.generatedAt, /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
  assert.match(card.expiresAt, /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
  assert.ok(card.expiresAt >= card.generatedAt)
  assert.ok(schema.properties.claimLevel.enum.includes(card.claimLevel))
  assert.equal(typeof card.selfAssessed, 'boolean')
  const canonical = value => Array.isArray(value)
    ? value.map(canonical)
    : (value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
      : value)
  const { recordHash, ...body } = card
  const expected = `sha256:${createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex')}`
  assert.equal(recordHash, expected, 'recordHash must be sha256 over the card without that field')
})

test('dsc clauses: C-1..C-14, every C-x.y, and a dsc id on every entry', () => {
  const doc = readJson('spec/dsc-clauses.json')
  assert.equal(doc.schema, 'dsh-dsc-clauses/1')
  assert.equal(doc.standard.id, 'DS-C')
  const entries = doc.clauses
  assert.ok(Array.isArray(entries))
  const ids = new Set(entries.map(entry => entry.clause))
  for (let index = 1; index <= 14; index += 1) assert.ok(ids.has(`C-${index}`), `missing parent C-${index}`)
  assert.equal(doc.counts.clauses, 14)
  const subclauses = entries.filter(entry => /^C-[0-9]+\.[0-9]+$/.test(entry.clause))
  assert.equal(doc.counts.subclauses, subclauses.length)
  assert.equal(doc.counts.entries, entries.length)
  assert.equal(doc.counts.dscChecks, 14)
  assert.equal(new Set(entries.map(entry => entry.dsc)).size, 14)
  for (const entry of entries) {
    assert.match(entry.dsc, /^DSC-[0-9]{2}$/, `${entry.clause} has no dsc`)
    assert.match(entry.clause, /^C-[0-9]+(?:\.[0-9]+)?$/)
    assert.equal(typeof entry.title, 'string')
    assert.ok(entry.title.length > 0)
    assert.match(entry.layer, /^L[0-3](?:\+L[0-3])?$/)
    assert.equal(typeof entry.mandatory, 'boolean')
    assert.equal(typeof entry.advisory, 'boolean')
    assert.equal(typeof entry.docs, 'string')
    const [file, anchor] = entry.docs.split('#')
    assert.ok(fs.existsSync(path.join(STD, file)), `docs file not found: ${file}`)
    assert.ok(anchor && anchor.length > 0, `docs anchor missing for ${entry.clause}`)
    if (entry.clause.includes('.')) {
      assert.equal(entry.parent, entry.clause.split('.')[0])
      assert.ok(ids.has(entry.parent), `parent missing for ${entry.clause}`)
    } else {
      assert.equal(entry.parent, null)
    }
  }
  const byClause = Object.fromEntries(entries.map(entry => [entry.clause, entry]))
  assert.equal(byClause['C-3'].mandatory, true)
  assert.match(byClause['C-3'].note, /listing/)
  assert.equal(byClause['C-10'].advisory, true)
  assert.equal(byClause['C-10'].mandatory, false)
  assert.equal(byClause['C-14'].dsc, 'DSC-14')
  assert.match(byClause['C-14'].docs, /^31-DSH-ENTRY/)
})

test('flow example: structurally valid v2 document, all 8 journeys bound', () => {
  const example = readJson('spec/examples/flow-evidence.example.json')
  const schema = readJson('spec/flow-evidence.schema.json')
  assert.equal(example.schema, 'dsh-flow-evidence/2')
  assert.ok(Array.isArray(example.producer.command) && example.producer.command.length > 0)
  assert.ok(example.producer.at)
  assert.equal(typeof example.subject.name, 'string')
  assert.equal(typeof example.subject.version, 'string')
  assert.equal(example.subject.package, undefined, 'subject.package is not part of the v2 shape')
  assert.equal(example.totals, undefined, 'totals is not part of the v2 shape')
  assert.deepEqual(Object.keys(example.chain), ['evidenceHash'])
  for (const id of ['J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7', 'J8']) {
    assert.ok(example.journeys[id], `missing ${id}`)
    assert.ok(Array.isArray(example.journeys[id].checks), `${id}.checks must be an array`)
  }
  for (const key of schema.required) assert.ok(Object.hasOwn(example, key), `flow example is missing ${key}`)
  assert.equal(example.chain.evidenceHash, evidenceHash(example))
  const verdict = validateFlowEvidence(example)
  assert.equal(verdict.valid, true, verdict.errors.join('; '))
  assert.equal(verdict.journeys.J1.derived, 'pass')
  assert.equal(verdict.journeys.J8.declared, 'na')
  assert.equal(verdict.journeys.J8.passes, false)
  // The guide's old example was flow-pass with only 1/8 evidenced; the corrected one is honest.
  assert.equal(example.conclusion, 'flow-warn')
  const roundTrip = validateFlowEvidence(finalizeEvidence({ ...example, chain: undefined }))
  assert.equal(roundTrip.declaredHash, example.chain.evidenceHash)
})

test('coverage contract: all report-level fields and the old full/partial mapping are documented', () => {
  const doc = readText('spec/coverage-contract.md')
  for (const field of COVERAGE_FIELDS) assert.ok(doc.includes(`\`${field}\``), `coverage-contract is missing ${field}`)
  assert.match(doc, /full/)
  assert.match(doc, /partial/)
  assert.match(doc, /checked \+ na \+ notRun = total/)
  assert.match(doc, /notRun/)
  assert.match(doc, /entryBlocking/)
  const schema = readJson('spec/schemas/conformance.schema.json')
  assert.deepEqual([...schema.$defs.coverage.required].filter(field => field !== 'mandatory' && field !== 'entryBlocking').sort(), [...COVERAGE_FIELDS].sort())
})

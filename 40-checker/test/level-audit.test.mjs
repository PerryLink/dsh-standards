import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const SCRIPT = path.join(STD, '40-checker', 'scripts', 'level-audit.mjs')
const GOOD = path.join(STD, '40-checker', 'fixtures', 'good')

test('level-audit: static ENTRY is recognized, FLOW/BOOST are not upgraded', () => {
  const run = spawnSync(process.execPath, [SCRIPT, GOOD, '--format', 'json'], { encoding: 'utf8', timeout: 30_000 })
  assert.equal(run.status, 0, run.stderr)
  const result = JSON.parse(run.stdout)
  assert.equal(result.schema, 'dsh-level-audit/1')
  assert.equal(result.levelsSpec.schema, 'dsh-levels/1')
  assert.equal(result.levels.entry.state, 'recognized')
  assert.equal(result.levels.flow.state, 'not-run')
  assert.equal(result.levels.boost.state, 'not-measured')
  assert.deepEqual(result.notClaimed.includes('certification'), true)
})

test('level-audit: a missing package exits 3 and does not print a fake pass', () => {
  const run = spawnSync(process.execPath, [SCRIPT, '/no/such/package', '--format', 'json'], { encoding: 'utf8', timeout: 30_000 })
  assert.equal(run.status, 3)
  assert.match(run.stderr, /not a package directory/)
})

import fs from 'node:fs'
import os from 'node:os'

const BOOST_IDS = ['LEV-1', 'LEV-2', 'LEV-3', 'LEV-4', 'LEV-5', 'LEV-6', 'LEV-7', 'LEV-8']

function writeBoostEvidence(rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-boost-evidence-'))
  const file = path.join(dir, 'boost.json')
  fs.writeFileSync(file, JSON.stringify(rows))
  return { dir, file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

function validCard(expiresAt = '2099-01-01', generatedAt = '2026-11-01') {
  return {
    subject: 'fixture@1.0.0',
    host: 'fixture-host',
    method: 'fixture',
    scope: 'fixture',
    command: 'node fixture.mjs',
    result: 'pass',
    negativeControl: 'control fails as expected',
    generatedAt,
    expiresAt,
    recordHash: `sha256:${'a'.repeat(64)}`,
    claimLevel: 'self-reported',
    issuer: 'fixture',
    selfAssessed: true,
  }
}

test('level-audit: status-only BOOST rows are not measured without evidence cards', () => {
  const rows = Object.fromEntries(BOOST_IDS.map(id => [id, { status: 'measured', evidence: 'looks fine' }]))
  const fixture = writeBoostEvidence(rows)
  try {
    const run = spawnSync(process.execPath, [SCRIPT, GOOD, '--format', 'json', '--boost-evidence', fixture.file], { encoding: 'utf8', timeout: 30_000 })
    assert.equal(run.status, 0, run.stderr)
    const result = JSON.parse(run.stdout)
    assert.equal(result.levels.boost.state, 'not-measured')
    assert.equal(result.levels.boost.practices['LEV-1'].card.valid, false)
  } finally {
    fixture.cleanup()
  }
})

test('level-audit: BOOST is measured only with eight valid evidence cards', () => {
  const rows = Object.fromEntries(BOOST_IDS.map(id => [id, { status: 'measured', evidenceCard: validCard() }]))
  const fixture = writeBoostEvidence(rows)
  try {
    const run = spawnSync(process.execPath, [SCRIPT, GOOD, '--format', 'json', '--boost-evidence', fixture.file], { encoding: 'utf8', timeout: 30_000 })
    assert.equal(run.status, 0, run.stderr)
    const result = JSON.parse(run.stdout)
    assert.equal(result.levels.boost.state, 'measured')
    assert.equal(result.levels.boost.validCards, 8)
  } finally {
    fixture.cleanup()
  }
})

test('level-audit: expired BOOST cards are stale, not measured', () => {
  const rows = Object.fromEntries(BOOST_IDS.map(id => [id, { status: 'measured', evidenceCard: validCard('2020-01-01', '2019-01-01') }]))
  const fixture = writeBoostEvidence(rows)
  try {
    const run = spawnSync(process.execPath, [SCRIPT, GOOD, '--format', 'json', '--boost-evidence', fixture.file], { encoding: 'utf8', timeout: 30_000 })
    assert.equal(run.status, 0, run.stderr)
    const result = JSON.parse(run.stdout)
    assert.equal(result.levels.boost.state, 'stale')
  } finally {
    fixture.cleanup()
  }
})

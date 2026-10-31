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

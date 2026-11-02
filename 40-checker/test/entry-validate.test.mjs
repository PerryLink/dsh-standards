import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const SCRIPT = path.join(STD, '40-checker', 'scripts', 'entry-validate.mjs')
const FIXTURES = path.join(STD, 'adoption', 'entry', 'fixtures')

function run(name, withMeta = true) {
  const dir = path.join(FIXTURES, name)
  const args = [SCRIPT, dir, '--json']
  const meta = path.join(dir, 'meta.json')
  if (withMeta && fs.existsSync(meta)) args.push('--meta', meta)
  return spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30_000 })
}

function result(name, withMeta = true) {
  const out = run(name, withMeta)
  assert.ok(out.stdout, out.stderr)
  return { out, json: JSON.parse(out.stdout) }
}

test('entry-validate: the good fixture passes C1-C8', () => {
  const { out, json } = result('good')
  assert.equal(out.status, 0, out.stderr)
  assert.equal(json.conclusion.status, 'pass')
  assert.deepEqual(json.conclusion.failed, [])
  assert.deepEqual(json.conclusion.notRun, [])
})

test('entry-validate: missing meta is incomplete, never a pass', () => {
  const { out, json } = result('no-meta', false)
  assert.equal(out.status, 3)
  assert.equal(json.conclusion.status, 'incomplete')
  assert.ok(json.conclusion.notRun.includes('C1'))
  assert.ok(json.conclusion.notRun.includes('C7'))
})

const failures = [
  ['client-only', 'C2'],
  ['missing-patch', 'C2'],
  ['engines-star', 'C4'],
  ['client-no-export', 'C5'],
  ['no-metadata', 'C6'],
  ['no-version', 'C7'],
  ['forbidden-label', 'C8'],
]

for (const [name, id] of failures) {
  test(`entry-validate: ${name} fails ${id}`, () => {
    const { out, json } = result(name)
    assert.equal(out.status, 2, out.stderr)
    assert.equal(json.conclusion.status, 'fail')
    assert.ok(json.conclusion.failed.includes(id), JSON.stringify(json.conclusion))
  })
}

test('entry-validate: a peer range is an accepted C4 source', () => {
  const { out, json } = result('peer-ok')
  assert.equal(out.status, 0, out.stderr)
  assert.equal(json.checks.find(row => row.id === 'C4').status, 'pass')
})

test('entry-validate: a declared but uncommitted build output is a warning, not a fail', () => {
  const { out, json } = result('build-output')
  assert.equal(out.status, 0, out.stderr)
  assert.equal(json.conclusion.status, 'pass-with-warnings')
  assert.ok(json.conclusion.warnings.includes('C5'))
  assert.equal(json.checks.find(row => row.id === 'C6').status, 'pass')
  assert.deepEqual(json.conclusion.failed, [])
})

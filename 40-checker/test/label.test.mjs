import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const SYNC = path.join(STD, '40-checker', 'scripts', 'label-sync.mjs')
const DRIFT = path.join(STD, '40-checker', 'scripts', 'label-drift.mjs')
const VERIFY = path.join(STD, '40-checker', 'scripts', 'label-verify.mjs')
const SAMPLE = path.join(STD, 'adoption', 'market', 'sample-source.json')

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-label-test-'))
}

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 30_000 })
}

test('label-sync: writes a valid index from the sample source', () => {
  const dir = tempDir()
  try {
    const out = path.join(dir, 'labels')
    const sync = run(SYNC, ['--source', SAMPLE, '--out', out])
    assert.equal(sync.status, 0, sync.stderr)
    const index = JSON.parse(fs.readFileSync(path.join(out, 'index.json'), 'utf8'))
    assert.equal(index.schema, 'dsh-label-index/1')
    assert.equal(index.records.length, 1)
    assert.match(index.records[0].recordHash, /^sha256:[0-9a-f]{64}$/)
    const drift = run(DRIFT, ['--index', path.join(out, 'index.json'), '--now', '2026-11-02'])
    assert.equal(drift.status, 0, drift.stdout + drift.stderr)
    const verify = run(VERIFY, ['--index', path.join(out, 'index.json'), '--hash', index.records[0].recordHash, '--json'])
    assert.equal(verify.status, 0, verify.stderr)
    const view = JSON.parse(verify.stdout)
    assert.equal(view.ok, true)
    assert.equal(view.claimLevel, 'reference')
    assert.equal(Object.prototype.hasOwnProperty.call(view, 'grade'), false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('label-drift: an expired label is stale and fails', () => {
  const dir = tempDir()
  try {
    const out = path.join(dir, 'labels')
    assert.equal(run(SYNC, ['--source', SAMPLE, '--out', out]).status, 0)
    const drift = run(DRIFT, ['--index', path.join(out, 'index.json'), '--now', '2028-01-01', '--json'])
    assert.equal(drift.status, 1)
    const result = JSON.parse(drift.stdout)
    assert.equal(result.stale, 1)
    assert.equal(result.ok, false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('label-sync: a grade or a wrong hash is rejected', () => {
  const dir = tempDir()
  try {
    const source = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'))
    const badGrade = structuredClone(source)
    badGrade[0].grade = 'A'
    const gradeFile = path.join(dir, 'bad-grade.json')
    fs.writeFileSync(gradeFile, JSON.stringify(badGrade))
    const grade = run(SYNC, ['--source', gradeFile, '--check'])
    assert.equal(grade.status, 1)
    assert.match(grade.stderr, /forbidden field: grade/)

    const badHash = structuredClone(source)
    badHash[0].recordHash = `sha256:${'0'.repeat(64)}`
    const hashFile = path.join(dir, 'bad-hash.json')
    fs.writeFileSync(hashFile, JSON.stringify(badHash))
    const hash = run(SYNC, ['--source', hashFile, '--check'])
    assert.equal(hash.status, 1)
    assert.match(hash.stderr, /recordHash does not match/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('label-verify: an unknown hash is a 404, not a fake pass', () => {
  const dir = tempDir()
  try {
    const out = path.join(dir, 'labels')
    assert.equal(run(SYNC, ['--source', SAMPLE, '--out', out]).status, 0)
    const verify = run(VERIFY, ['--index', path.join(out, 'index.json'), '--hash', `sha256:${'f'.repeat(64)}`])
    assert.equal(verify.status, 2)
    assert.match(verify.stderr, /not found/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

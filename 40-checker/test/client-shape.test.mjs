import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runManifestChecks } from '../src/manifest.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

test('G4: no dsh.client is not-applicable, not failed', () => {
  const { g4 } = runManifestChecks(path.join(ROOT, 'fixtures/good'))
  assert.equal(g4.hasClient, false)
  assert.equal(g4.ok, true)
  assert.equal(g4.result, 'NA')
})

test('G4: dsh.client without exports["./client"] fails statically', () => {
  const { g4 } = runManifestChecks(path.join(ROOT, 'fixtures/client-missing'))
  assert.equal(g4.hasClient, true)
  assert.equal(g4.ok, false)
  assert.equal(g4.result, 'FAIL')
  assert.match(g4.reason, /exports\["\.\/client"\]/)
})

test('G4: a client package with the export passes statically', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/client-missing/package.json'), 'utf8'))
  manifest.exports['./client'] = './client.js'
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-client-ok-'))
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest))
    fs.writeFileSync(path.join(dir, 'index.js'), 'export function apply() {}\n')
    fs.writeFileSync(path.join(dir, 'client.js'), 'export function apply() {}\n')
    const { g4 } = runManifestChecks(dir)
    assert.equal(g4.ok, true, g4.reason)
    assert.equal(g4.result, 'PASS')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('G4: exports["./client"] that points at a missing file fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-client-missing-target-'))
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: '@dsh-fixtures/client-target-missing',
      version: '1.0.0',
      exports: { '.': './index.js', './client': './missing-client.js' },
      dsh: { client: 'client.js' },
    }))
    fs.writeFileSync(path.join(dir, 'index.js'), 'export function apply() {}\n')
    const { g4, checks } = runManifestChecks(dir)
    assert.equal(g4.ok, false)
    assert.equal(g4.result, 'FAIL')
    assert.match(g4.reason, /missing file/)
    const dsc01 = checks.find(item => item.id === 'DSC-01')
    assert.equal(dsc01.result, 'FAIL')
    assert.ok(dsc01.details.some(item => item.item === 'C-1.2' && /missing file/.test(item.reason)), JSON.stringify(dsc01.details))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

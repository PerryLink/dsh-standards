import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
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
  const dir = fs.mkdtempSync(path.join(ROOT, 'fixtures', 'client-ok-'))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest))
  const { g4 } = runManifestChecks(dir)
  assert.equal(g4.ok, true)
  assert.equal(g4.result, 'PASS')
  fs.rmSync(dir, { recursive: true, force: true })
})

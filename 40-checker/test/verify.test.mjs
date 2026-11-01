import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildIndex, findAttestation, effectiveStatus, summarize, verify } from '../../publish/verify.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')

test('verify: the index contains the example record', () => {
  const index = buildIndex(path.join(ROOT, 'publish/attestations'))
  assert.equal(index.schema, 'dsh-attestation-index/1')
  const entry = findAttestation(index, 'DSH-ATT-2026-001')
  assert.ok(entry)
  assert.equal(entry.grade, 'A')
  assert.equal(entry.claimLevel, 'self-reported')
})

test('verify: an unknown ID is not found', () => {
  const index = buildIndex(path.join(ROOT, 'publish/attestations'))
  assert.equal(findAttestation(index, 'DSH-ATT-1999-999'), null)
})

test('verify: an expired active record is reported expired', () => {
  const cert = { status: 'active', expiresAt: '2020-01-01' }
  assert.equal(effectiveStatus(cert, new Date('2026-11-01T00:00:00Z')), 'expired')
})

test('verify: a non-active status is preserved', () => {
  assert.equal(effectiveStatus({ status: 'withdrawn', expiresAt: '2030-01-01' }), 'withdrawn')
})

test('verify: the example record validates', async () => {
  const result = await verify({ root: ROOT, id: 'DSH-ATT-2026-001' })
  assert.equal(result.ok, true)
  assert.equal(result.attestation.claimLevel, 'self-reported')
  assert.equal(result.attestation.selfAssessed, true)
})

test('verify: an invalid file fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-verify-cert-'))
  const file = path.join(dir, 'bad.json')
  fs.writeFileSync(file, JSON.stringify({ schema: 'dsh-attestation/1', attestationId: 'bad' }))
  const result = await verify({ root: ROOT, file })
  assert.equal(result.ok, false)
  assert.ok(result.errors.length > 0)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('verify: summarize keeps the disclaimer and evidence', () => {
  const cert = JSON.parse(fs.readFileSync(path.join(ROOT, 'publish/attestations/DSH-ATT-2026-001.json'), 'utf8'))
  const s = summarize(cert)
  assert.match(s.disclaimer, /非官方/)
  assert.equal(s.evidence.length, 5)
})

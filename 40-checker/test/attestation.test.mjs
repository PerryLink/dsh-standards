import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateAttestation } from '../scripts/attestation-check.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const base = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'publish/attestations/DSH-ATT-2026-001.json'), 'utf8'))

test('attestation: the checked-in example passes', () => {
  const result = validateAttestation(base())
  assert.deepEqual(result.errors, [])
})

test('attestation: a level field is forbidden', () => {
  const cert = base()
  cert.level = 'entry'
  const result = validateAttestation(cert)
  assert.ok(result.errors.some((e) => /level field/.test(e)))
})

test('attestation: selfAssessed cannot be verified', () => {
  const cert = base()
  cert.claimLevel = 'verified'
  const result = validateAttestation(cert)
  assert.ok(result.errors.some((e) => /cannot claim verified/.test(e)))
})

test('attestation: an expired active attestation fails', () => {
  const cert = base()
  cert.status = 'active'
  cert.issuedAt = '2024-01-01'
  cert.expiresAt = '2025-01-01'
  const result = validateAttestation(cert)
  assert.ok(result.errors.some((e) => /cannot be active/.test(e)))
})

test('attestation: excluded scope is required', () => {
  const cert = base()
  cert.scope.excluded = []
  const result = validateAttestation(cert)
  assert.ok(result.errors.some((e) => /scope\.excluded/.test(e)))
})

test('attestation: evidence needs a URL or hash', () => {
  const cert = base()
  cert.evidence[0] = { id: 'A', result: 'PASS' }
  const result = validateAttestation(cert)
  assert.ok(result.errors.some((e) => /needs a url or sha256/.test(e)))
})

test('attestation: disclaimer must deny official/certification', () => {
  const cert = base()
  cert.disclaimer = 'A great plugin, approved.'
  const result = validateAttestation(cert)
  assert.ok(result.errors.some((e) => /non-official/.test(e)))
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  SIGNATURE_ALG, canonicalJson, evidenceSigningPayload, generateEd25519KeyPair,
  keyIdFromPublicKey, signEvidence, verifyEvidenceSignature,
} from '../src/signature.mjs'
import {
  FLOW_IDS, attachEvidenceSignature, canonicalJson as flowCanonicalJson, evidenceHash,
  finalizeEvidence, validateFlowEvidence, verifyEvidenceSignature as verifyViaFlow,
} from '../src/flow-evidence.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.join(HERE, '..', 'scripts', 'sign-evidence.mjs')
const ISO = '2026-11-06T12:00:00.000Z'
const HASH = `sha256:${'a'.repeat(64)}`

function tempDir(prefix = 'dsh-signature-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8', timeout: 30_000, ...options,
  })
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function check(id) {
  return {
    id,
    kind: 'observed',
    command: ['node', '-e', 'process.exit(0)'],
    exitCode: 0,
    startedAt: ISO,
    endedAt: ISO,
    stdout: { path: `logs/${id}.out.log`, sha256: HASH },
    assertions: [{ claim: `${id} observed`, observed: true }],
  }
}

/** A structurally valid local flow-evidence document (no sandbox claim). */
function evidenceDocument() {
  return finalizeEvidence({
    schema: 'dsh-flow-evidence/2',
    generatedAt: ISO,
    producer: { command: ['node', '40-checker/bin/dsh-flow-collect.mjs'], at: ISO, kind: 'local' },
    subject: {
      name: '@dsh-fixtures/signed-plugin',
      version: '1.0.0',
      integrity: null,
      tarballSha256: HASH,
      commit: null,
      treeSha256: HASH,
    },
    host: { dsh: '0.2.1-rc.5', node: 'v24.22.1', platform: 'linux-x64' },
    journeys: Object.fromEntries(FLOW_IDS.map((id) => [id, { status: 'pass', checks: [check(`${id}.run`)] }])),
    claims: { claimLevel: 'self-attested', notClaimed: ['certification'] },
    conclusion: 'flow-pass',
  })
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

test('signature: keygen writes 0600 PEM keys, derives a stable keyId, and refuses overwrite', () => {
  const dir = tempDir()
  try {
    const run = runCli(['keygen', '--out', dir])
    assert.equal(run.status, 0, run.stderr)
    const result = JSON.parse(run.stdout)
    const privateFile = path.join(dir, 'ed25519.pem')
    const publicFile = path.join(dir, 'ed25519.pub.pem')
    const privatePem = fs.readFileSync(privateFile, 'utf8')
    const publicPem = fs.readFileSync(publicFile, 'utf8')
    assert.match(privatePem, /BEGIN PRIVATE KEY/)
    assert.match(publicPem, /BEGIN PUBLIC KEY/)
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(privateFile).mode & 0o777, 0o600)
      assert.equal(fs.statSync(publicFile).mode & 0o777, 0o600)
    }
    // keyId = sha256(SPKI public key PEM)[:16].
    const expected = crypto.createHash('sha256').update(publicPem).digest('hex').slice(0, 16)
    assert.equal(result.keyId, expected)
    assert.equal(keyIdFromPublicKey(publicPem), expected)

    const again = runCli(['keygen', '--out', dir])
    assert.equal(again.status, 2)
    assert.match(again.stderr, /refusing to overwrite/)
    const forced = runCli(['keygen', '--out', dir, '--force'])
    assert.equal(forced.status, 0, forced.stderr)
  } finally {
    cleanup(dir)
  }
})

test('signature: sign/verify round-trip, keyId consistency, and pinned keys', () => {
  const pair = generateEd25519KeyPair()
  const other = generateEd25519KeyPair()
  const document = { b: 2, a: { z: 1, y: [3, 2] } }
  const signed = signEvidence(document, pair.privateKeyPem, { at: ISO })
  assert.equal(signed.signature.alg, SIGNATURE_ALG)
  assert.equal(signed.signature.at, ISO)
  assert.equal(signed.signature.keyId, pair.keyId)
  assert.equal(keyIdFromPublicKey(signed.signature.publicKey), pair.keyId)
  assert.equal(signed.a, document.a)

  const embedded = verifyEvidenceSignature(signed)
  assert.equal(embedded.status, 'valid')
  assert.equal(embedded.publicKeySource, 'embedded')
  assert.equal(embedded.keyId, pair.keyId)
  assert.equal(embedded.keyIdMatch, true)

  // Serialising and reordering keys must not change the signed payload.
  const reordered = { signature: signed.signature, a: signed.a, b: signed.b }
  assert.equal(verifyEvidenceSignature(reordered).status, 'valid')
  assert.equal(verifyEvidenceSignature(clone(signed)).status, 'valid')

  const pinned = verifyEvidenceSignature(signed, { publicKey: pair.publicKeyPem })
  assert.equal(pinned.status, 'valid')
  assert.equal(pinned.publicKeySource, 'pinned')

  const wrong = verifyEvidenceSignature(signed, { publicKey: other.publicKeyPem })
  assert.equal(wrong.status, 'invalid')
  assert.equal(wrong.keyIdMatch, false)

  const wrongId = clone(signed)
  wrongId.signature.keyId = other.keyId
  assert.equal(verifyEvidenceSignature(wrongId).status, 'invalid')
})

test('signature: a one-byte payload or signature change is invalid', () => {
  const pair = generateEd25519KeyPair()
  const signed = signEvidence(evidenceDocument(), pair.privateKeyPem, { at: ISO })
  assert.equal(verifyEvidenceSignature(signed).status, 'valid')

  const tamperedPayload = clone(signed)
  tamperedPayload.subject.version = '1.0.1'
  const payloadVerdict = verifyEvidenceSignature(tamperedPayload)
  assert.equal(payloadVerdict.status, 'invalid')
  assert.match(payloadVerdict.reason, /does not verify/)

  const tamperedSignature = clone(signed)
  tamperedSignature.signature.sig = `${tamperedSignature.signature.sig[0] === 'A' ? 'B' : 'A'}${tamperedSignature.signature.sig.slice(1)}`
  assert.equal(verifyEvidenceSignature(tamperedSignature).status, 'invalid')

  const tamperedKey = clone(signed)
  tamperedKey.signature.publicKey = generateEd25519KeyPair().publicKeyPem
  assert.equal(verifyEvidenceSignature(tamperedKey).status, 'invalid')
})

test('signature: missing signature and missing key are reported as missing', () => {
  const pair = generateEd25519KeyPair()
  const document = evidenceDocument()
  assert.equal(verifyEvidenceSignature(document).status, 'missing')
  assert.equal(verifyEvidenceSignature({ ...document, signature: null }).status, 'missing')
  assert.equal(verifyEvidenceSignature(null).status, 'invalid')

  const signed = signEvidence(document, pair.privateKeyPem, { at: ISO })
  const noEmbedded = clone(signed)
  delete noEmbedded.signature.publicKey
  assert.equal(verifyEvidenceSignature(noEmbedded).status, 'missing')
  assert.equal(verifyEvidenceSignature(noEmbedded, { publicKey: pair.publicKeyPem }).status, 'valid')
})

test('signature: canonical JSON is key-order independent and excludes signature', () => {
  const first = { z: 1, a: [{ b: 2, c: 3 }] }
  const second = { a: [{ c: 3, b: 2 }], z: 1 }
  assert.equal(canonicalJson(first), canonicalJson(second))
  assert.deepEqual(evidenceSigningPayload(first), evidenceSigningPayload(second))
  assert.deepEqual(
    evidenceSigningPayload({ ...first, signature: { alg: 'ed25519', sig: 'ignored' } }),
    evidenceSigningPayload(first),
  )
  // The evidence model keeps its own canonicalJson for chain hashing; the two
  // encodings must stay byte-identical or a signature and its chain diverge.
  assert.equal(flowCanonicalJson(first), canonicalJson(first))
})

test('signature: CLI sign/verify, tampered file invalid, unsigned missing', () => {
  const dir = tempDir()
  try {
    assert.equal(runCli(['keygen', '--out', dir]).status, 0)
    const privateFile = path.join(dir, 'ed25519.pem')
    const publicFile = path.join(dir, 'ed25519.pub.pem')
    const evidenceFile = path.join(dir, 'evidence.json')
    const signedFile = path.join(dir, 'signed.json')
    const unsignedFile = path.join(dir, 'unsigned.json')
    const document = evidenceDocument()
    writeJson(evidenceFile, document)
    writeJson(unsignedFile, document)

    const sign = runCli(['sign', evidenceFile, '--key', privateFile, '--out', signedFile, '--at', ISO])
    assert.equal(sign.status, 0, sign.stderr)
    const signed = JSON.parse(fs.readFileSync(signedFile, 'utf8'))
    assert.equal(signed.signature.alg, 'ed25519')
    assert.equal(signed.signature.at, ISO)

    const valid = runCli(['verify', signedFile])
    assert.equal(valid.status, 0, valid.stderr)
    assert.equal(valid.stdout.trim(), 'valid')

    const pinned = runCli(['verify', signedFile, '--pub', publicFile])
    assert.equal(pinned.status, 0)
    assert.equal(pinned.stdout.trim(), 'valid')

    const missingKey = runCli(['verify', signedFile, '--pub', path.join(dir, 'missing.pem')])
    assert.equal(missingKey.status, 1)
    assert.equal(missingKey.stdout.trim(), 'missing')

    const unsigned = runCli(['verify', unsignedFile])
    assert.equal(unsigned.status, 1)
    assert.equal(unsigned.stdout.trim(), 'missing')

    const text = fs.readFileSync(signedFile, 'utf8')
    assert.ok(text.includes('"1.0.0"'))
    fs.writeFileSync(signedFile, text.replace('"1.0.0"', '"1.0.1"'))
    const tampered = runCli(['verify', signedFile])
    assert.equal(tampered.status, 1)
    assert.equal(tampered.stdout.trim(), 'invalid')

    const missingPrivate = runCli(['sign', evidenceFile, '--key', path.join(dir, 'nope.pem'), '--out', path.join(dir, 'x.json')])
    assert.equal(missingPrivate.status, 2)
    assert.match(missingPrivate.stderr, /ENOENT|no such file/i)
  } finally {
    cleanup(dir)
  }
})

test('flow-evidence: signing preserves the chain hash and structural validation', () => {
  const pair = generateEd25519KeyPair()
  const document = evidenceDocument()
  assert.equal(validateFlowEvidence(document).valid, true, validateFlowEvidence(document).errors.join('; '))
  const unsignedHash = evidenceHash(document)
  const signed = attachEvidenceSignature(document, pair.privateKeyPem, { at: ISO })

  assert.equal(signed.chain.evidenceHash, unsignedHash)
  assert.equal(evidenceHash(signed), signed.chain.evidenceHash)
  assert.equal(verifyViaFlow(signed).status, 'valid')
  const verdict = validateFlowEvidence(signed)
  assert.equal(verdict.valid, true, verdict.errors.join('; '))
  assert.equal(verdict.conclusion, 'flow-pass')
  assert.equal(verdict.computedHash, unsignedHash)

  const tampered = clone(signed)
  tampered.subject.version = '1.0.1'
  const tamperedVerdict = validateFlowEvidence(tampered)
  assert.equal(tamperedVerdict.valid, false)
  assert.match(tamperedVerdict.errors.join('; '), /chain\.evidenceHash does not match/)
  assert.equal(verifyViaFlow(tampered).status, 'invalid')
})

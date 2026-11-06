import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  FLOW_IDS, bindEvidenceSubject, ciAttribution, finalizeEvidence, recomputeSubject,
} from '../src/flow-evidence.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const AUDIT = path.join(STD, '40-checker', 'scripts', 'level-audit.mjs')
const COLLECT = path.join(STD, '40-checker', 'bin', 'dsh-flow-collect.mjs')
const TEMPLATE = path.join(STD, 'examples', 'plugin-template')
const ISO = '2026-11-06T12:00:00.000Z'
const HASH = `sha256:${'a'.repeat(64)}`
const GIT_SHA = 'a'.repeat(40)

let cachedSubject = null
function subjectOf(dir = TEMPLATE) {
  if (cachedSubject === null) cachedSubject = recomputeSubject(dir)
  return cachedSubject
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

function evidenceFor(subject, producer = { command: ['node', 'flow-collect.mjs'], at: ISO, kind: 'local' }) {
  return finalizeEvidence({
    schema: 'dsh-flow-evidence/2',
    generatedAt: ISO,
    producer,
    subject: {
      name: subject.name,
      version: subject.version,
      integrity: subject.integrity,
      tarballSha256: subject.tarballSha256,
      commit: null,
      treeSha256: subject.treeSha256,
    },
    host: { dsh: '0.2.1-rc.5', node: process.version, platform: 'linux-x64' },
    journeys: Object.fromEntries(FLOW_IDS.map(id => [id, { status: 'pass', checks: [check(`${id}.run`)] }])),
    claims: { claimLevel: 'self-attested', notClaimed: ['certification'] },
    conclusion: 'flow-pass',
  })
}

function resign(document) {
  const copy = structuredClone(document)
  delete copy.chain
  return finalizeEvidence(copy)
}

function writeTemp(name, value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-subject-test-'))
  const file = path.join(dir, name)
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
  return { dir, file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

function runAudit(args) {
  return spawnSync(process.execPath, [AUDIT, ...args], { encoding: 'utf8', timeout: 120_000 })
}

test('recomputeSubject is deterministic: same name/version/hash every run', () => {
  const first = recomputeSubject(TEMPLATE)
  const second = recomputeSubject(TEMPLATE)
  assert.equal(first.name, 'dsh-plugin-template')
  assert.equal(first.version, '0.0.0')
  assert.equal(first.treeSha256, second.treeSha256)
  assert.equal(first.tarballSha256, second.tarballSha256)
  assert.equal(first.integrity, second.integrity)
})

test('bindEvidenceSubject accepts the same name, version and hashes', () => {
  const binding = bindEvidenceSubject(evidenceFor(subjectOf()), TEMPLATE)
  assert.equal(binding.ok, true, JSON.stringify(binding.mismatches))
  assert.deepEqual(binding.mismatches, [])
  assert.equal(binding.declared.version, binding.recomputed.version)
  assert.equal(binding.declared.treeSha256, binding.recomputed.treeSha256)
})

test('level-audit --dir: a different subject version makes FLOW invalid', () => {
  const document = evidenceFor(subjectOf())
  document.subject.version = '9.9.9'
  const fixture = writeTemp('wrong-version.json', resign(document))
  try {
    const run = runAudit(['--dir', TEMPLATE, '--flow-evidence', fixture.file, '--format', 'json'])
    assert.equal(run.status, 0, run.stderr)
    const result = JSON.parse(run.stdout)
    assert.equal(result.levels.flow.state, 'invalid')
    assert.equal(result.subject.ok, false)
    assert.match(result.subject.mismatches.join('\n'), /version: declared 9\.9\.9 != recomputed 0\.0\.0/)
    assert.match(result.levels.flow.reason, /does not match the inspected package/)
  } finally {
    fixture.cleanup()
  }
})

test('level-audit --dir: a different tree hash makes FLOW invalid', () => {
  const document = evidenceFor(subjectOf())
  document.subject.treeSha256 = `sha256:${'b'.repeat(64)}`
  const fixture = writeTemp('wrong-tree.json', resign(document))
  try {
    const run = runAudit(['--dir', TEMPLATE, '--flow-evidence', fixture.file, '--format', 'json'])
    assert.equal(run.status, 0, run.stderr)
    const result = JSON.parse(run.stdout)
    assert.equal(result.levels.flow.state, 'invalid')
    assert.equal(result.subject.ok, false)
    assert.ok(result.subject.mismatches.some(line => line.startsWith('treeSha256:')))
  } finally {
    fixture.cleanup()
  }
})

test('level-audit: without --dir the evidence is not re-bound (backwards compatible)', () => {
  const document = evidenceFor({ name: 'other', version: '1.0.0', integrity: null, tarballSha256: HASH, treeSha256: HASH })
  const fixture = writeTemp('unbound.json', document)
  try {
    const run = runAudit([TEMPLATE, '--flow-evidence', fixture.file, '--format', 'json'])
    assert.equal(run.status, 0, run.stderr)
    const result = JSON.parse(run.stdout)
    assert.notEqual(result.levels.flow.state, 'invalid')
    assert.equal(result.subject, null)
  } finally {
    fixture.cleanup()
  }
})

test('ciAttribution reads GITHUB_* and returns null outside CI', () => {
  assert.equal(ciAttribution({}), null)
  assert.equal(ciAttribution({ GITHUB_RUN_ID: '1' }).runUrl, null)
  const attribution = ciAttribution({
    GITHUB_RUN_ID: '42',
    GITHUB_REPOSITORY: 'PerryLink/dsh-standards',
    GITHUB_SHA: GIT_SHA,
  })
  assert.equal(attribution.provider, 'github-actions')
  assert.equal(attribution.runUrl, 'https://github.com/PerryLink/dsh-standards/actions/runs/42')
  assert.equal(attribution.commit, GIT_SHA)
})

test('flow-collect records CI attribution without upgrading the claim', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-ci-collect-'))
  const out = path.join(dir, 'evidence.json')
  try {
    const run = spawnSync(process.execPath, [COLLECT, '--package', TEMPLATE, '--static', '--out', out, '--logs', path.join(dir, 'logs')], {
      encoding: 'utf8',
      timeout: 120_000,
      env: {
        ...process.env,
        GITHUB_RUN_ID: '4242',
        GITHUB_REPOSITORY: 'PerryLink/dsh-standards',
        GITHUB_SHA: GIT_SHA,
      },
    })
    assert.equal(run.status, 0, run.stderr)
    const document = JSON.parse(fs.readFileSync(out, 'utf8'))
    assert.equal(document.producer.repository, 'PerryLink/dsh-standards')
    assert.equal(document.producer.commit, GIT_SHA)
    assert.equal(document.producer.runUrl, 'https://github.com/PerryLink/dsh-standards/actions/runs/4242')
    // Attribution is display-only: it must not upgrade the claim.
    assert.equal(document.claims.claimLevel, 'self-attested')
    assert.equal(document.producer.kind, 'local')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('level-audit reports self-declared vs ci attestation', () => {
  const local = evidenceFor(subjectOf())
  const ci = evidenceFor(subjectOf(), { command: ['node', 'flow-collect.mjs'], at: ISO, kind: 'ci', runUrl: 'https://github.com/PerryLink/dsh-standards/actions/runs/7' })
  const localFixture = writeTemp('local.json', local)
  const ciFixture = writeTemp('ci.json', ci)
  try {
    const localRun = runAudit([TEMPLATE, '--flow-evidence', localFixture.file, '--format', 'json'])
    assert.equal(localRun.status, 0, localRun.stderr)
    const localResult = JSON.parse(localRun.stdout)
    assert.equal(localResult.levels.flow.attestation, 'self-declared')
    assert.equal(localResult.attestation, 'self-declared')

    const ciRun = runAudit([TEMPLATE, '--flow-evidence', ciFixture.file, '--format', 'json'])
    assert.equal(ciRun.status, 0, ciRun.stderr)
    const ciResult = JSON.parse(ciRun.stdout)
    assert.equal(ciResult.levels.flow.attestation, 'ci')
    assert.equal(ciResult.attestation, 'ci')
    assert.equal(ciResult.levels.flow.state, 'not-run', 'ci attribution cannot become runtime')
  } finally {
    localFixture.cleanup()
    ciFixture.cleanup()
  }
})

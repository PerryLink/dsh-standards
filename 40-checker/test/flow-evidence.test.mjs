import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  FLOW_IDS, evidenceHash, finalizeEvidence, journeyAggregate, treeSha256, validateFlowEvidence,
} from '../src/flow-evidence.mjs'
import { isSecretEnvName, sanitizedEnv } from '../src/sandbox-env.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const AUDIT = path.join(STD, '40-checker', 'scripts', 'level-audit.mjs')
const COLLECT = path.join(STD, '40-checker', 'bin', 'dsh-flow-collect.mjs')
const GOOD = path.join(STD, '40-checker', 'fixtures', 'good')
const TEMPLATE = path.join(STD, 'examples', 'plugin-template')
const ISO = '2026-11-06T12:00:00.000Z'
const HASH = `sha256:${'a'.repeat(64)}`

function check(id, overrides = {}) {
  return {
    id,
    kind: 'observed',
    command: ['node', '-e', 'process.exit(0)'],
    exitCode: 0,
    startedAt: ISO,
    endedAt: ISO,
    stdout: { path: `logs/${id}.out.log`, sha256: HASH },
    assertions: [{ claim: `${id} observed`, observed: true }],
    ...overrides,
  }
}

function evidenceDocument({ journeys = {}, subject, ...rest } = {}) {
  const base = {
    schema: 'dsh-flow-evidence/2',
    generatedAt: ISO,
    producer: { command: ['node', '40-checker/bin/dsh-flow-collect.mjs'], at: ISO, kind: 'local' },
    subject: subject ?? {
      name: '@dsh-fixtures/good-plugin',
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
    ...rest,
  }
  for (const [id, override] of Object.entries(journeys)) base.journeys[id] = override
  return finalizeEvidence(base)
}

function sandboxReport(overrides = {}) {
  const base = {
    schema: 'dsh-sandbox-report/1',
    mode: 'sandbox',
    platform: process.platform,
    env: { policy: 'allowlist', checked: ['GH_TOKEN', 'NPM_TOKEN', 'GITHUB_TOKEN'], absent: true, offenders: [] },
    home: { isolated: true, mode: 'temporary HOME/DSH_HOME/TMPDIR' },
    network: { isolated: true, mechanism: 'unshare -n (network namespace)' },
    limits: { available: true, nproc: 1024, asBytes: 4294967296, applied: ['nproc', 'as'] },
    processTreeKill: { available: true, mechanism: 'process-group SIGKILL' },
    degraded: [],
    executed: true,
    execution: { exitCode: 0, timedOut: false, killed: false },
  }
  return { ...base, ...overrides }
}

function writeTemp(name, value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-flow-evidence-test-'))
  const file = path.join(dir, name)
  fs.writeFileSync(file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`)
  return { dir, file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

function runAudit(flowFile) {
  const run = spawnSync(process.execPath, [AUDIT, GOOD, '--format', 'json', '--flow-evidence', flowFile], {
    encoding: 'utf8', timeout: 60_000,
  })
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout)
}

test('sandbox-env: inherited secrets are dropped and only allowlisted names survive', () => {
  process.env.DSH_TEST_TOKEN = 'do-not-leak'
  process.env.DSH_TEST_API_KEY = 'do-not-leak'
  try {
    const env = sanitizedEnv()
    assert.equal(env.DSH_TEST_TOKEN, undefined)
    assert.equal(env.DSH_TEST_API_KEY, undefined)
    assert.equal(env.DSH_HOME, undefined)
    assert.equal(env.PATH, process.env.PATH)
    assert.equal(isSecretEnvName('GH_TOKEN'), true)
    assert.equal(isSecretEnvName('DEEPSEEK_API_KEY'), true)
    assert.equal(isSecretEnvName('PATH'), false)
    assert.equal(sanitizedEnv({ DSH_HOME: '/tmp/isolated' }).DSH_HOME, '/tmp/isolated')
  } finally {
    delete process.env.DSH_TEST_TOKEN
    delete process.env.DSH_TEST_API_KEY
  }
})

test('flow-evidence: a well-formed v2 document validates and hashes consistently', () => {
  const doc = evidenceDocument()
  const verdict = validateFlowEvidence(doc)
  assert.equal(verdict.kind, 'v2')
  assert.equal(verdict.valid, true, verdict.errors.join('; '))
  assert.equal(verdict.declaredHash, evidenceHash(doc))
  assert.equal(verdict.journeys.J1.derived, 'pass')
})

test('level-audit: v1 journey/runtime schemas are deprecated and never a pass', () => {
  const docs = [
    { schema: 'dsh-flow-journey/1', package: '@dsh-fixtures/good-plugin', checks: [] },
    { schema: 'dsh-flow-runtime/1', environment: {}, checks: [] },
  ]
  for (const doc of docs) {
    const temp = writeTemp('v1.json', doc)
    try {
      const result = runAudit(temp.file)
      assert.equal(result.levels.flow.state, 'deprecated')
      assert.equal(result.levels.flow.deprecated, true)
      assert.equal(result.levels.flow.passed, 0)
      assert.notEqual(result.levels.flow.state, 'runtime')
    } finally {
      temp.cleanup()
    }
  }
})

test('level-audit: bare {Jx:{status:pass}} rows are deprecated and never a pass', () => {
  const temp = writeTemp('bare.json', Object.fromEntries(FLOW_IDS.map(id => [id, { status: 'pass' }])))
  try {
    const result = runAudit(temp.file)
    assert.equal(result.levels.flow.state, 'deprecated')
    assert.equal(result.levels.flow.passed, 0)
    assert.notEqual(result.levels.flow.state, 'runtime')
  } finally {
    temp.cleanup()
  }
})

test('level-audit: producer.kind=sandbox with all eight journeys passing is runtime', () => {
  const doc = evidenceDocument({
    producer: { command: ['node', '40-checker/bin/dsh-flow-collect.mjs'], at: ISO, kind: 'sandbox' },
    sandbox: sandboxReport(),
  })
  const temp = writeTemp('v2-sandbox-producer.json', doc)
  try {
    const result = runAudit(temp.file)
    assert.equal(result.levels.flow.state, 'runtime')
    assert.equal(result.levels.flow.passed, 8)
    assert.equal(result.levels.flow.sandboxAttested, true)
    assert.equal(result.levels.flow.evidenceHash.ok, true)
  } finally {
    temp.cleanup()
  }
})

test('level-audit: a hand-written self-attested/ci-attested v2 with all eight journeys passing is not runtime', () => {
  for (const claimLevel of ['self-attested', 'ci-attested']) {
    // Structurally perfect: every journey is an observed check with exitCode 0
    // and a held assertion, and the chain hash is recomputed. Only the claim
    // level says it is not sandbox evidence.
    const doc = evidenceDocument({ claims: { claimLevel, notClaimed: ['certification'] } })
    const temp = writeTemp(`v2-${claimLevel}.json`, doc)
    try {
      const result = runAudit(temp.file)
      assert.equal(result.levels.flow.state, 'not-run')
      assert.notEqual(result.levels.flow.state, 'runtime')
      assert.equal(result.levels.flow.passed, 8)
      assert.equal(result.levels.flow.claimLevel, claimLevel)
      assert.equal(result.levels.flow.sandboxAttested, false)
      assert.match(result.levels.flow.reason, new RegExp(`${claimLevel} evidence; runtime requires sandbox-attested`))
      assert.equal(result.levels.flow.evidenceHash.ok, true)
    } finally {
      temp.cleanup()
    }
  }
})

test('level-audit: sandbox-attested v2 with all eight journeys passing is runtime', () => {
  const doc = evidenceDocument({ claims: { claimLevel: 'sandbox-attested', notClaimed: ['certification'] } })
  const temp = writeTemp('v2-sandbox-claims.json', doc)
  try {
    const result = runAudit(temp.file)
    assert.equal(result.levels.flow.state, 'runtime')
    assert.equal(result.levels.flow.passed, 8)
    assert.equal(result.levels.flow.claimLevel, 'sandbox-attested')
    assert.equal(result.levels.flow.producerKind, 'local')
    assert.equal(result.levels.flow.sandboxAttested, true)
    assert.equal(result.levels.flow.evidenceHash.ok, true)
  } finally {
    temp.cleanup()
  }
})

test('level-audit: a forged v2 pass with a non-zero exitCode is not a pass', () => {
  // Declared pass on every journey, but J4 carries exitCode 1: the aggregate
  // contradicts the declaration, so the document must fail validation.
  const doc = evidenceDocument({
    journeys: { J4: { status: 'pass', checks: [check('J4.run', { exitCode: 1 })] } },
  })
  const temp = writeTemp('forged.json', doc)
  try {
    const result = runAudit(temp.file)
    assert.notEqual(result.levels.flow.state, 'runtime')
    assert.equal(result.levels.flow.passed, 0)
    assert.equal(result.levels.flow.invalid, true)
    assert.match(result.levels.flow.reason, /aggregate|exitCode|declares pass/i)
  } finally {
    temp.cleanup()
  }
})

test('level-audit: an honest v2 with one failed journey is failed, not runtime', () => {
  const doc = evidenceDocument({
    journeys: { J4: { status: 'fail', checks: [check('J4.run', { exitCode: 1 })] } },
    conclusion: 'flow-fail',
  })
  const temp = writeTemp('failed.json', doc)
  try {
    const result = runAudit(temp.file)
    assert.equal(result.levels.flow.state, 'failed')
    assert.equal(result.levels.flow.passed, 7)
    assert.equal(result.levels.flow.journeys.J4.status, 'fail')
  } finally {
    temp.cleanup()
  }
})

test('level-audit: a v2 journey without checks does not count as a pass', () => {
  const doc = evidenceDocument({ journeys: { J5: { status: 'not-run', checks: [] } } })
  const temp = writeTemp('empty.json', doc)
  try {
    const result = runAudit(temp.file)
    assert.notEqual(result.levels.flow.state, 'runtime')
    assert.equal(result.levels.flow.passed, 7)
  } finally {
    temp.cleanup()
  }
})

test('level-audit: a tampered evidence hash is invalid, not runtime', () => {
  const doc = evidenceDocument()
  doc.chain.evidenceHash = HASH
  const temp = writeTemp('tampered.json', doc)
  try {
    const result = runAudit(temp.file)
    assert.equal(result.levels.flow.state, 'invalid')
    assert.equal(result.levels.flow.passed, 0)
    assert.match(result.levels.flow.reason, /evidenceHash/)
  } finally {
    temp.cleanup()
  }
})

test('level-audit: a declared blocked journey is blocked, not failed', () => {
  const doc = evidenceDocument({
    journeys: { J6: { status: 'blocked', reason: 'no --previous package supplied', checks: [check('J6.upgrade', { exitCode: 1 })] } },
    conclusion: 'flow-blocked',
  })
  const temp = writeTemp('blocked.json', doc)
  try {
    const result = runAudit(temp.file)
    assert.equal(result.levels.flow.state, 'blocked')
    assert.equal(result.levels.flow.passed, 7)
  } finally {
    temp.cleanup()
  }
})

test('flow-collect: static output is v2, validates, and the audit can read it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-flow-collect-test-'))
  try {
    const copy = path.join(dir, 'plugin')
    fs.cpSync(TEMPLATE, copy, { recursive: true })
    const out = path.join(dir, 'flow.json')
    const run = spawnSync(process.execPath, [COLLECT, '--package', copy, '--static', '--out', out], {
      encoding: 'utf8', timeout: 120_000,
    })
    assert.equal(run.status, 0, `${run.stderr}\n${run.stdout}`)
    const doc = JSON.parse(fs.readFileSync(out, 'utf8'))
    assert.equal(doc.schema, 'dsh-flow-evidence/2')
    const verdict = validateFlowEvidence(doc)
    assert.equal(verdict.valid, true, verdict.errors.join('; '))
    assert.deepEqual(Object.keys(doc.journeys), FLOW_IDS)
    assert.equal(doc.subject.treeStable, true)
    assert.equal(doc.subject.treeSha256, treeSha256(TEMPLATE).hash)
    assert.equal(doc.chain.evidenceHash, evidenceHash(doc))
    assert.equal(journeyAggregate(doc.journeys.J1.checks), 'static')

    // The audit consumes the collector output without upgrading it to runtime.
    const audit = spawnSync(process.execPath, [AUDIT, copy, '--format', 'json', '--flow-evidence', out], {
      encoding: 'utf8', timeout: 60_000,
    })
    assert.equal(audit.status, 0, audit.stderr)
    const result = JSON.parse(audit.stdout)
    assert.equal(result.levels.flow.schema, 'dsh-flow-evidence/2')
    assert.notEqual(result.levels.flow.state, 'runtime')
    assert.notEqual(result.levels.flow.state, 'invalid')
    assert.notEqual(result.levels.flow.state, 'deprecated')
    assert.equal(result.levels.flow.passed, 0)
    assert.equal(result.levels.flow.evidenceHash.ok, true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('flow-collect: a failed journey exits 1 and prints the five-element hint', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-flow-collect-fail-'))
  try {
    const plugin = path.join(dir, 'plugin')
    fs.mkdirSync(plugin)
    fs.writeFileSync(path.join(plugin, 'package.json'), `${JSON.stringify({
      name: 'dsh-flow-bad-fixture', version: '1.0.0', type: 'module', main: './index.mjs',
      files: ['index.mjs'], dependencies: { 'workspace-only': 'workspace:*' },
    }, null, 2)}\n`)
    fs.writeFileSync(path.join(plugin, 'index.mjs'), 'export function apply() {}\n')
    const out = path.join(dir, 'flow.json')
    const run = spawnSync(process.execPath, [COLLECT, '--package', plugin, '--static', '--out', out], {
      encoding: 'utf8', timeout: 120_000,
    })
    assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
    for (const marker of ['FAIL J1.install.preflight', '1) 子检查:', '2) 命令:', '3) exitCode:', '4) stderr(末20行):', '5) 日志:', '条款锚: 32#R1']) {
      assert.ok(run.stdout.includes(marker), `missing hint marker ${marker}\n${run.stdout}`)
    }
    const doc = JSON.parse(fs.readFileSync(out, 'utf8'))
    assert.equal(doc.journeys.J1.status, 'fail')
    assert.equal(doc.conclusion, 'flow-fail')
    assert.equal(validateFlowEvidence(doc).valid, true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('flow-evidence: the published schema declares the validator contract', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(STD, 'spec', 'flow-evidence.schema.json'), 'utf8'))
  assert.equal(schema.properties.schema.const, 'dsh-flow-evidence/2')
  for (const key of ['schema', 'generatedAt', 'producer', 'subject', 'host', 'journeys', 'claims', 'chain']) {
    assert.ok(schema.required.includes(key), `schema.required is missing ${key}`)
  }
  for (const id of FLOW_IDS) assert.ok(schema.properties.journeys.required.includes(id), `journeys.required is missing ${id}`)
  for (const key of ['id', 'command', 'exitCode', 'startedAt', 'endedAt', 'stdout', 'assertions']) {
    assert.ok(schema.$defs.check.required.includes(key), `check.required is missing ${key}`)
  }
  assert.ok(schema.$defs.journey.properties.checks)
})

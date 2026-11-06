import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  FLOW_IDS, evidenceHash, finalizeEvidence, journeyAggregate, validateFlowEvidence,
} from '../src/flow-evidence.mjs'
import { sanitizedEnv } from '../src/sandbox-env.mjs'
import {
  assertNoCredentialEnv, buildSandboxPlan, credentialEnvOffenders, runInProcessTree,
} from '../src/sandbox-run.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const AUDIT = path.join(STD, '40-checker', 'scripts', 'level-audit.mjs')
const COLLECT = path.join(STD, '40-checker', 'bin', 'dsh-flow-collect.mjs')
const GOOD = path.join(STD, '40-checker', 'fixtures', 'good')
const TEMPLATE = path.join(STD, 'examples', 'plugin-template')
const ISO = '2026-11-06T12:00:00.000Z'
const HASH = `sha256:${'a'.repeat(64)}`
const CREDENTIALS = ['GH_TOKEN', 'NPM_TOKEN', 'GITHUB_TOKEN']

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

function sandboxReport(overrides = {}) {
  const base = {
    schema: 'dsh-sandbox-report/1',
    mode: 'sandbox',
    platform: process.platform,
    env: { policy: 'allowlist', checked: [...CREDENTIALS], absent: true, offenders: [] },
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

function evidenceDocument(overrides = {}) {
  const base = {
    schema: 'dsh-flow-evidence/2',
    generatedAt: ISO,
    producer: { command: ['node', '40-checker/bin/dsh-flow-collect.mjs'], at: ISO, kind: 'sandbox' },
    sandbox: sandboxReport(),
    subject: {
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
  }
  return finalizeEvidence({ ...base, ...overrides })
}

function writeTemp(name, value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sandbox-test-'))
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

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

test('sandbox: GH_TOKEN / NPM_TOKEN / GITHUB_TOKEN never reach the child env', () => {
  const saved = new Map()
  for (const name of [...CREDENTIALS, 'DSH_EXTRA_SECRET_TOKEN']) {
    saved.set(name, process.env[name])
    process.env[name] = 'leak-value'
  }
  try {
    // The allowlist drops every credential name, even though the parent has them.
    const env = sanitizedEnv({ HOME: '/tmp/isolated-home', DSH_HOME: '/tmp/isolated-home' })
    for (const name of [...CREDENTIALS, 'DSH_EXTRA_SECRET_TOKEN']) {
      assert.equal(env[name], undefined, `${name} leaked into the child env`)
    }
    const report = assertNoCredentialEnv(env)
    assert.equal(report.absent, true)
    assert.deepEqual(report.checked, CREDENTIALS)
    assert.deepEqual(credentialEnvOffenders({ GH_TOKEN: 'x', PATH: '/bin', NPM_TOKEN: 'y' }), ['GH_TOKEN', 'NPM_TOKEN'])
    // A surviving credential is a hard failure, not a degraded run.
    assert.throws(() => assertNoCredentialEnv({ GH_TOKEN: 'x' }), /sandbox env assertion failed: GH_TOKEN/)
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('level-audit: sandbox-degraded evidence is valid but never runtime', () => {
  const doc = evidenceDocument({
    producer: { command: ['node', '40-checker/bin/dsh-flow-collect.mjs'], at: ISO, kind: 'sandbox-degraded' },
    sandbox: sandboxReport({
      mode: 'sandbox-degraded',
      degraded: ['unshare-missing'],
      network: { isolated: false, reason: 'unshare -n failed and unshare -Urn is not permitted' },
    }),
  })
  const verdict = validateFlowEvidence(doc)
  assert.equal(verdict.valid, true, verdict.errors.join('; '))
  assert.equal(verdict.sandboxAttested, false)
  assert.deepEqual(verdict.sandbox.degraded, ['unshare-missing'])
  const temp = writeTemp('degraded.json', doc)
  try {
    const result = runAudit(temp.file)
    assert.equal(result.levels.flow.state, 'not-run')
    assert.equal(result.levels.flow.passed, 8)
    assert.equal(result.levels.flow.sandboxAttested, false)
    assert.deepEqual(result.levels.flow.sandboxDegraded, ['unshare-missing'])
    assert.match(result.levels.flow.reason, /sandbox-degraded/)
    assert.match(result.levels.flow.reason, /unshare-missing/)
    assert.ok(result.nextActions.some(action => /sandbox degraded \(unshare-missing\)/.test(action)))
  } finally {
    temp.cleanup()
  }

  // A degraded producer may not keep the sandbox-attested claim.
  const contradictory = evidenceDocument({
    producer: { command: ['node', '40-checker/bin/dsh-flow-collect.mjs'], at: ISO, kind: 'sandbox-degraded' },
    sandbox: sandboxReport({ mode: 'sandbox-degraded', degraded: ['prlimit-missing'] }),
    claims: { claimLevel: 'sandbox-attested' },
  })
  const contradictoryVerdict = validateFlowEvidence(contradictory)
  assert.equal(contradictoryVerdict.valid, false)
  assert.match(contradictoryVerdict.errors.join('; '), /cannot claim sandbox-attested/)
})

test('flow-evidence: producer.kind=sandbox requires every isolation item', () => {
  // No sandbox report at all: the claim cannot be checked.
  const withoutSandbox = evidenceDocument()
  delete withoutSandbox.sandbox
  const missing = finalizeEvidence(withoutSandbox)
  const missingVerdict = validateFlowEvidence(missing)
  assert.equal(missingVerdict.valid, false)
  assert.match(missingVerdict.errors.join('; '), /sandbox is required/)

  // A degraded report with kind=sandbox is internally inconsistent.
  const inconsistent = evidenceDocument({
    sandbox: sandboxReport({ mode: 'sandbox-degraded', degraded: ['prlimit-missing'] }),
  })
  const inconsistentVerdict = validateFlowEvidence(inconsistent)
  assert.equal(inconsistentVerdict.valid, false)
  assert.match(inconsistentVerdict.errors.join('; '), /producer\.kind=sandbox requires sandbox\.mode=sandbox/)
})

test('flow-evidence: a changed tree hash is invalid, not runtime', () => {
  const base = evidenceDocument()
  const changed = finalizeEvidence({
    ...base,
    subject: { ...base.subject, treeStable: true, treeSha256After: `sha256:${'b'.repeat(64)}` },
  })
  const changedVerdict = validateFlowEvidence(changed)
  assert.equal(changedVerdict.valid, false)
  assert.match(changedVerdict.errors.join('; '), /treeSha256After differs/)

  const unstable = finalizeEvidence({ ...base, subject: { ...base.subject, treeStable: false } })
  const unstableVerdict = validateFlowEvidence(unstable)
  assert.equal(unstableVerdict.valid, false)
  assert.match(unstableVerdict.errors.join('; '), /treeStable is false/)

  const temp = writeTemp('tree-changed.json', changed)
  try {
    const result = runAudit(temp.file)
    assert.equal(result.levels.flow.state, 'invalid')
    assert.equal(result.levels.flow.passed, 0)
    assert.notEqual(result.levels.flow.state, 'runtime')
    assert.match(result.levels.flow.reason, /treeSha256After|treeStable/)
  } finally {
    temp.cleanup()
  }
})

test('sandbox: forcing missing isolation records sandbox-degraded', () => {
  const plan = buildSandboxPlan({ env: { PATH: process.env.PATH ?? '/usr/bin' }, force: { network: true, limits: true } })
  assert.equal(plan.mode, 'sandbox-degraded')
  assert.deepEqual([...plan.degraded].sort(), ['prlimit-missing', 'unshare-missing'])
  assert.equal(plan.env.absent, true)
  assert.equal(plan.network.isolated, false)
  assert.equal(plan.limits.available, false)
})

test('sandbox: timeout SIGKILLs the whole process tree, not just the parent', {
  skip: process.platform === 'win32' ? 'POSIX process-group assertion' : false,
}, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sandbox-tree-'))
  try {
    const grandchild = path.join(dir, 'grandchild.mjs')
    fs.writeFileSync(grandchild, 'setInterval(() => {}, 1000)\n')
    const parent = path.join(dir, 'parent.mjs')
    fs.writeFileSync(parent, [
      "import { spawn } from 'node:child_process'",
      "import fs from 'node:fs'",
      `const child = spawn(process.execPath, [${JSON.stringify(grandchild)}], { stdio: 'ignore' })`,
      `fs.writeFileSync(${JSON.stringify(path.join(dir, 'grandchild.pid'))}, String(child.pid))`,
      'setInterval(() => {}, 1000)',
      '',
    ].join('\n'))
    const result = await runInProcessTree({
      command: process.execPath,
      args: [parent],
      env: sanitizedEnv(),
      timeoutMs: 1_500,
    })
    assert.equal(result.timedOut, true)
    assert.equal(result.killed, true)
    assert.equal(result.exitCode, 124)
    assert.equal(result.treeKill.cleared, true, 'process group was not verified dead')
    const grandchildPid = Number(fs.readFileSync(path.join(dir, 'grandchild.pid'), 'utf8'))
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.equal(isAlive(result.pid), false, `parent ${result.pid} survived`)
    assert.equal(isAlive(grandchildPid), false, `grandchild ${grandchildPid} survived`)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('flow-collect --sandbox: env is clean, the tree is stable, and kind follows degradation', {
  skip: process.platform === 'win32' ? 'fake dsh shell script needs sh' : false,
}, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sandbox-collect-'))
  try {
    const fakeDsh = path.join(dir, 'dsh')
    const trace = path.join(dir, 'dsh-env.log')
    fs.writeFileSync(fakeDsh, `#!/bin/sh
{ echo "--- $*"; env | sort; } >> "${trace}"
if [ "$1" = "--version" ]; then echo "0.2.3"; exit 0; fi
case "$*" in
  *--dump-config*) echo "- id: fake-row"; echo "  name: dsh-plugin-template"; exit 0;;
  *"Reply with one short sentence."*) echo "MISSING_CREDENTIAL: no API key" >&2; exit 1;;
esac
exit 0
`)
    fs.chmodSync(fakeDsh, 0o755)
    const out = path.join(dir, 'flow.json')
    const run = spawnSync(process.execPath, [
      COLLECT, '--package', TEMPLATE, '--dsh', fakeDsh, '--sandbox', '--out', out,
    ], {
      encoding: 'utf8',
      timeout: 240_000,
      env: { ...process.env, GH_TOKEN: 'leak-gh', NPM_TOKEN: 'leak-npm', GITHUB_TOKEN: 'leak-github' },
    })
    // The fake host does not pass every journey; the evidence file must still exist.
    assert.ok([0, 1].includes(run.status), `collector exited ${run.status}\n${run.stderr}\n${run.stdout}`)
    const doc = JSON.parse(fs.readFileSync(out, 'utf8'))
    assert.equal(validateFlowEvidence(doc).valid, true, validateFlowEvidence(doc).errors.join('; '))
    assert.equal(doc.subject.treeStable, true)
    assert.equal(doc.subject.treeSha256, doc.subject.treeSha256After)
    assert.equal(doc.sandbox.executed, true)
    assert.equal(doc.sandbox.env.absent, true)
    assert.deepEqual(doc.sandbox.env.checked, CREDENTIALS)
    assert.equal(doc.producer.kind, doc.sandbox.mode === 'sandbox' ? 'sandbox' : 'sandbox-degraded')
    if (doc.sandbox.mode === 'sandbox') assert.equal(doc.claims.claimLevel, 'sandbox-attested')
    else assert.equal(doc.claims.claimLevel, 'self-attested')

    const dumped = fs.readFileSync(trace, 'utf8')
    for (const name of CREDENTIALS) {
      assert.ok(!new RegExp(`^${name}=`, 'm').test(dumped), `${name} was visible to the sandboxed dsh`)
    }
    assert.ok(journeyAggregate(doc.journeys.J4.checks) !== 'not-run')
    assert.equal(doc.chain.evidenceHash, evidenceHash(doc))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

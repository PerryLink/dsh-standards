import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildReport } from '../src/report.mjs'
import {
  createRuntimeIsolation,
  detectHostRuntime,
  isolationEnv,
  parseArgs,
  resolveDshInstall,
  resolveRuntimeTarget,
} from '../src/cli.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CHECKER = path.join(HERE, '..', 'bin', 'dsh-plugin-verify.mjs')
const FIXTURES = path.join(HERE, '..', 'fixtures')
const HOST_RUNTIME_VERSION = '0.2.2-alpha.2'
const ANCHOR = {
  repo: 'test', commit: '0'.repeat(40), scanner: 'test', dsh: HOST_RUNTIME_VERSION,
  cordis: '4.0.6-alpha.1', runtime: null, runtimeSource: 'cli', hostVersion: null, suspect: false,
}

const CLAUSE = {
  'DSC-01': ['C-1', 'L0'], 'DSC-02': ['C-2', 'L0'], 'DSC-03': ['C-3', 'L0'],
  'DSC-04': ['C-4', 'L1'], 'DSC-05': ['C-5', 'L1'], 'DSC-06': ['C-6', 'L1+L2'],
  'DSC-07': ['C-7', 'L2'], 'DSC-08': ['C-8', 'L3'], 'DSC-09': ['C-9', 'L1'],
  'DSC-10': ['C-10', 'L0'], 'DSC-11': ['C-11', 'L0'], 'DSC-12': ['C-12', 'L0'],
  'DSC-13': ['C-13', 'L0'], 'DSC-14': ['C-14', 'L1'],
}

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function writeFiles(dir, files) {
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), text)
  }
}

function runtimeChecks(overrides = {}) {
  return Array.from({ length: 14 }, (_, index) => {
    const id = `DSC-${String(index + 1).padStart(2, '0')}`
    const [clause, layer] = CLAUSE[id]
    const base = { id, clause, layer, result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [], method: 'M', advisory: false }
    if (id === 'DSC-03') return { ...base, result: 'NA', coverage: 'not-run', reason: 'install spec not supplied', ...(overrides[id] ?? {}) }
    if (id === 'DSC-04' || id === 'DSC-05' || id === 'DSC-06' || id === 'DSC-07' || id === 'DSC-08' || id === 'DSC-09') {
      return { ...base, coverage: 'partial', reason: 'static subset passed; runtime not run', ...(overrides[id] ?? {}) }
    }
    if (id === 'DSC-14') return { ...base, result: 'ERROR', coverage: 'not-run', reason: 'bundle runtime requires --host', ...(overrides[id] ?? {}) }
    return { ...base, ...(overrides[id] ?? {}) }
  })
}

function reportFor(checks) {
  return buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'bundle', kindInferred: true, kindEvaluated: 'bundle', name: '@fixtures/x', version: '1.0.0', path: HERE },
    anchor: ANCHOR,
    checks,
    g4: null,
    scope: 'ds-c',
    profile: 'package',
    kind: 'bundle',
    advice: false,
  })
}

function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [CHECKER, ...args], {
    encoding: 'utf8',
    timeout: 120_000,
    env: options.env ?? process.env,
  })
  let report = null
  try { report = JSON.parse(result.stdout) } catch { /* not JSON */ }
  return { ...result, report }
}

test('ds-c: a static partial PASS is not an incomplete report', () => {
  const report = reportFor(runtimeChecks())
  assert.equal(report.conclusion.status, 'pass', report.conclusion.reason)
  assert.equal(report.conclusion.exitCode, 0)
  assert.equal(report.coverage.partial, 6)
  // DSC-14 is the only not-run row; it is not in the ds-c mandatory set.
  assert.equal(report.coverage.notRun, 1)
  assert.equal(report.coverage.checked, 12)
  // The partial rows stay visible in the bucket instead of disappearing.
  assert.deepEqual(report.buckets.partial.map(row => row.id), ['DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09'])

  // Hygiene still downgrades pass to warn, not to incomplete.
  const warned = reportFor(runtimeChecks({ 'DSC-13': { result: 'WARN', reason: 'labels missing' } }))
  assert.equal(warned.conclusion.status, 'warn')
  assert.equal(warned.conclusion.exitCode, 0)
})

test('ds-c: a mandatory check that did not run is still incomplete', () => {
  const report = reportFor(runtimeChecks({ 'DSC-06': { result: 'ERROR', coverage: 'not-run', reason: 'runtime unavailable' } }))
  assert.equal(report.conclusion.status, 'incomplete')
  assert.equal(report.conclusion.exitCode, 2)
  assert.match(report.conclusion.reason, /not run: DSC-06/)
  assert.deepEqual(report.coverage.entryBlocking, null)
})

test('CLI: a bundle without --host reports DSC-14 not-run, not incomplete', () => {
  const run = runCli([
    path.join(FIXTURES, 'bundle'), '--scope', 'ds-c', '--format', 'json',
    '--runtime-version', HOST_RUNTIME_VERSION, '--no-advice',
  ])
  assert.equal(run.status, 0, run.stderr)
  assert.ok(run.report, run.stderr)
  assert.notEqual(run.report.conclusion.status, 'incomplete')
  assert.equal(run.report.conclusion.exitCode, 0)
  const dsc14 = run.report.checks.find(item => item.id === 'DSC-14')
  assert.equal(dsc14.result, 'ERROR')
  assert.equal(dsc14.coverage, 'not-run')
  assert.match(dsc14.reason, /--host/)
  assert.equal(run.report.runtimeChecks.executed, false)
  assert.equal(run.report.runtimeChecks.isolation.isolatedHome, false)
  assert.match(run.report.runtimeChecks.reason, /no --runtime\/--host supplied/)
  assert.deepEqual(run.report.runtimeChecks.checks.map(row => row.result), ['ERROR', 'ERROR', 'ERROR', 'ERROR', 'ERROR', 'ERROR'])
})

test('CLI: a plugin without --runtime is incomplete and says nothing ran', () => {
  const run = runCli([
    path.join(FIXTURES, 'good'), '--scope', 'ds-c', '--format', 'json',
    '--runtime-version', HOST_RUNTIME_VERSION, '--no-advice',
  ])
  assert.equal(run.status, 2, run.stderr)
  const dsc04 = run.report.checks.find(item => item.id === 'DSC-04')
  assert.equal(dsc04.result, 'ERROR')
  assert.equal(dsc04.coverage, 'not-run')
  assert.match(dsc04.reason, /no --runtime supplied/)
  assert.equal(run.report.runtimeChecks.executed, false)
  assert.match(run.report.runtimeChecks.reason, /nothing executed/)
})

test('CLI: an unusable --runtime path is recorded as a failure, never a silent pass', () => {
  const run = runCli([
    path.join(FIXTURES, 'good'), '--scope', 'ds-c', '--format', 'json',
    '--runtime-version', HOST_RUNTIME_VERSION, '--treat-as-plugin',
    '--runtime', path.join(os.tmpdir(), 'dsh-does-not-exist', 'cordis', 'lib', 'index.js'),
    '--no-advice',
  ])
  assert.equal(run.status, 2, run.stderr)
  assert.equal(run.report.runtimeChecks.executed, true)
  assert.match(run.report.runtimeChecks.failure, /runtime import failed/)
  const dsc04 = run.report.checks.find(item => item.id === 'DSC-04')
  assert.equal(dsc04.result, 'ERROR')
  assert.equal(dsc04.coverage, 'not-run')
})

test('CLI args: bare --runtime / --host mean auto; explicit values still win', () => {
  assert.equal(parseArgs(['pkg', '--runtime']).runtime, 'auto')
  assert.equal(parseArgs(['pkg', '--host']).host, 'auto')
  assert.equal(parseArgs(['pkg', '--runtime=/opt/cordis/lib/index.js']).runtime, '/opt/cordis/lib/index.js')
  assert.equal(parseArgs(['pkg', '--host', '/opt/app-boot/lib/index.js']).host, '/opt/app-boot/lib/index.js')
})

test('CLI: an explicitly requested --host that cannot boot is incomplete, not a pass', () => {
  const run = runCli([
    path.join(FIXTURES, 'bundle'), '--scope', 'ds-c', '--format', 'json',
    '--runtime-version', HOST_RUNTIME_VERSION, '--host', path.join(os.tmpdir(), 'dsh-missing-app-boot', 'lib', 'index.js'),
    '--no-advice',
  ])
  assert.equal(run.status, 2, run.stderr)
  assert.equal(run.report.conclusion.status, 'incomplete')
  assert.equal(run.report.runtimeChecks.executed, true)
  assert.match(run.report.runtimeChecks.failure, /bundle smoke/)
  assert.equal(run.report.runtimeChecks.entry.result, 'ERROR')
})

test('isolation: one disposable HOME/DSH_HOME/TMPDIR, cleaned up afterwards', () => {
  const isolation = createRuntimeIsolation()
  const root = isolation.root
  assert.equal(fs.existsSync(isolation.home), true)
  assert.equal(fs.existsSync(isolation.tmp), true)
  const env = isolationEnv(isolation)
  assert.equal(env.HOME, isolation.home)
  assert.equal(env.DSH_HOME, isolation.home)
  assert.equal(env.TMPDIR, isolation.tmp)
  assert.equal(env.GH_TOKEN, undefined)
  isolation.cleanup()
  assert.equal(fs.existsSync(root), false)
  isolation.cleanup() // idempotent
})

test('--runtime auto / --host auto resolve against an installed dsh', () => {
  const root = tempDir('dsh-fake-install-')
  try {
    const install = path.join(root, 'npm', 'node_modules', '@deepseek-ai', 'dsh')
    writeFiles(root, {
      'npm/node_modules/@deepseek-ai/dsh/package.json': JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.1-rc.5' }),
      'npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js': 'export class Context {}\n',
      'npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js': 'export const boot = () => {}\n',
    })
    const env = { ...process.env, DSH_INSTALL_DIR: install }
    assert.equal(resolveDshInstall({ env }), install)
    assert.equal(resolveRuntimeTarget('auto', 'cordis', { env }), path.join(install, 'node_modules/@deepseek-ai/cordis/lib/index.js'))
    assert.equal(resolveRuntimeTarget('auto', 'host', { env }), path.join(install, 'node_modules/@deepseek-ai/dsh-app-boot/lib/index.js'))
    // A directory argument expands to its package entry.
    assert.equal(
      resolveRuntimeTarget(path.join(install, 'node_modules/@deepseek-ai/cordis'), 'cordis', { env }),
      path.join(install, 'node_modules/@deepseek-ai/cordis/lib/index.js'),
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('real host smoke: L1-L3 runs in a temporary DSH_HOME with a scrubbed env', { timeout: 120_000 }, (t) => {
  const host = detectHostRuntime()
  const runtime = resolveRuntimeTarget('auto', 'cordis')
  if (!host.version || !runtime) {
    t.skip('dsh is not available; real host smoke is skipped')
    return
  }
  const dir = tempDir('dsh-runtime-probe-')
  const probeOut = path.join(dir, 'probe.json')
  try {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: '@fixtures/runtime-probe',
        version: '1.0.0',
        license: 'MIT',
        type: 'module',
        main: './index.mjs',
        exports: { '.': './index.mjs' },
        engines: { dsh: `>=${HOST_RUNTIME_VERSION} <0.3.0` },
        dsh: { manifestVersion: 1, kind: 'plugin', capabilities: [], labels: [] },
      }, null, 2),
      'index.mjs': `import fs from 'node:fs'
export const provide = ['probeEnv']
export function apply(ctx) {
  fs.writeFileSync(${JSON.stringify(probeOut)}, JSON.stringify({
    home: process.env.HOME ?? null,
    dshHome: process.env.DSH_HOME ?? null,
    tmp: process.env.TMPDIR ?? null,
    gh: process.env.GH_TOKEN ?? null,
  }))
  ctx.provide('probeEnv', { ok: true })
  ctx.effect(() => () => {}, 'probe.effect')
}
`,
    })
    const run = runCli([
      dir, '--scope', 'ds-c', '--treat-as-plugin', '--runtime', 'auto',
      '--runtime-version', HOST_RUNTIME_VERSION, '--format', 'json', '--timeout', '5000', '--no-advice',
    ], { env: { ...process.env, GH_TOKEN: 'must-not-leak' } })
    assert.equal(run.status, 0, run.stderr)
    assert.ok(run.report, run.stderr)
    assert.equal(run.report.runtimeChecks.executed, true)
    assert.deepEqual(run.report.runtimeChecks.modes, ['cordis'])
    assert.equal(run.report.runtimeChecks.isolation.isolatedHome, true)
    assert.ok(run.report.runtimeChecks.durationMs >= 0)
    const dsc04 = run.report.checks.find(item => item.id === 'DSC-04')
    assert.equal(dsc04.result, 'PASS', dsc04.reason)
    assert.equal(dsc04.coverage, 'full')
    const probe = JSON.parse(fs.readFileSync(probeOut, 'utf8'))
    assert.ok(probe.home && probe.home.includes('dsh-checker-runtime-'), `HOME was not the disposable dir: ${probe.home}`)
    assert.equal(probe.dshHome, probe.home)
    assert.ok(probe.tmp && probe.tmp.includes('dsh-checker-runtime-'), `TMPDIR was not the disposable dir: ${probe.tmp}`)
    assert.equal(probe.gh, null, 'GH_TOKEN leaked into the plugin process')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

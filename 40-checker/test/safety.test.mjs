import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { safetyDefaultsFor } from '../src/author-cli.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const BIN = path.join(STD, 'bin', 'dsh-standards.mjs')
const GOOD = path.join(STD, '40-checker', 'fixtures', 'good')

function cleanEnv(overrides = {}) {
  const env = { ...process.env }
  delete env.DSH_HOST_VERSION
  delete env.DSH_BIN
  return Object.assign(env, overrides)
}

function runCheck(args, env = {}) {
  return spawnSync(process.execPath, [BIN, 'check', ...args], {
    encoding: 'utf8', timeout: 120_000, env: cleanEnv(env),
  })
}

function fakeDsh(marker, version) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-safety-'))
  const bin = path.join(dir, 'dsh')
  fs.writeFileSync(bin, `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')\nconsole.log(${JSON.stringify(version)})\n`)
  fs.chmodSync(bin, 0o755)
  return { dir, bin }
}

test('check default safety: static claim + no-exec, runtime needs an explicit opt-in', () => {
  assert.deepEqual(safetyDefaultsFor([]).args, ['--entry-claim', 'static', '--no-exec'])
  assert.equal(safetyDefaultsFor([]).defaulted, true)
  assert.equal(safetyDefaultsFor([]).noExec, true)
  // A static claim without --no-exec still must not import the package.
  assert.deepEqual(safetyDefaultsFor(['--entry-claim', 'static']).args, ['--no-exec'])
  // Explicit runtime opt-ins are never overridden.
  assert.deepEqual(safetyDefaultsFor(['--entry-claim', 'runtime']).args, [])
  assert.deepEqual(safetyDefaultsFor(['--entry-claim=runtime']).args, [])
  assert.deepEqual(safetyDefaultsFor(['--runtime', 'lib/index.js']).args, [])
  assert.deepEqual(safetyDefaultsFor(['--host', 'lib/index.js']).args, [])
  // --runtime-version is an anchor, not an execution opt-in.
  assert.deepEqual(safetyDefaultsFor(['--runtime-version', '0.2.1-rc.5']).args, ['--entry-claim', 'static', '--no-exec'])
})

test('check default does not execute PATH dsh and reports an unknown host anchor', () => {
  const marker = path.join(os.tmpdir(), `dsh-safety-marker-${process.pid}`)
  const fake = fakeDsh(marker, '9.9.9')
  try {
    const run = runCheck([GOOD, '--json'], { DSH_BIN: fake.bin })
    assert.equal(run.status, 2, run.stderr)
    assert.equal(fs.existsSync(marker), false, 'PATH dsh must not run without --allow-host-probe')
    const report = JSON.parse(run.stdout)
    assert.equal(report.safety.executed, false)
    assert.equal(report.safety.defaultSafety, true)
    assert.equal(report.safety.noExec, true)
    assert.equal(report.safety.entryClaim, 'static')
    assert.equal(report.anchor.runtimeSource, 'default')
    assert.equal(report.anchor.suspect, true)
    assert.equal(report.anchor.hostVersionKnown, false)
  } finally {
    fs.rmSync(marker, { force: true })
    fs.rmSync(fake.dir, { recursive: true, force: true })
  }
})

test('check Markdown starts with the no-execution and unknown-host notice', () => {
  const run = runCheck([GOOD])
  assert.equal(run.status, 2, run.stderr)
  const lines = run.stdout.split('\n')
  assert.match(lines[0], /^# DSH standards check —/)
  assert.match(run.stdout, /本次未执行插件代码/)
  assert.match(run.stdout, /host 版本未知/)
  assert.match(run.stdout, /source=default, suspect=true/)
})

test('check --host-version wins over PATH and is not executed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-safety-'))
  const marker = path.join(dir, 'probe-ran')
  const fake = fakeDsh(marker, '9.9.9')
  try {
    const run = runCheck([GOOD, '--host-version', '0.2.2-rc.1', '--json'], { DSH_BIN: fake.bin })
    assert.notEqual(run.status, 3, run.stderr)
    assert.equal(fs.existsSync(marker), false)
    const report = JSON.parse(run.stdout)
    assert.equal(report.anchor.dsh, '0.2.2-rc.1')
    assert.equal(report.anchor.runtimeSource, 'host')
    assert.equal(report.anchor.hostVersionKnown, true)
    assert.equal(report.anchor.hostVersionSource, 'flag')
    assert.equal(report.anchor.suspect, false)
  } finally {
    fs.rmSync(fake.dir, { recursive: true, force: true })
  }
})

test('check DSH_HOST_VERSION is the second host-version source', () => {
  const run = runCheck([GOOD, '--json'], { DSH_HOST_VERSION: '0.2.1-rc.5' })
  assert.notEqual(run.status, 3, run.stderr)
  const report = JSON.parse(run.stdout)
  assert.equal(report.anchor.dsh, '0.2.1-rc.5')
  assert.equal(report.anchor.runtimeSource, 'host')
  assert.equal(report.anchor.hostVersionSource, 'env')
  assert.equal(report.anchor.hostVersionKnown, true)
})

test('check --allow-host-probe runs node on the resolved dsh JS entry only when asked', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-safety-'))
  const marker = path.join(dir, 'probe-ran')
  const fake = fakeDsh(marker, '7.7.7')
  try {
    const run = runCheck([GOOD, '--allow-host-probe', '--json'], { DSH_BIN: fake.bin })
    assert.notEqual(run.status, 3, run.stderr)
    assert.equal(fs.existsSync(marker), true, '--allow-host-probe should run the resolved entry')
    const report = JSON.parse(run.stdout)
    assert.equal(report.anchor.dsh, '7.7.7')
    assert.equal(report.anchor.runtimeSource, 'host')
    assert.equal(report.anchor.hostVersionSource, 'probe')
    assert.equal(report.anchor.hostVersionKnown, true)
  } finally {
    fs.rmSync(fake.dir, { recursive: true, force: true })
  }
})

test('check explicit --entry-claim runtime is not downgraded to the static default', () => {
  const run = runCheck([GOOD, '--scope', 'entry', '--entry-claim', 'runtime', '--json'])
  assert.notEqual(run.status, 3, run.stderr)
  const report = JSON.parse(run.stdout)
  assert.equal(report.safety.defaultSafety, false)
  assert.equal(report.safety.entryClaim, 'runtime')
  // No --runtime/--host was supplied, so the report must still say no code ran.
  assert.equal(report.safety.executed, false)
  const md = runCheck([GOOD, '--scope', 'entry', '--entry-claim', 'runtime'])
  assert.match(md.stdout, /本次未执行插件代码/)
})

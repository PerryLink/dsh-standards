import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const CHECKER = path.join(HERE, '..', 'bin', 'dsh-plugin-verify.mjs')
const NO_DSH = path.join(os.tmpdir(), `dsh-no-host-registry-${process.pid}`)

/** A sidebar-style registry/: dsh.plugin.json plus the referenced built files. */
function registryFixture({ includeLicense = false } = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-registry-'))
  const dir = path.join(parent, 'registry')
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'dsh.plugin.json'), JSON.stringify({
    id: 'dsh-external/dsh-better-sidebar',
    version: '0.30.1',
    main: './lib/index.js',
    description: 'sidebar fixture',
    engines: { dsh: '>=0.2.2-rc.1' },
    contributes: { tools: [], skills: [] },
    client: { main: './lib/client-registry.js' },
    ...(includeLicense ? { license: 'MIT' } : {}),
  }, null, 2))
  fs.writeFileSync(path.join(dir, 'lib/index.js'), 'export function apply() {}\n')
  fs.writeFileSync(path.join(dir, 'lib/client-registry.js'), 'export function apply() {}\n')
  return { parent, dir }
}

function runCli(args, { cwd = STD, env = {} } = {}) {
  return spawnSync(process.execPath, [CHECKER, ...args], {
    cwd, encoding: 'utf8', timeout: 60_000, env: { ...process.env, DSH_BIN: NO_DSH, ...env },
  })
}

test('registry/: dsh.plugin.json is auto-detected and produces a static ENTRY report', () => {
  const { parent, dir } = registryFixture()
  try {
    const run = runCli([dir, '--scope', 'entry', '--entry-claim', 'static', '--no-exec', '--format', 'json'])
    assert.equal(run.status, 0, run.stderr)
    const report = JSON.parse(run.stdout)
    assert.equal(report.subject.source, 'registry')
    assert.equal(report.subject.name, 'dsh-external/dsh-better-sidebar')
    assert.equal(report.subject.version, '0.30.1')
    assert.equal(report.subject.kind, 'plugin')
    assert.equal(report.checks.filter(item => item.result === 'FAIL').length, 0)
    const dsc01 = report.checks.find(item => item.id === 'DSC-01')
    assert.equal(dsc01.result, 'PASS', dsc01.reason)
    assert.equal(dsc01.coverage, 'partial')
    assert.ok(dsc01.details.some(item => item.item === 'C-1.5' && item.result === 'NA' && /license not judged/.test(item.reason)))
    const dsc02 = report.checks.find(item => item.id === 'DSC-02')
    assert.equal(dsc02.result, 'NA')
    assert.equal(dsc02.coverage, 'partial')
    assert.match(dsc02.reason, /兼容性未判定/)
    assert.equal(report.checks.find(item => item.id === 'DSC-03').result, 'NA')
    assert.match(report.checks.find(item => item.id === 'DSC-03').reason, /no package\.json/)
  } finally {
    fs.rmSync(parent, { recursive: true, force: true })
  }
})

test('registry/: --registry-dir selects the layout and --host-version judges C-2', () => {
  const { parent } = registryFixture()
  try {
    const auto = runCli(['--registry-dir', 'registry', '--scope', 'entry', '--entry-claim', 'static', '--no-exec', '--format', 'json'], { cwd: parent })
    assert.equal(auto.status, 0, auto.stderr)
    const autoReport = JSON.parse(auto.stdout)
    assert.equal(autoReport.subject.source, 'registry')

    const matching = runCli([path.join(parent, 'registry'), '--scope', 'entry', '--entry-claim', 'static', '--no-exec', '--format', 'json', '--host-version', '0.2.2-rc.1'])
    assert.equal(matching.status, 0, matching.stderr)
    assert.equal(JSON.parse(matching.stdout).checks.find(item => item.id === 'DSC-02').result, 'PASS')

    const older = runCli([path.join(parent, 'registry'), '--scope', 'ds-c', '--no-exec', '--format', 'json', '--host-version', '0.2.1-rc.5'])
    assert.equal(older.status, 1, older.stderr)
    const olderC2 = JSON.parse(older.stdout).checks.find(item => item.id === 'DSC-02')
    assert.equal(olderC2.result, 'FAIL')
    assert.ok(olderC2.details.some(item => item.item === 'C-2.2' && item.result === 'FAIL'))
  } finally {
    fs.rmSync(parent, { recursive: true, force: true })
  }
})

test('registry/: a declared license is PASS, a relative main must exist', () => {
  const licensed = registryFixture({ includeLicense: true })
  try {
    const run = runCli([licensed.dir, '--scope', 'entry', '--entry-claim', 'static', '--no-exec', '--format', 'json'])
    assert.equal(run.status, 0, run.stderr)
    const report = JSON.parse(run.stdout)
    assert.ok(report.checks.find(item => item.id === 'DSC-01').details.some(item => item.item === 'C-1.5' && item.result === 'PASS'))
  } finally {
    fs.rmSync(licensed.parent, { recursive: true, force: true })
  }
})

test('registry/: a directory with neither manifest still exits 3', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-empty-input-'))
  try {
    const run = runCli([dir, '--scope', 'entry', '--entry-claim', 'static', '--no-exec', '--format', 'json'])
    assert.equal(run.status, 3)
    assert.match(run.stderr, /no package\.json or dsh\.plugin\.json/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

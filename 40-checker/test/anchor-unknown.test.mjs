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
const BIN = path.join(STD, 'bin', 'dsh-standards.mjs')
const NO_DSH = path.join(os.tmpdir(), `dsh-no-host-${process.pid}`)

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-anchor-unknown-'))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: '@fixtures/anchor-unknown',
    version: '1.0.0',
    license: 'MIT',
    type: 'module',
    main: './index.js',
    exports: { '.': './index.js' },
    engines: { dsh: '>=0.2.2-rc.1 <0.3.0' },
    dsh: { kind: 'plugin', capabilities: [], labels: [] },
  }, null, 2))
  fs.writeFileSync(path.join(dir, 'index.js'), 'export function apply() {}\n')
  return dir
}

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [CHECKER, ...args], {
    encoding: 'utf8', timeout: 60_000, env: { ...process.env, DSH_BIN: NO_DSH, ...env },
  })
}

test('raw checker: an unknown host makes C-2 NA/partial, never a FAIL', () => {
  const dir = fixture()
  try {
    const run = runCli([dir, '--scope', 'entry', '--entry-claim', 'static', '--no-exec', '--format', 'json'])
    assert.equal(run.status, 0, run.stderr)
    const report = JSON.parse(run.stdout)
    assert.equal(report.anchor.runtimeSource, 'default')
    assert.equal(report.anchor.suspect, true)
    assert.equal(report.anchor.hostVersion, null)
    assert.equal(report.checks.filter(item => item.result === 'FAIL').length, 0)
    const dsc02 = report.checks.find(item => item.id === 'DSC-02')
    assert.equal(dsc02.result, 'NA')
    assert.equal(dsc02.coverage, 'partial')
    assert.match(dsc02.reason, /未指定 host 版本/)
    assert.match(dsc02.reason, /兼容性未判定/)
    assert.match(dsc02.howToEnable, /--host-version/)
    assert.match(dsc02.howToEnable, /--allow-host-probe/)
    const row = report.notChecked.find(item => item.id === 'DSC-02')
    assert.equal(row.coverage, 'partial')
    assert.match(row.howToEnable, /--host-version/)
    assert.match(report.conclusion.reason, /兼容性未判定/)
    assert.equal(report.conclusion.exitCode, 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('raw checker: --host-version restores the real C-2 verdict', () => {
  const dir = fixture()
  try {
    const older = runCli([dir, '--scope', 'ds-c', '--no-exec', '--format', 'json', '--host-version', '0.2.1-rc.5'])
    assert.equal(older.status, 1, older.stderr)
    const olderReport = JSON.parse(older.stdout)
    assert.equal(olderReport.anchor.runtimeSource, 'host')
    assert.equal(olderReport.anchor.dsh, '0.2.1-rc.5')
    const olderC2 = olderReport.checks.find(item => item.id === 'DSC-02')
    assert.equal(olderC2.result, 'FAIL')
    assert.ok(olderC2.details.some(item => item.item === 'C-2.2' && item.result === 'FAIL'))

    const matching = runCli([dir, '--scope', 'entry', '--entry-claim', 'static', '--no-exec', '--format', 'json', '--host-version', '0.2.2-rc.1'])
    assert.equal(matching.status, 0, matching.stderr)
    const matchingReport = JSON.parse(matching.stdout)
    assert.equal(matchingReport.checks.find(item => item.id === 'DSC-02').result, 'PASS')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('author check: unknown host reports C-2 as not judged and adds a banner', () => {
  const dir = fixture()
  try {
    const run = spawnSync(process.execPath, [BIN, 'check', dir, '--json'], {
      encoding: 'utf8', timeout: 120_000, env: { ...process.env, DSH_BIN: NO_DSH, DSH_HOST_VERSION: '' },
    })
    assert.equal(run.status, 2, run.stderr)
    const report = JSON.parse(run.stdout)
    assert.equal(report.anchor.runtimeSource, 'default')
    assert.equal(report.anchor.suspect, true)
    assert.equal(report.checks.filter(item => item.result === 'FAIL').length, 0)
    assert.equal(report.checks.find(item => item.id === 'DSC-02').result, 'NA')

    const markdown = spawnSync(process.execPath, [BIN, 'check', dir], {
      encoding: 'utf8', timeout: 120_000, env: { ...process.env, DSH_BIN: NO_DSH, DSH_HOST_VERSION: '' },
    })
    assert.match(markdown.stdout, /C-2\.1\/C-2\.2 兼容性未判定/)
    assert.match(markdown.stdout, /--host-version/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

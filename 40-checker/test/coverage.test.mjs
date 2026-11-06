import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readSourcesWithStats } from '../src/util.mjs'
import { checkImportTimeAdvisory } from '../src/declarations.mjs'
import { runManifestChecks } from '../src/manifest.mjs'
import { runStaticBundleChecks } from '../src/bundle-static.mjs'
import { buildReport } from '../src/report.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CHECKER = path.join(HERE, '..', 'bin', 'dsh-plugin-verify.mjs')
const ANCHOR = {
  repo: 'test', commit: '0'.repeat(40), scanner: 'test', dsh: '0.2.2-rc.1',
  cordis: '4.0.6-alpha.1', runtime: null, runtimeSource: 'cli', hostVersion: null, suspect: false,
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

test('DSC-10: a bounded scan that stops before the entry is partial, never ERROR', () => {
  const dir = tempDir('dsh-large-scan-')
  try {
    const files = {}
    for (let index = 0; index < 405; index += 1) files[`src/a${String(index).padStart(3, '0')}.js`] = 'export const x = 1\n'
    files['src/zz-entry.js'] = 'export function apply() {}\n'
    writeFiles(dir, files)
    const { sources, scan } = readSourcesWithStats(dir)
    assert.equal(scan.truncated, true)
    assert.equal(scan.files, 400)
    assert.equal(sources.some(source => source.relative === 'src/zz-entry.js'), false)
    const check = checkImportTimeAdvisory(sources, 'src/zz-entry.js', scan)
    assert.equal(check.result, 'NA', check.reason)
    assert.equal(check.coverage, 'partial')
    assert.match(check.reason, /truncated at 400 files \/ 2000000 bytes; entry may be beyond the scan/)
    assert.ok(check.details.some(item => item.item === 'C-10.3' && item.result === 'NA'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('DSC-10: a truncated scan with the entry inside is partial, not a clean pass', () => {
  const dir = tempDir('dsh-truncated-entry-')
  try {
    const files = { 'a-entry.js': 'export function apply() {}\n' }
    for (let index = 0; index < 20; index += 1) files[`src/b${String(index).padStart(2, '0')}.js`] = 'export const x = 1\n'
    writeFiles(dir, files)
    const { sources, scan } = readSourcesWithStats(dir, { maxFiles: 5, maxBytes: 1_000_000 })
    assert.equal(scan.truncated, true)
    const check = checkImportTimeAdvisory(sources, 'a-entry.js', scan)
    assert.equal(check.result, 'PASS', check.reason)
    assert.equal(check.coverage, 'partial')
    assert.match(check.reason, /truncated at 5 files \/ 1000000 bytes; entry may be beyond the scan/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI: --max-files surfaces DSC-10 partial in notChecked with howToEnable', () => {
  const dir = tempDir('dsh-scan-cli-')
  try {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: '@fixtures/large-scan',
        version: '1.0.0',
        license: 'MIT',
        main: './z-entry.js',
        exports: { '.': './z-entry.js' },
        engines: { dsh: '>=0.2.2-0 <0.3.0' },
        dsh: { kind: 'plugin', capabilities: [], labels: [] },
      }, null, 2),
      'z-entry.js': 'export function apply() {}\n',
    })
    for (let index = 0; index < 40; index += 1) {
      fs.writeFileSync(path.join(dir, `a${String(index).padStart(3, '0')}.js`), 'export const x = 1\n')
    }
    const run = spawnSync(process.execPath, [CHECKER, dir, '--format', 'json', '--scope', 'entry', '--entry-claim', 'static', '--no-exec', '--runtime-version', '0.2.2-rc.1', '--max-files', '20', '--max-bytes', '100000'], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(run.status, 0, run.stderr)
    const report = JSON.parse(run.stdout)
    const dsc10 = report.checks.find(item => item.id === 'DSC-10')
    assert.equal(dsc10.result, 'NA', dsc10.reason)
    assert.equal(dsc10.coverage, 'partial')
    assert.doesNotMatch(dsc10.reason, /entry module .* was not found/)
    const row = report.notChecked.find(item => item.id === 'DSC-10')
    assert.ok(row, JSON.stringify(report.notChecked))
    assert.equal(row.coverage, 'partial')
    assert.match(row.howToEnable, /--max-files/)
    assert.ok(report.coverage.partial >= 1)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('report: NA/ERROR findings carry reason + howToEnable and never ruleMissing', () => {
  const checks = [
    { id: 'DSC-01', clause: 'C-1', layer: 'L0', result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [] },
    { id: 'DSC-02', clause: 'C-2', layer: 'L0', result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [] },
    { id: 'DSC-03', clause: 'C-3', layer: 'L0', result: 'NA', coverage: 'not-run', reason: 'install spec not supplied', details: [], evidence: [] },
    { id: 'DSC-04', clause: 'C-4', layer: 'L1', result: 'PASS', coverage: 'partial', reason: 'static subset passed; runtime not run', details: [], evidence: [] },
    { id: 'DSC-14', clause: 'C-14', layer: 'L1', result: 'ERROR', coverage: 'not-run', reason: 'bundle runtime requires --host <dir>', details: [], evidence: [] },
  ]
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'bundle', kindInferred: false, name: 'x', version: '1.0.0', path: HERE },
    anchor: ANCHOR,
    checks,
    scope: 'entry',
    profile: 'package',
    kind: 'bundle',
    entryClaim: 'static',
  })
  const dsc03 = report.notChecked.find(item => item.id === 'DSC-03')
  assert.equal(dsc03.coverage, 'not-run')
  assert.match(dsc03.howToEnable, /--install-spec/)
  const dsc14 = report.notChecked.find(item => item.id === 'DSC-14')
  assert.match(dsc14.reason, /--host/)
  assert.match(dsc14.howToEnable, /--host/)
  const dsc04 = report.notChecked.find(item => item.id === 'DSC-04')
  assert.equal(dsc04.coverage, 'partial')
  assert.match(dsc04.howToEnable, /--runtime|--treat-as-plugin/)
  assert.equal(report.buckets.partial.length, 1)
  assert.equal(report.coverage.partial, 1)
  assert.deepEqual(report.advice, [])
})

function bundlePackage() {
  const dir = tempDir('dsh-bundle-static-')
  const manifest = {
    name: '@fixtures/static-bundle',
    version: '1.0.0',
    license: 'MIT',
    main: './lib/index.js',
    exports: { '.': './lib/index.js', './client': './lib/client.js' },
    peerDependencies: { '@deepseek-ai/dsh': '>=0.2.2-0 <0.3.0' },
    dsh: {
      kind: 'bundle',
      bundle: { patch: './cordis.patch.yml' },
      client: { platform: 'web', inject: [] },
      capabilities: [],
      labels: [],
    },
  }
  writeFiles(dir, {
    'package.json': JSON.stringify(manifest, null, 2),
    'lib/index.js': "import { Service } from './service.js'\nexport const provide = ['fixture']\n",
    'lib/service.js': 'export class Service {}\n',
    'lib/client.js': 'export function apply() {}\n',
    'cordis.patch.yml': "- insert:\n    - id: fixture\n      name: '@fixtures/static-bundle'\n",
  })
  return dir
}

test('advice: C-2.2 points at a floor that includes the report anchor', () => {
  const checks = [
    { id: 'DSC-01', clause: 'C-1', layer: 'L0', result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [] },
    {
      id: 'DSC-02', clause: 'C-2', layer: 'L0', result: 'WARN', coverage: 'full', reason: 'C-2.2 mismatch',
      details: [{ item: 'C-2.2', result: 'FAIL', reason: 'engines.dsh is valid but does not satisfy runtime 0.2.1-rc.5', evidence: ['package.json#engines.dsh'] }],
      evidence: [], advisory: false,
    },
  ]
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: HERE },
    anchor: { ...ANCHOR, dsh: '0.2.1-rc.5', runtimeSource: 'host', hostVersion: '0.2.1-rc.5', suspect: false },
    checks,
    scope: 'entry',
    profile: 'package',
    kind: 'plugin',
    entryClaim: 'static',
  })
  const item = report.advice.find(entry => entry.key === 'C-2.2')
  assert.ok(item, JSON.stringify(report.advice))
  assert.match(item.fix, />=0\.2\.1-0/)
  assert.match(item.fix, /--runtime-version 0\.2\.1-rc\.5/)
  assert.equal(item.ruleMissing, undefined)
})

test('DSC-04..09: a bundle gets partial static coverage, not six NA rows', () => {
  const dir = bundlePackage()
  try {
    const result = runManifestChecks(dir, { runtimeVersion: '0.2.2-rc.1' })
    const { sources, scan } = readSourcesWithStats(dir)
    const checks = runStaticBundleChecks({ manifest: result.manifest, kind: result.kind, entry: result.entry, patch: result.patch, sources, g4: result.g4, scan, dir })
    assert.deepEqual(checks.map(item => item.id), ['DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09'])
    for (const item of checks) {
      assert.equal(item.coverage, 'partial', `${item.id} must be partial`)
      assert.notEqual(item.result, 'NA', `${item.id} must produce a static conclusion`)
      assert.match(item.reason, /--host|--runtime/)
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('DSC-04..09: CLI entry/static/no-exec checks 12/14 with partial rows and enable hints', () => {
  const dir = bundlePackage()
  try {
    const run = spawnSync(process.execPath, [CHECKER, dir, '--format', 'json', '--scope', 'entry', '--entry-claim', 'static', '--no-exec', '--runtime-version', '0.2.2-rc.1'], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(run.status, 0, run.stderr)
    const report = JSON.parse(run.stdout)
    assert.equal(report.coverage.checked, 12, JSON.stringify(report.coverage))
    assert.equal(report.buckets.partial.length, 6)
    for (const id of ['DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09']) {
      const check = report.checks.find(item => item.id === id)
      assert.equal(check.result, 'PASS', `${id}: ${check.reason}`)
      assert.equal(check.coverage, 'partial')
      const row = report.notChecked.find(item => item.id === id)
      assert.ok(row, `${id} missing from notChecked`)
      assert.match(row.howToEnable, /--host|--runtime/)
    }
    assert.equal(report.notChecked.some(item => item.id === 'DSC-14' && /--host/.test(item.howToEnable)), true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('DSC-04 static subset: a missing patch file is FAIL, not a silent NA', () => {
  const dir = tempDir('dsh-bundle-missing-patch-')
  try {
    writeFiles(dir, {
      'package.json': JSON.stringify({
        name: '@fixtures/missing-patch',
        version: '1.0.0',
        license: 'MIT',
        dsh: { kind: 'bundle', bundle: { patch: './missing.patch.yml' }, capabilities: [], labels: [] },
      }),
      'index.js': 'export function apply() {}\n',
    })
    const result = runManifestChecks(dir, { runtimeVersion: '0.2.2-rc.1' })
    const { sources, scan } = readSourcesWithStats(dir)
    const checks = runStaticBundleChecks({ manifest: result.manifest, kind: result.kind, entry: result.entry, patch: result.patch, sources, g4: result.g4, scan, dir })
    const dsc04 = checks.find(item => item.id === 'DSC-04')
    assert.equal(dsc04.result, 'FAIL')
    assert.equal(dsc04.coverage, 'partial')
    assert.match(dsc04.reason, /patch file is missing/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

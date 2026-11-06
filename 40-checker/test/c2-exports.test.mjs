import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runManifestChecks } from '../src/manifest.mjs'

function packageDir(manifest, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-c2-exports-'))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest, null, 2))
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), text)
  }
  return dir
}

function detailOf(check, item) {
  return check.details.filter(entry => entry.item === item)
}

const BASE = {
  name: '@fixtures/c2-exports',
  version: '1.0.0',
  license: 'MIT',
  main: './index.js',
  exports: { '.': './index.js' },
  dsh: { kind: 'plugin', capabilities: [], labels: [] },
}

test('C-2: a legal range with an operator/version space is not an invalid declaration', () => {
  const dir = packageDir({ ...BASE, engines: { dsh: '>= 0.2.2-rc.1 < 0.2.3' } }, { 'index.js': 'export function apply() {}\n' })
  try {
    const atOlder = runManifestChecks(dir, { runtimeVersion: '0.2.1-rc.5' }).checks.find(item => item.id === 'DSC-02')
    assert.equal(detailOf(atOlder, 'C-2.1').every(entry => entry.result !== 'FAIL'), true, JSON.stringify(atOlder.details))
    assert.ok(detailOf(atOlder, 'C-2.2').some(entry => entry.result === 'FAIL'), 'older runtime is a compatibility finding')
    assert.match(atOlder.reason, /C-2\.2/)

    const atTarget = runManifestChecks(dir, { runtimeVersion: '0.2.2-rc.1' }).checks.find(item => item.id === 'DSC-02')
    assert.equal(atTarget.result, 'PASS', JSON.stringify(atTarget.details))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('C-2: >=0.2.2-0 and ^0.2.2-alpha.2 use correct prerelease semantics', () => {
  for (const range of ['>=0.2.2-0 <0.3.0', '^0.2.2-alpha.2']) {
    const dir = packageDir({ ...BASE, engines: { dsh: range } }, { 'index.js': 'export function apply() {}\n' })
    try {
      const older = runManifestChecks(dir, { runtimeVersion: '0.2.1-rc.5' }).checks.find(item => item.id === 'DSC-02')
      assert.ok(detailOf(older, 'C-2.1').every(entry => entry.result !== 'FAIL'), `${range} must parse as valid`)
      assert.ok(detailOf(older, 'C-2.2').some(entry => entry.result === 'FAIL'), `${range} excludes 0.2.1-rc.5`)

      const target = runManifestChecks(dir, { runtimeVersion: '0.2.2-rc.1' }).checks.find(item => item.id === 'DSC-02')
      assert.equal(target.result, 'PASS', `${range}: ${JSON.stringify(target.details)}`)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
})

test('C-2: a valid but unsatisfied peer range is C-2.2, not C-2.1', () => {
  const manifest = {
    name: '@fixtures/c2-peer',
    version: '1.0.0',
    license: 'MIT',
    main: './index.js',
    exports: { '.': './index.js' },
    peerDependencies: { '@deepseek-ai/dsh': '>=0.2.2-0 <0.3.0' },
    dsh: { kind: 'plugin', capabilities: [], labels: [] },
  }
  const dir = packageDir(manifest, { 'index.js': 'export function apply() {}\n' })
  try {
    const older = runManifestChecks(dir, { runtimeVersion: '0.2.1-rc.5' }).checks.find(item => item.id === 'DSC-02')
    assert.ok(detailOf(older, 'C-2.1').every(entry => entry.result !== 'FAIL'), JSON.stringify(older.details))
    assert.ok(detailOf(older, 'C-2.2').some(entry => entry.result === 'FAIL'))

    const target = runManifestChecks(dir, { runtimeVersion: '0.2.2-rc.1' }).checks.find(item => item.id === 'DSC-02')
    assert.equal(target.result, 'PASS', JSON.stringify(target.details))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('DSC-01: exports["./client"] must point at an existing file', () => {
  const dir = packageDir({
    ...BASE,
    exports: { '.': './index.js', './client': './missing-client.js' },
    dsh: { kind: 'client', client: { platform: 'web' }, capabilities: [], labels: [] },
  }, { 'index.js': 'export function apply() {}\n' })
  try {
    const { checks, g4 } = runManifestChecks(dir)
    const dsc01 = checks.find(item => item.id === 'DSC-01')
    assert.equal(dsc01.result, 'FAIL', dsc01.reason)
    assert.ok(detailOf(dsc01, 'C-1.2').some(entry => entry.result === 'FAIL' && /missing file/.test(entry.reason)), JSON.stringify(dsc01.details))
    assert.equal(g4.result, 'FAIL')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('DSC-01: a bundle with a missing client target fails too', () => {
  const dir = packageDir({
    ...BASE,
    exports: { '.': './index.js', './client': './missing-client.js' },
    dsh: { kind: 'bundle', bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' }, capabilities: [], labels: [] },
  }, { 'index.js': 'export function apply() {}\n', 'cordis.patch.yml': "- insert:\n    - id: self\n      name: '@fixtures/c2-exports'\n" })
  try {
    const { checks } = runManifestChecks(dir)
    const dsc01 = checks.find(item => item.id === 'DSC-01')
    assert.equal(dsc01.result, 'FAIL', dsc01.reason)
    assert.ok(detailOf(dsc01, 'C-1.2').some(entry => /missing file/.test(entry.reason)), JSON.stringify(dsc01.details))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('DSC-01: main pointing at a missing file fails even when the root export resolves', () => {
  const dir = packageDir({ ...BASE, main: './missing-main.js' }, { 'index.js': 'export function apply() {}\n' })
  try {
    const { checks } = runManifestChecks(dir)
    const dsc01 = checks.find(item => item.id === 'DSC-01')
    assert.equal(dsc01.result, 'FAIL', dsc01.reason)
    assert.ok(detailOf(dsc01, 'C-1.2').some(entry => entry.result === 'FAIL' && /main points to a missing file/.test(entry.reason)), JSON.stringify(dsc01.details))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

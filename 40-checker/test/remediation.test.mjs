import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import remediationSpec from '../../spec/remediation.json' with { type: 'json' }
import packageJson from '../../package.json' with { type: 'json' }
import { DOCS_BASE, joinAdvice } from '../src/remediation.mjs'
import { buildReport } from '../src/report.mjs'
import { runManifestChecks } from '../src/manifest.mjs'
import { checkCapabilities, checkCredentials, checkImportTimeAdvisory, checkLabels } from '../src/declarations.mjs'
import { readSources } from '../src/util.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.join(here, '..', 'src')
const fixturesDir = path.join(here, '..', 'fixtures')
const guideDocs = process.env.DSH_GUIDE_DOCS
  ? path.resolve(process.env.DSH_GUIDE_DOCS)
  : path.resolve(here, '..', '..', '..', 'dsh-plugin-guide', 'docs')
const RULES = remediationSpec

function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-')
}

function headingSlugs(text) {
  const slugs = new Set()
  let fence = null
  for (const line of text.split(/\r?\n/)) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line)
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1][0]
      else if (fence === fenceMatch[1][0]) fence = null
      continue
    }
    if (fence !== null) continue
    // Explicit HTML anchors are valid targets too (older docs predate heading-only slugs).
    const explicit = /<a\s+id="([^"]+)"/.exec(line)
    if (explicit) slugs.add(explicit[1])
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (match) slugs.add(slugify(match[2]))
  }
  return slugs
}

/** The key set the checker can emit: C-x[.y] literals, clause values, G0-G4. */
function checkerUniverse() {
  const keys = new Set()
  for (const file of fs.readdirSync(srcDir).filter(name => name.endsWith('.mjs'))) {
    const text = fs.readFileSync(path.join(srcDir, file), 'utf8')
    for (const match of text.matchAll(/'((?:C-\d+)(?:\.\d+)*)'/g)) keys.add(match[1])
    for (const match of text.matchAll(/item:\s*'(G[0-4])'/g)) keys.add(match[1])
  }
  for (const gate of ['G0', 'G1', 'G2', 'G3', 'G4']) keys.add(gate)
  return keys
}

function runtimeNotRun() {
  const meta = {
    'DSC-04': ['C-4', 'L1'], 'DSC-05': ['C-5', 'L1'], 'DSC-06': ['C-6', 'L1+L2'],
    'DSC-07': ['C-7', 'L2'], 'DSC-08': ['C-8', 'L3'], 'DSC-09': ['C-9', 'L1'],
  }
  return Object.entries(meta).map(([id, [clause, layer]]) => ({
    id, clause, layer, method: 'M', advisory: false,
    result: 'ERROR', coverage: 'not-run', reason: 'test: runtime not run', details: [], evidence: [],
  }))
}

function staticReportFor(dir) {
  const result = runManifestChecks(dir)
  const sources = readSources(dir)
  const declaration = result.manifest
    ? [
        checkCapabilities(result.manifest, sources, result.patch),
        checkCredentials(result.manifest, sources),
        checkLabels(result.manifest, sources),
      ].map(item => (item.result === 'WARN' && ['DSC-11', 'DSC-13'].includes(item.id) ? { ...item, advisory: true } : item))
    : [
        { id: 'DSC-11', clause: 'C-11', layer: 'L0', method: 'M', advisory: false, result: 'ERROR', coverage: 'not-run', reason: 'manifest unavailable', details: [], evidence: [] },
        { id: 'DSC-12', clause: 'C-12', layer: 'L0', method: 'M', advisory: false, result: 'ERROR', coverage: 'not-run', reason: 'manifest unavailable', details: [], evidence: [] },
        { id: 'DSC-13', clause: 'C-13', layer: 'L0', method: 'M', advisory: false, result: 'ERROR', coverage: 'not-run', reason: 'manifest unavailable', details: [], evidence: [] },
      ]
  const checks = [
    ...result.checks,
    ...runtimeNotRun(),
    { id: 'DSC-14', clause: 'C-14', layer: 'L1', method: 'M', advisory: false, result: 'ERROR', coverage: 'not-run', reason: 'test: runtime not run', details: [], evidence: [] },
    checkImportTimeAdvisory(sources, result.entry?.relative),
    ...declaration,
  ]
  if (result.g4?.result === 'FAIL') {
    const dsc01 = checks.find(item => item.id === 'DSC-01')
    if (dsc01 && dsc01.result !== 'FAIL') {
      dsc01.result = 'FAIL'
      dsc01.reason = dsc01.reason ? `${dsc01.reason}; ${result.g4.reason}` : result.g4.reason
      dsc01.details = [...(dsc01.details ?? []), { item: 'G4', result: 'FAIL', reason: result.g4.reason }]
    }
  }
  return buildReport({
    subject: {
      mode: 'package', profile: 'package', kind: result.kind, kindInferred: true,
      name: result.manifest?.name ?? null, version: result.manifest?.version ?? null, path: dir,
    },
    anchor: { repo: 'test', commit: '0'.repeat(40), scanner: 'test', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks,
    g4: result.g4,
    scope: 'ds-c',
    profile: 'package',
    kind: result.kind,
  })
}

test('remediation table covers every checker key exactly', () => {
  const universe = checkerUniverse()
  const keys = new Set(Object.keys(RULES))
  const missing = [...universe].filter(key => !keys.has(key)).sort()
  const extra = [...keys].filter(key => !universe.has(key)).sort()
  assert.deepEqual(missing, [], `missing remediation rules: ${missing.join(', ')}`)
  assert.deepEqual(extra, [], `stale remediation rules: ${extra.join(', ')}`)
  assert.ok(universe.size > 0)
})

test('remediation rules have the required shape', () => {
  assert.equal(DOCS_BASE, 'https://github.com/PerryLink/dsh-plugin-guide/blob/v0.4.4/')
  assert.equal(packageJson.version, '1.2.0')
  assert.ok(Object.keys(RULES).length > 0)
  for (const [key, rule] of Object.entries(RULES)) {
    assert.match(key, /^(?:C-\d+(?:\.\d+)*|G[0-4])$/)
    for (const field of ['title', 'why', 'fix']) {
      assert.equal(typeof rule[field], 'string', `${key}.${field}`)
      assert.ok(rule[field].trim().length > 0, `${key}.${field} is empty`)
    }
    assert.match(rule.docs, /^docs\/[a-z]+\.md#[a-z0-9-]+$/, `${key}.docs`)
    assert.ok(['fail', 'warn', 'advisory'].includes(rule.severityHint), `${key}.severityHint`)
  }
})

test('advice on every fixture has a rule (no ruleMissing)', () => {
  const dirs = fs.readdirSync(fixturesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(fixturesDir, entry.name))
    .filter(dir => fs.existsSync(path.join(dir, 'package.json')))
  assert.ok(dirs.length >= 20, `expected fixture packages, got ${dirs.length}`)
  let total = 0
  for (const dir of dirs) {
    const report = staticReportFor(dir)
    assert.ok(Array.isArray(report.advice), `${path.basename(dir)}: advice is not an array`)
    const missing = report.advice.filter(item => item.ruleMissing)
    assert.deepEqual(missing.map(item => `${item.source}:${item.key}`), [], `${path.basename(dir)}: ruleMissing`)
    for (const item of report.advice) {
      assert.ok(item.docsUrl, `${path.basename(dir)}: ${item.key} has no docsUrl`)
      assert.equal(item.docsUrl, `${DOCS_BASE}${RULES[item.key].docs}`, `${path.basename(dir)}: ${item.key} docsUrl`)
      assert.equal(item.version, packageJson.version)
      assert.ok(['FAIL', 'WARN'].includes(item.severity))
    }
    total += report.advice.length
  }
  assert.ok(total > 0, 'fixtures produced no advice; the test would be vacuous')
})

test('runtime FAIL without details falls back to check.clause', () => {
  const checks = [
    {
      id: 'DSC-04', clause: 'C-4', layer: 'L1', result: 'FAIL', coverage: 'full',
      reason: 'load failed: boom', details: [], evidence: ['index.mjs:1'], method: 'M', advisory: false,
    },
    {
      id: 'DSC-14', clause: 'C-14', layer: 'L1', result: 'FAIL', coverage: 'full',
      reason: 'runtime failed', details: [], evidence: ['index.mjs:1'], method: 'M', advisory: false,
    },
  ]
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks,
    scope: 'ds-c',
    profile: 'package',
    kind: 'plugin',
  })
  const c4 = report.advice.find(item => item.source === 'DSC-04')
  const c14 = report.advice.find(item => item.source === 'DSC-14')
  assert.equal(c4.key, 'C-4')
  assert.equal(c4.severity, 'FAIL')
  assert.equal(c4.version, '1.2.0')
  assert.deepEqual(c4.evidence, ['index.mjs:1'])
  assert.equal(c4.docsUrl, `${DOCS_BASE}docs/levels.md#entry`)
  assert.equal(c14.key, 'C-14')
  assert.equal(c14.docsUrl, `${DOCS_BASE}docs/entry.md#the-two-claims`)
})

test('advice uses detail severity even when the check was adjusted to WARN', () => {
  const checks = [
    { id: 'DSC-01', clause: 'C-1', layer: 'L0', result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [] },
    {
      id: 'DSC-02', clause: 'C-2', layer: 'L0', result: 'FAIL', coverage: 'full', reason: '',
      details: [{ item: 'C-2.1', result: 'FAIL', reason: 'no engines', evidence: ['package.json#engines'] }],
      evidence: [], advisory: false,
    },
    { id: 'DSC-11', clause: 'C-11', layer: 'L0', result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [] },
    { id: 'DSC-12', clause: 'C-12', layer: 'L0', result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [] },
    { id: 'DSC-13', clause: 'C-13', layer: 'L0', result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [] },
    { id: 'DSC-14', clause: 'C-14', layer: 'L1', result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [] },
  ]
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks,
    scope: 'entry',
    profile: 'package',
    kind: 'plugin',
  })
  assert.equal(report.checks.find(item => item.id === 'DSC-02').result, 'WARN')
  const item = report.advice.find(entry => entry.key === 'C-2.1')
  assert.equal(item.severity, 'FAIL')
  assert.equal(item.source, 'DSC-02')
  assert.match(item.reason, /no engines/)
})

test('duplicate details merge evidence and count once per check and key', () => {
  const checks = [{
    id: 'DSC-11', clause: 'C-11', layer: 'L0', result: 'WARN', coverage: 'full', reason: '',
    details: [
      { item: 'C-11.2', result: 'WARN', reason: 'trigger tools', evidence: ['a.mjs:1'] },
      { item: 'C-11.1', result: 'WARN', reason: 'missing capabilities', evidence: ['package.json#dsh.capabilities'] },
      { item: 'C-11.2', result: 'WARN', reason: 'trigger web', evidence: ['b.mjs:2'] },
    ],
    evidence: [], advisory: true,
  }]
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks,
    scope: 'ds-c',
    profile: 'package',
    kind: 'plugin',
  })
  const merged = report.advice.find(item => item.key === 'C-11.2')
  assert.ok(merged)
  assert.equal(merged.occurrences, 2)
  assert.deepEqual(merged.evidence, ['a.mjs:1', 'b.mjs:2'])
  assert.equal(merged.advisory, true)
  assert.equal(report.advice.filter(item => item.source === 'DSC-11').length, 2)
})

test('buildReport includes advice by default and omits it on advice:false', () => {
  const base = {
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks: [],
    scope: 'ds-c',
    profile: 'package',
    kind: 'plugin',
  }
  const on = buildReport(base)
  const off = buildReport({ ...base, advice: false })
  assert.ok(Array.isArray(on.advice))
  assert.equal(on.advice.length, 0)
  assert.equal(Object.hasOwn(off, 'advice'), false)
})

test('every rule docs anchor exists in the local guide repository', t => {
  if (!fs.existsSync(guideDocs)) {
    t.skip(`guide docs not checked out at ${guideDocs}`)
    return
  }
  const cache = new Map()
  for (const [key, rule] of Object.entries(RULES)) {
    const hash = rule.docs.indexOf('#')
    const file = rule.docs.slice(0, hash)
    const anchor = rule.docs.slice(hash + 1)
    assert.ok(hash > 0 && !anchor.includes('#'), `${key}: docs must be <file>#<anchor>`)
    const relative = file.replace(/^docs\//, '')
    const absolute = path.join(guideDocs, relative)
    assert.ok(fs.existsSync(absolute), `${key}: missing guide file ${file}`)
    if (!cache.has(file)) cache.set(file, headingSlugs(fs.readFileSync(absolute, 'utf8')))
    assert.ok(cache.get(file).has(anchor), `${key}: missing anchor ${rule.docs}`)
  }
})

test('joinAdvice is pure and leaves the report untouched', () => {
  const checks = [{
    id: 'DSC-04', clause: 'C-4', layer: 'L1', result: 'FAIL', coverage: 'full',
    reason: 'load failed', details: [], evidence: ['index.mjs'], method: 'M', advisory: false,
  }]
  const report = {
    checks,
    standard: { id: 'DS-C', version: '1.0.0' },
  }
  const snapshot = JSON.stringify(report)
  const advice = joinAdvice(report, remediationSpec, DOCS_BASE)
  assert.equal(JSON.stringify(report), snapshot)
  assert.equal(advice.length, 1)
  assert.equal(advice[0].key, 'C-4')
  // A flat rule map (no version metadata) still gets the package version.
  const bare = joinAdvice(report, RULES, DOCS_BASE)
  assert.equal(bare[0].version, packageJson.version)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runManifestChecks } from '../src/manifest.mjs'
import { checkCapabilities, checkCredentials, checkLabels } from '../src/declarations.mjs'
import { readSources } from '../src/util.mjs'
import { buildReport } from '../src/report.mjs'
import { parseInstallSpec } from '../src/install-spec.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const good = path.join(here, '..', 'fixtures', 'good')
const bad = path.join(here, '..', 'fixtures', 'bad')

test('good fixture passes manifest and version checks', () => {
  const result = runManifestChecks(good)
  assert.equal(result.kind, 'plugin')
  assert.equal(result.checks[0].id, 'DSC-01')
  assert.equal(result.checks[0].result, 'PASS')
  assert.equal(result.checks[1].result, 'PASS')
  assert.equal(result.checks[2].result, 'NA')
})

test('bad fixture fails version and warns licence', () => {
  const result = runManifestChecks(bad)
  assert.equal(result.checks[0].result, 'WARN')
  assert.equal(result.checks[1].result, 'FAIL')
  assert.match(result.checks[1].reason, /engines\.dsh|peer/)
})

test('good fixture declarations are consistent', () => {
  const result = runManifestChecks(good)
  const sources = readSources(good)
  const caps = checkCapabilities(result.manifest, sources, result.patch)
  const creds = checkCredentials(result.manifest, sources)
  const labels = checkLabels(result.manifest, sources)
  assert.equal(caps.result, 'PASS', caps.reason)
  assert.equal(creds.result, 'PASS', creds.reason)
  assert.equal(labels.result, 'PASS', labels.reason)
})

test('bad fixture rejects official label and unknown capability', () => {
  const result = runManifestChecks(bad)
  const sources = readSources(bad)
  const caps = checkCapabilities(result.manifest, sources, result.patch)
  const labels = checkLabels(result.manifest, sources)
  assert.equal(labels.result, 'FAIL')
  assert.match(labels.reason, /official|forbidden/)
  assert.equal(caps.result, 'WARN')
})

test('parseInstallSpec pins git and rejects floating git', () => {
  const pinned = parseInstallSpec('github:acme/dsh-greet#0123456789abcdef0123456789abcdef01234567')
  assert.equal(pinned.kind, 'git')
  assert.equal(pinned.pinned, true)
  assert.throws(() => parseInstallSpec('github:acme/dsh-greet'), /pin/)
  assert.equal(parseInstallSpec('@acme/dsh-greet@1.2.3').pinned, true)
  assert.equal(parseInstallSpec('@acme/dsh-greet').pinned, false)
})

test('report marks missing mandatory checks as incomplete', () => {
  const checks = [
    { id: 'DSC-01', clause: 'C-1', layer: 'L0', result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [] },
    { id: 'DSC-02', clause: 'C-2', layer: 'L0', result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [] },
  ]
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks,
    scope: 'ds-c',
    profile: 'package',
    kind: 'plugin',
  })
  assert.equal(report.conclusion.status, 'incomplete')
  assert.equal(report.conclusion.exitCode, 2)
  assert.equal(report.conclusion.level, null)
  assert.ok(report.coverage.notRun > 0)
})

test('report passes when all mandatory checks are full and clean', () => {
  const checks = ['DSC-01', 'DSC-02', 'DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09', 'DSC-11', 'DSC-12', 'DSC-13']
    .map(id => ({ id, clause: id.replace('DSC', 'C'), layer: 'L0', result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [] }))
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks,
    scope: 'ds-c',
    profile: 'package',
    kind: 'plugin',
  })
  assert.equal(report.conclusion.status, 'pass')
  assert.equal(report.conclusion.exitCode, 0)
  assert.equal(report.conclusion.level, 'DS-C (package)')
})

test('static-only M1 report maps L1-L3 to NA and issues DS-C static', () => {
  const checks = ['DSC-01', 'DSC-02', 'DSC-03', 'DSC-11', 'DSC-12', 'DSC-13']
    .map(id => ({ id, clause: id.replace('DSC', 'C'), layer: 'L0', result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [] }))
    .concat(['DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09'].map(id => ({ id, clause: id.replace('DSC', 'C'), layer: 'L1', result: 'ERROR', coverage: 'not-run', reason: 'no runtime', details: [], evidence: [] })))
  const report = buildReport({
    subject: { mode: 'listing', profile: 'listing', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks,
    scope: 'ds-c',
    profile: 'listing',
    kind: 'plugin',
    staticOnly: true,
  })
  assert.equal(report.conclusion.status, 'pass')
  assert.equal(report.conclusion.level, 'DS-C static')
  assert.equal(report.conclusion.staticOnly, true)
  assert.equal(report.checks.find(item => item.id === 'DSC-04').result, 'NA')
})

function entryChecks(overrides = {}) {
  const make = (id, clause, result = 'PASS', details = []) => ({ id, clause, layer: 'L0', result, coverage: result === 'ERROR' ? 'not-run' : 'full', reason: '', details, evidence: [] })
  return [
    make('DSC-01', 'C-1'),
    make('DSC-02', 'C-2', overrides.c2Result ?? 'PASS', overrides.c2Details ?? []),
    make('DSC-11', 'C-11'),
    make('DSC-12', 'C-12'),
    make('DSC-13', 'C-13'),
    make('DSC-14', 'C-14', overrides.runResult ?? 'PASS'),
  ]
}

test('entry: C-2.1 only is WARN, runtime level', () => {
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks: entryChecks({ c2Result: 'FAIL', c2Details: [{ item: 'C-2.1', result: 'FAIL', reason: 'no engines' }] }),
    scope: 'entry', profile: 'package', kind: 'plugin',
  })
  assert.equal(report.conclusion.status, 'warn')
  assert.equal(report.conclusion.level, 'DSH-ENTRY runtime (warnings)')
})

test('entry: C-2.2 remains blocking', () => {
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks: entryChecks({ c2Result: 'FAIL', c2Details: [{ item: 'C-2.2', result: 'FAIL', reason: 'peer mismatch' }] }),
    scope: 'entry', profile: 'package', kind: 'plugin',
  })
  assert.equal(report.conclusion.status, 'fail')
  assert.ok(report.coverage.entryBlocking.failed.includes('C-2.2'))
})

test('entry: no runtime is incomplete, not static pass', () => {
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks: entryChecks({ runResult: 'ERROR' }),
    scope: 'entry', profile: 'package', kind: 'plugin',
  })
  assert.equal(report.conclusion.status, 'incomplete')
  assert.equal(report.conclusion.exitCode, 2)
  assert.equal(report.conclusion.level, null)
})

test('entry: static claim recognizes without runtime', () => {
  const checks = entryChecks().filter(c => c.id !== 'DSC-14')
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks,
    scope: 'entry', profile: 'package', kind: 'plugin', entryClaim: 'static',
  })
  assert.equal(report.conclusion.status, 'pass')
  assert.equal(report.conclusion.level, 'DSH-ENTRY recognized')
  assert.equal(report.conclusion.exitCode, 0)
})

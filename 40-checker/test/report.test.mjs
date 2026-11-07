import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildReport, formatText, summarizeBlocking } from '../src/report.mjs'
import { detectHostRuntime, resolveRuntimeAnchor } from '../src/cli.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GOOD = path.join(HERE, '..', 'fixtures', 'good')
const CHECKER = path.join(HERE, '..', 'bin', 'dsh-plugin-verify.mjs')
const ANCHOR = {
  repo: 'test', commit: '0'.repeat(40), scanner: 'test', dsh: '0.2.1-rc.5',
  cordis: '4.0.6-alpha.1', runtime: null, runtimeSource: 'host', hostVersion: '0.2.1-rc.5', suspect: false,
}

function row(id, clause, result, extra = {}) {
  return {
    id, clause, layer: 'L0', result,
    coverage: extra.coverage ?? (result === 'NA' || result === 'ERROR' ? 'not-run' : 'full'),
    reason: extra.reason ?? `${id} ${result}`,
    details: extra.details ?? [],
    evidence: [],
    advisory: extra.advisory ?? false,
  }
}

/** A realistic 14-check run: six evaluated, six not run, two NA by design. */
function fourteenChecks() {
  return [
    row('DSC-01', 'C-1', 'PASS', { details: ['C-1.1', 'C-1.2', 'C-1.4'].map(id => ({ item: id, result: 'PASS', reason: 'ok' })) }),
    row('DSC-02', 'C-2', 'WARN', { details: [{ item: 'C-2.2', result: 'FAIL', reason: 'engines.dsh misses the host' }] }),
    row('DSC-03', 'C-3', 'NA', { reason: 'install spec not supplied' }),
    row('DSC-04', 'C-4', 'ERROR', { reason: '--no-exec' }),
    row('DSC-05', 'C-5', 'ERROR', { reason: '--no-exec' }),
    row('DSC-06', 'C-6', 'ERROR', { reason: '--no-exec' }),
    row('DSC-07', 'C-7', 'ERROR', { reason: '--no-exec' }),
    row('DSC-08', 'C-8', 'ERROR', { reason: '--no-exec' }),
    row('DSC-09', 'C-9', 'ERROR', { reason: '--no-exec' }),
    row('DSC-10', 'C-10', 'PASS', { advisory: true }),
    row('DSC-11', 'C-11', 'WARN', { advisory: true, details: [{ item: 'C-11.1', result: 'WARN', reason: 'capabilities absent' }] }),
    row('DSC-12', 'C-12', 'WARN', { details: [{ item: 'C-12.4', result: 'WARN', reason: 'danger-full-access literal' }] }),
    row('DSC-13', 'C-13', 'PASS', { advisory: true }),
    row('DSC-14', 'C-14', 'NA', { reason: 'entry static claim' }),
  ]
}

function reportOf(checks, overrides = {}) {
  return buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: HERE },
    anchor: ANCHOR,
    checks,
    scope: 'entry',
    profile: 'package',
    kind: 'plugin',
    entryClaim: 'static',
    declarations: { total: 5, present: ['capabilities', 'engines.dsh'] },
    ...overrides,
  })
}

test('coverage counts all 14 checks, not only the mandatory subset', () => {
  const report = reportOf(fourteenChecks())
  assert.equal(report.coverage.total, 14)
  assert.equal(report.coverage.pass, 3)
  assert.equal(report.coverage.warn, 3)
  assert.equal(report.coverage.na, 2)
  assert.equal(report.coverage.notRun, 6)
  assert.equal(report.coverage.error, 6)
  assert.equal(report.metrics.checked, 6)
  assert.equal(report.metrics.total, 14)
  assert.equal(report.metrics.declaredFields, 2)
  assert.deepEqual(
    { blocking: report.buckets.blocking.length, hygiene: report.buckets.hygiene.length, notChecked: report.buckets.notChecked.length },
    { blocking: 0, hygiene: 3, notChecked: 8 },
  )
  assert.match(report.conclusion.headline, /blocking 0 .*hygiene 3 .*not checked 8\/14/)
})

test('hygiene tags declaration-class WARNs and leaves runtime WARNs untagged', () => {
  const report = reportOf(fourteenChecks())
  const byId = new Map(report.buckets.hygiene.map(item => [item.id, item]))
  assert.equal(byId.get('DSC-11').declaration, true)
  assert.equal(byId.get('DSC-12').declaration, true)
  assert.equal(byId.get('DSC-02').declaration, false)
  assert.equal(byId.get('DSC-11').advisory, true)
})

test('entryBlocking never passes while C-3.1/3.2/3.5 were not checked', () => {
  const checks = fourteenChecks().map(item => (item.id === 'DSC-01'
    ? { ...item, details: ['C-1.1', 'C-1.2', 'C-1.4'].map(id => ({ item: id, result: 'PASS', reason: 'ok' })) }
    : item))
  const report = reportOf(checks)
  assert.equal(report.coverage.entryBlocking.required, 6)
  assert.deepEqual(report.coverage.entryBlocking.checked, ['C-1.1', 'C-1.2', 'C-1.4'])
  assert.deepEqual(report.coverage.entryBlocking.notChecked, ['C-3.1', 'C-3.2', 'C-3.5'])
  assert.equal(report.coverage.entryBlocking.pass, false)
})

test('entryBlocking passes only when every prerequisite produced a detail row', () => {
  const checks = fourteenChecks().map(item => {
    if (item.id === 'DSC-01') return { ...item, details: ['C-1.1', 'C-1.2', 'C-1.4'].map(id => ({ item: id, result: 'PASS', reason: 'ok' })) }
    if (item.id === 'DSC-03') return { ...item, result: 'PASS', coverage: 'full', details: ['C-3.1', 'C-3.2', 'C-3.5'].map(id => ({ item: id, result: 'PASS', reason: 'ok' })) }
    return item
  })
  const report = reportOf(checks)
  assert.equal(report.coverage.entryBlocking.pass, true)
  assert.deepEqual(report.coverage.entryBlocking.notChecked, [])
})

test('text renders the buckets, headline and full coverage', () => {
  const text = formatText(reportOf(fourteenChecks()))
  assert.match(text, /Blocking \(FAIL\) \(0\):/)
  assert.match(text, /Hygiene \(WARN\) \(3\):/)
  assert.match(text, /Partly checked \(static subset\) \(0\):/)
  assert.match(text, /Not checked \(NA \/ not-run \/ ERROR\) \(8\):/)
  assert.match(text, /headline: entry\/package · runtime 0\.2\.1-rc\.5 host/)
  assert.match(text, /coverage: total=14 checked=6 .*notRun=6 .*error=6/)
  assert.match(text, /metrics: checked=6\/14 declaredFields=2\/5/)
  assert.match(text, /entryBlocking: checked=3\/6 .*pass=false/)
})

test('runtime anchor follows an explicit version and is suspect when the host differs', () => {
  assert.deepEqual(resolveRuntimeAnchor('0.2.2-rc.1', '0.2.1-rc.5'), {
    dsh: '0.2.2-rc.1', runtimeSource: 'cli', hostVersion: '0.2.1-rc.5', suspect: true,
  })
  assert.equal(resolveRuntimeAnchor('0.2.1-rc.5', '0.2.1-rc.5').suspect, false)
  assert.equal(resolveRuntimeAnchor('0.2.2-rc.1', null).suspect, false)
  const hostDefault = resolveRuntimeAnchor(null, '0.2.1-rc.5')
  assert.equal(hostDefault.runtimeSource, 'host')
  assert.equal(hostDefault.dsh, '0.2.1-rc.5')
  assert.equal(hostDefault.suspect, false)
  const unknown = resolveRuntimeAnchor(null, null)
  assert.equal(unknown.runtimeSource, 'default')
  assert.ok(unknown.dsh.length > 0)
  assert.equal(unknown.suspect, true, 'a default constant is not a host: it must be marked suspect')
})

test('C-2.3 counts as checked once C-2.2 was evaluated', () => {
  const blocking = ['C-1.1', 'C-1.2', 'C-1.4', 'C-2.2', 'C-2.3', 'C-3.1', 'C-3.2', 'C-3.5']
  const summary = summarizeBlocking([
    { id: 'DSC-01', details: [{ item: 'C-1.1', result: 'PASS' }, { item: 'C-1.2', result: 'PASS' }, { item: 'C-1.4', result: 'PASS' }] },
    { id: 'DSC-02', details: [{ item: 'C-2.2', result: 'PASS' }] },
  ], blocking)
  assert.ok(summary.checked.includes('C-2.2'))
  assert.ok(summary.checked.includes('C-2.3'))
  assert.deepEqual(summary.notChecked, ['C-3.1', 'C-3.2', 'C-3.5'])
  assert.equal(summary.pass, false)
})

test('checker: the default anchor is host-derived or an explicit suspect default', () => {
  const run = spawnSync(process.execPath, [CHECKER, GOOD, '--scope', 'entry', '--entry-claim', 'static', '--no-exec', '--format', 'json'], {
    encoding: 'utf8', timeout: 60_000,
  })
  assert.equal(run.status, 0, run.stderr)
  const report = JSON.parse(run.stdout)
  assert.ok(['host', 'default'].includes(report.anchor.runtimeSource))
  assert.ok(Object.hasOwn(report.anchor, 'hostVersion'))
  assert.equal(typeof report.anchor.suspect, 'boolean')
  if (report.anchor.runtimeSource === 'host') {
    assert.equal(report.anchor.dsh, report.anchor.hostVersion)
    assert.equal(report.anchor.suspect, false)
  } else {
    assert.equal(report.anchor.suspect, true)
    assert.equal(report.checks.find(item => item.id === 'DSC-02').result, 'NA')
  }
  assert.equal(report.coverage.entryBlocking.pass, false, 'C-3.x were not checked, so the blocking gate cannot pass')
})

test('detectHostRuntime reports null rather than inventing a version', () => {
  const missing = detectHostRuntime({ bin: 'dsh-standards-no-such-binary', timeoutMs: 2000 })
  assert.equal(missing.version, null)
  assert.ok(missing.error)
})

function securityRow(id, result, extra = {}) {
  return {
    id,
    clause: id.replace('DSC', 'C'),
    layer: 'L0',
    result,
    coverage: extra.coverage ?? (result === 'NA' || result === 'ERROR' ? 'not-run' : 'full'),
    reason: extra.reason ?? '',
    details: extra.details ?? [],
    evidence: [],
    advisory: ['DSC-18', 'DSC-19', 'DSC-20', 'DSC-22'].includes(id),
  }
}

test('security scope: only DSC-15/16/17 FAILs are blocking and the headline agrees', () => {
  const securityChecks = [
    securityRow('DSC-15', 'FAIL', { details: [{ item: 'C-15.1', result: 'FAIL', reason: 'curl | sh' }] }),
    securityRow('DSC-16', 'PASS'),
    securityRow('DSC-17', 'PASS'),
    securityRow('DSC-18', 'PASS'),
    securityRow('DSC-19', 'PASS'),
    securityRow('DSC-20', 'PASS'),
    securityRow('DSC-21', 'PASS'),
    securityRow('DSC-22', 'PASS'),
  ]
  const checks = [
    ...fourteenChecks().map(item => (item.id === 'DSC-02'
      ? { ...item, result: 'FAIL', reason: 'C-2.2: engines.dsh misses the host' }
      : item)),
    ...securityChecks,
  ]
  const report = reportOf(checks, { scope: 'security', entryClaim: 'runtime', securityChecks })
  assert.equal(report.conclusion.status, 'fail')
  assert.equal(report.conclusion.exitCode, 1)
  assert.deepEqual(report.buckets.blocking.map(item => item.id), ['DSC-15'])
  assert.match(report.conclusion.headline, /blocking 1/)
  assert.equal(report.security.status, 'fail')
  assert.deepEqual(report.security.blocking, ['DSC-15'])
})

test('security scope: a non-security FAIL is not blocking and conclusion.status stays pass', () => {
  const securityChecks = ['DSC-15', 'DSC-16', 'DSC-17', 'DSC-18', 'DSC-19', 'DSC-20', 'DSC-21', 'DSC-22']
    .map(id => securityRow(id, 'PASS'))
  const checks = [
    ...fourteenChecks().map(item => (item.id === 'DSC-02'
      ? { ...item, result: 'FAIL', reason: 'C-2.2: engines.dsh misses the host' }
      : item)),
    ...securityChecks,
  ]
  const report = reportOf(checks, { scope: 'security', entryClaim: 'runtime', securityChecks })
  assert.equal(report.conclusion.status, 'pass')
  assert.equal(report.conclusion.exitCode, 0)
  assert.deepEqual(report.buckets.blocking, [])
  assert.match(report.conclusion.headline, /blocking 0/)
  assert.equal(report.security.status, 'pass')
  const dsc02 = report.buckets.hygiene.find(row => row.id === 'DSC-02')
  assert.ok(dsc02, 'the DSC-02 FAIL must stay visible outside the blocking bucket')
  assert.equal(dsc02.result, 'WARN')
  assert.match(dsc02.reason, /not blocking in --scope security/)
})

test('security scope: security partial coverage is listed with a reason', () => {
  const securityChecks = [
    securityRow('DSC-15', 'PASS'),
    securityRow('DSC-16', 'PASS', { coverage: 'partial', reason: 'partial: 3 package imports outside the closure' }),
    securityRow('DSC-17', 'PASS'),
    securityRow('DSC-18', 'PASS'),
    securityRow('DSC-19', 'PASS'),
    securityRow('DSC-20', 'PASS'),
    securityRow('DSC-21', 'PASS'),
    securityRow('DSC-22', 'PASS'),
  ]
  const report = reportOf(securityChecks, { scope: 'security', entryClaim: 'runtime', securityChecks })
  assert.equal(report.security.status, 'warn')
  assert.deepEqual(report.security.partial, [{ id: 'DSC-16', reason: 'partial: 3 package imports outside the closure' }])
  assert.match(report.conclusion.headline, /partial 1/)
})

test('default scope keeps the old blocking bucket for a mandatory FAIL', () => {
  const checks = fourteenChecks().map(item => (item.id === 'DSC-02'
    ? { ...item, result: 'FAIL', reason: 'C-2.2: engines.dsh misses the host' }
    : item))
  const report = reportOf(checks, { scope: 'ds-c', profile: 'package', entryClaim: 'runtime' })
  assert.equal(report.conclusion.status, 'fail')
  assert.deepEqual(report.buckets.blocking.map(item => item.id), ['DSC-02'])
  assert.match(report.conclusion.headline, /blocking 1/)
})

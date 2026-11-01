/**
 * Schema + raw-row consistency test for the BOOST LEV-1/2/4/5/8 evidence.
 *
 * This intentionally does NOT assert that every practice is supported: a run
 * whose negative control leaks differently must still produce a structurally
 * valid report. It checks that each summary is backed by the raw rows, that the
 * negative control is present, and that the evidence-card meta-check covers all
 * five practices.
 *
 *   node --test examples/boost/lev12458-result.test.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RESULT = path.resolve(HERE, '..', '..', '40-checker', 'results', 'boost', 'lev12458.json')
const PRACTICES = ['LEV-1', 'LEV-2', 'LEV-4', 'LEV-5', 'LEV-8']
const REQUIRED_ROW_KEYS = ['practice', 'level', 'environment', 'input', 'command', 'negativeControl', 'result', 'limitations']

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function quantile(sorted, p) {
  const position = (sorted.length - 1) * p
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return Number(quantile(sorted, 0.5).toFixed(3))
}

function p95(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return Number(quantile(sorted, 0.95).toFixed(3))
}

const result = fs.existsSync(RESULT) ? JSON.parse(fs.readFileSync(RESULT, 'utf8')) : null
const rows = result?.measurements ?? []
const byPractice = Object.fromEntries(rows.map(row => [row.practice, row]))

test('LEV-1/2/4/5/8 result: file, schema, environment, and evidence-card shape', () => {
  assert.ok(result, `missing result: ${RESULT}; run examples/boost/lev12458-bench.mjs first`)
  assert.equal(result.schema, 'dsh-boost-lev12458/1')
  assert.ok(!Number.isNaN(Date.parse(result.generatedAt)), 'generatedAt must be a date')
  assert.ok(Array.isArray(result.command) && result.command.includes('examples/boost/lev12458-bench.mjs'))
  assert.ok(Array.isArray(result.limitations) && result.limitations.length > 0)

  for (const key of ['dsh', 'cordis', 'loader', 'include', 'appBoot']) {
    assert.ok(result.environment?.[key]?.version, `environment.${key}.version`)
    assert.equal(typeof result.environment[key].version, 'string')
  }
  assert.equal(result.environment.dsh.version, '0.2.2-alpha.2')
  assert.equal(result.environment.cordis.version, '4.0.6-alpha.1')
  assert.equal(result.environment.loader.version, '1.0.7-alpha.1')
  assert.ok(result.environment.checkout && 'commit' in result.environment.checkout)
  assert.equal(typeof result.environment.node, 'string')

  assert.deepEqual(rows.map(row => row.practice), PRACTICES)
  for (const row of rows) {
    for (const key of REQUIRED_ROW_KEYS) assert.ok(key in row, `${row.practice}: missing ${key}`)
    assert.ok(['loader-level', 'context-level'].includes(row.level), `${row.practice}: level`)
    assert.ok(['measured', 'not-measured'].includes(row.status), `${row.practice}: status`)
    assert.ok(['supported', 'refuted', 'inconclusive', null].includes(row.result?.verdict ?? null), `${row.practice}: verdict`)
    assert.ok(typeof row.command === 'string' && row.command.includes('lev12458-bench.mjs'))
    assert.ok(row.negativeControl && typeof row.negativeControl === 'object', `${row.practice}: negativeControl`)
    assert.ok(typeof row.negativeControl.description === 'string' && row.negativeControl.description.length > 0)
    assert.ok(Array.isArray(row.limitations) && row.limitations.length > 0)
    assert.ok(row.input && typeof row.input === 'object')
    assert.ok(Array.isArray(row.input.fixtureFiles) && row.input.fixtureFiles.length > 0)
    for (const file of row.input.fixtureFiles) {
      assert.match(file.sha256, /^[a-f0-9]{64}$/, `${row.practice}: fixture hash`)
    }
  }

  assert.equal(result.summary.status, 'measured')
  assert.deepEqual(result.summary.measured, PRACTICES)
  assert.deepEqual(result.summary.notMeasured, [])
  assert.deepEqual(result.summary.verdicts, Object.fromEntries(rows.map(row => [row.practice, row.result.verdict])))
  assert.equal(result.summary.evidenceCard.ok, true)
  assert.deepEqual(result.summary.evidenceCard.checkedPractices, PRACTICES)
  assert.deepEqual(result.summary.evidenceCard.problems, [])
})

test('LEV-1: effect disposers, open timer handles, and latency math are backed by rows', () => {
  const row = byPractice['LEV-1']
  const value = row.result
  assert.equal(row.level, 'loader-level')
  assert.equal(value.runs, row.input.runs)
  for (const arm of ['positive', 'negative']) {
    const data = value[arm]
    assert.equal(data.rows.length, value.runs)
    assert.equal(data.final.state, 2)
    assert.equal(data.final.stateName, 'ACTIVE')
    assert.equal(data.disposed.state, 4)
    assert.deepEqual(data.final.effects, data.baselineEffects)
    assert.equal(data.final.effectsMatchBaseline, true)
    assert.equal(data.final.applies, value.runs + 1)
    assert.equal(data.final.pings, 1)
    assert.equal(data.latencyMs.n, value.runs)
    assert.equal(data.latencyMs.median, median(data.rows.map(item => item.reloadMs)))
    assert.equal(data.latencyMs.p95, p95(data.rows.map(item => item.reloadMs)))
    assert.ok(data.latencyMs.median <= data.latencyMs.p95)
    for (const [index, item] of data.rows.entries()) {
      assert.equal(item.i, index + 1)
      assert.equal(item.state, 2)
      assert.equal(item.stateName, 'ACTIVE')
      assert.ok(isFiniteNumber(item.reloadMs) && item.reloadMs >= 0)
      assert.deepEqual(item.effects, data.baselineEffects)
      assert.equal(item.effectsMatchBaseline, true)
    }
  }
  assert.equal(value.positive.final.timerDisposers, value.runs)
  assert.equal(value.positive.final.openTimers, value.positive.firstOpenTimers)
  assert.equal(value.negative.final.timerDisposers, 0)
  assert.equal(value.negative.final.openTimers - value.negative.firstOpenTimers, value.runs)
  assert.equal(value.negative.disposed.leakedTimersDrained, value.negative.final.openTimers)
  assert.equal(value.positive.disposed.openTimers, 0)
  assert.ok(value.positive.baselineEffects.includes('lev1.timer'))
  assert.ok(!value.negative.baselineEffects.includes('lev1.timer'))
  assert.equal(value.divergence.timerDisposerDelta, value.runs)
  assert.equal(value.divergence.openTimerDelta, -value.runs)
  assert.equal(value.positive.final.pings, value.negative.final.pings)
  assert.equal(value.checks.positiveTimerDisposedPerRestart, true)
  assert.equal(value.checks.negativeLeakDetected, true)
  assert.equal(value.checks.probeDistinguishes, true)
})

test('LEV-2: PENDING -> ACTIVE and the direct-access negative controls', () => {
  const row = byPractice['LEV-2']
  const value = row.result
  assert.equal(row.level, 'loader-level')
  assert.equal(value.before.state, 0)
  assert.equal(value.before.stateName, 'PENDING')
  assert.equal(value.before.pendingTasks, 0)
  assert.equal(value.before.probe.events.length, 0)
  assert.equal(value.after.state, 2)
  assert.equal(value.after.stateName, 'ACTIVE')
  assert.equal(value.after.pendingTasks, 0)
  assert.equal(value.badConsumerState, 3)
  assert.ok(isFiniteNumber(value.activationMs) && value.activationMs >= 0)
  assert.equal(value.applies.length, 1)
  assert.equal(value.applies[0].value, 'A1')
  assert.equal(value.directEvents.length, 2)
  for (const event of value.directEvents) {
    assert.equal(event.ok, false)
    assert.match(event.message, /without inject/)
  }
  assert.equal(value.checks.consumerPendingBeforeProvider, true)
  assert.equal(value.checks.consumerActiveAfterProvider, true)
  assert.equal(value.checks.badConsumerFailedNotPending, true)
  assert.equal(value.checks.directAccessThrowsBefore, true)
  assert.equal(value.checks.directAccessThrowsAfter, true)
})

test('LEV-4: waterfall calls and dispatch-mode outcomes match the recorded expectations', () => {
  const row = byPractice['LEV-4']
  const value = row.result
  assert.equal(row.level, 'context-level')
  assert.equal(value.waterfall.length, 2)
  for (const item of value.waterfall) {
    assert.deepEqual(item.calls, item.expectedCalls)
    assert.equal(item.result, item.expectedResult)
    assert.equal(item.pass, true)
  }
  const expected = {
    emit: { calls: ['L1', 'L2'], resolved: false, errorName: 'Error' },
    parallel: { calls: ['L1', 'L2', 'L3'], resolved: false, errorName: 'AggregateError' },
    serial: { calls: ['L1', 'L2'], resolved: false, errorName: 'Error' },
    bail: { calls: ['L1', 'L2'], resolved: false, errorName: 'Error' },
  }
  assert.deepEqual(value.notifications.map(item => item.mode), ['emit', 'parallel', 'serial', 'bail'])
  for (const item of value.notifications) {
    const target = expected[item.mode]
    assert.ok(target, `unexpected mode: ${item.mode}`)
    assert.deepEqual(item.calls, target.calls, `${item.mode} calls`)
    assert.equal(item.expected.calls.length, target.calls.length)
    assert.equal(item.outcome.resolved, target.resolved)
    if (!target.resolved) assert.equal(item.outcome.errorName, target.errorName)
    assert.equal(item.pass, true)
    assert.equal(typeof item.documentedBehavior, 'string')
  }
  assert.equal(value.checks.modesDistinguishable, true)
  assert.equal(new Set(value.notifications.map(item => JSON.stringify(item.calls))).size >= 2, true)
})

test('LEV-5: two isolate realms, one provider swap, zero cross-realm applies', () => {
  const row = byPractice['LEV-5']
  const value = row.result
  assert.equal(row.level, 'loader-level')
  for (const key of ['providerA', 'providerB', 'consumerA', 'consumerB', 'consumerRoot']) {
    assert.ok(value.before.states[key], `before ${key}`)
    assert.ok(value.after.states[key], `after ${key}`)
  }
  assert.equal(value.before.states.providerA.state, 2)
  assert.equal(value.before.states.providerB.state, 2)
  assert.equal(value.before.states.consumerA.state, 2)
  assert.equal(value.before.states.consumerB.state, 2)
  assert.equal(value.before.states.consumerRoot.state, 0)
  assert.equal(value.after.states.consumerRoot.state, 0)
  assert.equal(value.before.rootServiceVisible, false)
  assert.equal(value.after.rootServiceVisible, false)
  assert.deepEqual(value.appliesFor.a, ['a1', 'a2'])
  assert.deepEqual(value.appliesFor.b, ['b1'])
  assert.equal(value.applies.filter(event => event.consumer === 'a').length, 2)
  assert.equal(value.applies.filter(event => event.consumer === 'b').length, 1)
  assert.equal(value.disposes.length, 1)
  assert.equal(value.disposes[0].consumer, 'a')
  assert.equal(value.disposes[0].version, 'a1')
  assert.equal(value.impls.length, 2)
  assert.deepEqual(new Set(value.impls.map(impl => `${impl.realm}:${impl.version}`)), new Set(['a:a2', 'b:b1']))
  assert.equal(value.consumerSourceUnchanged, true)
  assert.equal(value.consumerHashBefore, value.consumerHashAfter)
  assert.deepEqual(value.leakedServices, [])
  assert.equal(value.crossRealmApplies, 0)
  assert.ok(isFiniteNumber(value.swapMs) && value.swapMs >= 0)
  assert.equal(value.checks.crossRealmBleedZero, true)
  assert.equal(value.checks.rootConsumerStaysPending, true)
  assert.equal(value.checks.distinctProviderInstances, true)
})

test('LEV-8: composed row diff, toggle isolation, and the evidence-card meta-check', () => {
  const row = byPractice['LEV-8']
  const value = row.result
  assert.equal(row.level, 'loader-level')
  assert.deepEqual(value.compositions.baseOnly.rows.map(item => item.id), ['lev8-base-a', 'lev8-base-b'])
  assert.deepEqual(value.compositions.enabled.rows.map(item => item.id), ['lev8-base-a', 'lev8-base-b', 'lev8-sample'])
  assert.deepEqual(value.compositions.disabled.rows.map(item => item.id), ['lev8-base-a', 'lev8-base-b', 'lev8-sample'])
  assert.deepEqual(value.compositions.missingTarget.rows.map(item => item.id), ['lev8-base-a', 'lev8-base-b'])
  assert.deepEqual(value.diffs.baseToEnabled.added, ['lev8-sample'])
  assert.deepEqual(value.diffs.enabledToDisabled.added, [])
  assert.deepEqual(value.diffs.enabledToDisabled.removed, [])
  assert.deepEqual(value.diffs.enabledToDisabled.changed.map(item => item.id), ['lev8-sample'])
  assert.deepEqual(value.diffs.enabledToDisabled.changed[0].keys, ['disabled'])
  assert.equal(value.diffs.enabledToDisabled.changed[0].after.disabled, true)
  assert.equal(value.compositions.disabled.rows.find(item => item.id === 'lev8-sample').disabled, true)
  for (const check of value.schemaChecks) {
    assert.equal(check.ok, true, `${check.label}: ${check.issues.join('; ')}`)
    assert.equal(check.rows, value.compositions[check.label === 'base-only' ? 'baseOnly' : check.label === 'base+sample' ? 'enabled' : 'disabled'].rows.length)
  }
  assert.equal(value.checks.toggleOnlyChangesSampleDisabled, true)
  assert.equal(value.checks.missingTargetIsWarnedAndInert, true)
  assert.equal(value.checks.malformedPatchRejected, true)
  assert.equal(value.checks.evidenceCardValid, true)
  assert.equal(value.evidenceCardCheck.ok, true)
  assert.deepEqual(value.evidenceCardCheck.checkedPractices, PRACTICES)
  assert.deepEqual(value.evidenceCardCheck.problems, [])
  assert.equal(value.evidenceCardCheck.partial, false)
})

test('fixture provenance: every recorded file still hashes to the recorded value', () => {
  const workspace = path.resolve(HERE, '..', '..')
  for (const file of result.fixture.files) {
    const absolute = path.resolve(workspace, file.path)
    assert.ok(fs.existsSync(absolute), `missing fixture: ${file.path}`)
    assert.equal(fs.statSync(absolute).isFile(), true)
    assert.equal(createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'), file.sha256, `hash drift: ${file.path}`)
  }
  for (const row of rows) {
    for (const file of row.input.fixtureFiles) {
      assert.ok(fs.existsSync(path.resolve(workspace, file.path)), `missing ${row.practice} fixture: ${file.path}`)
    }
  }
})

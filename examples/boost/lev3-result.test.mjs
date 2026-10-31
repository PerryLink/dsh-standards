/**
 * Schema + internal-consistency test for the LEV-3 loader result.
 *
 * This intentionally does NOT assert the LEV-3 claim itself: a run where the
 * volatile field remounts must still produce a valid report. It checks that the
 * JSON is structurally sound and that every summary count is backed by the raw
 * per-iteration rows.
 *
 *   node --test examples/boost/lev3-result.test.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RESULT = path.resolve(HERE, '..', '..', '40-checker', 'results', 'lev3', 'lev3.json')

const ARM_KEYS = [
  'i', 'arm', 'field', 'from', 'to', 'writeMs', 'reloadMs',
  'uidBefore', 'uidAfter', 'fiberUidSame', 'fiberObjectSame', 'stateBefore', 'stateAfter',
  'configBefore', 'configAfter', 'configUpdated', 'appliesDelta',
  'effectInstallsDelta', 'effectDisposalsDelta', 'volatileUpdatesDelta',
  'pluginReapplied', 'effectsTornDown', 'remounted', 'events',
]

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

test('LEV-3 result: schema and raw-row consistency', () => {
  assert.ok(fs.existsSync(RESULT), `missing result: ${RESULT}; run examples/boost/lev3-loader-bench.mjs first`)
  const result = JSON.parse(fs.readFileSync(RESULT, 'utf8'))

  assert.equal(result.schema, 'dsh-boost-lev3/1')
  assert.equal(result.practice, 'LEV-3')
  assert.equal(result.level, 'loader-level')
  assert.ok(Number.isInteger(result.config.runs) && result.config.runs > 0)
  assert.equal(result.config.volatileField, 'greeting')
  assert.equal(result.config.controlField, 'mode')
  assert.ok(typeof result.config.trigger === 'string' && result.config.trigger.includes('Include.refresh()'))
  assert.ok(result.hosts && typeof result.hosts === 'object')
  assert.ok(Object.keys(result.hosts).length > 0)
  assert.ok(Array.isArray(result.limitations) && result.limitations.length > 0)
  assert.ok(['supported', 'refuted', 'mixed', 'invalid'].includes(result.summary.status))

  for (const [hostId, host] of Object.entries(result.hosts)) {
    assert.equal(host.host, hostId)
    assert.ok(['supported', 'refuted', 'invalid', 'error'].includes(host.status), `${hostId} status`)
    assert.ok(host.runtime?.versions, `${hostId} runtime versions`)
    if (host.status === 'error') {
      assert.ok(host.errors.length > 0, `${hostId} error must carry a message`)
      continue
    }

    assert.ok(host.boot?.fixture?.uid, `${hostId} boot fixture uid`)
    assert.equal(host.boot.fixture.state, 2, `${hostId} fixture must boot ACTIVE`)
    assert.equal(host.boot.fixture.volatileReference, true, `${hostId} volatile field must be a Volatile reference`)
    assert.equal(host.boot.fixture.controlValueIsPlain, true, `${hostId} control field must be a plain string`)
    assert.deepEqual(host.boot.entries.find(entry => entry.name === './plugin.mjs')?.state, 2)

    for (const armName of ['volatile', 'control']) {
      const arm = host.arms[armName]
      assert.ok(arm, `${hostId} ${armName} arm`)
      assert.equal(arm.rows.length, result.config.runs, `${hostId} ${armName} row count`)
      assert.equal(arm.summary.n, arm.rows.length)
      assert.equal(arm.summary.remounts, arm.rows.filter(row => row.remounted).length)
      assert.equal(arm.summary.pluginReapplied, arm.rows.filter(row => row.pluginReapplied).length)
      assert.equal(arm.summary.effectsTornDown, arm.rows.filter(row => row.effectsTornDown).length)
      assert.equal(arm.summary.configUpdates, arm.rows.filter(row => row.configUpdated).length)
      assert.equal(arm.summary.fiberUidChanged, arm.rows.filter(row => !row.fiberUidSame).length)
      assert.equal(arm.summary.fiberObjectChanged, arm.rows.filter(row => !row.fiberObjectSame).length)
      assert.equal(arm.summary.appliesDeltaTotal, arm.rows.reduce((total, row) => total + row.appliesDelta, 0))
      assert.equal(arm.summary.effectInstallsTotal, arm.rows.reduce((total, row) => total + row.effectInstallsDelta, 0))
      assert.equal(arm.summary.effectDisposalsTotal, arm.rows.reduce((total, row) => total + row.effectDisposalsDelta, 0))
      assert.equal(arm.summary.volatileUpdatesTotal, arm.rows.reduce((total, row) => total + row.volatileUpdatesDelta, 0))
      if (arm.summary.reloadMs) {
        assert.ok(isFiniteNumber(arm.summary.reloadMs.median))
        assert.ok(arm.summary.reloadMs.p50 <= arm.summary.reloadMs.p95)
        assert.ok(arm.summary.reloadMs.min <= arm.summary.reloadMs.median)
        assert.ok(arm.summary.reloadMs.median <= arm.summary.reloadMs.max)
      }

      for (const row of arm.rows) {
        for (const key of ARM_KEYS) assert.ok(key in row, `${hostId} ${armName} row ${row.i} missing ${key}`)
        assert.equal(row.arm, armName)
        assert.equal(row.field, armName === 'volatile' ? 'greeting' : 'mode')
        assert.ok(row.i >= 1)
        assert.ok(isFiniteNumber(row.writeMs) && row.writeMs >= 0)
        assert.ok(isFiniteNumber(row.reloadMs) && row.reloadMs >= 0)
        assert.equal(row.remounted, row.appliesDelta > 0 || row.effectDisposalsDelta > 0)
        assert.equal(row.pluginReapplied, row.appliesDelta > 0)
        assert.equal(row.effectsTornDown, row.effectDisposalsDelta > 0)
        assert.equal(row.fiberUidSame, row.uidBefore === row.uidAfter)
        assert.ok(Array.isArray(row.events), `${hostId} ${armName} row ${row.i} events`)
        assert.ok(row.configBefore && row.configAfter)
        if (row.configUpdated) {
          assert.equal(armName === 'volatile' ? row.configAfter.greeting : row.configAfter.mode, row.to)
        }
        if (armName === 'volatile') {
          assert.ok(row.volatileUpdatesDelta <= 1)
          for (const event of row.events) {
            assert.equal(event.type, 'volatile-update')
            assert.deepEqual(event.paths, ['greeting'])
          }
        } else {
          assert.equal(row.volatileUpdatesDelta, 0)
          if (row.remounted) {
            assert.ok(row.events.some(event => event.type === 'apply'))
            assert.ok(row.events.some(event => event.type === 'effect-dispose'))
          }
        }
      }
    }
  }

  // The two arms must stay distinguishable for the report to mean anything.
  for (const [hostId, host] of Object.entries(result.hosts)) {
    if (host.status === 'error') continue
    assert.equal(host.arms.volatile.summary.remounts, result.summary.volatileRemounts[hostId])
    assert.equal(host.arms.control.summary.remounts, result.summary.controlRemounts[hostId])
    if (host.checks.controlRestarts) {
      assert.equal(host.arms.control.summary.pluginReapplied, result.config.runs)
    }
  }
})

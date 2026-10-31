import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const levels = JSON.parse(readFileSync(path.join(STD, 'spec', 'levels.json'), 'utf8'))

test('levels: exactly three levels with the expected ids and analogies', () => {
  assert.equal(levels.schema, 'dsh-levels/1')
  assert.equal(levels.nonOfficial, true)
  assert.deepEqual(levels.levels.map(level => level.id), ['entry', 'flow', 'boost'])
  assert.deepEqual(levels.levels.map(level => level.analogy), ['GB', 'GB/T', 'GB/Z'])
})

test('levels: ENTRY has G0-G5, FLOW has J1-J8, BOOST has LEV-1..LEV-8', () => {
  const gates = Object.fromEntries(levels.levels.map(level => [level.id, level.gates.map(gate => gate.id)]))
  assert.deepEqual(gates.entry, ['G0', 'G1', 'G2', 'G3', 'G4', 'G5'])
  assert.deepEqual(gates.flow, ['J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7', 'J8'])
  assert.deepEqual(gates.boost, ['LEV-1', 'LEV-2', 'LEV-3', 'LEV-4', 'LEV-5', 'LEV-6', 'LEV-7', 'LEV-8'])
})

test('levels: evidence states include not-run and never imply a pass', () => {
  const all = new Set(levels.levels.flatMap(level => level.evidenceStates))
  assert.equal(all.has('not-run'), true)
  assert.equal(all.has('runtime'), true)
  assert.equal(all.has('measured'), true)
  assert.equal(levels.axes.rules.some(rule => rule.includes('skip is not a pass')), true)
})

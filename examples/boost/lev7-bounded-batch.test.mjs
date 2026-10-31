import test from 'node:test'
import assert from 'node:assert/strict'
import { runWithLimit } from './lev7-bounded-batch.mjs'

test('LEV-7: bounded concurrency, stable order', async () => {
  let active = 0
  let peak = 0
  const tasks = [30, 5, 20, 1, 10].map((ms, index) => async () => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, ms))
    active -= 1
    return index
  })
  const results = await runWithLimit(tasks, 2)
  assert.deepEqual(results, [0, 1, 2, 3, 4])
  assert.equal(peak, 2)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { scanText } from '../scripts/claim-check.mjs'

test('claim: an official claim fails', () => {
  const r = scanText('DSH-ENTRY is an official certification.', 'x.md')
  assert.equal(r.errors.length, 1)
})

test('claim: a negated claim passes', () => {
  const r = scanText('DSH-ENTRY is not an official certification.', 'x.md')
  assert.deepEqual(r.errors, [])
})

test('claim: Chinese negation passes', () => {
  const r = scanText('DSH-ENTRY 不是官方认证，也不做安全审计。', 'x.md')
  assert.deepEqual(r.errors, [])
})

test('claim: a mark without a disclaimer warns', () => {
  const r = scanText('DSH-FLOW manual', 'x.md')
  assert.equal(r.warnings.length, 1)
})

test('claim: a mark with a disclaimer does not warn', () => {
  const r = scanText('DSH-FLOW manual\n非官方 · 非认证 · 非安全审计', 'x.md')
  assert.deepEqual(r.warnings, [])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateGovernance } from '../scripts/governance-check.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))

function fixture() {
  return {
    roles: read('governance/roles.json'),
    contributors: read('governance/contributors.json'),
    reviewers: read('governance/reviewers.json'),
    coi: read('governance/coi.json'),
  }
}

test('governance: the checked-in files pass', () => {
  const result = validateGovernance(fixture())
  assert.deepEqual(result.errors, [])
})

test('governance: exactly one human organizer is required', () => {
  const data = fixture()
  data.roles.roles.organizer.bot = true
  data.roles.roles.organizer.humanOnly = false
  const result = validateGovernance(data)
  assert.ok(result.errors.some((e) => /organizer must be humanOnly/.test(e)))
})

test('governance: AI must not decide spec semantics', () => {
  const data = fixture()
  data.roles.matrix['ai-steward']['spec.decide'] = 'allow'
  const result = validateGovernance(data)
  assert.ok(result.errors.some((e) => /must not hold spec\.decide/.test(e)))
})

test('governance: AI merge must be allowlist-only', () => {
  const data = fixture()
  data.roles.matrix['ai-steward']['repo.merge.main'] = 'allow'
  const result = validateGovernance(data)
  assert.ok(result.errors.some((e) => /allow-with-allowlist/.test(e)))
})

test('governance: class A approver must be human', () => {
  const data = fixture()
  data.roles.decisions.A.approver = ['ai-steward']
  const result = validateGovernance(data)
  assert.ok(result.errors.some((e) => /decision A approver/.test(e)))
})

test('governance: AI merge denylist protects spec and governance', () => {
  const data = fixture()
  data.roles.ai.mergeDenylist = ['spec/']
  const result = validateGovernance(data)
  assert.ok(result.errors.some((e) => /governance\//.test(e)))
})

test('governance: a contributor needs DCO and the current terms', () => {
  const data = fixture()
  data.contributors.contributors[0].signedOff = false
  data.contributors.contributors[0].terms = 'dsh-ct/0'
  const result = validateGovernance(data)
  assert.ok(result.errors.some((e) => /no DCO sign-off/.test(e)))
  assert.ok(result.errors.some((e) => /terms mismatch/.test(e)))
})

test('governance: reviewer must reference a human role', () => {
  const data = fixture()
  data.reviewers.reviewers[0].role = 'ai-steward'
  const result = validateGovernance(data)
  assert.ok(result.errors.some((e) => /human role/.test(e)))
})

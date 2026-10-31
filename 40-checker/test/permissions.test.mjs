import test from 'node:test'
import assert from 'node:assert/strict'
import { checkCredentials } from '../src/declarations.mjs'
import { validateCommitments, validateDisclosure, COMMITMENT_IDS } from '../src/permissions.mjs'

const manifest = {
  dsh: {
    commitmentsVersion: 1,
    commitments: Object.fromEntries(COMMITMENT_IDS.map(id => [id, true])),
    disclosure: {
      endpoints: ['https://api.example.com'],
      retention: 'none',
      systemPrompt: 'unchanged',
    },
    capabilities: ['network:egress'],
  },
}

test('all 9 commitments validate as booleans', () => {
  const details = validateCommitments(manifest)
  assert.equal(details.length, 1)
  assert.equal(details[0].result, 'PASS')
})

test('missing commitment is a warning, not a failure', () => {
  const details = validateCommitments({ dsh: { commitments: { 'no-session-upload': true } } })
  assert.ok(details.some(item => item.result === 'WARN' && item.reason.includes('missing commitment')))
})

test('disclosure endpoints must be https URLs', () => {
  const details = validateDisclosure({ dsh: { disclosure: { endpoints: ['http://insecure.example.com'] } } })
  assert.ok(details.some(item => item.result === 'WARN'))
})

test('checkCredentials reads both declaration fields', () => {
  const check = checkCredentials(manifest, [])
  assert.equal(check.result, 'PASS')
  assert.ok(check.details.some(item => item.item === 'C-12.6' && item.result === 'PASS'))
  assert.ok(check.details.some(item => item.item === 'C-12.7' && item.result === 'PASS'))
})

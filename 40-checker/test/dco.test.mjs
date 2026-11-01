import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLog, checkCommit, checkTerms } from '../scripts/dco-check.mjs'

function commit(body, email = 'a@example.com') {
  return { sha: 'abcdef1234567890', authorName: 'Alice', authorEmail: email, body }
}

test('dco: a signed commit passes', () => {
  const r = checkCommit(commit('feat: x\n\nSigned-off-by: Alice <a@example.com>'))
  assert.deepEqual(r.errors, [])
})

test('dco: missing sign-off fails', () => {
  const r = checkCommit(commit('feat: x'))
  assert.ok(r.errors.some((e) => /missing Signed-off-by/.test(e)))
})

test('dco: author email must be among sign-offs', () => {
  const r = checkCommit(commit('feat: x\n\nSigned-off-by: Alice <other@example.com>'))
  assert.ok(r.errors.some((e) => /not among the sign-offs/.test(e)))
})

test('dco: AI-assisted requires a tool and a human sign-off', () => {
  const r = checkCommit(commit('feat: x\n\nAI-Assisted: yes\nSigned-off-by: [bot] <bot@example.com>'))
  assert.ok(r.errors.some((e) => /AI-Tool/.test(e)))
  assert.ok(r.errors.some((e) => /human sign-off/.test(e)))
})

test('dco: terms checkbox counts', () => {
  const r = checkTerms({
    commits: [{ body: 'feat: x' }],
    prBody: '- [x] I agree to the DSH Contribution Terms v1 (dsh-ct/1)',
    requireTerms: true,
  })
  assert.deepEqual(r.errors, [])
})

test('dco: missing terms fails only when required', () => {
  const r = checkTerms({ commits: [{ body: 'feat: x' }], prBody: '', requireTerms: true })
  assert.ok(r.errors.length === 1)
  assert.deepEqual(checkTerms({ commits: [{ body: 'feat: x' }], prBody: '', requireTerms: false }).errors, [])
})

test('dco: parseLog keeps author and body', () => {
  const raw = 'abc\x1fAlice\x1fa@example.com\x1ffeat: x\n\nSigned-off-by: Alice <a@example.com>\x1e'
  const [c] = parseLog(raw)
  assert.equal(c.sha, 'abc')
  assert.equal(c.authorEmail, 'a@example.com')
  assert.match(c.body, /Signed-off-by/)
})

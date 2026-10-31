import test from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, parseVersion, satisfies, validRange } from '../src/semver.mjs'

test('parseVersion accepts exact semver and prerelease', () => {
  assert.deepEqual(parseVersion('0.2.2-alpha.2'), { major: 0, minor: 2, patch: 2, prerelease: ['alpha', '2'] })
  assert.equal(parseVersion('^0.2.2'), null)
})

test('compareVersions orders release above prerelease', () => {
  assert.equal(compareVersions(parseVersion('0.2.2'), parseVersion('0.2.2-alpha.2')), 1)
  assert.equal(compareVersions(parseVersion('0.2.2-alpha.2'), parseVersion('0.2.2-alpha.1')), 1)
  assert.equal(compareVersions(parseVersion('0.2.0-rc.2'), parseVersion('0.2.0-0')), 1)
})

test('satisfies handles the ranges used by real plugins', () => {
  assert.equal(satisfies('0.2.2-alpha.2', '>=0.2.2-alpha.2 <0.3.0'), true)
  assert.equal(satisfies('0.2.2-alpha.2', '>=0.1.5-rc.1 <0.2.0-0 || >=0.2.0-rc.2 <0.3.0-0'), true)
  assert.equal(satisfies('0.2.2-alpha.2', '^0.2.2-alpha.2'), true)
  assert.equal(satisfies('0.2.2-alpha.2', '~0.2.2'), false)
  assert.equal(satisfies('0.2.2-alpha.2', '^0.2.2'), false)
  assert.equal(satisfies('0.2.2-alpha.2', '>=0.3.0'), false)
  assert.equal(satisfies('0.2.2-alpha.2', 'workspace:^'), false)
  assert.equal(satisfies('24.0.0', '^22.19.0 || >=24.0.0'), true)
})

test('validRange rejects empty and malformed ranges', () => {
  assert.equal(validRange('>=0.2.2 <0.3.0'), true)
  assert.equal(validRange(''), false)
  assert.equal(validRange('workspace:^'), false)
  assert.equal(validRange('not-a-range'), false)
})

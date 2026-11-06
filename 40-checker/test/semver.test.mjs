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

test('validRange accepts legal npm ranges with spaces and prereleases', () => {
  assert.equal(validRange('>= 0.2.2-rc.1 < 0.2.3'), true)
  assert.equal(validRange('>=0.2.2-0 <0.3.0'), true)
  assert.equal(validRange('^0.2.2-alpha.2'), true)
  assert.equal(validRange('1.2 - 2.3'), true)
  assert.equal(validRange('^0.1.0-rc.6 || 0.2.2-rc.1'), true)
  assert.equal(validRange('~0.2.2-0'), true)
  assert.equal(validRange('1.x'), true)
  // node-semver treats an empty alternative as `*`.
  assert.equal(validRange('>=0.2.2-0 ||'), true)
  assert.equal(validRange('|| >=0.2.2-0'), true)
  assert.equal(validRange('>='), false)
  // A comma is not npm range syntax; it must stay invalid, not be swallowed.
  assert.equal(validRange('>=1.0.0, <2.0.0'), false)
})

test('prerelease semantics match includePrerelease and comparator bounds', () => {
  // A prerelease floor includes later prereleases of the same patch.
  assert.equal(satisfies('0.2.2-rc.1', '>=0.2.2-0 <0.3.0'), true)
  assert.equal(satisfies('0.2.1-rc.5', '>=0.2.2-0 <0.3.0'), false)
  assert.equal(satisfies('0.2.2-rc.1', '^0.2.2-alpha.2'), true)
  assert.equal(satisfies('0.2.1-rc.5', '^0.2.2-alpha.2'), false)
  assert.equal(satisfies('0.2.0-rc.1', '>= 0.2.2-rc.1 < 0.2.3'), false)
  assert.equal(satisfies('0.2.2-rc.1', '>= 0.2.2-rc.1 < 0.2.3'), true)
  assert.equal(satisfies('0.3.0-0', '^0.2.2-alpha.2'), false, 'caret upper bound is 0.3.0-0')
  assert.equal(satisfies('1.3.0-0', '^1.2.3-alpha.1'), true, 'only the caret boundary is excluded')
  assert.equal(satisfies('0.3.0-rc.1', '>=0.2.2-0 <0.3.0'), true, 'explicit upper bounds keep prereleases')
  assert.equal(satisfies('0.3.0', '^0.2.2-alpha.2'), false)
  assert.equal(satisfies('0.2.3', '~0.2.2'), true)
  assert.equal(satisfies('1.3.0-0', '^1.2'), true, '^1.2 upper bound is 2.0.0-0')
  assert.equal(satisfies('2.0.0-0', '^1.2'), false)
  assert.equal(satisfies('0.3.0-0', '^0.2'), false)
  assert.equal(satisfies('0.1.0-0', '^0.0'), false)
  assert.equal(satisfies('1.2.0-0', '^1.2'), true, 'partial lower bounds use -0 with includePrerelease')
  assert.equal(satisfies('1.3.0-0', '>1.2'), true)
  assert.equal(satisfies('1.2.0-0', '1.2 - 2.3'), true)
  assert.equal(satisfies('0.2.2-alpha.2', '~0.2.2'), false)
  // The exact comparator is not the same as the `-0` sentinel.
  assert.equal(satisfies('0.2.2-rc.1', '0.2.2-0'), false)
})

test('multi-segment and alternative ranges are evaluated in order', () => {
  assert.equal(satisfies('0.2.2-alpha.2', '>=0.1.5-rc.1 <0.2.0-0 || >=0.2.0-rc.2 <0.3.0-0'), true)
  assert.equal(satisfies('0.1.8', '^0.1.0-rc.6 || 0.2.2-rc.1'), true)
  assert.equal(satisfies('0.2.2-rc.1', '^0.1.0-rc.6 || 0.2.2-rc.1'), true)
  assert.equal(satisfies('0.3.0', '>=0.2.2-0 <0.3.0'), false)
  assert.equal(satisfies('24.0.0', '^22.19.0 || >=24.0.0'), true)
})

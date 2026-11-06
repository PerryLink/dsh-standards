import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SIDECAR = path.join(REPO, '40-checker', 'scripts', 'build-sidecar.mjs')
const KIT = path.join(REPO, '40-checker', 'scripts', 'build-offline-kit.mjs')
const NOT_CLAIMED = ['official', 'certification', 'security-audit', 'endorsement', 'ordering', 'comparison', 'warranty']
const CHECKER_SHA = 'a'.repeat(40)
const EVIDENCE_SHA = 'b'.repeat(64)

function tempDir(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sidecar-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

function run(script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  })
}

function mustRun(script, args, options = {}) {
  const result = run(script, args, options)
  assert.equal(result.status, 0, `${path.basename(script)} exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  return result
}

function json(result) {
  assert.equal(result.stderr, '', `unexpected stderr: ${result.stderr}`)
  return JSON.parse(result.stdout)
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
  return file
}

function assertNoForbidden(value, trail = 'sidecar') {
  const banned = new Set(['advice', 'issuer', 'recordHash', 'verifyUrl'])
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!banned.has(key), `${trail}.${key} must not appear in the sidecar`)
    assertNoForbidden(child, `${trail}.${key}`)
  }
}

function sidecarDocument(entries, generatedAt = '2026-01-01T00:00:00.000Z') {
  return {
    schema: 'dsh-market-sidecar/1',
    generatedAt,
    index: { url: 'https://example.test/index.json', format: 1 },
    checker: { name: 'dsh-standards', version: '1.2.2', sha: CHECKER_SHA },
    notClaimed: NOT_CLAIMED,
    entries,
  }
}

function sidecarEntry(name, version, expiresAt, lifecycle = 'active') {
  return {
    subject: { name, version, tarballSha256: 'c'.repeat(64) },
    levels: { entry: { state: 'recognized', claim: 'static' }, flow: { state: 'not-run' }, boost: { state: 'not-measured' } },
    evidence: {},
    validity: { checkedAt: '2026-01-01', expiresAt, policy: '90d' },
    lifecycle,
    selfAssessed: true,
  }
}

test('build-sidecar: fixed audit input produces the documented shape', (t) => {
  const dir = tempDir(t)
  const packageDir = path.join(dir, 'plugin')
  writeJson(path.join(packageDir, 'package.json'), { name: '@acme/x', version: '1.2.3' })
  const tarball = path.join(dir, 'acme-x-1.2.3.tgz')
  fs.writeFileSync(tarball, 'fake package tarball\n')
  const audit = writeJson(path.join(dir, 'audit.json'), {
    schema: 'dsh-level-audit/1',
    generatedAt: '2026-11-06T01:02:03.000Z',
    target: { dir: packageDir },
    levels: {
      entry: { state: 'recognized', claim: 'static' },
      flow: { state: 'not-run' },
      boost: { state: 'not-measured' },
    },
  })
  const out = path.join(dir, 'out', 'sidecar.json')
  const summary = json(mustRun(SIDECAR, [
    '--levels', audit,
    '--tarball', tarball,
    '--out', out,
    '--today', '2026-11-06',
    '--checker-version', '1.2.2',
    '--checker-sha', CHECKER_SHA,
    '--index-url', 'https://example.test/index.json',
    '--evidence-url', 'https://example.test/evidence/audit.json',
    '--evidence-sha256', EVIDENCE_SHA,
  ]))

  assert.equal(summary.written, true)
  assert.equal(summary.entries, 1)
  const document = JSON.parse(fs.readFileSync(out, 'utf8'))
  assert.deepEqual(document, {
    schema: 'dsh-market-sidecar/1',
    generatedAt: '2026-11-06T00:00:00.000Z',
    index: { url: 'https://example.test/index.json', format: 1 },
    checker: { name: 'dsh-standards', version: '1.2.2', sha: CHECKER_SHA },
    notClaimed: NOT_CLAIMED,
    entries: {
      '@acme/x@1.2.3': {
        subject: { name: '@acme/x', version: '1.2.3', tarballSha256: sha256(tarball) },
        levels: { entry: { state: 'recognized', claim: 'static' }, flow: { state: 'not-run' }, boost: { state: 'not-measured' } },
        evidence: { url: 'https://example.test/evidence/audit.json', sha256: EVIDENCE_SHA },
        validity: { checkedAt: '2026-11-06', expiresAt: '2027-02-04', policy: '90d' },
        lifecycle: 'active',
        selfAssessed: true,
      },
    },
  })
  assertNoForbidden(document)
})

test('build-sidecar: today > expiresAt marks stale and a re-run is byte-identical', (t) => {
  const dir = tempDir(t)
  const prev = writeJson(path.join(dir, 'sidecar.json'), sidecarDocument({
    '@acme/old@1.0.0': sidecarEntry('@acme/old', '1.0.0', '2026-10-01'),
    '@acme/fresh@1.0.0': sidecarEntry('@acme/fresh', '1.0.0', '2027-01-01'),
  }))
  const withdrawals = writeJson(path.join(dir, 'withdrawals.json'), { schema: 'dsh-market-withdrawals/1', withdrawals: [] })
  const out = path.join(dir, 'out.json')

  const first = json(mustRun(SIDECAR, ['--prev', prev, '--withdrawals', withdrawals, '--out', out, '--today', '2026-11-06']))
  assert.equal(first.lifecycle.stale, 1)
  assert.equal(first.lifecycle.active, 1)
  const document = JSON.parse(fs.readFileSync(out, 'utf8'))
  assert.equal(document.entries['@acme/old@1.0.0'].lifecycle, 'stale')
  assert.equal(document.entries['@acme/fresh@1.0.0'].lifecycle, 'active')
  assert.equal(document.generatedAt, '2026-01-01T00:00:00.000Z')
  assert.equal(document.entries['@acme/old@1.0.0'].validity.expiresAt, '2026-10-01')

  const before = fs.readFileSync(out, 'utf8')
  const second = json(mustRun(SIDECAR, ['--prev', out, '--withdrawals', withdrawals, '--out', out, '--today', '2026-11-06']))
  assert.equal(second.written, false)
  assert.equal(second.unchanged, true)
  assert.equal(fs.readFileSync(out, 'utf8'), before)
})

test('build-sidecar: expiry is strict (today == expiresAt stays active)', (t) => {
  const dir = tempDir(t)
  const prev = writeJson(path.join(dir, 'sidecar.json'), sidecarDocument({
    '@acme/edge@1.0.0': sidecarEntry('@acme/edge', '1.0.0', '2026-11-06'),
  }))
  const withdrawals = writeJson(path.join(dir, 'withdrawals.json'), { schema: 'dsh-market-withdrawals/1', withdrawals: [] })
  const out = path.join(dir, 'out.json')
  mustRun(SIDECAR, ['--prev', prev, '--withdrawals', withdrawals, '--out', out, '--today', '2026-11-06'])
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).entries['@acme/edge@1.0.0'].lifecycle, 'active')
})

test('build-sidecar: withdrawals win, carry dates/reasons, and never revert to active', (t) => {
  const dir = tempDir(t)
  const prev = writeJson(path.join(dir, 'sidecar.json'), sidecarDocument({
    '@acme/gone@1.0.0': sidecarEntry('@acme/gone', '1.0.0', '2027-01-01'),
    '@acme/ok@1.0.0': sidecarEntry('@acme/ok', '1.0.0', '2027-01-01'),
  }))
  const withdrawals = writeJson(path.join(dir, 'withdrawals.json'), {
    schema: 'dsh-market-withdrawals/1',
    withdrawals: [{ name: '@acme/gone', version: '1.0.0', date: '2026-11-01', reason: 'tarball removed upstream' }],
  })
  const out = path.join(dir, 'out.json')
  const summary = json(mustRun(SIDECAR, ['--prev', prev, '--withdrawals', withdrawals, '--out', out, '--today', '2026-11-06']))
  assert.equal(summary.lifecycle.withdrawn, 1)
  assert.equal(summary.lifecycle.active, 1)
  const document = JSON.parse(fs.readFileSync(out, 'utf8'))
  assert.equal(document.entries['@acme/gone@1.0.0'].lifecycle, 'withdrawn')
  assert.deepEqual(document.entries['@acme/gone@1.0.0'].lifecycleDetail, {
    since: '2026-11-01',
    reason: 'tarball removed upstream',
  })
  assert.equal(document.entries['@acme/ok@1.0.0'].lifecycle, 'active')

  // Append-only means the human list normally keeps the record. Even if it is
  // rotated empty by mistake, a withdrawn entry must not silently go active.
  const empty = writeJson(path.join(dir, 'empty.json'), { schema: 'dsh-market-withdrawals/1', withdrawals: [] })
  const second = json(mustRun(SIDECAR, ['--prev', out, '--withdrawals', empty, '--out', out, '--today', '2026-11-07']))
  assert.equal(second.lifecycle.withdrawn, 1)
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).entries['@acme/gone@1.0.0'].lifecycle, 'withdrawn')
})

test('build-offline-kit: content manifest, npm tarball and market-contract are inside one tgz', (t) => {
  const dir = tempDir(t)
  const root = path.join(dir, 'repo')
  writeJson(path.join(root, 'package.json'), { name: 'dsh-standards', version: '9.9.9' })
  writeJson(path.join(root, 'adoption', 'market', 'label.schema.json'), { schema: 'dsh-market-label/1' })
  writeJson(path.join(root, 'market-contract', 'label.schema.rev2.json'), { schema: 'dsh-market-label/1', proposal: true })
  fs.writeFileSync(path.join(root, 'market-contract', 'validate.mjs'), '// validate\n')
  writeJson(path.join(root, 'examples', 'plugin-template', 'package.json'), { name: 'example' })
  const tarball = path.join(root, 'dsh-standards-9.9.9.tgz')
  fs.writeFileSync(tarball, 'fake npm tarball\n')
  const out = path.join(dir, 'kit.tgz')

  const summary = json(mustRun(KIT, [
    '--root', root,
    '--tarball', tarball,
    '--market-contract', path.join(root, 'market-contract'),
    '--out', out,
    '--version', '9.9.9',
    '--today', '2026-11-06',
  ]))
  assert.ok(summary.bytes > 0)
  assert.equal(summary.tarball.sha256, sha256(tarball))

  const listing = spawnSync('tar', ['-tzf', out], { encoding: 'utf8' })
  assert.equal(listing.status, 0, listing.stderr)
  const names = listing.stdout.split('\n').map(name => name.replace(/^\.\//, '')).filter(Boolean)
  for (const expected of [
    'README.md',
    'OFFLINE-KIT.json',
    'dsh-standards-9.9.9.tgz',
    'adoption/market/label.schema.json',
    'market-contract/validate.mjs',
    'market-contract/label.schema.rev2.json',
    'examples/plugin-template/package.json',
  ]) {
    assert.ok(names.includes(expected), `kit is missing ${expected}; got ${names.join(', ')}`)
  }

  const unpacked = path.join(dir, 'unpacked')
  fs.mkdirSync(unpacked)
  const untar = spawnSync('tar', ['-xzf', out, '-C', unpacked], { encoding: 'utf8' })
  assert.equal(untar.status, 0, untar.stderr)
  const manifest = JSON.parse(fs.readFileSync(path.join(unpacked, 'OFFLINE-KIT.json'), 'utf8'))
  assert.equal(manifest.schema, 'dsh-offline-kit/1')
  assert.equal(manifest.version, '9.9.9')
  assert.equal(manifest.package.sha256, sha256(tarball))
  assert.ok(manifest.contents.includes('market-contract/validate.mjs'))
  assert.ok(manifest.contents.includes('adoption/market/label.schema.json'))
  const readme = fs.readFileSync(path.join(unpacked, 'README.md'), 'utf8')
  assert.match(readme, /离线/)
  assert.match(readme, /npm install --offline/)
})

test('build-offline-kit: a missing market-contract fails loudly instead of shipping a partial kit', (t) => {
  const dir = tempDir(t)
  const root = path.join(dir, 'repo')
  writeJson(path.join(root, 'package.json'), { name: 'dsh-standards', version: '9.9.9' })
  writeJson(path.join(root, 'adoption', 'market', 'label.schema.json'), { schema: 'dsh-market-label/1' })
  writeJson(path.join(root, 'examples', 'plugin-template', 'package.json'), { name: 'example' })
  const tarball = path.join(root, 'dsh-standards-9.9.9.tgz')
  fs.writeFileSync(tarball, 'fake npm tarball\n')
  const result = run(KIT, ['--root', root, '--tarball', tarball, '--out', path.join(dir, 'kit.tgz')], {
    env: { ...process.env, DSH_MARKET_CONTRACT: '' },
  })
  assert.equal(result.status, 3)
  assert.match(result.stderr, /market-contract not found/)
})

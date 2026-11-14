import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  CHECKER, CHECKER_SHA, COMMAND, EVIDENCE_SHA, NOT_CLAIMED, SCHEMA,
  assertNoForbidden, assertNoKey, legacyEntry, readPublishSidecar, richEntry,
  sha256, sidecarDocument, writeJson,
} from './helpers/sidecar.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SIDECAR = path.join(REPO, '40-checker', 'scripts', 'build-sidecar.mjs')
const KIT = path.join(REPO, '40-checker', 'scripts', 'build-offline-kit.mjs')
const TODAY = '2026-11-06'
const EXPIRES = '2027-02-04'
const PUBLISH_ENTRIES = 50
const SECURITY_COMMAND = 'dsh-standards check <package-dir> --scope security --json'

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

function auditFixture({ name, version, dir, generatedAt = '2026-11-06T01:02:03.000Z' }) {
  return {
    schema: 'dsh-level-audit/1',
    generatedAt,
    target: { dir },
    levels: {
      entry: { state: 'recognized', claim: 'static' },
      flow: { state: 'not-run' },
      boost: { state: 'not-measured' },
    },
    checker: {
      invoked: 'static',
      exit: 0,
      schema: 'dsh-conformance/1',
      anchor: {
        repo: 'deepseek-ai/deepseek-harness',
        commit: 'd'.repeat(40),
        scanner: 'dsh-plugin-verify@0.1.0',
        dsh: '0.2.1-rc.5',
        cordis: '4.0.6-alpha.1',
        runtime: null,
      },
      coverage: { mandatory: 5, pass: 2, warn: 1, fail: 0, na: 2, notRun: 2, error: 0 },
    },
  }
}

function reportFixture(name, version, checks) {
  return {
    schema: 'dsh-conformance/1',
    subject: { mode: 'package', profile: 'package', name, version },
    checks,
  }
}

function buildArgs(dir, { name, version, packageDir, tarball, audit, report, out, extra = [] }) {
  const args = [
    '--levels', audit,
    '--package', packageDir,
    '--tarball', tarball,
    '--out', out,
    '--today', TODAY,
    '--checker-version', '1.3.0',
    '--checker-sha', CHECKER_SHA,
    '--index-url', 'https://example.test/index.json',
    ...extra,
  ]
  if (report) args.push('--report', report)
  return args
}

test('build-sidecar: the additive entry shape is derived from audit, report and package.json', (t) => {
  const dir = tempDir(t)
  const packageDir = path.join(dir, 'plugin')
  writeJson(path.join(packageDir, 'package.json'), {
    name: '@acme/x',
    version: '1.2.3',
    description: 'Acme X plugin.\nSecond line must not be the title.',
    repository: { type: 'git', url: 'git+ssh://git@github.com/acme/x.git' },
    license: 'MIT',
    dsh: {
      engines: { dsh: '>=0.2.0-rc.1 <0.3.0-0' },
      client: { platform: 'web' },
    },
    peerDependencies: { '@deepseek-ai/cordis': '^4.0.6-alpha.1' },
  })
  const tarball = path.join(dir, 'acme-x-1.2.3.tgz')
  fs.writeFileSync(tarball, 'fake package tarball\n')
  const audit = writeJson(path.join(dir, 'audit.json'), auditFixture({ name: '@acme/x', version: '1.2.3', dir: packageDir }))
  const report = writeJson(path.join(dir, 'report.json'), reportFixture('@acme/x', '1.2.3', [
    { id: 'DSC-01', result: 'PASS', coverage: 'full', details: [{ item: 'C-1.1', reason: 'secret detail' }] },
    { id: 'DSC-02', result: 'WARN', coverage: 'full', reason: 'kept out of the sidecar' },
    { id: 'DSC-03', result: 'NA', coverage: 'not-run' },
    { id: 'DSC-04', result: 'NA', coverage: 'not-run' },
    { id: 'DSC-05', result: 'NA', coverage: 'partial' },
  ]))
  const out = path.join(dir, 'out', 'sidecar.json')
  const summary = json(mustRun(SIDECAR, buildArgs(dir, {
    name: '@acme/x', version: '1.2.3', packageDir, tarball, audit, report, out,
    extra: [
      '--evidence-url', 'https://example.test/report.json',
      '--evidence-sha256', EVIDENCE_SHA,
      '--checked-command', COMMAND,
    ],
  })))

  assert.equal(summary.written, true)
  assert.equal(summary.entries, 1)
  const document = JSON.parse(fs.readFileSync(out, 'utf8'))
  assert.deepEqual(document, {
    schema: SCHEMA,
    generatedAt: '2026-11-06T00:00:00.000Z',
    index: { url: 'https://example.test/index.json', format: 1 },
    checker: { name: 'dsh-standards', version: '1.3.0', sha: CHECKER_SHA },
    notClaimed: NOT_CLAIMED,
    entries: {
      '@acme/x@1.2.3': {
        subject: { name: '@acme/x', version: '1.2.3', tarballSha256: sha256(tarball) },
        title: 'Acme X plugin.',
        repo: 'https://github.com/acme/x',
        license: 'MIT',
        scope: { dsh: '>=0.2.0-rc.1 <0.3.0-0', cordis: '^4.0.6-alpha.1', platform: 'web' },
        levels: {
          entry: { state: 'recognized', claim: 'static' },
          flow: { state: 'not-run' },
          boost: { state: 'not-measured' },
        },
        checks: [
          { id: 'DSC-01', result: 'PASS', coverage: 'full' },
          { id: 'DSC-02', result: 'WARN', coverage: 'full' },
          { id: 'DSC-03', result: 'NA', coverage: 'not-run' },
          { id: 'DSC-04', result: 'NA', coverage: 'not-run' },
          { id: 'DSC-05', result: 'NA', coverage: 'partial' },
        ],
        evidence: {
          url: 'https://example.test/report.json',
          sha256: EVIDENCE_SHA,
          reportUrl: 'https://example.test/report.json',
          reportSha256: EVIDENCE_SHA,
        },
        checkedBy: { checker: CHECKER, command: COMMAND },
        notChecked: [
          'ENTRY:runtime (claim=static; not exercised)',
          'ENTRY:DSC-03, DSC-04 (coverage=not-run)',
          'FLOW:J1-J8 (not-run; 0/8 journeys pass)',
          'BOOST:LEV-3..LEV-4 (not-measured)',
        ],
        validity: { checkedAt: TODAY, expiresAt: EXPIRES, policy: '90d' },
        lifecycle: 'active',
        selfAssessed: true,
      },
    },
  })
  assertNoForbidden(document)
  assertNoKey(document, 'details')
})

test('build-sidecar: absent package metadata stays null instead of being invented', (t) => {
  const dir = tempDir(t)
  const packageDir = path.join(dir, 'plugin')
  writeJson(path.join(packageDir, 'package.json'), { name: '@acme/bare', version: '2.0.0' })
  const tarball = path.join(dir, 'bare.tgz')
  fs.writeFileSync(tarball, 'fake tarball\n')
  const audit = writeJson(path.join(dir, 'audit.json'), auditFixture({ name: '@acme/bare', version: '2.0.0', dir: packageDir }))
  const out = path.join(dir, 'out.json')
  mustRun(SIDECAR, buildArgs(dir, { name: '@acme/bare', version: '2.0.0', packageDir, tarball, audit, out }))

  const entry = JSON.parse(fs.readFileSync(out, 'utf8')).entries['@acme/bare@2.0.0']
  assert.equal(entry.title, null)
  assert.equal(entry.repo, null)
  assert.equal(entry.license, null)
  assert.deepEqual(entry.scope, { dsh: '0.2.1-rc.5', cordis: '4.0.6-alpha.1', platform: null })
  assert.deepEqual(entry.checks, [])
  assert.ok(entry.notChecked.includes('ENTRY:checks (no --report; checker results unavailable)'))
  assert.ok(entry.notChecked.includes('ENTRY:runtime (claim=static; not exercised)'))
  assert.equal(entry.checkedBy.checker, CHECKER)
})

test('build-sidecar: a report for a different subject is rejected, not merged', (t) => {
  const dir = tempDir(t)
  const packageDir = path.join(dir, 'plugin')
  writeJson(path.join(packageDir, 'package.json'), { name: '@acme/x', version: '1.2.3', license: 'MIT' })
  const tarball = path.join(dir, 'x.tgz')
  fs.writeFileSync(tarball, 'fake tarball\n')
  const audit = writeJson(path.join(dir, 'audit.json'), auditFixture({ name: '@acme/x', version: '1.2.3', dir: packageDir }))
  const report = writeJson(path.join(dir, 'report.json'), reportFixture('@acme/other', '1.2.3', [
    { id: 'DSC-01', result: 'PASS', coverage: 'full' },
  ]))
  const out = path.join(dir, 'out.json')
  const result = run(SIDECAR, buildArgs(dir, { name: '@acme/x', version: '1.2.3', packageDir, tarball, audit, report, out }))
  assert.equal(result.status, 3)
  assert.match(result.stderr, /does not match/)
  assert.equal(fs.existsSync(out), false)
})

test('build-sidecar: legacy entries survive a lifecycle refresh unchanged (additive)', (t) => {
  const dir = tempDir(t)
  const legacy = legacyEntry('@acme/legacy', '1.0.0', '2027-01-01')
  const rich = richEntry('@acme/rich', '1.0.0', '2027-01-01')
  const prev = writeJson(path.join(dir, 'sidecar.json'), sidecarDocument({ '@acme/legacy@1.0.0': legacy, '@acme/rich@1.0.0': rich }))
  const withdrawals = writeJson(path.join(dir, 'withdrawals.json'), { schema: 'dsh-market-withdrawals/1', withdrawals: [] })
  const out = path.join(dir, 'out.json')
  mustRun(SIDECAR, ['--prev', prev, '--withdrawals', withdrawals, '--out', out, '--today', TODAY])

  const document = JSON.parse(fs.readFileSync(out, 'utf8'))
  assert.deepEqual(document.entries['@acme/legacy@1.0.0'], legacy)
  assert.equal(document.entries['@acme/rich@1.0.0'].title, rich.title)
  assert.deepEqual(document.entries['@acme/rich@1.0.0'].checks, rich.checks)
  assert.deepEqual(document.entries['@acme/rich@1.0.0'].checkedBy, rich.checkedBy)
  assert.deepEqual(document.entries['@acme/rich@1.0.0'].notChecked, rich.notChecked)
  assert.equal(document.generatedAt, '2026-01-01T00:00:00.000Z')

  const before = fs.readFileSync(out, 'utf8')
  const second = json(mustRun(SIDECAR, ['--prev', out, '--withdrawals', withdrawals, '--out', out, '--today', TODAY]))
  assert.equal(second.written, false)
  assert.equal(fs.readFileSync(out, 'utf8'), before)
})

test('build-sidecar: a lifecycle refresh preserves the checker metadata', (t) => {
  const dir = tempDir(t)
  const prev = writeJson(path.join(dir, 'sidecar.json'), sidecarDocument({
    '@acme/keep@1.0.0': richEntry('@acme/keep', '1.0.0', '2027-01-01'),
  }))
  const withdrawals = writeJson(path.join(dir, 'withdrawals.json'), { schema: 'dsh-market-withdrawals/1', withdrawals: [] })
  const out = path.join(dir, 'out.json')

  mustRun(SIDECAR, ['--prev', prev, '--withdrawals', withdrawals, '--out', out, '--today', TODAY])
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')).checker, {
    name: 'dsh-standards', version: '1.3.0', sha: CHECKER_SHA,
  })

  mustRun(SIDECAR, [
    '--prev', prev, '--withdrawals', withdrawals, '--out', out, '--today', TODAY,
    '--checker-version', '9.9.9', '--checker-sha', 'b'.repeat(40),
  ])
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')).checker, {
    name: 'dsh-standards', version: '9.9.9', sha: 'b'.repeat(40),
  })
})

test('build-sidecar: expiry/withdrawal win and keep the additive fields', (t) => {
  const dir = tempDir(t)
  const prev = writeJson(path.join(dir, 'sidecar.json'), sidecarDocument({
    '@acme/old@1.0.0': richEntry('@acme/old', '1.0.0', '2026-10-01'),
    '@acme/gone@1.0.0': richEntry('@acme/gone', '1.0.0', '2027-01-01'),
    '@acme/fresh@1.0.0': richEntry('@acme/fresh', '1.0.0', '2027-01-01'),
  }))
  const withdrawals = writeJson(path.join(dir, 'withdrawals.json'), {
    schema: 'dsh-market-withdrawals/1',
    withdrawals: [{ name: '@acme/gone', version: '1.0.0', date: '2026-11-01', reason: 'tarball removed upstream' }],
  })
  const out = path.join(dir, 'out.json')
  const summary = json(mustRun(SIDECAR, ['--prev', prev, '--withdrawals', withdrawals, '--out', out, '--today', TODAY]))
  assert.equal(summary.lifecycle.stale, 1)
  assert.equal(summary.lifecycle.withdrawn, 1)
  assert.equal(summary.lifecycle.active, 1)

  const document = JSON.parse(fs.readFileSync(out, 'utf8'))
  assert.equal(document.entries['@acme/old@1.0.0'].lifecycle, 'stale')
  assert.equal(document.entries['@acme/gone@1.0.0'].lifecycle, 'withdrawn')
  assert.deepEqual(document.entries['@acme/gone@1.0.0'].lifecycleDetail, {
    since: '2026-11-01',
    reason: 'tarball removed upstream',
  })
  assert.equal(document.entries['@acme/fresh@1.0.0'].lifecycle, 'active')
  for (const key of ['@acme/old@1.0.0', '@acme/gone@1.0.0', '@acme/fresh@1.0.0']) {
    assert.equal(document.entries[key].title, `${document.entries[key].subject.name} title`)
    assert.equal(document.entries[key].checks.length, 3)
    assert.ok(document.entries[key].notChecked.length > 0)
    // Expiry/withdrawal changes only lifecycle; the security block survives untouched.
    assert.deepEqual(document.entries[key].security, richEntry('@acme/x', '1.0.0', '2027-01-01').security)
  }

  // Append-only means a mistakenly rotated-empty list must not revive it.
  const empty = writeJson(path.join(dir, 'empty.json'), { schema: 'dsh-market-withdrawals/1', withdrawals: [] })
  mustRun(SIDECAR, ['--prev', out, '--withdrawals', empty, '--out', out, '--today', '2026-11-07'])
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).entries['@acme/gone@1.0.0'].lifecycle, 'withdrawn')
})

test('build-sidecar: expiry is strict and duplicate builds are deduped byte for byte', (t) => {
  const dir = tempDir(t)
  const packageDir = path.join(dir, 'plugin')
  writeJson(path.join(packageDir, 'package.json'), { name: '@acme/edge', version: '1.0.0', description: 'Edge plugin', license: 'Apache-2.0' })
  const tarball = path.join(dir, 'edge.tgz')
  fs.writeFileSync(tarball, 'fake tarball\n')
  const audit = writeJson(path.join(dir, 'audit.json'), auditFixture({ name: '@acme/edge', version: '1.0.0', dir: packageDir }))
  const report = writeJson(path.join(dir, 'report.json'), reportFixture('@acme/edge', '1.0.0', [
    { id: 'DSC-01', result: 'PASS', coverage: 'full' },
  ]))
  const out = path.join(dir, 'out.json')

  mustRun(SIDECAR, buildArgs(dir, { name: '@acme/edge', version: '1.0.0', packageDir, tarball, audit, report, out }))
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).entries['@acme/edge@1.0.0'].validity.expiresAt, EXPIRES)
  const before = fs.readFileSync(out, 'utf8')

  const args = buildArgs(dir, { name: '@acme/edge', version: '1.0.0', packageDir, tarball, audit, report, out })
  args.push('--prev', out)
  const second = json(mustRun(SIDECAR, args))
  assert.equal(second.entries, 1)
  assert.equal(second.written, false)
  assert.equal(fs.readFileSync(out, 'utf8'), before)

  const edge = writeJson(path.join(dir, 'edge-sidecar.json'), sidecarDocument({
    '@acme/edge@1.0.0': richEntry('@acme/edge', '1.0.0', TODAY),
  }))
  mustRun(SIDECAR, ['--prev', edge, '--withdrawals', writeJson(path.join(dir, 'w.json'), { withdrawals: [] }), '--out', path.join(dir, 'edge-out.json'), '--today', TODAY])
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'edge-out.json'), 'utf8')).entries['@acme/edge@1.0.0'].lifecycle, 'active')
})

test('publish/sidecar.json: 50 real dsh packages carry every additive field and no claims', (t) => {
  const sidecar = readPublishSidecar(REPO)
  assert.equal(sidecar.schema, SCHEMA)
  assert.deepEqual(sidecar.notClaimed, NOT_CLAIMED)
  assert.equal(sidecar.checker.name, 'dsh-standards')
  // checker.version records the build that produced the checks; a lifecycle
  // refresh must preserve it (see the --prev test above). The consistency
  // assertion below pins it to the entries' checkedBy provenance instead of
  // hardcoding a patch number.
  assert.match(sidecar.checker.version, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)
  assert.ok(sidecar.checker.sha === null || /^[0-9a-f]{40}$/.test(sidecar.checker.sha))
  assert.equal(sidecar.index.format, 1)
  assert.match(sidecar.generatedAt, /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/)
  assertNoForbidden(sidecar)
  assertNoKey(sidecar, 'details')

  const keys = Object.keys(sidecar.entries)
  assert.equal(keys.length, PUBLISH_ENTRIES)
  assert.deepEqual(keys, [...keys].sort())

  const checkedByVersions = new Set()
  for (const key of keys) {
    const match = /^dsh-standards@([^\s(]+)/.exec(sidecar.entries[key].checkedBy?.checker ?? '')
    if (match) checkedByVersions.add(match[1])
  }
  assert.ok(checkedByVersions.size > 0, 'real entries must carry checkedBy provenance')
  assert.ok(
    checkedByVersions.has(sidecar.checker.version),
    `sidecar.checker.version ${sidecar.checker.version} is not among the entry checker versions (${[...checkedByVersions].join(', ')})`,
  )

  const names = new Set()
  const shas = new Set()
  let warns = 0
  for (const key of keys) {
    const entry = sidecar.entries[key]
    assert.match(key, /^@?[^@/]+(?:\/[^@]+)?@\d/)
    assert.equal(key, `${entry.subject.name}@${entry.subject.version}`)
    names.add(entry.subject.name)
    assert.match(entry.subject.version, /^\d+\.\d+\.\d+/)
    assert.match(entry.subject.tarballSha256, /^[0-9a-f]{64}$/)
    shas.add(entry.subject.tarballSha256)

    const basename = entry.subject.name.split('/').pop()
    assert.ok(basename === 'dsh-plugin' || basename.startsWith('dsh-'), `${key} should be a dsh plugin name`)
    if (entry.title !== null) {
      assert.equal(typeof entry.title, 'string')
      assert.ok(entry.title.length > 0)
      assert.ok(!entry.title.includes('\n'))
    }
    if (entry.repo !== null) {
      assert.equal(new URL(entry.repo).protocol, 'https:')
    }
    if (entry.license !== null) assert.match(entry.license, /^[A-Za-z0-9.+-]+/)

    assert.ok(entry.scope && typeof entry.scope === 'object')
    for (const field of ['dsh', 'cordis', 'platform']) {
      const value = entry.scope[field]
      assert.ok(value === null || (typeof value === 'string' && value.length > 0), `${key} scope.${field}`)
    }

    assert.equal(entry.checks.length, 14)
    const ids = new Set()
    for (const check of entry.checks) {
      assert.deepEqual(Object.keys(check).sort(), ['coverage', 'id', 'result'])
      assert.ok(['PASS', 'WARN', 'FAIL', 'NA'].includes(check.result), `${key} ${check.id} result`)
      assert.ok(['full', 'partial', 'not-run'].includes(check.coverage), `${key} ${check.id} coverage`)
      ids.add(check.id)
      if (check.result === 'WARN') warns += 1
      // A WARN is never rewritten as PASS.
      assert.notEqual(check.result, 'pass')
    }
    assert.equal(ids.size, entry.checks.length)

    assert.equal(entry.levels.entry.state, 'recognized')
    assert.equal(entry.levels.entry.claim, 'static')
    assert.equal(entry.levels.flow.state, 'not-run')
    assert.equal(entry.levels.boost.state, 'not-measured')

    assert.ok(entry.security, `${key} security block`)
    const security = entry.security
    assert.deepEqual(Object.keys(security).sort(), ['checks', 'command', 'state', 'summary'], `${key} security keys`)
    assert.ok(['checked', 'partial', 'not-run'].includes(security.state), `${key} security.state`)
    assert.equal(security.checks.length, 22)
    assert.equal(security.summary.total, 22)
    assert.equal(security.summary.checked + security.summary.notRun, 22)
    assert.equal(security.command, SECURITY_COMMAND)
    assert.equal(entry.checkedBy.securityCommand, SECURITY_COMMAND)
    // The block is a faithful reduction of the 22 security checks: counts and
    // state are derived, never manually adjusted, and a WARN/FAIL is not hidden.
    const securityIds = []
    const securitySummary = { total: security.checks.length, checked: 0, blocking: 0, warn: 0, na: 0, notRun: 0 }
    for (const check of security.checks) {
      assert.deepEqual(Object.keys(check).sort(), ['coverage', 'id', 'result'])
      assert.ok(['PASS', 'WARN', 'FAIL', 'NA'].includes(check.result), `${key} security ${check.id} result`)
      assert.ok(['full', 'partial', 'not-run'].includes(check.coverage), `${key} security ${check.id} coverage`)
      securityIds.push(check.id)
      if (check.coverage !== 'not-run') securitySummary.checked += 1
      else securitySummary.notRun += 1
      if (check.result === 'FAIL') securitySummary.blocking += 1
      if (check.result === 'WARN') securitySummary.warn += 1
      if (check.result === 'NA') securitySummary.na += 1
    }
    assert.deepEqual(securityIds, [...securityIds].sort(), `${key} security checks are sorted by id`)
    assert.equal(new Set(securityIds).size, 22, `${key} security check ids are unique`)
    assert.deepEqual(security.summary, securitySummary, `${key} security.summary is derived from checks`)
    const expectedSecurityState = securitySummary.checked === 0
      ? 'not-run'
      : securitySummary.checked === securitySummary.total ? 'checked' : 'partial'
    assert.equal(security.state, expectedSecurityState, `${key} security.state matches coverage`)

    assert.match(entry.evidence.reportSha256, /^[0-9a-f]{64}$/)
    assert.equal(entry.evidence.reportUrl, undefined)
    assert.equal(entry.checkedBy.checker.split(' ')[0], `dsh-standards@${sidecar.checker.version}`)
    assert.match(entry.checkedBy.command, /--no-runtime/)
    assert.ok(Array.isArray(entry.notChecked))
    assert.ok(entry.notChecked.some(item => item.startsWith('ENTRY:runtime')))
    assert.ok(entry.notChecked.some(item => item.startsWith('FLOW:')))
    assert.ok(entry.notChecked.some(item => item.startsWith('BOOST:')))

    assert.equal(entry.validity.checkedAt, sidecar.generatedAt.slice(0, 10))
    assert.equal(entry.validity.expiresAt, new Date(Date.parse(`${sidecar.generatedAt.slice(0, 10)}T00:00:00.000Z`) + 90 * 86_400_000).toISOString().slice(0, 10))
    assert.equal(entry.validity.policy, '90d')
    assert.equal(entry.lifecycle, 'active')
    assert.equal(entry.selfAssessed, true)
  }
  assert.equal(names.size, PUBLISH_ENTRIES)
  assert.equal(shas.size, PUBLISH_ENTRIES)
  assert.ok(warns > 0, 'the sample should keep its WARN results visible')

  const withdrawals = JSON.parse(fs.readFileSync(path.join(REPO, 'publish', 'withdrawals.json'), 'utf8'))
  assert.equal(withdrawals.schema, 'dsh-market-withdrawals/1')
  assert.ok(Array.isArray(withdrawals.withdrawals))
  for (const record of withdrawals.withdrawals) {
    assert.equal(typeof record.name, 'string')
    assert.ok(record.name.length > 0)
    assert.ok(!('version' in record) || nonEmpty(record.version), 'withdrawal.version must be omitted or non-empty')
    if ('date' in record) assert.match(record.date, /^\d{4}-\d{2}-\d{2}$/)
  }

  const size = fs.statSync(path.join(REPO, 'publish', 'sidecar.json')).size
  assert.ok(size > 40_000 && size < 500_000, `sidecar size ${size} bytes is outside the expected range`)
})

function nonEmpty(value) {
  return typeof value === 'string' && value.length > 0
}

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
test('build-sidecar: --security-report adds an additive security block', (t) => {
  const dir = tempDir(t)
  const packageDir = path.join(dir, 'plugin')
  writeJson(path.join(packageDir, 'package.json'), { name: '@acme/sec', version: '1.0.0', license: 'MIT' })
  const tarball = path.join(dir, 'sec.tgz')
  fs.writeFileSync(tarball, 'fake tarball\n')
  const audit = writeJson(path.join(dir, 'audit.json'), auditFixture({ name: '@acme/sec', version: '1.0.0', dir: packageDir }))
  const report = writeJson(path.join(dir, 'report.json'), reportFixture('@acme/sec', '1.0.0', [
    { id: 'DSC-01', result: 'PASS', coverage: 'full' },
  ]))
  const security = writeJson(path.join(dir, 'security.json'), reportFixture('@acme/sec', '1.0.0', [
    { id: 'DSC-15', result: 'PASS', coverage: 'full' },
    { id: 'DSC-16', result: 'WARN', coverage: 'full' },
    { id: 'DSC-17', result: 'NA', coverage: 'not-run' },
  ]))
  const out = path.join(dir, 'out.json')
  mustRun(SIDECAR, buildArgs(dir, {
    name: '@acme/sec', version: '1.0.0', packageDir, tarball, audit, report, out,
    extra: ['--security-report', security],
  }))
  const entry = JSON.parse(fs.readFileSync(out, 'utf8')).entries['@acme/sec@1.0.0']
  assert.equal(entry.security.state, 'partial')
  assert.equal(entry.security.checks.length, 3)
  assert.deepEqual(entry.security.summary, { total: 3, checked: 2, blocking: 0, warn: 1, na: 1, notRun: 1 })
  assert.equal(entry.checkedBy.securityCommand, 'dsh-standards check <package-dir> --scope security --json')
  assert.equal(entry.checks.length, 1)
})

test('build-sidecar: security.state is derived from coverage and never claims an audit', (t) => {
  const dir = tempDir(t)
  const packageDir = path.join(dir, 'plugin')
  writeJson(path.join(packageDir, 'package.json'), { name: '@acme/secstate', version: '1.0.0', license: 'MIT' })
  const tarball = path.join(dir, 'secstate.tgz')
  fs.writeFileSync(tarball, 'fake tarball\n')
  const audit = writeJson(path.join(dir, 'audit.json'), auditFixture({ name: '@acme/secstate', version: '1.0.0', dir: packageDir }))
  const report = writeJson(path.join(dir, 'report.json'), reportFixture('@acme/secstate', '1.0.0', [
    { id: 'DSC-01', result: 'PASS', coverage: 'full' },
  ]))
  const cases = [
    {
      expected: 'checked',
      checks: [
        { id: 'DSC-15', result: 'PASS', coverage: 'full' },
        { id: 'DSC-16', result: 'FAIL', coverage: 'full' },
      ],
    },
    {
      expected: 'not-run',
      checks: [
        { id: 'DSC-15', result: 'NA', coverage: 'not-run' },
        { id: 'DSC-16', result: 'NA', coverage: 'not-run' },
      ],
    },
  ]
  for (const testCase of cases) {
    const security = writeJson(path.join(dir, `${testCase.expected}-security.json`), reportFixture('@acme/secstate', '1.0.0', testCase.checks))
    const out = path.join(dir, `${testCase.expected}-out.json`)
    mustRun(SIDECAR, buildArgs(dir, {
      name: '@acme/secstate', version: '1.0.0', packageDir, tarball, audit, report, out,
      extra: ['--security-report', security],
    }))
    const entry = JSON.parse(fs.readFileSync(out, 'utf8')).entries['@acme/secstate@1.0.0']
    assert.equal(entry.security.state, testCase.expected)
    assert.equal(entry.security.summary.total, testCase.checks.length)
    assert.equal(entry.security.summary.checked + entry.security.summary.notRun, testCase.checks.length)
    assert.equal(entry.security.summary.blocking, testCase.checks.filter(check => check.result === 'FAIL').length)
    assert.equal(entry.security.command, SECURITY_COMMAND)
    // A FAIL result is preserved, never rewritten into PASS or treated as an audit verdict.
    assert.deepEqual(entry.security.checks.map(check => check.result).sort(), testCase.checks.map(check => check.result).sort())
  }
})

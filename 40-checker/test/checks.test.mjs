import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runManifestChecks } from '../src/manifest.mjs'
import { checkCapabilities, checkCredentials, checkImportTimeAdvisory, checkLabels } from '../src/declarations.mjs'
import { readSources } from '../src/util.mjs'
import { buildReport } from '../src/report.mjs'
import { parseInstallSpec } from '../src/install-spec.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const good = path.join(here, '..', 'fixtures', 'good')
const bad = path.join(here, '..', 'fixtures', 'bad')

test('good fixture passes manifest and version checks', () => {
  const result = runManifestChecks(good)
  assert.equal(result.kind, 'plugin')
  assert.equal(result.checks[0].id, 'DSC-01')
  assert.equal(result.checks[0].result, 'PASS')
  assert.equal(result.checks[1].result, 'PASS')
  assert.equal(result.checks[2].result, 'NA')
})

test('patch-only bundle reports C-1.2 as NA, not WARN', () => {
  const result = runManifestChecks(path.join(here, '..', 'fixtures', 'bundle-patch-only'))
  const dsc01 = result.checks.find((check) => check.id === 'DSC-01')
  const entry = dsc01.details.find((detail) => detail.item === 'C-1.2')
  assert.equal(entry.result, 'NA')
  assert.match(entry.reason, /patch-only bundle/)
})

test('bad fixture fails version and warns licence', () => {
  const result = runManifestChecks(bad)
  assert.equal(result.checks[0].result, 'WARN')
  assert.equal(result.checks[1].result, 'FAIL')
  assert.match(result.checks[1].reason, /engines\.dsh|peer/)
})

test('good fixture declarations are consistent', () => {
  const result = runManifestChecks(good)
  const sources = readSources(good)
  const caps = checkCapabilities(result.manifest, sources, result.patch)
  const creds = checkCredentials(result.manifest, sources)
  const labels = checkLabels(result.manifest, sources)
  assert.equal(caps.result, 'PASS', caps.reason)
  assert.equal(creds.result, 'PASS', creds.reason)
  assert.equal(labels.result, 'PASS', labels.reason)
})

test('DSC-11: session.append requires sessions:write, not sessions:read', () => {
  const sources = [{ relative: 'index.mjs', text: "agent.session.append('permissionRules/decision', { decision: 'allow' })\n" }]
  const declared = checkCapabilities({ dsh: { capabilities: ['sessions:write'] } }, sources)
  assert.equal(declared.result, 'PASS', declared.reason)
  const undeclared = checkCapabilities({ dsh: { capabilities: ['sessions:read'] } }, sources)
  assert.equal(undeclared.result, 'FAIL', undeclared.reason)
  assert.ok(
    undeclared.details.some((detail) => detail.item === 'C-11.2' && /sessions:write/.test(detail.reason)),
    JSON.stringify(undeclared.details),
  )
})

test('bad fixture rejects official label and unknown capability', () => {
  const result = runManifestChecks(bad)
  const sources = readSources(bad)
  const caps = checkCapabilities(result.manifest, sources, result.patch)
  const labels = checkLabels(result.manifest, sources)
  assert.equal(labels.result, 'FAIL')
  assert.match(labels.reason, /official|forbidden/)
  assert.equal(caps.result, 'WARN')
})

test('parseInstallSpec pins git and rejects floating git', () => {
  const pinned = parseInstallSpec('github:acme/dsh-greet#0123456789abcdef0123456789abcdef01234567')
  assert.equal(pinned.kind, 'git')
  assert.equal(pinned.pinned, true)
  assert.throws(() => parseInstallSpec('github:acme/dsh-greet'), /pin/)
  assert.equal(parseInstallSpec('@acme/dsh-greet@1.2.3').pinned, true)
  assert.equal(parseInstallSpec('@acme/dsh-greet').pinned, false)
})

test('report marks missing mandatory checks as incomplete', () => {
  const checks = [
    { id: 'DSC-01', clause: 'C-1', layer: 'L0', result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [] },
    { id: 'DSC-02', clause: 'C-2', layer: 'L0', result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [] },
  ]
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks,
    scope: 'ds-c',
    profile: 'package',
    kind: 'plugin',
  })
  assert.equal(report.conclusion.status, 'incomplete')
  assert.equal(report.conclusion.exitCode, 2)
  assert.equal(report.conclusion.level, null)
  assert.ok(report.coverage.notRun > 0)
})

test('report passes when all mandatory checks are full and clean', () => {
  const checks = ['DSC-01', 'DSC-02', 'DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09', 'DSC-11', 'DSC-12', 'DSC-13']
    .map(id => ({ id, clause: id.replace('DSC', 'C'), layer: 'L0', result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [] }))
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks,
    scope: 'ds-c',
    profile: 'package',
    kind: 'plugin',
  })
  assert.equal(report.conclusion.status, 'pass')
  assert.equal(report.conclusion.exitCode, 0)
  assert.equal(report.conclusion.level, 'DS-C (package)')
})

test('static-only M1 report maps L1-L3 to NA and issues DS-C static', () => {
  const checks = ['DSC-01', 'DSC-02', 'DSC-03', 'DSC-11', 'DSC-12', 'DSC-13']
    .map(id => ({ id, clause: id.replace('DSC', 'C'), layer: 'L0', result: 'PASS', coverage: 'full', reason: '', details: [], evidence: [] }))
    .concat(['DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09'].map(id => ({ id, clause: id.replace('DSC', 'C'), layer: 'L1', result: 'ERROR', coverage: 'not-run', reason: 'no runtime', details: [], evidence: [] })))
  const report = buildReport({
    subject: { mode: 'listing', profile: 'listing', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks,
    scope: 'ds-c',
    profile: 'listing',
    kind: 'plugin',
    staticOnly: true,
  })
  assert.equal(report.conclusion.status, 'pass')
  assert.equal(report.conclusion.level, 'DS-C static')
  assert.equal(report.conclusion.staticOnly, true)
  assert.equal(report.checks.find(item => item.id === 'DSC-04').result, 'NA')
})

function entryChecks(overrides = {}) {
  const make = (id, clause, result = 'PASS', details = []) => ({ id, clause, layer: 'L0', result, coverage: result === 'ERROR' ? 'not-run' : 'full', reason: '', details, evidence: [] })
  return [
    make('DSC-01', 'C-1'),
    make('DSC-02', 'C-2', overrides.c2Result ?? 'PASS', overrides.c2Details ?? []),
    make('DSC-11', 'C-11'),
    make('DSC-12', 'C-12'),
    make('DSC-13', 'C-13'),
    make('DSC-14', 'C-14', overrides.runResult ?? 'PASS'),
  ]
}

test('entry: C-2.1 only is WARN, runtime level', () => {
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks: entryChecks({ c2Result: 'FAIL', c2Details: [{ item: 'C-2.1', result: 'FAIL', reason: 'no engines' }] }),
    scope: 'entry', profile: 'package', kind: 'plugin',
  })
  assert.equal(report.conclusion.status, 'warn')
  assert.equal(report.conclusion.level, 'DSH-ENTRY runtime (warnings)')
})

test('entry: C-2.2 remains blocking', () => {
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks: entryChecks({ c2Result: 'FAIL', c2Details: [{ item: 'C-2.2', result: 'FAIL', reason: 'peer mismatch' }] }),
    scope: 'entry', profile: 'package', kind: 'plugin',
  })
  assert.equal(report.conclusion.status, 'fail')
  assert.ok(report.coverage.entryBlocking.failed.includes('C-2.2'))
})

test('entry: no runtime is incomplete, not static pass', () => {
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks: entryChecks({ runResult: 'ERROR' }),
    scope: 'entry', profile: 'package', kind: 'plugin',
  })
  assert.equal(report.conclusion.status, 'incomplete')
  assert.equal(report.conclusion.exitCode, 2)
  assert.equal(report.conclusion.level, null)
})

test('entry: static claim recognizes without runtime', () => {
  const checks = entryChecks().filter(c => c.id !== 'DSC-14')
  const report = buildReport({
    subject: { mode: 'package', profile: 'package', kind: 'plugin', kindInferred: false, name: 'x', version: '1.0.0', path: here },
    anchor: { repo: 'x', commit: '0'.repeat(40), scanner: 'x', dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1', runtime: null },
    checks,
    scope: 'entry', profile: 'package', kind: 'plugin', entryClaim: 'static',
  })
  assert.equal(report.conclusion.status, 'pass')
  assert.equal(report.conclusion.level, 'DSH-ENTRY recognized')
  assert.equal(report.conclusion.exitCode, 0)
})

test('DSC-10.4: flags a module-scope fs mutation in the entry module', () => {
  const dir = path.join(here, '..', 'fixtures', 'import-side-effect')
  const result = runManifestChecks(dir)
  const check = checkImportTimeAdvisory(readSources(dir), result.entry?.relative)
  assert.equal(check.result, 'WARN', check.reason)
  assert.ok(check.details.some((detail) => /top-level fs mutation/.test(detail.reason)), JSON.stringify(check.details))
})

test('DSC-10.4: ignores a module-scope fs mutation outside the entry module', () => {
  const dir = path.join(here, '..', 'fixtures', 'import-side-effect-nonentry')
  const result = runManifestChecks(dir)
  const check = checkImportTimeAdvisory(readSources(dir), result.entry?.relative)
  assert.equal(check.result, 'PASS', check.reason)
})

test('DSC-10.4: a clean entry module still passes', () => {
  const result = runManifestChecks(good)
  const check = checkImportTimeAdvisory(readSources(good), result.entry?.relative)
  assert.equal(check.result, 'PASS', check.reason)
})

test('DSC-10.1/2: the existing patterns are entry-scoped too', () => {
  const dir = path.join(here, '..', 'fixtures', 'import-side-effect-nonentry')
  const result = runManifestChecks(dir)
  const check = checkImportTimeAdvisory(readSources(dir), result.entry?.relative)
  assert.equal(check.result, 'PASS', check.reason)
})

test('DSC-10.4: a read-only openSync is not a write mutation', () => {
  const dir = path.join(here, '..', 'fixtures', 'import-open-readonly')
  const result = runManifestChecks(dir)
  const check = checkImportTimeAdvisory(readSources(dir), result.entry?.relative)
  assert.equal(check.result, 'PASS', check.reason)
})

test('DSC-10: no source files is NA, not WARN', () => {
  const dir = path.join(here, '..', 'fixtures', 'no-source')
  const check = checkImportTimeAdvisory(readSources(dir), 'index.mjs')
  assert.equal(check.result, 'NA', check.reason)
  assert.match(check.reason, /no source/)
})

test('DSC-10.2: flags an immediate module-scope void main()', () => {
  const dir = path.join(here, '..', 'fixtures', 'import-void-main')
  const result = runManifestChecks(dir)
  const check = checkImportTimeAdvisory(readSources(dir), result.entry?.relative)
  assert.equal(check.result, 'WARN', check.reason)
  assert.ok(check.details.some((detail) => /immediate main/.test(detail.reason)), JSON.stringify(check.details))
})

test('DSC-10.1/2: AST catches top-level await, timer, process hooks and globals', () => {
  const text = [
    "await Promise.resolve()",
    'for await (const item of []) {}',
    "setInterval(() => {}, 1000)",
    "process.on('SIGINT', () => {})",
    "process.env.DSH_FIXTURE = '1'",
    'globalThis.__dshFixture = true',
  ].join('\n')
  const check = checkImportTimeAdvisory([{ relative: 'index.mjs', text }], 'index.mjs')
  assert.equal(check.result, 'WARN', check.reason)
  assert.equal(check.details.filter((detail) => /top-level await/.test(detail.reason)).length, 2)
  for (const pattern of ['top-level setInterval', 'top-level process.on', 'top-level process.env assignment', 'top-level globalThis assignment']) {
    assert.ok(check.details.some((detail) => detail.reason.includes(pattern)), `${pattern}: ${JSON.stringify(check.details)}`)
  }
})

test('DSC-10.4: member fs writes and module-scope control flow count', () => {
  const text = [
    "import * as fs from 'node:fs'",
    'if (process.env.DSH_FIXTURE) {',
    "  fs.writeFileSync('/tmp/dsh-fixture-member-write.txt', 'x')",
    '}',
  ].join('\n')
  const check = checkImportTimeAdvisory([{ relative: 'index.mjs', text }], 'index.mjs')
  assert.equal(check.result, 'WARN', check.reason)
  assert.ok(check.details.some((detail) => /top-level fs mutation/.test(detail.reason)), JSON.stringify(check.details))
})

test('DSC-10: function, arrow and class-method bodies are not module-scope side effects', () => {
  const text = [
    "function a() { writeFileSync('/tmp/a', 'x') }",
    "const b = () => spawnSync('cmd')",
    "class C { m() { process.on('x', () => {}) } }",
    'const d = { n() { setInterval(() => {}, 1) } }',
  ].join('\n')
  const check = checkImportTimeAdvisory([{ relative: 'index.mjs', text }], 'index.mjs')
  assert.equal(check.result, 'PASS', check.reason)
})

test('DSC-12 C-12.4: ignores comment-only literals', () => {
  const dir = path.join(here, '..', 'fixtures', 'c12-comment')
  const check = checkCredentials({}, readSources(dir))
  assert.equal(check.result, 'PASS', check.reason)
})

test('DSC-12 C-12.4: ignores equality comparisons', () => {
  const dir = path.join(here, '..', 'fixtures', 'c12-compare')
  const check = checkCredentials({}, readSources(dir))
  assert.equal(check.result, 'PASS', check.reason)
})

test('DSC-12 C-12.4: still flags an actual set() grant', () => {
  const dir = path.join(here, '..', 'fixtures', 'c12-grant')
  const check = checkCredentials({}, readSources(dir))
  assert.equal(check.result, 'WARN', check.reason)
  assert.ok(check.details.some((detail) => detail.item === 'C-12.4'), JSON.stringify(check.details))
})

test('DSC-12 C-12.4: console-only documentation string is not a grant', () => {
  const dir = path.join(here, '..', 'fixtures', 'c12-string')
  const check = checkCredentials({}, readSources(dir))
  assert.equal(check.result, 'PASS', check.reason)
  assert.ok(!check.details.some((detail) => detail.item === 'C-12.4'), JSON.stringify(check.details))
})

test('DSC-12 C-12.4: console/desc documentation strings are not grants', () => {
  const dir = path.join(here, '..', 'fixtures', 'c12-doc-string')
  const check = checkCredentials({}, readSources(dir))
  assert.equal(check.result, 'PASS', check.reason)
  assert.ok(!check.details.some((detail) => detail.item === 'C-12.4'), JSON.stringify(check.details))
})

test('DSC-11 C-11.4: console/desc documentation strings are not danger literals', () => {
  const dir = path.join(here, '..', 'fixtures', 'c12-doc-string')
  const check = checkCapabilities({}, readSources(dir))
  assert.ok(!check.details.some((detail) => detail.item === 'C-11.4'), JSON.stringify(check.details))
})

test('DSC-11 C-11.4: --add-dir alone is a C-12.4 concern, not C-11.4', () => {
  const sources = [{ relative: 'index.mjs', text: "spawn('dsh', ['--add-dir', './docs'])\n" }]
  const check = checkCapabilities({}, sources)
  assert.ok(!check.details.some((detail) => detail.item === 'C-11.4'), JSON.stringify(check.details))
})

test('DSC-12 C-12.4: spawn args with --add-dir are a real command string', () => {
  const dir = path.join(here, '..', 'fixtures', 'c12-command-arg')
  const check = checkCredentials({}, readSources(dir))
  assert.equal(check.result, 'WARN', check.reason)
  assert.ok(check.details.some((detail) => detail.item === 'C-12.4'), JSON.stringify(check.details))
})

test('DSC-12 C-12.4: set/resolve/mode/switch contexts are real grants', () => {
  const text = [
    "svc.set(session, 'danger-full-access')",
    "svc.resolve('danger-full-access')",
    "const policy = { sandboxPolicy: { mode: 'danger-full-access' } }",
    "switch (mode) { case 'danger-full-access': break }",
  ].join('\n')
  const check = checkCredentials({}, [{ relative: 'index.mjs', text }])
  assert.equal(check.result, 'WARN', check.reason)
  const detail = check.details.find((item) => item.item === 'C-12.4')
  assert.ok(detail, JSON.stringify(check.details))
  assert.match(detail.reason, /\b4\b/)
})

test('DSC-12 C-12.4: nested command properties outrank documentation keys', () => {
  const check = checkCredentials({}, [{ relative: 'index.mjs', text: "const policy = { sandboxPolicy: { description: 'danger-full-access' } }\n" }])
  assert.equal(check.result, 'WARN', check.reason)
})

test('DSC-12 C-12.4: an unknown context stays a conservative warning', () => {
  const check = checkCredentials({}, [{ relative: 'index.mjs', text: "const mode = 'danger-full-access'\n" }])
  assert.equal(check.result, 'WARN', check.reason)
})

test('DSC-12 C-12.4: an unparsable source is not-run, not PASS', () => {
  const check = checkCredentials({}, [{ relative: 'index.mjs', text: 'const broken = {\n' }])
  assert.equal(check.result, 'ERROR', check.reason)
  assert.equal(check.coverage, 'not-run')
  assert.ok(check.details.some((detail) => detail.item === 'C-12.4' && /not-run/.test(detail.reason)), JSON.stringify(check.details))
})

test('DSC-10.3: follows a local relative import and flags its top-level fs mutation', () => {
  const dir = path.join(here, '..', 'fixtures', 'import-local-side-effect')
  const result = runManifestChecks(dir)
  const check = checkImportTimeAdvisory(readSources(dir), result.entry?.relative)
  assert.equal(check.result, 'WARN', check.reason)
  assert.ok(check.details.some((detail) => /top-level fs mutation/.test(detail.reason) && /side-effectful\.mjs/.test(detail.reason)), JSON.stringify(check.details))
})

test('DSC-10.3: a package-only entry is PASS with a C-10.3 not-run coverage note', () => {
  const dir = path.join(here, '..', 'fixtures', 'import-package-only')
  const result = runManifestChecks(dir)
  const check = checkImportTimeAdvisory(readSources(dir), result.entry?.relative)
  assert.equal(check.result, 'PASS', check.reason)
  const note = check.details.find((detail) => detail.item === 'C-10.3')
  assert.ok(note, JSON.stringify(check.details))
  assert.match(note.reason, /not-run/)
  assert.match(note.reason, /node:path/)
})

test('DSC-10.3: an unresolved local import records not-run without becoming a WARN', () => {
  const sources = [{ relative: 'index.mjs', text: "import './missing-module.mjs'\n" }]
  const check = checkImportTimeAdvisory(sources, 'index.mjs')
  assert.equal(check.result, 'PASS', check.reason)
  assert.ok(check.details.some((detail) => detail.item === 'C-10.3' && /not-run/.test(detail.reason)), JSON.stringify(check.details))
})

test('DSC-10.3: a require inside a function is not an import-time edge', () => {
  const sources = [
    { relative: 'index.mjs', text: "function load() { return require('./side-effectful.mjs') }\n" },
    { relative: 'side-effectful.mjs', text: "writeFileSync('/tmp/x', 'x')\n" },
  ]
  const check = checkImportTimeAdvisory(sources, 'index.mjs')
  assert.equal(check.result, 'PASS', check.reason)
  assert.ok(!check.details.some((detail) => /side-effectful/.test(detail.reason)), JSON.stringify(check.details))
})

test('DSC-10: an unparsable entry is ERROR/not-run, not PASS', () => {
  const dir = path.join(here, '..', 'fixtures', 'import-parse-error')
  const result = runManifestChecks(dir)
  const check = checkImportTimeAdvisory(readSources(dir), result.entry?.relative)
  assert.equal(check.result, 'ERROR', check.reason)
  assert.equal(check.coverage, 'not-run')
})

test('DSC-10/DSC-12: a broken .d.ts is skipped, not ERROR', () => {
  const dir = path.join(here, '..', 'fixtures', 'declaration-file')
  const result = runManifestChecks(dir)
  const c10 = checkImportTimeAdvisory(readSources(dir), result.entry?.relative)
  const c12 = checkCredentials({}, readSources(dir))
  assert.equal(c10.result, 'PASS', c10.reason)
  assert.equal(c12.result, 'PASS', c12.reason)
})

test('DSC-12 C-12.4: one unparsable non-entry file is partial, not ERROR', () => {
  const dir = path.join(here, '..', 'fixtures', 'parse-error-nonentry')
  const check = checkCredentials({}, readSources(dir))
  assert.notEqual(check.result, 'ERROR', check.reason)
  assert.equal(check.coverage, 'partial')
  assert.ok(check.details.some((detail) => detail.item === 'C-12.4' && /not-run/.test(detail.reason)), JSON.stringify(check.details))
})

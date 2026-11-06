import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { escapeHtml, priorityFixes, renderHtml, renderMarkdown } from '../src/author-report.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const BIN = path.join(STD, 'bin', 'dsh-standards.mjs')
const GOOD = path.join(STD, '40-checker', 'fixtures', 'good')
const BAD = path.join(STD, '40-checker', 'fixtures', 'bad')
const SCHEMA = path.join(STD, 'spec', 'schemas', 'advice.schema.json')
const ARGS = ['--scope', 'entry', '--entry-claim', 'static', '--no-exec']

function runCheck(args, options = {}) {
  return spawnSync(process.execPath, [BIN, 'check', ...args], { encoding: 'utf8', timeout: 120_000, ...options })
}

function sampleReport(overrides = {}) {
  const check = (id, result, extra = {}) => ({
    id, clause: id.replace('DSC', 'C'), layer: 'L0', result,
    coverage: extra.coverage ?? (result === 'NA' || result === 'ERROR' ? 'not-run' : 'full'),
    reason: extra.reason ?? `${id} ${result}`, details: [], evidence: [], advisory: false,
  })
  return {
    schema: 'dsh-conformance/1',
    subject: { name: '@acme/evil', version: '1.0.0', kind: 'plugin', kindInferred: false },
    anchor: { dsh: '0.2.1-rc.5', runtimeSource: 'host', suspect: false },
    coverage: { total: 14, checked: 6, pass: 5, warn: 1, fail: 0, na: 2, notRun: 6, error: 6, advisory: 0 },
    metrics: { checked: 6, total: 14, declaredFields: 1 },
    buckets: {
      blocking: [],
      hygiene: [{ id: 'DSC-02', clause: 'C-2', result: 'WARN', coverage: 'full', reason: 'engines.dsh <script>alert(1)</script> misses the host', declaration: false, advisory: false }],
      notChecked: [check('DSC-03', 'NA', { reason: 'install spec not supplied' })],
    },
    checks: [check('DSC-01', 'PASS'), check('DSC-02', 'WARN'), check('DSC-03', 'NA')],
    advice: [1, 2, 3, 4, 5].map(index => ({
      key: `C-2.${index}`, gate: 'WARN', severity: 'WARN', title: `fix ${index}`,
      why: null, fix: `do the fix ${index}`, docsUrl: null, source: 'DSC-02',
      version: '1.2.2', evidence: [], reason: '', occurrences: 1, advisory: false,
    })),
    conclusion: {
      headline: 'entry/package · runtime 0.2.1-rc.5 host · blocking 0 · hygiene 1 · not checked 1/14',
      level: 'DSH-ENTRY recognized (warnings)', status: 'warn', exitCode: 0,
      profile: 'package', scope: 'entry', reason: 'WARN: DSC-02',
    },
    ...overrides,
  }
}

test('check: Markdown has a one-line conclusion, <=3 fixes, all buckets, advice and disclaimer', () => {
  const run = runCheck([GOOD, ...ARGS])
  assert.equal(run.status, 0, run.stderr)
  const md = run.stdout
  assert.match(md, /^# DSH standards check — @dsh-fixtures\/good-plugin@1\.0\.0/m)
  assert.match(md, /\*\*Conclusion:\*\* entry\/package · runtime .* · blocking 0 .*hygiene \d+ .*not checked 8\/14/)
  const fixes = md.split('## Priority fixes (up to 3)')[1].split('## Blocking')[0]
  const numbered = fixes.match(/^\d+\. /gm) ?? []
  assert.ok(numbered.length <= 3, `priority fixes: ${numbered.length}`)
  assert.match(md, /## Blocking \(FAIL\) — 0/)
  assert.match(md, /## Hygiene \(WARN\) — \d+/)
  assert.match(md, /## Not checked \(NA \/ not-run \/ ERROR\) — 8/)
  assert.match(md, /## Advice \(non-blocking\) — \d+/)
  assert.match(md, /## What this report does not check/)
  assert.match(md, /not a certification, security audit, endorsement, or ranking/)
})

test('check --json: raw dsh-conformance/1 report with advice and buckets', () => {
  const run = runCheck([GOOD, ...ARGS, '--json'])
  assert.equal(run.status, 0, run.stderr)
  const report = JSON.parse(run.stdout)
  assert.equal(report.schema, 'dsh-conformance/1')
  assert.ok(Array.isArray(report.advice))
  assert.equal(report.coverage.total, 14)
  assert.equal(typeof report.buckets.notChecked.length, 'number')
  assert.equal(report.metrics.total, 14)
})

test('check: the directory defaults to the current working directory', () => {
  const run = runCheck(['--scope', 'entry', '--entry-claim', 'static', '--no-exec', '--json'], { cwd: GOOD })
  assert.equal(run.status, 0, run.stderr)
  const report = JSON.parse(run.stdout)
  assert.equal(report.subject.name, '@dsh-fixtures/good-plugin')
  assert.equal(report.subject.path, GOOD)
})

test('check --json preserves a FAIL exit code', () => {
  const run = runCheck([BAD, '--no-exec', '--json'])
  assert.equal(run.status, 1, run.stderr)
  const report = JSON.parse(run.stdout)
  assert.equal(report.conclusion.exitCode, 1)
  assert.equal(report.conclusion.status, 'fail')
})

test('check --html writes one self-contained file with inline CSS and no scripts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-check-html-'))
  const out = path.join(dir, 'report.html')
  try {
    const run = runCheck([GOOD, ...ARGS, '--html', out])
    assert.equal(run.status, 0, run.stderr)
    assert.match(run.stdout, /wrote .*report\.html/)
    const html = fs.readFileSync(out, 'utf8')
    assert.match(html, /^<!doctype html>/)
    assert.match(html, /<style>/)
    assert.doesNotMatch(html, /<script/i)
    assert.doesNotMatch(html, /<link\b/i)
    assert.doesNotMatch(html, /<img\b/i)
    assert.match(html, /Blocking \(FAIL\)/)
    assert.match(html, /What this report does not check/)
    assert.match(html, /not a certification/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('renderHtml escapes every dynamic field, including a <script> package name', () => {
  const html = renderHtml(sampleReport())
  assert.doesNotMatch(html, /<script/i)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /@acme\/evil/)
})

test('renderMarkdown keeps priority fixes to three unique keys', () => {
  const report = sampleReport()
  assert.equal(priorityFixes(report).length, 3)
  assert.deepEqual(priorityFixes(report).map(item => item.key), ['C-2.1', 'C-2.2', 'C-2.3'])
  const md = renderMarkdown(report)
  assert.match(md, /## Hygiene \(WARN\) — 1/)
})

function sampleSecurityReport(overrides = {}) {
  return sampleReport({
    security: {
      scope: 'advisory',
      status: 'warn',
      checks: [
        { id: 'DSC-15', clause: 'C-15', result: 'PASS', coverage: 'full', reason: '' },
        { id: 'DSC-16', clause: 'C-16', result: 'WARN', coverage: 'partial', reason: 'capped WARN: dynamic execution <script>alert(1)</script>' },
        { id: 'DSC-22', clause: 'C-22', result: 'NA', coverage: 'not-run', reason: 'no registry metadata/attestation input; not-run' },
      ],
      blocking: [],
      warn: ['DSC-16'],
      advisory: [],
      partial: [{ id: 'DSC-16', reason: 'capped WARN: dynamic execution' }],
      notRun: ['DSC-22'],
    },
    ...overrides,
  })
}

test('renderMarkdown renders the security block with status, counts and only non-PASS rows', () => {
  const md = renderMarkdown(sampleSecurityReport())
  assert.match(md, /## Security \(advisory\)/)
  assert.match(md, /- Status: \*\*warn\*\* · blocking 0 · warn 1 · advisory 0 · partial 1 · notRun 1/)
  assert.match(md, /- DSC-16 WARN — capped WARN: dynamic execution/)
  assert.match(md, /- DSC-22 NA — no registry metadata/)
  assert.doesNotMatch(md, /- DSC-15 PASS/)
  assert.match(md, /Static clues only: this block is not a security proof, audit, or certification\./)

  // Eight rows max; the rest is folded into a single "more" line.
  const many = sampleSecurityReport()
  many.security.checks = Array.from({ length: 10 }, (_, index) => ({ id: `X-${index}`, result: 'WARN', coverage: 'full', reason: 'r' }))
  const folded = renderMarkdown(many)
  assert.equal((folded.match(/^- X-\d+ WARN/gm) ?? []).length, 8)
  assert.match(folded, /…and 2 more non-PASS checks/)
})

test('renderHtml renders the security block and escapes its dynamic values', () => {
  const html = renderHtml(sampleSecurityReport())
  assert.match(html, /<h2>Security \(advisory\)<\/h2>/)
  assert.match(html, /<strong class="result warn">DSC-16 WARN<\/strong>/)
  assert.match(html, /Status: <strong>warn<\/strong> · blocking 0 · warn 1 · advisory 0 · partial 1 · notRun 1/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script/i)
})

test('renderMarkdown and renderHtml omit an empty security block', () => {
  const emptySecurity = { scope: 'advisory', status: 'pass', checks: [], blocking: [], warn: [], advisory: [], partial: [], notRun: [] }
  for (const report of [sampleReport(), sampleReport({ security: null }), sampleReport({ security: emptySecurity })]) {
    assert.doesNotMatch(renderMarkdown(report), /## Security \(/)
    assert.doesNotMatch(renderHtml(report), /Security \(/)
  }
})

test('advice.schema.json declares dsh-advice/1 with 13 required fields', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'))
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.equal(schema.type, 'array')
  assert.equal(schema.items.required.length, 13)
  assert.deepEqual(schema.items.properties.gate.enum, ['FAIL', 'WARN'])
  assert.deepEqual(schema.items.properties.severity.enum, ['FAIL', 'WARN'])
  assert.equal(schema.items.properties.evidence.maxItems, 10)
  for (const nullable of ['why', 'fix', 'docsUrl']) {
    assert.deepEqual(schema.items.properties[nullable].type, ['string', 'null'])
  }
})

test('every advice entry produced by the checker matches the published schema', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'))
  // Build a package that is guaranteed to produce advice (no license, no engines.dsh)
  // instead of relying on a shared fixture whose cleanliness can drift.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'advice-schema-'))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'advice-fixture', version: '1.0.0', main: 'index.mjs' }))
  fs.writeFileSync(path.join(dir, 'index.mjs'), 'export const answer = 42\n')
  const report = JSON.parse(runCheck([dir, ...ARGS, '--json']).stdout)
  assert.ok(report.advice.length > 0)
  const allowed = new Set(Object.keys(schema.items.properties))
  for (const item of report.advice) {
    for (const key of schema.items.required) assert.ok(Object.hasOwn(item, key), `advice.${key} missing`)
    for (const key of Object.keys(item)) assert.ok(allowed.has(key), `advice.${key} is not in the schema`)
    assert.ok(['FAIL', 'WARN'].includes(item.gate))
    assert.ok(['FAIL', 'WARN'].includes(item.severity))
    assert.ok(Array.isArray(item.evidence) && item.evidence.length <= 10)
    assert.ok(Number.isInteger(item.occurrences) && item.occurrences >= 1)
    assert.equal(typeof item.advisory, 'boolean')
    for (const nullable of ['why', 'fix', 'docsUrl']) assert.ok(item[nullable] === null || typeof item[nullable] === 'string')
  }
})

test('--help fixes the Usage name for both the umbrella and the check subcommand', () => {
  const umbrella = spawnSync(process.execPath, [BIN, '--help'], { encoding: 'utf8', timeout: 60_000 })
  assert.equal(umbrella.status, 0)
  assert.match(umbrella.stdout, /Usage:\n[\s\S]*dsh-standards check \[dir\]/)
  assert.doesNotMatch(umbrella.stdout, /Usage:\n\s+dsh-plugin-verify <package-dir>/)
  const sub = runCheck(['--help'])
  assert.equal(sub.status, 0)
  assert.match(sub.stdout, /dsh-standards check — author-facing standards report/)
  assert.match(sub.stdout, /dsh-standards check \[dir\]/)
})

test('check rejects --format instead of silently emitting non-JSON', () => {
  const run = runCheck([GOOD, '--format', 'text'])
  assert.equal(run.status, 3)
  assert.match(run.stderr, /--json or --html/)
})

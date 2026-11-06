#!/usr/bin/env node
/**
 * level-audit.mjs — one-command self-check against the three DSH adoption levels.
 *
 * What it does:
 *   ENTRY  runs the existing ENTRY checker (static by default; real G0-G3 boot
 *          when --host is supplied) and maps its conclusion to an evidence state.
 *   FLOW   reads an optional `dsh-flow-evidence/2` file; with no file it reports
 *          the checklist as `not-run` and never invents a pass. v1 schemas and
 *          bare {Jx:{status}} rows are `deprecated` and never count as a pass.
 *          Only sandbox-attested evidence (claims.claimLevel =
 *          'sandbox-attested' or producer.kind = 'sandbox') may become
 *          `runtime`; self-attested/ci-attested keeps its pass count but stays
 *          `not-run`.
 *   BOOST  reads an optional LEV evidence file; with no file it reports
 *          `not-measured`. It does not run benchmarks for you.
 *
 * The machine source of truth is `spec/levels.json`; this tool only reads it.
 * Zero dependencies: it shells out to the checker already in this repo.
 *
 * Usage:
 *   node 40-checker/scripts/level-audit.mjs <plugin-dir>
 *   node 40-checker/scripts/level-audit.mjs <bundle-dir> --host <app-boot/lib/index.js> \
 *     --base <dsh-base/cordis.patch.yml> --bare <farm> [--timeout 150000]
 *   node 40-checker/scripts/level-audit.mjs <dir> --flow-evidence flow.json \
 *     --boost-evidence boost.json --format json --out audit.json
 *
 * Exit codes: 0 ENTRY recognized/runtime; 2 ENTRY failed; 3 audit could not run.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { FLOW_IDS, FLOW_EVIDENCE_SCHEMA, validateFlowEvidence } from '../src/flow-evidence.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const LEVELS_PATH = path.join(STD, 'spec', 'levels.json')
const CHECKER = path.join(STD, '40-checker', 'bin', 'dsh-plugin-verify.mjs')

function usage() {
  console.log(`level-audit — DSH-ENTRY / FLOW / BOOST self-check

Usage:
  node 40-checker/scripts/level-audit.mjs <plugin-dir> [options]

Options:
  --host <file>            app-boot lib/index.js; enables real ENTRY G0-G3
  --base <file>            dsh-base cordis.patch.yml
  --bare <dir>             bare-module farm for the bundle smoke
  --no-runtime             force static ENTRY even when --host is given
  --flow-evidence <file>   dsh-flow-evidence/2 JSON from dsh-flow-collect.mjs (J1-J8 checks
                            with command/exitCode/times/stdout sha256/assertions). v1 and bare
                            {Jx:{status}} files are reported deprecated and never count as pass.
  --boost-evidence <file>  JSON: { "LEV-3": { "status": "measured|not-measured|failed", "evidenceCard": { ... } }, ... }
                            measured requires a valid evidence card; a status-only row is downgraded to not-measured
  --timeout <ms>           checker timeout, default 150000
  --format text|json       default text
  --out <file>             write the JSON result
  --help                   show this help

The tool never upgrades a skip to a pass. FLOW and BOOST without evidence files
are reported as not-run / not-measured.`)
}

function parseArgs(argv) {
  const options = {
    dir: null, host: null, base: null, bare: null, runtime: true,
    flowEvidence: null, boostEvidence: null, timeout: 150_000,
    format: 'text', out: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      i += 1
      return value
    }
    if (arg === '--host') options.host = next()
    else if (arg === '--base') options.base = next()
    else if (arg === '--bare') options.bare = next()
    else if (arg === '--no-runtime') options.runtime = false
    else if (arg === '--flow-evidence') options.flowEvidence = next()
    else if (arg === '--boost-evidence') options.boostEvidence = next()
    else if (arg === '--timeout') options.timeout = Number(next())
    else if (arg === '--format') options.format = next()
    else if (arg === '--out') options.out = next()
    else if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
    else if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`)
    else if (options.dir === null) options.dir = arg
    else throw new Error(`unexpected argument: ${arg}`)
  }
  if (!options.dir) throw new Error('a plugin directory is required')
  if (!['text', 'json'].includes(options.format)) throw new Error('--format must be text or json')
  if (!Number.isFinite(options.timeout) || options.timeout < 1000) throw new Error('--timeout must be >= 1000')
  options.dir = path.resolve(options.dir)
  if (!fs.existsSync(path.join(options.dir, 'package.json'))) throw new Error(`not a package directory: ${options.dir}`)
  return options
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`)
  }
}

function runChecker(options) {
  const args = [CHECKER, options.dir, '--scope', 'entry', '--format', 'json']
  const canRun = options.runtime && options.host !== null
  args.push('--entry-claim', canRun ? 'runtime' : 'static')
  if (canRun) args.push('--host', options.host)
  if (options.base) args.push('--base', options.base)
  if (options.bare) args.push('--bare', options.bare)
  const run = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    timeout: options.timeout,
    maxBuffer: 64 * 1024 * 1024,
  })
  let report = null
  try {
    report = JSON.parse(run.stdout)
  } catch {
    throw new Error(`checker did not emit JSON (exit ${run.status}): ${(run.stderr || '').slice(-500)}`)
  }
  return {
    invoked: canRun ? 'runtime' : 'static',
    exit: run.status,
    report,
  }
}

function checkById(report, id) {
  return (report.checks ?? []).find(check => check.id === id)
}

function classifyEntry(report, invoked) {
  const conclusion = report.conclusion ?? {}
  const status = conclusion.status
  const failed = (report.checks ?? []).filter(check => check.result === 'FAIL')
  const warnings = (report.checks ?? []).filter(check => check.result === 'WARN')
  const dsc14 = checkById(report, 'DSC-14')
  let state
  if (status === 'fail' || failed.length > 0) state = 'failed'
  else if (status === 'pass' || status === 'warn') state = invoked === 'runtime' && dsc14?.result === 'PASS' ? 'runtime' : 'recognized'
  else state = 'not-run'
  return {
    state,
    claim: invoked,
    checkerStatus: status ?? 'unknown',
    checkerLevel: conclusion.level ?? null,
    failed: failed.map(check => ({ id: check.id, reason: check.reason })),
    warnings: warnings.map(check => ({ id: check.id, reason: check.reason })),
    runtimeEvidence: dsc14 ? { result: dsc14.result, reason: dsc14.reason } : null,
    g4: report.g4 ?? null,
  }
}

function classifyFlow(evidence) {
  const ids = FLOW_IDS
  const emptyJourneys = () => Object.fromEntries(ids.map(id => [id, { status: 'not-run', declared: null, checks: 0, passes: false }]))
  if (!evidence) {
    return {
      state: 'not-run',
      schema: null,
      claimLevel: null,
      producerKind: null,
      sandboxAttested: false,
      deprecated: false,
      invalid: false,
      evidenceHash: null,
      passed: 0,
      errors: [],
      reason: 'no --flow-evidence file; run dsh-flow-collect.mjs and re-run the audit',
      journeys: emptyJourneys(),
    }
  }
  const verdict = validateFlowEvidence(evidence)
  const declaredOf = id => {
    const row = evidence[id] ?? evidence[id.toLowerCase()]
    return row?.status ?? null
  }
  const base = {
    schema: verdict.schema,
    claimLevel: verdict.claimLevel ?? null,
    producerKind: verdict.producerKind ?? null,
    sandboxAttested: verdict.sandboxAttested === true,
    deprecated: verdict.kind === 'v1-deprecated' || verdict.kind === 'legacy',
    invalid: false,
    evidenceHash: null,
    passed: 0,
    errors: verdict.errors,
  }
  if (verdict.kind === 'v1-deprecated' || verdict.kind === 'legacy') {
    return {
      ...base,
      state: 'deprecated',
      reason: `${verdict.errors[0]}. Run node 40-checker/bin/dsh-flow-collect.mjs --package <dir> to produce ${FLOW_EVIDENCE_SCHEMA}`,
      journeys: Object.fromEntries(ids.map(id => [id, { status: 'deprecated', declared: declaredOf(id), checks: 0, passes: false }])),
    }
  }
  if (!verdict.valid) {
    return {
      ...base,
      state: 'invalid',
      invalid: true,
      reason: `${FLOW_EVIDENCE_SCHEMA} failed structural validation: ${verdict.errors.slice(0, 5).join('; ')}${verdict.errors.length > 5 ? ` (+${verdict.errors.length - 5} more)` : ''}`,
      evidenceHash: {
        declared: verdict.declaredHash,
        computed: verdict.computedHash,
        ok: verdict.declaredHash !== null && verdict.declaredHash === verdict.computedHash,
      },
      journeys: Object.fromEntries(ids.map(id => {
        const row = verdict.journeys[id] ?? { declared: null, derived: 'not-run', checks: 0, passes: false }
        return [id, { status: row.declared ?? row.derived, declared: row.declared, checks: row.checks, passes: false }]
      })),
    }
  }
  const journeys = {}
  for (const id of ids) {
    const row = verdict.journeys[id]
    journeys[id] = {
      status: row.derived,
      declared: row.declared,
      checks: row.checks,
      passes: row.passes,
      reason: evidence.journeys?.[id]?.reason ?? null,
    }
  }
  const passed = ids.filter(id => journeys[id].passes)
  const failed = ids.filter(id => journeys[id].status === 'fail' && journeys[id].declared !== 'blocked')
  const blocked = ids.filter(id => journeys[id].declared === 'blocked')
  // Passing journeys are necessary but not sufficient: only sandbox-attested
  // evidence may be reported as runtime. A self-attested/ci-attested document
  // keeps its pass count but never upgrades to runtime. An honest FAIL/BLOCKED
  // stays visible instead of being hidden behind the attestation level.
  const runtimeEligible = base.sandboxAttested
  const state = failed.length > 0
    ? 'failed'
    : blocked.length > 0
      ? 'blocked'
      : runtimeEligible && passed.length === ids.length
        ? 'runtime'
        : 'not-run'
  const reasons = []
  if (!runtimeEligible && failed.length === 0) {
    reasons.push(`${base.claimLevel ?? 'non-sandbox'} evidence; runtime requires sandbox-attested`)
  }
  if (failed.length > 0) reasons.push(`failed journeys: ${failed.join(', ')}`)
  if (blocked.length > 0) reasons.push(`blocked journeys (never a pass): ${blocked.join(', ')}`)
  if (failed.length === 0 && passed.length !== ids.length) {
    const rest = ids.filter(id => !passed.includes(id) && !blocked.includes(id))
    if (rest.length > 0) reasons.push(`${passed.length}/8 journeys pass; ${rest.length} static/warn/not-run`)
  }
  if (passed.length === ids.length) {
    reasons.push(runtimeEligible
      ? 'all J1-J8 journey checks pass (exitCode 0, assertions held)'
      : 'all J1-J8 journey checks pass but the evidence is not sandbox-attested; not runtime')
  }
  return {
    ...base,
    state,
    reason: reasons.join('; '),
    passed: passed.length,
    evidenceHash: {
      declared: verdict.declaredHash,
      computed: verdict.computedHash,
      ok: verdict.declaredHash === verdict.computedHash,
    },
    journeys,
  }
}

const BOOST_CARD_FIELDS = [
  'subject', 'host', 'method', 'scope', 'command', 'result', 'negativeControl',
  'generatedAt', 'expiresAt', 'recordHash', 'claimLevel', 'issuer', 'selfAssessed',
]
const BOOST_CLAIM_LEVELS = new Set(['self-reported', 'self-assessed', 'host-reviewed', 'independent', 'reference'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const HASH_RE = /^sha256:[0-9a-f]{64}$/

function validateEvidenceCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    return { valid: false, missing: ['evidenceCard'], reason: 'missing evidence card' }
  }
  const missing = []
  for (const field of BOOST_CARD_FIELDS) {
    if (card[field] === undefined || card[field] === null || card[field] === '') missing.push(field)
  }
  if (!DATE_RE.test(String(card.generatedAt ?? ''))) missing.push('generatedAt(date)')
  if (!DATE_RE.test(String(card.expiresAt ?? ''))) missing.push('expiresAt(date)')
  if (!HASH_RE.test(String(card.recordHash ?? ''))) missing.push('recordHash(sha256)')
  if (!BOOST_CLAIM_LEVELS.has(String(card.claimLevel ?? ''))) missing.push('claimLevel')
  if (typeof card.selfAssessed !== 'boolean') missing.push('selfAssessed(boolean)')
  if (missing.length > 0) {
    return { valid: false, missing, reason: `evidence card missing/invalid: ${missing.join(', ')}` }
  }
  const generated = Date.parse(`${card.generatedAt}T00:00:00Z`)
  const expires = Date.parse(`${card.expiresAt}T00:00:00Z`)
  if (!Number.isFinite(generated) || !Number.isFinite(expires) || expires < generated) {
    return { valid: false, missing: ['validity'], reason: 'evidence card has invalid generatedAt/expiresAt' }
  }
  return { valid: true, missing: [], reason: null }
}

function classifyBoost(evidence) {
  const ids = ['LEV-1', 'LEV-2', 'LEV-3', 'LEV-4', 'LEV-5', 'LEV-6', 'LEV-7', 'LEV-8']
  if (!evidence) {
    return {
      state: 'not-measured',
      reason: 'no --boost-evidence file; benchmarks/evidence cards are not run by this tool',
      practices: Object.fromEntries(ids.map(id => [id, { status: 'not-measured' }])),
    }
  }
  const practices = {}
  for (const id of ids) {
    const row = evidence[id] ?? evidence[id.toLowerCase()]
    const declared = row?.status
    const card = row?.evidenceCard ?? (row?.evidence && typeof row.evidence === 'object' ? row.evidence : null)
    const cardCheck = validateEvidenceCard(card)
    let status = 'not-measured'
    if (declared === 'failed') status = 'failed'
    else if (declared === 'measured' && cardCheck.valid) status = 'measured'
    practices[id] = {
      status,
      declared: ['measured', 'not-measured', 'failed'].includes(declared) ? declared : 'not-measured',
      evidence: typeof row?.evidence === 'string' ? row.evidence : null,
      evidenceCard: card,
      card: cardCheck,
    }
  }
  const failed = ids.filter(id => practices[id].status === 'failed')
  const measured = ids.filter(id => practices[id].status === 'measured')
  const today = new Date().toISOString().slice(0, 10)
  const stale = measured.filter(id => String(practices[id].evidenceCard.expiresAt) < today)
  const invalid = ids.filter(id => practices[id].declared === 'measured' && !practices[id].card.valid)
  let state = 'not-measured'
  if (failed.length > 0) state = 'failed'
  else if (stale.length > 0) state = 'stale'
  else if (measured.length === ids.length) state = 'measured'
  const reasons = []
  if (failed.length > 0) reasons.push(`failed practices: ${failed.join(', ')}`)
  if (stale.length > 0) reasons.push(`stale evidence cards: ${stale.join(', ')}`)
  if (invalid.length > 0) reasons.push(`measured without a valid evidence card: ${invalid.join(', ')}`)
  if (failed.length === 0 && stale.length === 0 && measured.length !== ids.length) {
    reasons.push(`${measured.length}/8 practices have valid measured evidence cards`)
  }
  return {
    state,
    reason: reasons.join('; '),
    practices,
    validCards: measured.length,
    invalidCards: invalid.length,
  }
}

function nextActions(entry, flow, boost) {
  const actions = []
  for (const failure of entry.failed) actions.push(`ENTRY: fix ${failure.id} — ${failure.reason}`)
  if (entry.g4 && entry.g4.hasClient && entry.g4.ok === false) actions.push(`ENTRY: fix G4 — ${entry.g4.reason}`)
  for (const warning of entry.warnings) actions.push(`ENTRY: consider ${warning.id} — ${warning.reason}`)
  if (entry.state === 'recognized') actions.push('ENTRY: run with --host to replace static recognition with a real G0-G3 boot')
  if (flow.state === 'not-run' && flow.claimLevel && flow.sandboxAttested !== true) {
    actions.push(`FLOW: ${flow.claimLevel} evidence keeps ${flow.passed}/8 journey passes but is not runtime; re-run under a sandbox and set claims.claimLevel=sandbox-attested (or producer.kind=sandbox)`)
  } else if (flow.state === 'not-run') {
    actions.push('FLOW: record J1-J8 with node 40-checker/bin/dsh-flow-collect.mjs; do not claim FLOW until they run')
  }
  if (flow.state === 'deprecated') actions.push('FLOW: v1/bare evidence is deprecated; collect a dsh-flow-evidence/2 file (spec/flow-evidence.schema.json)')
  if (flow.state === 'invalid') actions.push('FLOW: flow evidence failed structural validation; fix the listed fields or recollect')
  if (flow.state === 'failed') actions.push(`FLOW: fix failed journeys: ${Object.entries(flow.journeys).filter(([, row]) => row.status === 'fail').map(([id]) => id).join(', ')}`)
  if (flow.state === 'blocked') actions.push('FLOW: blocked journeys need a prerequisite (usable dsh, --previous, or a compatible host); blocked is not a pass')
  if (boost.state === 'not-measured') actions.push('BOOST: attach LEV evidence cards (subject/host/method/scope/command/result/negativeControl/generatedAt/expiresAt/recordHash/claimLevel/issuer/selfAssessed); a status alone is not measured')
  if (boost.state === 'stale') actions.push('BOOST: refresh stale evidence cards before claiming measured')
  return actions
}

function render(result) {
  const lines = [
    `DSH level audit — ${result.target.dir}`,
    `  ENTRY : ${result.levels.entry.state.padEnd(12)} (${result.levels.entry.checkerLevel ?? 'no level'})`,
    `  FLOW  : ${result.levels.flow.state.padEnd(12)} ${result.levels.flow.reason}`,
    `  BOOST : ${result.levels.boost.state.padEnd(12)} ${result.levels.boost.reason}`,
  ]
  if (result.nextActions.length > 0) {
    lines.push('Next:')
    for (const action of result.nextActions) lines.push(`  - ${action}`)
  }
  lines.push('Claims: not official, not a certification, not a security audit; static is not runtime.')
  return lines.join('\n')
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const levels = JSON.parse(fs.readFileSync(LEVELS_PATH, 'utf8'))
  const flowEvidence = options.flowEvidence ? readJson(options.flowEvidence, '--flow-evidence') : null
  const boostEvidence = options.boostEvidence ? readJson(options.boostEvidence, '--boost-evidence') : null

  const checker = runChecker(options)
  const entry = classifyEntry(checker.report, checker.invoked)
  const flow = classifyFlow(flowEvidence)
  const boost = classifyBoost(boostEvidence)

  const result = {
    schema: 'dsh-level-audit/1',
    generatedAt: new Date().toISOString(),
    target: { dir: options.dir },
    levelsSpec: { schema: levels.schema, version: levels.version, status: levels.status },
    levels: { entry, flow, boost },
    nextActions: nextActions(entry, flow, boost),
    notClaimed: ['official standard', 'certification', 'security audit', 'ranking', 'production baseline'],
    checker: {
      invoked: checker.invoked,
      exit: checker.exit,
      schema: checker.report.schema,
      anchor: checker.report.anchor,
      coverage: checker.report.coverage,
    },
  }

  const output = options.format === 'json' ? JSON.stringify(result, null, 2) : render(result)
  if (options.out) {
    fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true })
    fs.writeFileSync(options.out, `${output}\n`)
  }
  process.stdout.write(`${output}\n`)
  process.exit(entry.state === 'failed' ? 2 : entry.state === 'not-run' ? 3 : 0)
}

try {
  main()
} catch (error) {
  console.error(`level-audit: ${error.message}`)
  process.exit(3)
}

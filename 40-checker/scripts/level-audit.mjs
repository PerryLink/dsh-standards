#!/usr/bin/env node
/**
 * level-audit.mjs — one-command self-check against the three DSH adoption levels.
 *
 * What it does:
 *   ENTRY  runs the existing ENTRY checker (static by default; real G0-G3 boot
 *          when --host is supplied) and maps its conclusion to an evidence state.
 *   FLOW   reads an optional J1-J8 evidence file; with no file it reports the
 *          checklist as `not-run` and never invents a pass.
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
  --flow-evidence <file>   JSON: { "J1": { "status": "pass|fail|not-run", "evidence": "..." }, ... }
  --boost-evidence <file>  JSON: { "LEV-3": { "status": "measured|not-measured|failed", "evidence": "..." }, ... }
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
  const ids = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7', 'J8']
  if (!evidence) {
    return {
      state: 'not-run',
      reason: 'no --flow-evidence file; run the J1-J8 journeys and record pass/fail/not-run',
      journeys: Object.fromEntries(ids.map(id => [id, { status: 'not-run' }])),
    }
  }
  const journeys = {}
  for (const id of ids) {
    const row = evidence[id] ?? evidence[id.toLowerCase()]
    const status = row?.status
    journeys[id] = {
      status: ['pass', 'fail', 'not-run', 'manual'].includes(status) ? status : 'not-run',
      evidence: row?.evidence ?? null,
    }
  }
  const failed = ids.filter(id => journeys[id].status === 'fail')
  const passed = ids.filter(id => journeys[id].status === 'pass')
  return {
    state: failed.length > 0 ? 'failed' : passed.length === ids.length ? 'runtime' : 'not-run',
    reason: failed.length > 0
      ? `failed journeys: ${failed.join(', ')}`
      : passed.length === ids.length
        ? 'all J1-J8 have pass evidence'
        : `${passed.length}/8 journeys have pass evidence`,
    journeys,
  }
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
    const status = row?.status
    practices[id] = {
      status: ['measured', 'not-measured', 'failed'].includes(status) ? status : 'not-measured',
      evidence: row?.evidence ?? null,
    }
  }
  const failed = ids.filter(id => practices[id].status === 'failed')
  const measured = ids.filter(id => practices[id].status === 'measured')
  return {
    state: failed.length > 0 ? 'failed' : measured.length === ids.length ? 'measured' : 'not-measured',
    reason: failed.length > 0
      ? `failed practices: ${failed.join(', ')}`
      : `${measured.length}/8 practices have measured evidence`,
    practices,
  }
}

function nextActions(entry, flow, boost) {
  const actions = []
  for (const failure of entry.failed) actions.push(`ENTRY: fix ${failure.id} — ${failure.reason}`)
  if (entry.g4 && entry.g4.hasClient && entry.g4.ok === false) actions.push(`ENTRY: fix G4 — ${entry.g4.reason}`)
  for (const warning of entry.warnings) actions.push(`ENTRY: consider ${warning.id} — ${warning.reason}`)
  if (entry.state === 'recognized') actions.push('ENTRY: run with --host to replace static recognition with a real G0-G3 boot')
  if (flow.state === 'not-run') actions.push('FLOW: record J1-J8 in a flow-evidence JSON; do not claim FLOW until they run')
  if (boost.state === 'not-measured') actions.push('BOOST: attach LEV evidence cards; this tool does not benchmark for you')
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

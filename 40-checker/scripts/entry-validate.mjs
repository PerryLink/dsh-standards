#!/usr/bin/env node
/**
 * entry-validate.mjs — static C1-C8 checklist for DSH plugins.
 *
 * This is a pre-submit helper, not a gate, certification, ranking, or security
 * audit. C1/C3/C7 need --meta and are reported not-run without it. C5 is
 * not-applicable when the plugin ships no client. C6 checks metadata and the
 * entry file; code reality still needs a human sample.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validRange } from '../src/semver.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const CHECKLIST_PATH = path.join(STD, 'adoption', 'entry', 'checklist.json')
const FORBIDDEN = ['grade', 'score', 'rank', 'official', 'certified', 'secure', 'recommended']

function usage() {
  console.log(`entry-validate — static DSH entry checklist (C1-C8)

Usage:
  node 40-checker/scripts/entry-validate.mjs <plugin-dir> [options]

Options:
  --meta <file>     JSON: repo, topics, archived, commit, pushedAt, installCommand, claimLevel
  --host-evidence <file>  JSON: { status: pass|fail|blocked|not-run, command, host, evidence, generatedAt }
  --format text|json  default text
  --out <file>      write the JSON result
  --help            show this help

Exit codes: 0 pass/pass-with-warnings; 2 fail; 3 incomplete/not-run.`)
}

function parseArgs(argv) {
  const options = { dir: null, meta: null, hostEvidence: null, format: 'text', out: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      i += 1
      return value
    }
    if (arg === '--meta') options.meta = next()
    else if (arg === '--host-evidence') options.hostEvidence = next()
    else if (arg === '--json') options.format = 'json'
    else if (arg === '--format') options.format = next()
    else if (arg === '--out') options.out = next()
    else if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
    else if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`)
    else if (options.dir === null) options.dir = arg
    else throw new Error(`unexpected argument: ${arg}`)
  }
  if (!options.dir) throw new Error('a plugin directory is required')
  if (!['text', 'json'].includes(options.format)) throw new Error('--format must be text or json')
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

function fileExists(dir, value) {
  if (typeof value !== 'string' || value.length === 0) return false
  const resolved = path.resolve(dir, value)
  return resolved.startsWith(`${dir}${path.sep}`) && fs.existsSync(resolved)
}

function resolveExport(value) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return null
  return value.import ?? value.default ?? value.require ?? value.node ?? null
}

function check(id, status, detail, evidence = null) {
  return { id, status, detail, evidence }
}

function run(dir, meta) {
  const pkg = readJson(path.join(dir, 'package.json'), 'package.json')
  const dsh = pkg.dsh && typeof pkg.dsh === 'object' ? pkg.dsh : {}
  const checks = []

  // C1 — public repo + topic
  if (!meta || (!meta.repo && !Array.isArray(meta.topics))) {
    checks.push(check('C1', 'not-run', 'no --meta repo/topics; cannot verify public repo or dsh-plugin topic'))
  } else {
    const repoOk = typeof meta.repo === 'string' && /^[^/\s]+\/[^/\s]+$/.test(meta.repo)
    const topicOk = Array.isArray(meta.topics) && meta.topics.includes('dsh-plugin')
    const archivedOk = meta.archived !== true
    checks.push(check('C1', repoOk && topicOk && archivedOk ? 'pass' : 'fail',
      `repo=${meta.repo ?? 'missing'}, topic=${topicOk}, archived=${meta.archived === true}`,
      repoOk ? `https://github.com/${meta.repo}` : null))
  }

  // C2 — dsh.bundle + existing patch (one path or an ordered list)
  const bundle = dsh.bundle
  const patchValue = bundle?.patch
  const patches = Array.isArray(patchValue)
    ? patchValue.filter(item => typeof item === 'string' && item.length > 0)
    : typeof patchValue === 'string' && patchValue.length > 0
      ? [patchValue]
      : null
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    checks.push(check('C2', 'fail', 'dsh.bundle is missing; dsh.client alone is not installable'))
  } else if (!patches || patches.length === 0) {
    checks.push(check('C2', 'fail', 'dsh.bundle.patch is missing or empty'))
  } else {
    const missing = patches.filter(file => !fileExists(dir, file))
    if (missing.length > 0) checks.push(check('C2', 'fail', `dsh.bundle.patch file(s) missing: ${missing.join(', ')}`))
    else checks.push(check('C2', 'pass', `dsh.bundle.patch exists: ${patches.join(', ')}`))
  }

  // C3 — tested compose/install line (or an explicit host-install evidence object)
  const host = meta?.hostInstall
  if (host) {
    const status = ['pass', 'fail', 'blocked', 'not-run', 'not-applicable'].includes(host.status) ? host.status : 'blocked'
    const detail = `hostInstall ${status}: ${host.command ?? 'no command'}${host.host ? ` (${host.host})` : ''}${host.evidence ? ` ${host.evidence}` : ''}`
    checks.push(check('C3', status, detail, host.evidence ?? null))
  } else if (!meta?.installCommand) {
    checks.push(check('C3', 'not-applicable', 'C3 is flow-only; run J1 or pass --host-evidence for install evidence'))
  } else {
    const command = String(meta.installCommand)
    const name = typeof pkg.name === 'string' ? pkg.name : ''
    const ok = command.includes('dsh plugin') && (name.length === 0 || command.includes(name) || command.includes('add'))
    checks.push(check('C3', ok ? 'pass' : 'fail', `installCommand (declared; FLOW J1 still required for install evidence): ${command}`))
  }

  // C4 — engines.dsh or peer range
  const engineRange = pkg.engines?.dsh
  const peerRange = pkg.peerDependencies?.['@deepseek-ai/dsh']
  const range = typeof engineRange === 'string' ? engineRange : typeof peerRange === 'string' ? peerRange : null
  const source = typeof engineRange === 'string' ? 'engines.dsh' : 'peerDependencies["@deepseek-ai/dsh"]'
  if (!range) {
    checks.push(check('C4', 'warn', 'no declared engines.dsh or @deepseek-ai/dsh peer range; host compatibility unknown'))
  } else if (range.trim() === '*' || /(^|\s)(\*|x|X)(\s|$)/.test(range) || /\.(x|X|\*)/.test(range)) {
    checks.push(check('C4', 'fail', `${source} is too wide: ${range}`))
  } else if (!validRange(range)) {
    checks.push(check('C4', 'fail', `${source} is not a valid range: ${range}`))
  } else {
    checks.push(check('C4', 'pass', `${source} = ${range} (declared range; runtime not tested)`))
  }

  // C5 — client export
  if (!dsh.client) {
    checks.push(check('C5', 'not-applicable', 'no dsh.client; client export not required'))
  } else {
    const exportValue = pkg.exports?.['./client']
    const target = resolveExport(exportValue)
    if (!target) {
      checks.push(check('C5', 'fail', 'dsh.client exists but exports["./client"] is missing'))
    } else if (!fileExists(dir, target)) {
      checks.push(check('C5', 'warn', `exports["./client"] is declared at ${target}, but the built file is not committed; declaration present`))
    } else {
      checks.push(check('C5', 'pass', `exports["./client"] exists: ${target}`))
    }
  }

  // C6 — entry + metadata
  const main = pkg.main ?? resolveExport(pkg.exports?.['.'])
  const patch = Array.isArray(dsh.bundle?.patch)
    ? dsh.bundle.patch.find(item => typeof item === 'string' && item.length > 0) ?? null
    : typeof dsh.bundle?.patch === 'string' ? dsh.bundle.patch : null
  const missingMeta = ['description'].filter(field => {
    const value = pkg[field]
    return value === undefined || value === null || value === '' || (typeof value === 'object' && Object.keys(value).length === 0)
  })
  const missingRepository = pkg.repository === undefined || pkg.repository === null || pkg.repository === ''
  const missingLicense = pkg.license === undefined || pkg.license === null || pkg.license === ''
  if (!main && !patch) {
    checks.push(check('C6', 'fail', 'no main/exports["."] and no dsh.bundle.patch'))
  } else if (missingMeta.length > 0) {
    checks.push(check('C6', 'fail', `package.json missing: ${missingMeta.join(', ')}`))
  } else if (main && !fileExists(dir, main) && !(patch && fileExists(dir, patch))) {
    checks.push(check('C6', 'warn', `entry ${main} is declared but not committed (build output); declaration present`))
  } else if (missingRepository) {
    checks.push(check('C6', 'warn', 'repository is missing; C1 supplies the repo URL, but a package repository field is recommended'))
  } else {
    checks.push(check('C6', 'pass', `entry ${main ?? patch}; description/license/repository present`))
  }

  // C7 — version + commit/digest + freshness
  const version = typeof pkg.version === 'string' ? pkg.version : ''
  const versionOk = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)
  const commit = meta?.commit ?? pkg.gitHead
  if (!versionOk) {
    checks.push(check('C7', 'fail', `package.json version is missing or not semver: ${version || 'missing'}`))
  } else if (!commit && !meta?.pushedAt) {
    checks.push(check('C7', 'not-run', 'version present, but no commit/digest or pushedAt metadata'))
  } else if (!commit || !meta?.pushedAt) {
    checks.push(check('C7', 'not-run', `version ${version}; need both commit and pushedAt to judge freshness`))
  } else {
    const ageDays = (Date.now() - Date.parse(`${meta.pushedAt}T00:00:00Z`)) / 86_400_000
    const fresh = Number.isFinite(ageDays) && ageDays <= 365
    checks.push(check('C7', fresh ? 'pass' : 'warn',
      `version ${version}; commit ${String(commit).slice(0, 12)}; pushedAt ${meta.pushedAt} (${Math.round(ageDays)}d old)`))
  }

  // C8 — no grade/rank and claimLevel=reference
  const policySurface = JSON.stringify({ dsh: pkg.dsh ?? null, keywords: pkg.keywords ?? null, labels: pkg.labels ?? null })
  const hits = FORBIDDEN.filter(word => new RegExp(`"${word}"`, 'i').test(policySurface))
  if (hits.length > 0) {
    checks.push(check('C8', 'fail', `forbidden grade/rank/endorsement fields: ${hits.join(', ')}`))
  } else if (meta?.claimLevel !== undefined && meta.claimLevel !== 'reference') {
    checks.push(check('C8', 'fail', `claimLevel must be reference, got ${meta.claimLevel}`))
  } else {
    checks.push(check('C8', 'pass', 'no grade/rank/endorsement fields; claimLevel=reference (or not supplied)'))
  }

  const failed = checks.filter(row => row.status === 'fail')
  const notRun = checks.filter(row => row.status === 'not-run')
  const blocked = checks.filter(row => row.status === 'blocked')
  const warnings = checks.filter(row => row.status === 'warn')
  const advisories = []
  if (!dsh.manifestVersion) advisories.push({ id: 'A1', detail: 'dsh.manifestVersion is missing; the reference template declares 1' })
  if (!pkg.engines?.node) advisories.push({ id: 'A2', detail: 'engines.node is missing; the reference template recommends >=24' })
  if (dsh.client && dsh.client.platform !== 'web') advisories.push({ id: 'A3', detail: 'dsh.client.platform is not web' })
  if (!pkg.exports?.['./locale/en.json']) advisories.push({ id: 'A4', detail: 'exports["./locale/en.json"] is missing; display metadata may be absent' })
  if (!pkg.icon && !pkg.exports?.['./icon']) advisories.push({ id: 'A5', detail: 'icon is missing; the host will use the default artwork' })
  if (missingLicense) advisories.push({ id: 'A7', detail: 'license is missing; legal/market profile, not an ENTRY hard fail' })
  if (meta?.safety && !['clean', 'mentions-only'].includes(meta.safety)) advisories.push({ id: 'A6', detail: `safety category ${meta.safety}: requires review before C3` })
  let status = 'pass'
  if (failed.length > 0) status = 'fail'
  else if (notRun.length > 0 || blocked.length > 0) status = 'incomplete'
  else if (warnings.length > 0) status = 'pass-with-warnings'
  return {
    schema: 'dsh-entry-audit/1',
    generatedAt: new Date().toISOString(),
    target: { dir, name: pkg.name ?? null, version: pkg.version ?? null },
    checklist: { schema: 'dsh-entry-checklist/1', version: '0.1.0' },
    checks,
    conclusion: {
      status,
      passed: checks.filter(row => row.status === 'pass').length,
      failed: failed.map(row => row.id),
      warnings: warnings.map(row => row.id),
      notRun: notRun.map(row => row.id),
      blocked: blocked.map(row => row.id),
      notApplicable: checks.filter(row => row.status === 'not-applicable').map(row => row.id),
    },
    advisories,
    claimLevel: 'reference',
    notClaimed: ['official standard', 'certification', 'security audit', 'ranking', 'market acceptance', 'production baseline'],
  }
}

function render(result) {
  const lines = [
    `DSH entry checklist — ${result.target.dir}`,
    `  package: ${result.target.name ?? '?'}@${result.target.version ?? '?'}`,
    ...result.checks.map(row => `  ${row.id} ${row.status.padEnd(14)} ${row.detail}`),
    `Conclusion: ${result.conclusion.status}`,
    'Not claimed: official, certified, security audit, ranking, market acceptance.',
  ]
  return lines.join('\n')
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!fs.existsSync(CHECKLIST_PATH)) throw new Error(`missing checklist: ${CHECKLIST_PATH}`)
  const checklist = readJson(CHECKLIST_PATH, 'checklist.json')
  if (checklist.schema !== 'dsh-entry-checklist/1') throw new Error(`unsupported checklist schema: ${checklist.schema}`)
  let meta = options.meta ? readJson(path.resolve(options.meta), '--meta') : null
  if (options.hostEvidence) {
    const host = readJson(path.resolve(options.hostEvidence), '--host-evidence')
    meta = { ...(meta ?? {}), hostInstall: host }
  }
  const result = run(options.dir, meta)
  const output = options.format === 'json' ? JSON.stringify(result, null, 2) : render(result)
  if (options.out) {
    fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true })
    fs.writeFileSync(options.out, `${output}\n`)
  }
  process.stdout.write(`${output}\n`)
  process.exit(result.conclusion.status === 'fail' ? 2 : result.conclusion.status === 'incomplete' ? 3 : 0)
}

try {
  main()
} catch (error) {
  console.error(`entry-validate: ${error.message}`)
  process.exit(3)
}

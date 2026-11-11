#!/usr/bin/env node
/**
 * build-sidecar — generate or refresh `publish/sidecar.json`
 * (`dsh-market-sidecar/1`), the index cache the market can read without
 * executing a plugin and without treating us as an issuer.
 *
 * Two modes:
 *   fresh     read one `dsh-level-audit/1` JSON (`dsh-levels <dir> --format
 *             json`) plus a package tarball, emit one entry keyed name@version.
 *   lifecycle read an existing sidecar (`--prev`) and only recompute
 *             `lifecycle` from `--today` and `publish/withdrawals.json`.
 *
 * Entry fields are a superset of the original `dsh-market-sidecar/1` shape
 * (subject/levels/evidence/validity/lifecycle/selfAssessed are unchanged):
 *   title/repo/license   from the published package.json, null when absent
 *   scope                {dsh, cordis, platform} from dsh.engines / npm engines
 *                        / peerDependencies, falling back to the audit anchor
 *   checks               checker results as {id,result,coverage} only; detailed
 *                        reasons stay in the report, never in the sidecar
 *   evidence             url/sha256 kept for compatibility; reportUrl/
 *                        reportSha256 are the same values under the new names
 *   checkedBy            {checker, command} that produced the audit
 *   security             optional {state, checks, summary, command} from
 *                        `--security-report`; state is derived from the 22
 *                        coverage values, never hand-set. It is not a security
 *                        audit and must not be rendered as one.
 *   notChecked           short honest list of what the run did not exercise
 *
 * Deliberately absent: advice (author view), issuer / recordHash / verifyUrl
 * (we are not an issuer), score / rank (we do not grade). `--today` pins the
 * clock so CI and tests are reproducible.
 *
 * Usage:
 *   node 40-checker/scripts/build-sidecar.mjs --levels audit.json \
 *     --report report.json --tarball dsh-security-pack-3.0.1.tgz \
 *     --out publish/sidecar.json --today 2026-11-06
 *
 *   node 40-checker/scripts/build-sidecar.mjs --prev publish/sidecar.json \
 *     --withdrawals publish/withdrawals.json --out publish/sidecar.json \
 *     --today 2026-11-06
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const SCHEMA = 'dsh-market-sidecar/1'
const DATE = /^\d{4}-\d{2}-\d{2}$/
const HEX40 = /^[0-9a-f]{40}$/
const HEX64 = /^[0-9a-f]{64}$/
const LIFECYCLE = new Set(['active', 'stale', 'under-review', 'withdrawn'])
const FORBIDDEN = new Set(['advice', 'issuer', 'recordHash', 'verifyUrl', 'score', 'rank'])
const NOT_CLAIMED = ['official', 'certification', 'security-audit', 'endorsement', 'ordering', 'comparison', 'warranty']
const CHECK_KEYS = new Set(['id', 'result', 'coverage'])
const SCOPE_KEYS = new Set(['dsh', 'cordis', 'platform'])
const CHECKED_BY_KEYS = new Set(['checker', 'command', 'securityCommand'])
const SECURITY_KEYS = new Set(['state', 'checks', 'summary', 'command'])
const SECURITY_STATES = new Set(['checked', 'partial', 'not-run'])
const SECURITY_RESULTS = new Set(['PASS', 'WARN', 'FAIL', 'NA'])
const SECURITY_COVERAGE = new Set(['full', 'partial', 'not-run'])
const SECURITY_SUMMARY_KEYS = new Set(['total', 'checked', 'blocking', 'warn', 'na', 'notRun'])
const REPO_GIT_SHORTHAND = /^github:([^/]+\/[^/]+?)(?:\.git)?$/

function usage() {
  console.log(`build-sidecar — publish/sidecar.json (${SCHEMA})

Usage:
  node 40-checker/scripts/build-sidecar.mjs --levels <audit.json> [options]
  node 40-checker/scripts/build-sidecar.mjs --prev <sidecar.json> [options]

Options:
  --levels <file>          one dsh-level-audit/1 JSON (single package)
  --prev <file>            existing sidecar; entries survive a lifecycle refresh
  --withdrawals <file>     append-only withdrawal list (default: alongside --prev)
  --out <file>             output path, default publish/sidecar.json
  --today <YYYY-MM-DD>     fixed clock for generatedAt/checkedAt/lifecycle
  --ttl-days <n>           validity policy, default 90 (writes "90d")
  --name <name>            subject name; default package.json / audit.subject
  --version <version>      subject version; default package.json / audit.subject
  --package <dir>          package.json directory for name/version
  --tarball <file>         package tarball; sha256 is recorded in subject
  --tarball-sha256 <hex>   explicit tarball sha256 (checked against --tarball)
  --report <file>          dsh-conformance/1 checker report; its checks are
                           reduced to {id,result,coverage} (no details)
  --security-report <file> optional dsh-conformance/1 report from --scope security;
                           adds a top-level security block (checks + counts)
  --checked-command <s>    command recorded in checkedBy.command
  --evidence-url <url>     optional https evidence URL (url + reportUrl)
  --evidence-file <file>   hash this file into evidence.sha256/reportSha256
  --evidence-sha256 <hex>  explicit evidence sha256 (sha256 + reportSha256)
  --checker-version <v>    default dsh-standards package.json version
  --checker-sha <40hex>    default git HEAD when available
  --index-url <url>        default https://awesome-dsh-plugin.com/index.json
  --organizer              sets selfAssessed=false (default true)
  --help                   show this help

Exit codes: 0 written/unchanged; 3 invalid input.`)
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is not readable JSON (${file}): ${error.message}`)
  }
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function normalizeDate(value, label) {
  const match = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/)
  if (!match) throw new Error(`${label} must be YYYY-MM-DD, got ${JSON.stringify(value)}`)
  const day = match[1]
  const parsed = new Date(`${day}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
    throw new Error(`${label} is not a real date: ${day}`)
  }
  return day
}

function addDays(day, count) {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

function parseArgs(argv) {
  const options = {
    levels: null, prev: null, withdrawals: null,
    out: 'publish/sidecar.json',
    today: null, todayProvided: false, ttlDays: 90,
    name: null, version: null, packageDir: null,
    tarball: null, tarballSha256: null,
    report: null, securityReport: null, checkedCommand: null,
    evidenceUrl: null, evidenceFile: null, evidenceSha256: null,
    checkerVersion: null, checkerSha: null,
    indexUrl: 'https://awesome-dsh-plugin.com/index.json',
    selfAssessed: true,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      i += 1
      return value
    }
    if (arg === '--levels') options.levels = next()
    else if (arg === '--prev') options.prev = next()
    else if (arg === '--withdrawals') options.withdrawals = next()
    else if (arg === '--out') options.out = next()
    else if (arg === '--today') { options.today = normalizeDate(next(), '--today'); options.todayProvided = true }
    else if (arg === '--ttl-days') options.ttlDays = Number(next())
    else if (arg === '--name') options.name = next()
    else if (arg === '--version') options.version = next()
    else if (arg === '--package') options.packageDir = next()
    else if (arg === '--tarball') options.tarball = next()
    else if (arg === '--tarball-sha256') options.tarballSha256 = next().toLowerCase()
    else if (arg === '--report') options.report = next()
    else if (arg === '--security-report') options.securityReport = next()
    else if (arg === '--checked-command') options.checkedCommand = next()
    else if (arg === '--evidence-url') options.evidenceUrl = next()
    else if (arg === '--evidence-file') options.evidenceFile = next()
    else if (arg === '--evidence-sha256') options.evidenceSha256 = next().toLowerCase()
    else if (arg === '--checker-version') options.checkerVersion = next()
    else if (arg === '--checker-sha') options.checkerSha = next().toLowerCase()
    else if (arg === '--index-url') options.indexUrl = next()
    else if (arg === '--organizer') options.selfAssessed = false
    else if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
    else throw new Error(`unknown option: ${arg}`)
  }
  if (!options.levels && !options.prev) throw new Error('one of --levels or --prev is required')
  if (!Number.isInteger(options.ttlDays) || options.ttlDays < 1 || options.ttlDays > 3650) {
    throw new Error('--ttl-days must be an integer between 1 and 3650')
  }
  return options
}

function readPackageMeta(directory) {
  if (!directory) return {}
  const file = path.join(directory, 'package.json')
  if (!fs.existsSync(file)) return {}
  try {
    return readJson(file, 'package.json')
  } catch {
    return {}
  }
}

function firstLine(value) {
  if (typeof value !== 'string') return null
  const line = value.split(/\r?\n/)[0].trim()
  return line === '' ? null : line
}

function httpsUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return null
  let url = value.trim()
  const shorthand = url.match(REPO_GIT_SHORTHAND)
  if (shorthand) url = `https://github.com/${shorthand[1]}`
  if (url.startsWith('git+')) url = url.slice(4)
  if (url.startsWith('ssh://git@')) url = `https://${url.slice('ssh://git@'.length)}`
  if (url.startsWith('git@')) {
    const match = url.match(/^git@([^:]+):(.+)$/)
    if (match) url = `https://${match[1]}/${match[2]}`
  }
  if (url.startsWith('git://')) url = `https://${url.slice('git://'.length)}`
  if (url.startsWith('http://')) url = `https://${url.slice('http://'.length)}`
  if (!url.startsWith('https://')) return null
  url = url.replace(/\.git$/i, '').replace(/\/+$/, '')
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
  } catch {
    return null
  }
  return url
}

function normalizeRepo(repository) {
  if (typeof repository === 'string') return httpsUrl(repository)
  if (!repository || typeof repository !== 'object') return null
  return httpsUrl(repository.url)
}

function normalizeLicense(license) {
  let value = license
  if (value && typeof value === 'object') value = value.type
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text === '' || /^SEE LICENSE/i.test(text) || text === 'UNLICENSED') return null
  // Accept plain SPDX ids and simple AND/OR/WITH expressions; anything else is
  // left null rather than guessed.
  if (!/^[A-Za-z0-9.+-]+(?: \([^()]+\))?(?: (?:AND|OR|WITH) [A-Za-z0-9.+-]+(?: \([^()]+\))?)*$/.test(text)) return null
  return text
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return null
}

function platformFromPackage(meta) {
  const declared = firstString(meta?.dsh?.client?.platform, meta?.dsh?.platform, meta?.engines?.platform)
  if (declared) return declared
  const os = Array.isArray(meta?.os) ? meta.os.filter(item => typeof item === 'string' && item !== '') : []
  const cpu = Array.isArray(meta?.cpu) ? meta.cpu.filter(item => typeof item === 'string' && item !== '') : []
  if (os.length === 0 && cpu.length === 0) return null
  return [os.join('/'), cpu.join('/')].filter(Boolean).join('-')
}

function inferScope(meta, audit) {
  const anchor = audit?.checker?.anchor && typeof audit.checker.anchor === 'object' ? audit.checker.anchor : {}
  const dshEngines = meta?.dsh?.engines && typeof meta.dsh.engines === 'object' ? meta.dsh.engines : {}
  const engines = meta?.engines && typeof meta.engines === 'object' ? meta.engines : {}
  const peer = meta?.peerDependencies && typeof meta.peerDependencies === 'object' ? meta.peerDependencies : {}
  const deps = meta?.dependencies && typeof meta.dependencies === 'object' ? meta.dependencies : {}
  return {
    dsh: firstString(dshEngines.dsh, engines.dsh, anchor.dsh),
    cordis: firstString(dshEngines.cordis, engines.cordis, peer['@deepseek-ai/cordis'], deps['@deepseek-ai/cordis'], anchor.cordis),
    platform: platformFromPackage(meta),
  }
}

function extractChecks(report, name, version) {
  if (!report || !Array.isArray(report.checks)) return []
  if (report.subject && typeof report.subject === 'object') {
    const subjectName = firstString(report.subject.name)
    const subjectVersion = firstString(report.subject.version)
    if (subjectName !== null && name !== null && subjectName !== name) {
      throw new Error(`--report subject.name ${subjectName} does not match ${name}`)
    }
    if (subjectVersion !== null && version !== null && subjectVersion !== version) {
      throw new Error(`--report subject.version ${subjectVersion} does not match ${version}`)
    }
  }
  return report.checks.map(check => {
    if (!check || typeof check !== 'object') throw new Error('--report checks must be objects')
    const id = firstString(check.id)
    const result = firstString(check.result)
    const coverage = firstString(check.coverage)
    if (id === null || result === null || coverage === null) {
      throw new Error('--report checks need id/result/coverage')
    }
    return { id, result, coverage }
  })
}

function buildSecurity(report, name, version) {
  if (!report) return null
  if (!Array.isArray(report.checks)) throw new Error('--security-report checks must be an array')
  if (report.subject && report.subject.name && report.subject.name !== name) {
    throw new Error(`--security-report subject.name ${report.subject.name} does not match ${name}`)
  }
  if (report.subject && report.subject.version && report.subject.version !== version) {
    throw new Error(`--security-report subject.version ${report.subject.version} does not match ${version}`)
  }
  const checks = report.checks.map(check => {
    if (!check || typeof check !== 'object') throw new Error('--security-report checks must be objects')
    if (typeof check.id !== 'string' || typeof check.result !== 'string' || typeof check.coverage !== 'string') {
      throw new Error('--security-report checks need id/result/coverage')
    }
    return { id: check.id, result: check.result, coverage: check.coverage }
  }).sort((a, b) => a.id.localeCompare(b.id))
  const count = (predicate) => checks.filter(predicate).length
  const checked = count(c => c.coverage !== 'not-run')
  const total = checks.length
  const state = checked === 0 ? 'not-run' : checked === total ? 'checked' : 'partial'
  return {
    state,
    checks,
    summary: {
      total,
      checked,
      blocking: count(c => c.result === 'FAIL'),
      warn: count(c => c.result === 'WARN'),
      na: count(c => c.result === 'NA'),
      notRun: count(c => c.coverage === 'not-run'),
    },
    command: 'dsh-standards check <package-dir> --scope security --json',
  }
}

function summarizeNotChecked(audit, checks, hasReport) {
  const items = []
  const entry = audit?.levels?.entry && typeof audit.levels.entry === 'object' ? audit.levels.entry : {}
  if (entry.claim !== 'runtime') items.push(`ENTRY:runtime (claim=${firstString(entry.claim) ?? 'unknown'}; not exercised)`)
  if (!hasReport) items.push('ENTRY:checks (no --report; checker results unavailable)')
  const notRun = checks.filter(check => check.coverage === 'not-run').map(check => check.id)
  if (notRun.length > 0) items.push(`ENTRY:${notRun.join(', ')} (coverage=not-run)`)
  const flow = audit?.levels?.flow && typeof audit.levels.flow === 'object' ? audit.levels.flow : {}
  if (flow.state !== 'runtime') {
    items.push(`FLOW:J1-J8 (${firstString(flow.state) ?? 'not-run'}; ${Number.isInteger(flow.passed) ? flow.passed : 0}/8 journeys pass)`)
  }
  const boost = audit?.levels?.boost && typeof audit.levels.boost === 'object' ? audit.levels.boost : {}
  if (boost.state !== 'measured') items.push(`BOOST:LEV-3..LEV-4 (${firstString(boost.state) ?? 'not-measured'})`)
  return items
}

function pickLevel(row, keys, fallback) {
  const level = {}
  if (row && typeof row === 'object') {
    for (const key of keys) {
      if (typeof row[key] === 'string' && row[key] !== '') level[key] = row[key]
    }
  }
  if (!level.state) level.state = fallback
  return level
}

function gitHead() {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return HEX40.test(sha) ? sha : null
  } catch {
    return null
  }
}

function loadPrev(file) {
  const prev = readJson(file, 'previous sidecar')
  if (prev.schema !== SCHEMA) throw new Error(`previous sidecar schema is ${JSON.stringify(prev.schema)}, expected ${SCHEMA}`)
  if (!prev.entries || typeof prev.entries !== 'object' || Array.isArray(prev.entries)) {
    throw new Error('previous sidecar has no entries object')
  }
  if (typeof prev.generatedAt !== 'string') throw new Error('previous sidecar has no generatedAt')
  return prev
}

function parseWithdrawals(file) {
  const result = { exact: new Map(), names: new Map(), records: 0 }
  if (!file) return result
  const raw = readJson(file, 'withdrawals')
  let rows
  if (Array.isArray(raw)) rows = raw
  else if (Array.isArray(raw.withdrawals)) rows = raw.withdrawals
  else if (raw.withdrawals && typeof raw.withdrawals === 'object') {
    rows = Object.entries(raw.withdrawals).map(([key, value]) => ({ key, ...(typeof value === 'string' ? { reason: value } : value) }))
  } else if (raw.entries && typeof raw.entries === 'object') {
    rows = Object.entries(raw.entries).map(([key, value]) => ({ key, ...(typeof value === 'string' ? { reason: value } : value) }))
  } else {
    throw new Error('withdrawals must be an array or {"withdrawals":[...]} / {"entries":{...}}')
  }
  for (const row of rows) {
    if (!row || typeof row !== 'object') throw new Error('every withdrawal record must be an object')
    let name = row.name
    let version = row.version
    if (row.key) {
      const at = String(row.key).lastIndexOf('@')
      if (at <= 0) throw new Error(`withdrawal key must look like name@version: ${row.key}`)
      name = String(row.key).slice(0, at)
      version = String(row.key).slice(at + 1)
    }
    if (typeof name !== 'string' || name === '') throw new Error('withdrawal record needs a name')
    const record = {}
    const since = row.date ?? row.withdrawnAt ?? row.since
    if (since !== undefined) record.since = normalizeDate(since, 'withdrawal date')
    if (row.reason !== undefined) record.reason = String(row.reason)
    result.records += 1
    if (version !== undefined && version !== null && version !== '') {
      result.exact.set(`${name}@${version}`, record)
    } else {
      result.names.set(name, record)
    }
  }
  return result
}

function entryFromAudit(audit, options, levelFile) {
  const targetDir = audit.target?.dir
    ? path.resolve(path.dirname(levelFile), audit.target.dir)
    : options.packageDir
  const meta = readPackageMeta(options.packageDir ?? targetDir)
  const name = options.name ?? audit.subject?.name ?? meta.name
  const version = options.version ?? audit.subject?.version ?? meta.version
  if (typeof name !== 'string' || name === '') throw new Error('cannot determine subject.name; pass --name or --package')
  if (typeof version !== 'string' || version === '') throw new Error('cannot determine subject.version; pass --version or --package')

  const report = options.report ? readJson(path.resolve(options.report), '--report') : null
  const checks = extractChecks(report, name, version)
  const securityReport = options.securityReport ? readJson(path.resolve(options.securityReport), '--security-report') : null
  const security = buildSecurity(securityReport, name, version)

  const auditLevels = audit.levels && typeof audit.levels === 'object' ? audit.levels : {}
  const levels = {
    entry: pickLevel(auditLevels.entry, ['state', 'claim'], 'not-run'),
    flow: pickLevel(auditLevels.flow, ['state'], 'not-run'),
    boost: pickLevel(auditLevels.boost, ['state'], 'not-measured'),
  }

  let checkedAt
  try {
    checkedAt = normalizeDate(audit.generatedAt, 'audit.generatedAt')
  } catch {
    checkedAt = options.today ?? todayUtc()
  }
  const expiresAt = addDays(checkedAt, options.ttlDays)

  let tarballSha256 = options.tarballSha256 ?? audit.subject?.tarballSha256 ?? null
  if (tarballSha256 !== null) tarballSha256 = String(tarballSha256).toLowerCase()
  if (options.tarball) {
    const computed = sha256File(options.tarball)
    if (tarballSha256 !== null && tarballSha256 !== computed) {
      throw new Error(`--tarball-sha256 does not match ${options.tarball}`)
    }
    tarballSha256 = computed
  }
  if (tarballSha256 !== null && !HEX64.test(tarballSha256)) throw new Error('tarball sha256 must be 64 hex chars')

  let evidenceSha256 = options.evidenceSha256 ?? null
  if (options.evidenceFile) {
    const computed = sha256File(options.evidenceFile)
    if (evidenceSha256 !== null && evidenceSha256 !== computed) {
      throw new Error('--evidence-sha256 does not match --evidence-file')
    }
    evidenceSha256 = computed
  }
  if (evidenceSha256 !== null && !HEX64.test(evidenceSha256)) throw new Error('evidence sha256 must be 64 hex chars')

  const evidence = {}
  if (options.evidenceUrl) {
    let parsed
    try { parsed = new URL(options.evidenceUrl) } catch { throw new Error(`--evidence-url is not a URL: ${options.evidenceUrl}`) }
    if (parsed.protocol !== 'https:') throw new Error('--evidence-url must be https')
    // url/sha256 are the original names; reportUrl/reportSha256 are the same
    // values under the newer, explicit names. Both stay so old readers work.
    evidence.url = options.evidenceUrl
    evidence.reportUrl = options.evidenceUrl
  }
  if (evidenceSha256 !== null) {
    evidence.sha256 = evidenceSha256
    evidence.reportSha256 = evidenceSha256
  }

  const scanner = firstString(audit.checker?.anchor?.scanner)
  const checkerVersion = firstString(options.checkerVersion, readPackageMeta(ROOT).version) ?? 'unknown'
  const checker = scanner === null
    ? `dsh-standards@${checkerVersion}`
    : `dsh-standards@${checkerVersion} (${scanner})`
  const command = firstString(options.checkedCommand) ?? (levels.entry.claim === 'runtime'
    ? 'dsh-levels <package-dir> --format json'
    : 'dsh-levels <package-dir> --no-runtime --format json')

  return {
    key: `${name}@${version}`,
    entry: {
      subject: { name, version, tarballSha256 },
      title: firstLine(meta.description),
      repo: normalizeRepo(meta.repository),
      license: normalizeLicense(meta.license),
      scope: inferScope(meta, audit),
      levels,
      checks,
      ...(security ? { security } : {}),
      evidence,
      checkedBy: security ? { checker, command, securityCommand: security.command } : { checker, command },
      notChecked: summarizeNotChecked(audit, checks, report !== null),
      validity: { checkedAt, expiresAt, policy: `${options.ttlDays}d` },
      lifecycle: 'active',
      selfAssessed: options.selfAssessed,
    },
  }
}

function withdrawalFor(key, entry, withdrawals, previous) {
  if (withdrawals.exact.has(key)) return withdrawals.exact.get(key)
  const byName = withdrawals.names.get(entry.subject.name)
  if (byName) return byName
  if (previous?.lifecycle === 'withdrawn') {
    return previous.lifecycleDetail ?? {}
  }
  return null
}

function applyLifecycle(entries, previousEntries, options, withdrawals) {
  const counts = { active: 0, stale: 0, 'under-review': 0, withdrawn: 0 }
  for (const [key, entry] of Object.entries(entries)) {
    const previous = previousEntries?.[key]
    const withdrawn = withdrawalFor(key, entry, withdrawals, previous)
    if (withdrawn) {
      entry.lifecycle = 'withdrawn'
      if (Object.keys(withdrawn).length > 0) entry.lifecycleDetail = withdrawn
      else if (previous?.lifecycleDetail) entry.lifecycleDetail = previous.lifecycleDetail
      else delete entry.lifecycleDetail
    } else if (previous?.lifecycle === 'under-review') {
      entry.lifecycle = 'under-review'
      if (previous.lifecycleDetail) entry.lifecycleDetail = previous.lifecycleDetail
    } else if (entry.validity?.expiresAt && options.today > entry.validity.expiresAt) {
      entry.lifecycle = 'stale'
    } else {
      entry.lifecycle = 'active'
    }
    if (entry.lifecycle === 'active') delete entry.lifecycleDetail
    else if (entry.lifecycle === 'stale') delete entry.lifecycleDetail
    counts[entry.lifecycle] = (counts[entry.lifecycle] ?? 0) + 1
  }
  return counts
}

function walkKeys(value, trail, callback) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkKeys(item, `${trail}[${index}]`, callback))
    return
  }
  for (const [key, child] of Object.entries(value)) {
    callback(key, `${trail}.${key}`)
    walkKeys(child, `${trail}.${key}`, callback)
  }
}

function validateSidecar(sidecar) {
  if (sidecar.schema !== SCHEMA) throw new Error(`sidecar schema must be ${SCHEMA}`)
  if (typeof sidecar.generatedAt !== 'string' || Number.isNaN(Date.parse(sidecar.generatedAt))) {
    throw new Error('sidecar.generatedAt is not an ISO timestamp')
  }
  if (!sidecar.index || sidecar.index.format !== 1 || typeof sidecar.index.url !== 'string') {
    throw new Error('sidecar.index must be {url, format:1}')
  }
  if (!sidecar.checker || typeof sidecar.checker.name !== 'string' || typeof sidecar.checker.version !== 'string') {
    throw new Error('sidecar.checker must name a checker version')
  }
  if (sidecar.checker.sha !== null && !HEX40.test(String(sidecar.checker.sha))) {
    throw new Error('sidecar.checker.sha must be null or 40 hex chars')
  }
  if (!Array.isArray(sidecar.notClaimed) || sidecar.notClaimed.length !== NOT_CLAIMED.length) {
    throw new Error('sidecar.notClaimed must list the fixed not-claimed set')
  }
  if (!sidecar.entries || typeof sidecar.entries !== 'object' || Array.isArray(sidecar.entries)) {
    throw new Error('sidecar.entries must be an object')
  }
  for (const [key, entry] of Object.entries(sidecar.entries)) {
    if (!entry?.subject || typeof entry.subject.name !== 'string' || typeof entry.subject.version !== 'string') {
      throw new Error(`${key}: subject.name/subject.version are required`)
    }
    if (key !== `${entry.subject.name}@${entry.subject.version}`) throw new Error(`${key}: key does not match subject`)
    if (entry.subject.tarballSha256 !== null && !HEX64.test(String(entry.subject.tarballSha256))) {
      throw new Error(`${key}: subject.tarballSha256 must be null or 64 hex chars`)
    }
    if (!entry.levels || typeof entry.levels !== 'object') throw new Error(`${key}: levels are required`)
    for (const id of ['entry', 'flow', 'boost']) {
      if (!entry.levels[id] || typeof entry.levels[id].state !== 'string' || entry.levels[id].state === '') {
        throw new Error(`${key}: levels.${id}.state is required`)
      }
    }
    if (!entry.validity || !DATE.test(String(entry.validity.checkedAt))) throw new Error(`${key}: validity.checkedAt is required`)
    if (!DATE.test(String(entry.validity.expiresAt))) throw new Error(`${key}: validity.expiresAt is required`)
    if (typeof entry.validity.policy !== 'string') throw new Error(`${key}: validity.policy is required`)
    if (!LIFECYCLE.has(entry.lifecycle)) throw new Error(`${key}: lifecycle must be one of ${[...LIFECYCLE].join(', ')}`)
    if (typeof entry.selfAssessed !== 'boolean') throw new Error(`${key}: selfAssessed must be boolean`)
    if (!entry.evidence || typeof entry.evidence !== 'object' || Array.isArray(entry.evidence)) {
      throw new Error(`${key}: evidence must be an object`)
    }
    if (entry.evidence.url !== undefined) {
      let url
      try { url = new URL(entry.evidence.url) } catch { throw new Error(`${key}: evidence.url is not a URL`) }
      if (url.protocol !== 'https:') throw new Error(`${key}: evidence.url must be https`)
    }
    if (entry.evidence.sha256 !== undefined && !HEX64.test(String(entry.evidence.sha256))) {
      throw new Error(`${key}: evidence.sha256 must be 64 hex chars`)
    }
    if (entry.evidence.reportUrl !== undefined) {
      let url
      try { url = new URL(entry.evidence.reportUrl) } catch { throw new Error(`${key}: evidence.reportUrl is not a URL`) }
      if (url.protocol !== 'https:') throw new Error(`${key}: evidence.reportUrl must be https`)
    }
    if (entry.evidence.reportSha256 !== undefined && !HEX64.test(String(entry.evidence.reportSha256))) {
      throw new Error(`${key}: evidence.reportSha256 must be 64 hex chars`)
    }
    if (entry.title !== undefined && entry.title !== null && (typeof entry.title !== 'string' || entry.title === '')) {
      throw new Error(`${key}: title must be a non-empty string or null`)
    }
    if (entry.repo !== undefined && entry.repo !== null) {
      let url
      try { url = new URL(entry.repo) } catch { throw new Error(`${key}: repo is not a URL`) }
      if (url.protocol !== 'https:') throw new Error(`${key}: repo must be https or null`)
    }
    if (entry.license !== undefined && entry.license !== null && (typeof entry.license !== 'string' || entry.license === '')) {
      throw new Error(`${key}: license must be a non-empty string or null`)
    }
    if (entry.scope !== undefined) {
      if (!entry.scope || typeof entry.scope !== 'object' || Array.isArray(entry.scope)) throw new Error(`${key}: scope must be an object`)
      for (const field of Object.keys(entry.scope)) {
        if (!SCOPE_KEYS.has(field)) throw new Error(`${key}: scope.${field} is not part of the sidecar contract`)
      }
      for (const field of ['dsh', 'cordis', 'platform']) {
        const value = entry.scope[field]
        if (field === 'platform' && value === undefined) continue
        if (value !== null && (typeof value !== 'string' || value === '')) {
          throw new Error(`${key}: scope.${field} must be a non-empty string or null`)
        }
      }
    }
    if (entry.checks !== undefined) {
      if (!Array.isArray(entry.checks)) throw new Error(`${key}: checks must be an array`)
      const seen = new Set()
      for (const check of entry.checks) {
        if (!check || typeof check !== 'object' || Array.isArray(check)) throw new Error(`${key}: every check must be an object`)
        for (const field of Object.keys(check)) {
          if (!CHECK_KEYS.has(field)) throw new Error(`${key}: checks must not carry ${field}; only id/result/coverage`)
        }
        for (const field of ['id', 'result', 'coverage']) {
          if (typeof check[field] !== 'string' || check[field] === '') throw new Error(`${key}: checks[].${field} is required`)
        }
        if (seen.has(check.id)) throw new Error(`${key}: duplicate check id ${check.id}`)
        seen.add(check.id)
      }
    }
    if (entry.checkedBy !== undefined) {
      if (!entry.checkedBy || typeof entry.checkedBy !== 'object' || Array.isArray(entry.checkedBy)) {
        throw new Error(`${key}: checkedBy must be an object`)
      }
      for (const field of Object.keys(entry.checkedBy)) {
        if (!CHECKED_BY_KEYS.has(field)) throw new Error(`${key}: checkedBy.${field} is not part of the sidecar contract`)
      }
      for (const field of ['checker', 'command']) {
        if (typeof entry.checkedBy[field] !== 'string' || entry.checkedBy[field] === '') {
          throw new Error(`${key}: checkedBy.${field} is required`)
        }
      }
    }
    if (entry.security !== undefined) {
      const sec = entry.security
      if (!sec || typeof sec !== 'object' || Array.isArray(sec)) throw new Error(`${key}: security must be an object`)
      for (const field of Object.keys(sec)) {
        if (!SECURITY_KEYS.has(field)) throw new Error(`${key}: security.${field} is not part of the sidecar contract`)
      }
      if (!SECURITY_STATES.has(sec.state)) throw new Error(`${key}: security.state is invalid`)
      if (!Array.isArray(sec.checks)) throw new Error(`${key}: security.checks must be an array`)
      const securityIds = new Set()
      const securityCounts = { total: sec.checks.length, checked: 0, blocking: 0, warn: 0, na: 0, notRun: 0 }
      for (const check of sec.checks) {
        if (!check || typeof check !== 'object') throw new Error(`${key}: security.checks must be objects`)
        for (const field of Object.keys(check)) {
          if (!CHECK_KEYS.has(field)) throw new Error(`${key}: security.checks.${field} is not part of the sidecar contract`)
        }
        for (const field of ['id', 'result', 'coverage']) {
          if (typeof check[field] !== 'string' || check[field] === '') throw new Error(`${key}: security.checks.${field} is required`)
        }
        if (!SECURITY_RESULTS.has(check.result)) throw new Error(`${key}: security ${check.id} result must be PASS/WARN/FAIL/NA`)
        if (!SECURITY_COVERAGE.has(check.coverage)) throw new Error(`${key}: security ${check.id} coverage must be full/partial/not-run`)
        if (securityIds.has(check.id)) throw new Error(`${key}: duplicate security check id ${check.id}`)
        securityIds.add(check.id)
        if (check.coverage === 'not-run') securityCounts.notRun += 1
        else securityCounts.checked += 1
        if (check.result === 'FAIL') securityCounts.blocking += 1
        if (check.result === 'WARN') securityCounts.warn += 1
        if (check.result === 'NA') securityCounts.na += 1
      }
      const summary = sec.summary
      if (!summary || typeof summary !== 'object') throw new Error(`${key}: security.summary must be an object`)
      for (const field of Object.keys(summary)) {
        if (!SECURITY_SUMMARY_KEYS.has(field)) throw new Error(`${key}: security.summary.${field} is not part of the sidecar contract`)
      }
      for (const field of ['total', 'checked', 'blocking', 'warn', 'na', 'notRun']) {
        if (!Number.isInteger(summary[field]) || summary[field] < 0) throw new Error(`${key}: security.summary.${field} is invalid`)
        if (summary[field] !== securityCounts[field]) throw new Error(`${key}: security.summary.${field} must equal ${securityCounts[field]} derived from checks`)
      }
      const expectedState = securityCounts.checked === 0
        ? 'not-run'
        : securityCounts.checked === securityCounts.total ? 'checked' : 'partial'
      if (sec.state !== expectedState) throw new Error(`${key}: security.state must be ${expectedState} for the recorded coverage`)
      if (typeof sec.command !== 'string' || sec.command === '') throw new Error(`${key}: security.command is required`)
    }
    if (entry.notChecked !== undefined) {
      if (!Array.isArray(entry.notChecked)) throw new Error(`${key}: notChecked must be an array`)
      for (const item of entry.notChecked) {
        if (typeof item !== 'string' || item === '') throw new Error(`${key}: notChecked entries must be non-empty strings`)
      }
    }
  }
  walkKeys(sidecar, 'sidecar', (key, where) => {
    if (FORBIDDEN.has(key)) throw new Error(`${where} is forbidden in a sidecar (${[...FORBIDDEN].join(', ')})`)
  })
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const today = options.today ?? todayUtc()
  const outFile = path.resolve(options.out)
  const prev = options.prev ? loadPrev(path.resolve(options.prev)) : null
  const withdrawalsFile = options.withdrawals
    ? path.resolve(options.withdrawals)
    : prev && options.prev
      ? path.join(path.dirname(path.resolve(options.prev)), 'withdrawals.json')
      : null
  let withdrawals = { exact: new Map(), names: new Map(), records: 0 }
  if (withdrawalsFile && fs.existsSync(withdrawalsFile)) withdrawals = parseWithdrawals(withdrawalsFile)
  else if (options.withdrawals) throw new Error(`withdrawals file not found: ${withdrawalsFile}`)

  const previousEntries = prev ? prev.entries : null
  let entries = previousEntries ? JSON.parse(JSON.stringify(previousEntries)) : {}
  let generatedAt = prev?.generatedAt ?? null
  if (options.levels) {
    const levelFile = path.resolve(options.levels)
    const audit = readJson(levelFile, 'level audit')
    if (!audit.levels || typeof audit.levels !== 'object') throw new Error('--levels must be a dsh-level-audit/1 JSON')
    const built = entryFromAudit(audit, options, levelFile)
    entries[built.key] = built.entry
    generatedAt = options.todayProvided ? `${today}T00:00:00.000Z` : new Date().toISOString()
  }
  if (!generatedAt) throw new Error('no --prev and no --levels generatedAt')

  const checkerPkg = readPackageMeta(ROOT)
  // A pure --prev refresh only recomputes lifecycle; it must not overwrite the
  // checker metadata that records which build produced the checks. Explicit
  // --checker-version/--checker-sha still win, and --levels rebuilds use the
  // current package version because they add freshly produced checks.
  const prevChecker = prev && !options.levels && prev.checker && typeof prev.checker === 'object' ? prev.checker : null
  const checkerVersion = options.checkerVersion
    ?? (typeof prevChecker?.version === 'string' && prevChecker.version !== '' ? prevChecker.version : checkerPkg.version)
  if (typeof checkerVersion !== 'string' || checkerVersion === '') throw new Error('cannot determine checker version')
  const checkerSha = options.checkerSha
    ?? (prevChecker && Object.hasOwn(prevChecker, 'sha') ? prevChecker.sha : gitHead())
  if (checkerSha !== null && !HEX40.test(checkerSha)) throw new Error('--checker-sha must be 40 hex chars')
  try {
    const parsed = new URL(options.indexUrl)
    if (parsed.protocol !== 'https:') throw new Error()
  } catch {
    throw new Error('--index-url must be https')
  }

  const counts = applyLifecycle(entries, previousEntries, { today }, withdrawals)
  const sortedEntries = Object.fromEntries(Object.keys(entries).sort().map(key => [key, entries[key]]))
  const sidecar = {
    schema: SCHEMA,
    generatedAt,
    index: { url: options.indexUrl, format: 1 },
    checker: { name: 'dsh-standards', version: checkerVersion, sha: checkerSha },
    notClaimed: [...NOT_CLAIMED],
    entries: sortedEntries,
  }
  validateSidecar(sidecar)

  const text = `${JSON.stringify(sidecar, null, 2)}\n`
  let written = false
  if (!fs.existsSync(outFile) || fs.readFileSync(outFile, 'utf8') !== text) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    fs.writeFileSync(outFile, text)
    written = true
  }
  console.log(JSON.stringify({
    out: outFile,
    schema: SCHEMA,
    generatedAt,
    entries: Object.keys(sortedEntries).length,
    lifecycle: counts,
    withdrawals: { records: withdrawals.records, file: withdrawalsFile && fs.existsSync(withdrawalsFile) ? withdrawalsFile : null },
    written,
    unchanged: !written,
  }, null, 2))
}

try {
  main()
} catch (error) {
  console.error(`build-sidecar: ${error.message}`)
  process.exitCode = 3
}

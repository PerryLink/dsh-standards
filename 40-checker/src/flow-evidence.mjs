/**
 * FLOW evidence chain: `dsh-flow-evidence/2` construction and validation.
 *
 * One module owns the shape so the collector and the audit cannot drift:
 *   - `treeSha256` binds the package directory (read-only copy stays identical);
 *   - `finalizeEvidence`/`evidenceHash` bind the whole document (chain);
 *   - `validateFlowEvidence` is the structural gate `level-audit` uses. v1
 *     (`dsh-flow-journey/1`, `dsh-flow-runtime/1`) and the bare
 *     `{ "J1": { "status": "pass" } }` shape are recognised only so the audit
 *     can label them `deprecated`; they never count as a pass.
 *
 * Pass rule (per journey, enforced from `checks[]`, never from the declared
 * status alone): at least one check, every check has exitCode 0, at least one
 * observed (non-static) check, and every observed check's assertions hold.
 * A journey declared `warn`/`blocked`/`na`/`static`/`not-run` never counts.
 *
 * Runtime rule: passing journeys are necessary but not sufficient. Only
 * sandbox-attested evidence (`claims.claimLevel === 'sandbox-attested'` or
 * `producer.kind === 'sandbox'`) may be reported as `flow.state = 'runtime'`.
 * `self-attested`/`ci-attested` documents keep their `passed` count but stay
 * `not-run`, because structural validation cannot prove where commands ran.
 * A `sandbox-degraded` producer (any isolation item missing) is never runtime,
 * and a document whose `subject.treeStable` is false is structurally invalid:
 * a collector that changed the inspected tree has no trustworthy evidence.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { signEvidence } from './signature.mjs'

// Signing helpers live in signature.mjs; re-exported here so callers that
// already import the evidence model do not need a second module path.
export {
  SIGNATURE_ALG, SIGNATURE_SCHEMA, canonicalJson as signatureCanonicalJson,
  evidenceSigningPayload, generateEd25519KeyPair, keyIdFromPublicKey,
  signEvidence, verifyEvidenceSignature,
} from './signature.mjs'

export const FLOW_IDS = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7', 'J8']
export const FLOW_EVIDENCE_SCHEMA = 'dsh-flow-evidence/2'
export const FLOW_V1_SCHEMAS = new Set(['dsh-flow-journey/1', 'dsh-flow-runtime/1'])
export const JOURNEY_STATUSES = new Set(['pass', 'fail', 'warn', 'blocked', 'static', 'na', 'not-run'])
export const CHECK_KINDS = new Set(['observed', 'static', 'manual'])

const HASH_RE = /^sha256:[0-9a-f]{64}$/
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
const COMMIT_RE = /^[0-9a-f]{40}$/
const INTEGRITY_RE = /^(?:sha512|sha256)-[A-Za-z0-9+/=]+$/

/** Journey -> normative anchor in 32-DSH-FLOW顺畅规范.md (R1..R8). */
export const FLOW_CLAUSE_ANCHORS = {
  J1: '32#R1 安装/移除',
  J2: '32#R2 启用/停用',
  J3: '32#R3 配置',
  J4: '32#R4 首次成功',
  J5: '32#R5 权限',
  J6: '32#R6 升级/回滚/卸载',
  J7: '32#R7 可观测',
  J8: '32#R8 client/server',
}

export function clauseAnchor(checkId) {
  const id = String(checkId ?? '')
  return FLOW_CLAUSE_ANCHORS[id.slice(0, 2)] ?? null
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex')
}

export function sha256Value(data) {
  return `sha256:${sha256Hex(data)}`
}

export function sha256File(file) {
  return sha256Value(fs.readFileSync(file))
}

/** JSON with recursively sorted object keys; array order is preserved. */
export function canonicalJson(value) {
  const sort = (node) => {
    if (Array.isArray(node)) return node.map(sort)
    if (isPlainObject(node)) {
      const out = {}
      for (const key of Object.keys(node).sort()) out[key] = sort(node[key])
      return out
    }
    return node
  }
  return JSON.stringify(sort(value))
}

/** Chain hash: every field except `chain` and `signature`. */
export function evidenceHash(document) {
  const copy = { ...document }
  delete copy.chain
  delete copy.signature
  return sha256Value(canonicalJson(copy))
}

export function finalizeEvidence(document) {
  const output = { ...document }
  output.chain = { evidenceHash: evidenceHash(output) }
  return output
}

export function evidenceHashMatches(document) {
  const declared = document?.chain?.evidenceHash
  if (typeof declared !== 'string') return false
  return declared === evidenceHash(document)
}

/**
 * Attach an Ed25519 signature to a flow-evidence document. The signature
 * covers canonical JSON minus `signature` (the body plus `chain`), so it binds
 * the declared chain hash while never changing `chain.evidenceHash`; it never
 * upgrades a claim level. Verification is `verifyEvidenceSignature()`
 * (re-exported from signature.mjs); structural acceptance remains
 * `validateFlowEvidence()`.
 */
export function attachEvidenceSignature(document, privateKey, options = {}) {
  return signEvidence(document, privateKey, options)
}

const DEFAULT_TREE_EXCLUDE = ['.git', 'node_modules']
const TREE_EXCLUDE_ALWAYS = new Set(['.git', 'node_modules'])

/**
 * Deterministic directory hash: relative path + byte length + file hash for
 * every regular file, sorted, with `.git`/`node_modules` and `exclude` skipped.
 * Symlinks are hashed by target string so re-linking cannot pass unnoticed.
 * Returns `{ hash, files, bytes })` where `hash` is `sha256:<64 hex>`.
 */
export function treeSha256(dir, { exclude = [] } = {}) {
  const root = path.resolve(dir)
  const skip = new Set([...DEFAULT_TREE_EXCLUDE, ...exclude.map(item => String(item).split(path.sep).join('/'))])
  const rows = []
  let bytes = 0
  const walk = (current, relative) => {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name
      const segments = rel.split('/')
      if (segments.some(segment => TREE_EXCLUDE_ALWAYS.has(segment))) continue
      if ([...skip].some(pattern => rel === pattern || rel.startsWith(`${pattern}/`))) continue
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(absolute, rel)
      } else if (entry.isSymbolicLink()) {
        const target = fs.readlinkSync(absolute)
        rows.push(`${rel}\0link\0${sha256Hex(target)}`)
      } else if (entry.isFile()) {
        const size = fs.statSync(absolute).size
        bytes += size
        rows.push(`${rel}\0${size}\0${sha256Hex(fs.readFileSync(absolute))}`)
      }
    }
  }
  walk(root, '')
  rows.sort()
  return { hash: sha256Value(rows.join('\n')), files: rows.length, bytes }
}

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function subjectFields(subject) {
  if (!isPlainObject(subject)) return null
  return {
    name: subject.name ?? null,
    version: subject.version ?? null,
    integrity: subject.integrity ?? null,
    tarballSha256: subject.tarballSha256 ?? null,
    treeSha256: subject.treeSha256 ?? null,
    commit: subject.commit ?? null,
  }
}

/**
 * Recompute the subject binding from a package directory: package.json
 * name/version, the deterministic tree hash, and the npm-pack tarball hash +
 * integrity. npm packs the same tree byte-identically, so this is the same
 * binding `dsh-flow-collect` recorded.
 */
export function recomputeSubject(dir, { exclude = [], timeoutMs = 120_000 } = {}) {
  const root = path.resolve(dir)
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const tree = treeSha256(root, { exclude })
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-subject-'))
  try {
    const run = spawnSync(NPM, ['pack', '--ignore-scripts', '--json', '--pack-destination', destination], {
      cwd: root, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024,
    })
    if (run.error) throw new Error(`npm pack failed to start: ${run.error.message}`)
    if (run.status !== 0) throw new Error(`npm pack failed (exit ${run.status}): ${String(run.stderr ?? '').replace(/\s+/g, ' ').slice(0, 300)}`)
    let parsed
    try { parsed = JSON.parse(run.stdout) } catch { throw new Error('npm pack did not print JSON') }
    const info = Array.isArray(parsed) ? parsed[0] : parsed
    if (!info?.filename) throw new Error('npm pack did not report a tarball filename')
    return {
      name: typeof manifest.name === 'string' ? manifest.name : null,
      version: typeof manifest.version === 'string' ? manifest.version : null,
      treeSha256: tree.hash,
      tarballSha256: sha256File(path.join(destination, info.filename)),
      integrity: typeof info.integrity === 'string' ? info.integrity : null,
    }
  } finally {
    fs.rmSync(destination, { recursive: true, force: true })
  }
}

/**
 * Bind a flow-evidence document to a package directory. Any mismatch in
 * name/version/treeSha256/tarballSha256 (or a declared integrity) is a hard
 * failure: the audit must not accept evidence for a different subject.
 */
export function bindEvidenceSubject(document, dir, options = {}) {
  const declared = isPlainObject(document?.subject) ? document.subject : null
  const base = { dir: path.resolve(dir), declared: subjectFields(declared), recomputed: null, mismatches: [], errors: [] }
  if (!declared) return { ...base, ok: false, errors: ['subject is missing'] }
  let recomputed
  try {
    recomputed = recomputeSubject(dir, {
      exclude: Array.isArray(declared.treeExclude) ? declared.treeExclude : [],
      timeoutMs: options.timeoutMs,
    })
  } catch (error) {
    return { ...base, ok: false, errors: [error.message] }
  }
  const mismatches = []
  for (const key of ['name', 'version', 'treeSha256', 'tarballSha256']) {
    if (declared[key] !== recomputed[key]) {
      mismatches.push(`${key}: declared ${declared[key] ?? 'null'} != recomputed ${recomputed[key] ?? 'null'}`)
    }
  }
  if (typeof declared.integrity === 'string' && recomputed.integrity !== null && declared.integrity !== recomputed.integrity) {
    mismatches.push('integrity: declared value != recomputed value')
  }
  return { ...base, ok: mismatches.length === 0, recomputed, mismatches }
}

/**
 * Plain CI attribution for display. These fields are read from the runner
 * environment and are self-declared: CI attribution is not proof.
 */
export function ciAttribution(env = process.env) {
  const read = key => (typeof env?.[key] === 'string' ? env[key].trim() : '')
  const runId = read('GITHUB_RUN_ID')
  const repository = read('GITHUB_REPOSITORY')
  const commit = read('GITHUB_SHA')
  if (!runId && !repository && !commit) return null
  const server = (read('GITHUB_SERVER_URL') || 'https://github.com').replace(/\/+$/, '')
  return {
    provider: 'github-actions',
    runId: runId || null,
    repository: repository || null,
    commit: commit || null,
    runUrl: runId && repository ? `${server}/${repository}/actions/runs/${runId}` : null,
  }
}

export function isIsoTimestamp(value) {
  return typeof value === 'string' && ISO_RE.test(value) && Number.isFinite(Date.parse(value))
}

/**
 * Aggregate one journey from its checks.
 * `pass` requires observed evidence; `static` means preflight only; `warn`
 * means the commands succeeded but an assertion contradicts the claim.
 */
export function journeyAggregate(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return 'not-run'
  if (checks.some(check => check?.exitCode !== 0)) return 'fail'
  const observed = checks.filter(check => (check?.kind ?? 'observed') !== 'static')
  if (observed.length === 0) return 'static'
  const held = observed.every(check => Array.isArray(check.assertions)
    && check.assertions.length > 0
    && check.assertions.every(assertion => assertion?.observed === true))
  return held ? 'pass' : 'warn'
}

/** True only when a declared journey status agrees with its checks. */
export function journeyCountsAsPass(journey) {
  const derived = journeyAggregate(journey?.checks)
  const declared = journey?.status ?? null
  if (derived !== 'pass') return false
  return declared === null || declared === 'pass'
}

/**
 * Runtime eligibility. A local collector run is `self-attested`
 * (`ci-attested` with `--ci`): structurally valid, but it does not prove that
 * commands ran, let alone in a sandbox. Only `claims.claimLevel ===
 * 'sandbox-attested'` or the producer-side equivalent `producer.kind ===
 * 'sandbox'` may be reported as FLOW runtime.
 */
export function isSandboxAttested(document) {
  if (!isPlainObject(document)) return false
  // Degradation is disqualifying even if a claim was left at sandbox-attested:
  // the producer admits an isolation item was missing.
  if (document.producer?.kind === 'sandbox-degraded') return false
  if (document.sandbox?.mode === 'sandbox-degraded') return false
  if (Array.isArray(document.sandbox?.degraded) && document.sandbox.degraded.length > 0) return false
  return document.claims?.claimLevel === 'sandbox-attested' || document.producer?.kind === 'sandbox'
}

function emptyVerdict(kind, schema, errors) {
  return {
    kind,
    schema: schema ?? null,
    valid: false,
    errors,
    journeys: {},
    computedHash: null,
    declaredHash: null,
    subject: null,
    host: null,
    generatedAt: null,
    conclusion: null,
    claimLevel: null,
    producerKind: null,
    sandboxAttested: false,
  }
}

/**
 * Classify + structurally validate a flow evidence document.
 * `kind`: `v2` | `v1-deprecated` | `legacy` | `invalid`.
 */
export function validateFlowEvidence(document) {
  if (!isPlainObject(document)) return emptyVerdict('invalid', null, ['root must be a JSON object'])
  const schema = typeof document.schema === 'string' ? document.schema : null
  if (schema === FLOW_EVIDENCE_SCHEMA) return validateV2(document)
  const legacyRows = FLOW_IDS.some(id => isPlainObject(document[id]))
  if (schema && (FLOW_V1_SCHEMAS.has(schema) || !legacyRows)) {
    return emptyVerdict('v1-deprecated', schema, [
      `schema ${schema} is deprecated; only ${FLOW_EVIDENCE_SCHEMA} is accepted`,
    ])
  }
  if (legacyRows || isPlainObject(document.journeys)) {
    return emptyVerdict('legacy', schema, [
      'bare {Jx:{status}} rows are deprecated and never count as a pass',
    ])
  }
  return emptyVerdict('invalid', schema, [`unrecognised flow evidence document; expected schema ${FLOW_EVIDENCE_SCHEMA}`])
}

function validateV2(document) {
  const errors = []
  const requireObject = (value, label) => {
    if (!isPlainObject(value)) {
      errors.push(`${label} must be an object`)
      return false
    }
    return true
  }
  const requireString = (value, label, { allowNull = false, minLength = 1, pattern = null } = {}) => {
    if (value === null && allowNull) return
    if (typeof value !== 'string' || value.length < minLength) {
      errors.push(`${label} must be a non-empty string${allowNull ? ' or null' : ''}`)
      return
    }
    if (pattern && !pattern.test(value)) errors.push(`${label} has an invalid format`)
  }
  const requireIso = (value, label) => {
    if (!isIsoTimestamp(value)) errors.push(`${label} must be an ISO-8601 timestamp`)
  }
  const requireHash = (value, label, { allowNull = false } = {}) => {
    if (value === null && allowNull) return
    if (typeof value !== 'string' || !HASH_RE.test(value)) errors.push(`${label} must be sha256:<64 lowercase hex>${allowNull ? ' or null' : ''}`)
  }
  const requireLog = (value, label) => {
    if (!requireObject(value, label)) return
    requireString(value.path, `${label}.path`)
    requireHash(value.sha256, `${label}.sha256`)
    for (const key of Object.keys(value)) if (!['path', 'sha256'].includes(key)) errors.push(`${label}.${key} is not allowed`)
  }

  for (const key of ['schema', 'generatedAt', 'producer', 'subject', 'host', 'journeys', 'claims', 'chain']) {
    if (!(key in document)) errors.push(`${key} is required`)
  }
  if (!errors.includes('schema is required')) {
    if (document.schema !== FLOW_EVIDENCE_SCHEMA) errors.push(`schema must be ${FLOW_EVIDENCE_SCHEMA}`)
  }
  if ('generatedAt' in document) requireIso(document.generatedAt, 'generatedAt')
  if ('evidenceId' in document) requireString(document.evidenceId, 'evidenceId')

  if (requireObject(document.producer, 'producer')) {
    requireIso(document.producer.at ?? null, 'producer.at')
    const command = document.producer.command
    if (!Array.isArray(command) || command.length === 0 || command.some(item => typeof item !== 'string')) {
      errors.push('producer.command must be a non-empty array of strings')
    }
    if ('kind' in document.producer && document.producer.kind !== null && !['local', 'ci', 'sandbox', 'sandbox-degraded'].includes(document.producer.kind)) {
      errors.push('producer.kind must be local, ci, sandbox, or sandbox-degraded')
    }
    for (const key of ['runner', 'actor', 'runUrl', 'provider', 'runId', 'repository', 'commit']) {
      if (key in document.producer && document.producer[key] !== null) requireString(document.producer[key], `producer.${key}`)
    }
    if (typeof document.producer.commit === 'string' && !COMMIT_RE.test(document.producer.commit)) {
      errors.push('producer.commit must be a 40-hex commit')
    }
    if (typeof document.producer.runUrl === 'string' && !/^https:\/\//.test(document.producer.runUrl)) {
      errors.push('producer.runUrl must be an https URL')
    }
  }

  if (requireObject(document.subject, 'subject')) {
    const subject = document.subject
    requireString(subject.name, 'subject.name')
    requireString(subject.version, 'subject.version')
    requireFieldOrNull(errors, subject, 'integrity', value => requireString(value, 'subject.integrity', { allowNull: true, pattern: INTEGRITY_RE }))
    requireField(errors, subject, 'tarballSha256', () => requireHash(subject.tarballSha256, 'subject.tarballSha256'))
    requireFieldOrNull(errors, subject, 'commit', value => requireString(value, 'subject.commit', { allowNull: true, pattern: COMMIT_RE }))
    requireField(errors, subject, 'treeSha256', () => requireHash(subject.treeSha256, 'subject.treeSha256'))
    if ('treeSha256After' in subject) requireHash(subject.treeSha256After, 'subject.treeSha256After', { allowNull: true })
    if ('treeStable' in subject && typeof subject.treeStable !== 'boolean') errors.push('subject.treeStable must be a boolean')
    if ('treeExclude' in subject) {
      if (!Array.isArray(subject.treeExclude) || subject.treeExclude.some(item => typeof item !== 'string')) {
        errors.push('subject.treeExclude must be an array of strings')
      }
    }
    if ('source' in subject) requireString(subject.source, 'subject.source')
    if (subject.treeStable === false) {
      errors.push('subject.treeStable is false: the package tree changed during collection')
    }
    if ('treeSha256After' in subject && subject.treeSha256After && subject.treeSha256After !== subject.treeSha256 && subject.treeStable !== false) {
      errors.push('subject.treeSha256After differs from subject.treeSha256: the package tree changed during collection')
    }
  }

  if (requireObject(document.host, 'host')) {
    requireString(document.host.dsh, 'host.dsh', { allowNull: true })
    requireString(document.host.node, 'host.node')
    requireString(document.host.platform, 'host.platform')
    for (const key of ['dshCommit', 'cordis']) {
      if (key in document.host && document.host[key] !== null) requireString(document.host[key], `host.${key}`)
    }
  }

  if (requireObject(document.journeys, 'journeys')) {
    for (const key of Object.keys(document.journeys)) {
      if (!FLOW_IDS.includes(key)) errors.push(`journeys.${key} is not a known journey (J1-J8)`)
    }
    for (const id of FLOW_IDS) {
      const journey = document.journeys[id]
      if (!isPlainObject(journey)) {
        errors.push(`journeys.${id} must be an object`)
        continue
      }
      for (const key of Object.keys(journey)) {
        if (!['status', 'reason', 'kind', 'checks', 'limitations'].includes(key)) errors.push(`journeys.${id}.${key} is not allowed`)
      }
      if ('status' in journey && journey.status !== null && !JOURNEY_STATUSES.has(journey.status)) {
        errors.push(`journeys.${id}.status must be one of ${[...JOURNEY_STATUSES].join(', ')}`)
      }
      if ('reason' in journey && journey.reason !== null) requireString(journey.reason, `journeys.${id}.reason`)
      if ('limitations' in journey) {
        if (!Array.isArray(journey.limitations) || journey.limitations.some(item => typeof item !== 'string')) {
          errors.push(`journeys.${id}.limitations must be an array of strings`)
        }
      }
      if (!Array.isArray(journey.checks)) {
        errors.push(`journeys.${id}.checks must be an array`)
        continue
      }
      journey.checks.forEach((check, index) => validateCheck(check, `journeys.${id}.checks[${index}]`))
    }
  }

  if (requireObject(document.claims, 'claims')) {
    const claims = document.claims
    if (!['self-attested', 'ci-attested', 'sandbox-attested'].includes(claims.claimLevel)) {
      errors.push('claims.claimLevel must be self-attested, ci-attested, or sandbox-attested')
    }
    if ('notClaimed' in claims && (!Array.isArray(claims.notClaimed) || claims.notClaimed.some(item => typeof item !== 'string'))) {
      errors.push('claims.notClaimed must be an array of strings')
    }
    if ('method' in claims) requireString(claims.method, 'claims.method')
  }

  validateSandbox(document, errors)

  if (requireObject(document.chain, 'chain')) {
    requireHash(document.chain.evidenceHash, 'chain.evidenceHash')
    for (const key of Object.keys(document.chain)) if (key !== 'evidenceHash') errors.push(`chain.${key} is not allowed`)
  }
  if ('signature' in document && document.signature !== null && !isPlainObject(document.signature)) {
    errors.push('signature must be null or an object')
  }
  if ('conclusion' in document && document.conclusion !== null && !['flow-pass', 'flow-warn', 'flow-blocked', 'flow-fail'].includes(document.conclusion)) {
    errors.push('conclusion must be flow-pass, flow-warn, flow-blocked, or flow-fail')
  }

  // Aggregation consistency: declared pass/fail must agree with the checks.
  const journeys = {}
  for (const id of FLOW_IDS) {
    const journey = isPlainObject(document.journeys?.[id]) ? document.journeys[id] : null
    const checks = Array.isArray(journey?.checks) ? journey.checks : []
    const derived = journeyAggregate(checks)
    const declared = journey?.status ?? null
    const passes = journeyCountsAsPass(journey)
    journeys[id] = { declared, derived, checks: checks.length, passes }
    if (declared === 'pass' && derived !== 'pass') errors.push(`journeys.${id} declares pass but its checks aggregate to ${derived}`)
    if (declared === 'fail' && derived === 'pass') errors.push(`journeys.${id} declares fail but its checks aggregate to pass`)
  }

  // Chain integrity: recompute over every field except chain/signature.
  const computedHash = evidenceHash(document)
  const declaredHash = typeof document.chain?.evidenceHash === 'string' ? document.chain.evidenceHash : null
  if (declaredHash !== computedHash) {
    errors.push(`chain.evidenceHash does not match the document (declared ${declaredHash ?? 'missing'}, computed ${computedHash})`)
  }

  return {
    kind: 'v2',
    schema: FLOW_EVIDENCE_SCHEMA,
    valid: errors.length === 0,
    errors,
    journeys,
    computedHash,
    declaredHash,
    subject: isPlainObject(document.subject) ? document.subject : null,
    host: isPlainObject(document.host) ? document.host : null,
    generatedAt: document.generatedAt ?? null,
    conclusion: document.conclusion ?? null,
    claimLevel: isPlainObject(document.claims) ? document.claims.claimLevel ?? null : null,
    producerKind: isPlainObject(document.producer) ? document.producer.kind ?? null : null,
    sandbox: isPlainObject(document.sandbox)
      ? {
        mode: document.sandbox.mode ?? null,
        degraded: Array.isArray(document.sandbox.degraded) ? [...document.sandbox.degraded] : [],
      }
      : null,
    sandboxAttested: isSandboxAttested(document),
  }

  function validateSandbox(doc, errors) {
    const kind = isPlainObject(doc.producer) ? doc.producer.kind ?? null : null
    const declaredSandbox = 'sandbox' in doc
    if (!declaredSandbox && kind !== 'sandbox' && kind !== 'sandbox-degraded') return
    if (!declaredSandbox) {
      errors.push('sandbox is required when producer.kind is sandbox or sandbox-degraded')
      return
    }
    const sandbox = doc.sandbox
    if (!isPlainObject(sandbox)) {
      errors.push('sandbox must be an object')
      return
    }
    if (!['sandbox', 'sandbox-degraded'].includes(sandbox.mode)) {
      errors.push('sandbox.mode must be sandbox or sandbox-degraded')
    }
    const degraded = Array.isArray(sandbox.degraded) ? sandbox.degraded : null
    if (!degraded || degraded.some(item => typeof item !== 'string' || item.length === 0)) {
      errors.push('sandbox.degraded must be an array of non-empty strings')
    }
    const list = degraded ?? []
    if (sandbox.mode === 'sandbox' && list.length > 0) errors.push('sandbox.mode is sandbox but sandbox.degraded is not empty')
    if (sandbox.mode === 'sandbox-degraded' && list.length === 0) errors.push('sandbox.mode is sandbox-degraded but sandbox.degraded is empty')
    if ('env' in sandbox) {
      if (!isPlainObject(sandbox.env)) errors.push('sandbox.env must be an object')
      else if (typeof sandbox.env.absent !== 'boolean') errors.push('sandbox.env.absent must be a boolean')
    }
    if ('network' in sandbox && (!isPlainObject(sandbox.network) || typeof sandbox.network.isolated !== 'boolean')) {
      errors.push('sandbox.network.isolated must be a boolean')
    }
    if ('limits' in sandbox) {
      if (!isPlainObject(sandbox.limits)) errors.push('sandbox.limits must be an object')
      else {
        if ('available' in sandbox.limits && typeof sandbox.limits.available !== 'boolean') errors.push('sandbox.limits.available must be a boolean')
        if ('applied' in sandbox.limits && (!Array.isArray(sandbox.limits.applied) || sandbox.limits.applied.some(item => typeof item !== 'string'))) {
          errors.push('sandbox.limits.applied must be an array of strings')
        }
      }
    }
    if ('home' in sandbox && (!isPlainObject(sandbox.home) || typeof sandbox.home.isolated !== 'boolean')) {
      errors.push('sandbox.home.isolated must be a boolean')
    }
    if ('executed' in sandbox && typeof sandbox.executed !== 'boolean') errors.push('sandbox.executed must be a boolean')
    if (kind === 'sandbox') {
      if (sandbox.mode !== 'sandbox') errors.push('producer.kind=sandbox requires sandbox.mode=sandbox')
      if (list.length > 0) errors.push('producer.kind=sandbox requires an empty sandbox.degraded list')
      if (sandbox.executed !== true) errors.push('producer.kind=sandbox requires sandbox.executed=true')
      if (sandbox.env?.absent !== true) errors.push('producer.kind=sandbox requires sandbox.env.absent=true')
      if (sandbox.network?.isolated !== true) errors.push('producer.kind=sandbox requires sandbox.network.isolated=true')
      if (sandbox.limits?.available !== true) errors.push('producer.kind=sandbox requires sandbox.limits.available=true')
      if (sandbox.home?.isolated !== true) errors.push('producer.kind=sandbox requires sandbox.home.isolated=true')
    }
    if (kind === 'sandbox-degraded') {
      if (sandbox.mode !== 'sandbox-degraded') errors.push('producer.kind=sandbox-degraded requires sandbox.mode=sandbox-degraded')
      if (list.length === 0) errors.push('producer.kind=sandbox-degraded requires at least one sandbox.degraded reason')
      if (doc.claims?.claimLevel === 'sandbox-attested') errors.push('producer.kind=sandbox-degraded cannot claim sandbox-attested')
    }
  }

  function validateCheck(check, label) {
    if (!isPlainObject(check)) {
      errors.push(`${label} must be an object`)
      return
    }
    for (const key of Object.keys(check)) {
      if (!['id', 'kind', 'command', 'exitCode', 'startedAt', 'endedAt', 'stdout', 'stderr', 'assertions', 'durationMs'].includes(key)) {
        errors.push(`${label}.${key} is not allowed`)
      }
    }
    requireString(check.id, `${label}.id`, { pattern: /^J[1-8](?:\.[A-Za-z0-9._-]+)?$/ })
    if ('kind' in check && !CHECK_KINDS.has(check.kind)) errors.push(`${label}.kind must be observed, static, or manual`)
    if (!Array.isArray(check.command) || check.command.length === 0 || check.command.some(item => typeof item !== 'string')) {
      errors.push(`${label}.command must be a non-empty array of strings`)
    }
    if (!Number.isInteger(check.exitCode) || check.exitCode < 0 || check.exitCode > 255) {
      errors.push(`${label}.exitCode must be an integer in 0..255`)
    }
    requireIso(check.startedAt, `${label}.startedAt`)
    requireIso(check.endedAt, `${label}.endedAt`)
    if (isIsoTimestamp(check.startedAt) && isIsoTimestamp(check.endedAt) && Date.parse(check.endedAt) < Date.parse(check.startedAt)) {
      errors.push(`${label}.endedAt is before startedAt`)
    }
    requireField(errors, check, 'stdout', () => requireLog(check.stdout, `${label}.stdout`))
    if ('stderr' in check) requireLog(check.stderr, `${label}.stderr`)
    if (!Array.isArray(check.assertions) || check.assertions.length === 0) {
      errors.push(`${label}.assertions must be a non-empty array`)
    } else {
      check.assertions.forEach((assertion, index) => {
        const alabel = `${label}.assertions[${index}]`
        if (!isPlainObject(assertion)) {
          errors.push(`${alabel} must be an object`)
          return
        }
        for (const key of Object.keys(assertion)) if (!['claim', 'observed', 'detail'].includes(key)) errors.push(`${alabel}.${key} is not allowed`)
        requireString(assertion.claim, `${alabel}.claim`)
        if (typeof assertion.observed !== 'boolean') errors.push(`${alabel}.observed must be a boolean`)
        if ('detail' in assertion && assertion.detail !== null) requireString(assertion.detail, `${alabel}.detail`)
      })
    }
    if ('durationMs' in check && (typeof check.durationMs !== 'number' || check.durationMs < 0)) {
      errors.push(`${label}.durationMs must be a non-negative number`)
    }
  }
}

function requireField(errors, object, key, validate) {
  if (!(key in object)) {
    errors.push(`${key} is required`)
    return
  }
  validate()
}

function requireFieldOrNull(errors, object, key, validate) {
  if (!(key in object)) {
    errors.push(`${key} is required`)
    return
  }
  validate(object[key])
}

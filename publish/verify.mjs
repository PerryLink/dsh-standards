#!/usr/bin/env node
/**
 * verify.mjs — look up a DSH attestation by ID, validate it, and
 * print its scope/status/expiry. Optionally check that evidence URLs resolve.
 *
 * It is a read-only view. It does not issue, suspend, or revoke anything, and it
 * never turns an expired record into a valid one.
 *
 * Usage:
 *   node publish/verify.mjs --id DSH-ATT-2026-001
 *   node publish/verify.mjs --file publish/attestations/DSH-ATT-2026-001.json
 *   node publish/verify.mjs --build
 *   node publish/verify.mjs --id ... --online --json
 *
 * Exit: 0 valid, 2 not found / invalid, 3 input error.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateAttestation } from '../40-checker/scripts/attestation-check.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const CERTS = path.join(ROOT, 'publish', 'attestations')
const INDEX = path.join(CERTS, 'index.json')

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function buildIndex(dir = CERTS) {
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json') && name !== 'index.json').sort()
  const attestations = []
  for (const name of files) {
    const cert = readJson(path.join(dir, name))
    attestations.push({
      attestationId: cert.attestationId,
      repo: cert.subject?.repo,
      version: cert.subject?.version,
      grade: cert.grade,
      claimLevel: cert.claimLevel,
      status: cert.status,
      issuedAt: cert.issuedAt,
      expiresAt: cert.expiresAt,
      verifyUrl: cert.verifyUrl,
      file: `publish/attestations/${name}`,
    })
  }
  return {
    schema: 'dsh-attestation-index/1',
    updatedAt: new Date().toISOString().slice(0, 10),
    attestations,
  }
}

export function loadIndex(root = ROOT) {
  const file = path.join(root, 'publish', 'attestations', 'index.json')
  if (fs.existsSync(file)) return readJson(file)
  return buildIndex(path.join(root, 'publish', 'attestations'))
}

export function findAttestation(index, id) {
  return (index.attestations || []).find((c) => c.attestationId === id) || null
}

export function effectiveStatus(cert, now = new Date()) {
  if (cert.status !== 'active') return cert.status
  const expires = Date.parse(`${cert.expiresAt}T23:59:59Z`)
  if (Number.isFinite(expires) && expires < now.getTime()) return 'expired'
  return 'active'
}

export function summarize(cert) {
  return {
    attestationId: cert.attestationId,
    subject: cert.subject,
    grade: cert.grade,
    claimLevel: cert.claimLevel,
    status: effectiveStatus(cert),
    declaredStatus: cert.status,
    selfAssessed: cert.selfAssessed,
    issuedAt: cert.issuedAt,
    expiresAt: cert.expiresAt,
    scope: cert.scope,
    assessor: cert.assessor,
    verifyUrl: cert.verifyUrl,
    disclaimer: cert.disclaimer,
    evidence: (cert.evidence || []).map((e) => ({ id: e.id, result: e.result, url: e.url || null, sha256: e.sha256 || null })),
  }
}

async function checkOnline(cert, timeoutMs = 5000) {
  const results = []
  for (const item of cert.evidence || []) {
    if (!item.url) continue
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(item.url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' })
      results.push({ id: item.id, url: item.url, status: response.status, ok: response.ok })
    } catch (error) {
      results.push({ id: item.id, url: item.url, status: null, ok: false, error: error.name })
    } finally {
      clearTimeout(timer)
    }
  }
  return results
}

export async function verify({ root = ROOT, id = null, file = null, online = false } = {}) {
  let cert
  let source
  if (file) {
    source = path.resolve(file)
    cert = readJson(source)
  } else {
    const index = loadIndex(root)
    const entry = findAttestation(index, id)
    if (!entry) return { ok: false, error: `attestation not found: ${id}`, index }
    source = path.join(root, entry.file)
    cert = readJson(source)
  }
  const validation = validateAttestation(cert)
  const summary = summarize(cert)
  const errors = [...validation.errors]
  if (summary.status === 'expired' && cert.status === 'active') {
    errors.push('declared status is active but expiresAt has passed; it must be expired/stale')
  }
  const onlineResults = online ? await checkOnline(cert) : null
  const onlineFailures = onlineResults ? onlineResults.filter((r) => !r.ok) : []
  return {
    ok: errors.length === 0,
    source: path.relative(root, source),
    attestation: summary,
    errors,
    warnings: validation.warnings,
    online: onlineResults,
    onlineFailures,
  }
}

function usage() {
  console.log(`usage: node publish/verify.mjs [--id <id> | --file <json>] [--build] [--online] [--json]`)
}

export async function main(argv = process.argv.slice(2)) {
  let root = ROOT
  let id = null
  let file = null
  let build = false
  let online = false
  let json = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--root') root = path.resolve(argv[++i])
    else if (arg === '--id') id = argv[++i]
    else if (arg === '--file') file = argv[++i]
    else if (arg === '--build') build = true
    else if (arg === '--online') online = true
    else if (arg === '--json') json = true
    else if (arg === '--help' || arg === '-h') { usage(); return 0 }
    else { console.error(`unknown argument: ${arg}`); return 3 }
  }
  if (build) {
    const index = buildIndex(path.join(root, 'publish', 'attestations'))
    const out = path.join(root, 'publish', 'attestations', 'index.json')
    fs.writeFileSync(out, `${JSON.stringify(index, null, 2)}\n`)
    console.log(`wrote ${path.relative(root, out)} (${index.attestations.length} record(s))`)
    return 0
  }
  if (!id && !file) { usage(); return 3 }
  const result = await verify({ root, id, file, online })
  if (json) {
    console.log(JSON.stringify(result, null, 2))
  } else if (!result.ok && result.error) {
    console.error(result.error)
  } else {
    const c = result.attestation
    console.log(`${c.attestationId}  ${c.subject.repo}@${c.subject.version}`)
    console.log(`grade ${c.grade} · claimLevel ${c.claimLevel} · status ${c.status}${c.selfAssessed ? ' · self-assessed' : ''}`)
    console.log(`issued ${c.issuedAt} · expires ${c.expiresAt}`)
    console.log(`scope: ${c.scope.dimensions.join(',')}; excluded: ${c.scope.excluded.join(', ')}`)
    console.log(`verify: ${c.verifyUrl}`)
    console.log(`disclaimer: ${c.disclaimer}`)
    for (const e of c.evidence) console.log(`  ${e.id} ${e.result} ${e.url || e.sha256}`)
    if (result.online) for (const r of result.online) console.log(`  online ${r.id}: ${r.ok ? 'OK' : 'FAIL'} ${r.status ?? r.error}`)
    for (const warning of result.warnings) console.log(`WARN ${warning}`)
    for (const error of result.errors) console.log(`FAIL ${error}`)
    console.log(result.ok ? 'PASS valid record' : 'FAIL invalid record')
  }
  return result.ok ? 0 : 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code })
}

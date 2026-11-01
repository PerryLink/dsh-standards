#!/usr/bin/env node
/**
 * attestation-check.mjs — validate DSH attestation JSON.
 *
 * The attestation is a quality-grade document (A-E evidence, A-D grade). It is
 * orthogonal to the adoption levels: a `level` field is a hard error.
 *
 * Usage:
 *   node 40-checker/scripts/attestation-check.mjs --dir publish/attestations
 *   node 40-checker/scripts/attestation-check.mjs --file path/to/cert.json --json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = path.resolve(HERE, '..', '..')
const STATUS = new Set(['draft', 'active', 'suspended', 'withdrawn', 'expired'])
const GRADES = new Set(['A', 'B', 'C', 'D'])
const DIMENSIONS = new Set(['A', 'B', 'C', 'D', 'E'])

function date(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}

export function validateAttestation(cert) {
  const errors = []
  const warn = (m) => errors.push(`WARN ${m}`)
  const err = (m) => errors.push(m)
  if (!cert || typeof cert !== 'object') return { errors: ['attestation must be an object'] }
  if (cert.schema !== 'dsh-attestation/1') err('schema must be dsh-attestation/1')
  if ('level' in cert) err('attestation must not contain a level field (A-D is orthogonal to ENTRY/FLOW/BOOST)')
  if (!/^DSH-ATT-\d{4}-\d{3}$/.test(cert.attestationId || '')) err('attestationId must match DSH-ATT-YYYY-NNN')
  if (!cert.subject || !cert.subject.repo || !cert.subject.version) err('subject.repo and subject.version are required')
  if (!GRADES.has(cert.grade)) err('grade must be A, B, C, or D')
  if (!['self-reported', 'verified', 'peer-reviewed'].includes(cert.claimLevel)) {
    err('claimLevel must be self-reported, verified, or peer-reviewed')
  }
  if (cert.selfAssessed === true && cert.claimLevel !== 'self-reported') {
    err('a self-assessed record cannot claim verified or peer-reviewed')
  }
  if (!STATUS.has(cert.status)) err('status must be draft|active|suspended|withdrawn|expired')
  if (!date(cert.issuedAt)) err('issuedAt must be YYYY-MM-DD')
  if (!date(cert.expiresAt)) err('expiresAt must be YYYY-MM-DD')
  if (date(cert.issuedAt) && date(cert.expiresAt) && Date.parse(cert.expiresAt) <= Date.parse(cert.issuedAt)) {
    err('expiresAt must be after issuedAt')
  }
  if (date(cert.expiresAt) && Date.parse(cert.expiresAt) < Date.now() && cert.status === 'active') {
    err('an expired attestation cannot be active; set status=expired')
  }
  if (!cert.scope || !Array.isArray(cert.scope.dimensions) || cert.scope.dimensions.length === 0) {
    err('scope.dimensions must list A-E')
  } else {
    for (const dimension of cert.scope.dimensions) if (!DIMENSIONS.has(dimension)) err(`invalid scope dimension ${dimension}`)
  }
  if (!Array.isArray(cert.scope?.excluded) || cert.scope.excluded.length === 0) {
    err('scope.excluded must state what the attestation does NOT cover')
  }
  if (!cert.scheme || cert.scheme.id !== 'dsh-certification' || !cert.scheme.version) err('scheme.id/version required')
  if (!cert.assessor || !cert.assessor.handle) err('assessor.handle required')
  if (cert.assessor && !['organizer', 'maintainer', 'reviewer', 'external-reviewer'].includes(cert.assessor.role)) {
    err('assessor.role is invalid')
  }
  if (cert.assessor && !Array.isArray(cert.assessor.coi)) err('assessor.coi must be an array')
  if (typeof cert.selfAssessed !== 'boolean') err('selfAssessed must be boolean')
  if (cert.selfAssessed === true && !(cert.assessor?.coi || []).some((s) => /self|author|own/i.test(s))) {
    warn('selfAssessed is true but assessor.coi does not mention the self/author conflict')
  }
  if (typeof cert.disclaimer !== 'string' || cert.disclaimer.length < 12) err('disclaimer must be a real sentence')
  else if (!/非官方|not official|非认证|not a certification/i.test(cert.disclaimer)) {
    err('disclaimer must say non-official and/or not a certification')
  }
  if (!/^https:\/\//.test(cert.verifyUrl || '')) err('verifyUrl must be https')
  if (!Array.isArray(cert.evidence) || cert.evidence.length === 0) err('evidence must not be empty')
  const ids = new Set()
  for (const item of cert.evidence || []) {
    if (!DIMENSIONS.has(item.id)) err(`evidence id ${item.id} must be A-E`)
    if (ids.has(item.id)) err(`duplicate evidence id ${item.id}`)
    ids.add(item.id)
    if (!['PASS', 'FAIL', 'WARN', 'NOT-RUN'].includes(item.result)) err(`evidence ${item.id} result is invalid`)
    if (!item.url && !item.sha256) err(`evidence ${item.id} needs a url or sha256`)
    if (item.url && !/^https:\/\//.test(item.url)) err(`evidence ${item.id} url must be https`)
  }
  for (const item of cert.evidence || []) {
    if (item.result === 'PASS' && !item.url && !item.sha256) err(`evidence ${item.id} cannot PASS without an artifact`)
  }
  return { errors: errors.filter((e) => !e.startsWith('WARN ')), warnings: errors.filter((e) => e.startsWith('WARN ')).map((e) => e.slice(5)) }
}

export function main(argv = process.argv.slice(2)) {
  let root = DEFAULT_ROOT
  let dir = 'publish/attestations'
  let file = null
  let json = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--root') root = path.resolve(argv[++i])
    else if (arg === '--dir') dir = argv[++i]
    else if (arg === '--file') file = path.resolve(argv[++i])
    else if (arg === '--json') json = true
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: attestation-check.mjs [--root <dir>] [--dir <dir>] [--file <json>] [--json]')
      return 0
    } else {
      console.error(`unknown argument: ${arg}`)
      return 2
    }
  }
  let files = []
  if (file) files = [file]
  else {
    const full = path.join(root, dir)
    if (!fs.existsSync(full)) {
      console.error(`attestation-check: directory not found: ${full}`)
      return 2
    }
    files = fs.readdirSync(full).filter((name) => name.endsWith('.json') && name !== 'index.json').map((name) => path.join(full, name)).sort()
  }
  if (files.length === 0) {
    console.error('attestation-check: no attestation JSON found')
    return 2
  }
  const results = []
  let failed = 0
  for (const item of files) {
    try {
      const cert = JSON.parse(fs.readFileSync(item, 'utf8'))
      const result = validateAttestation(cert)
      if (result.errors.length > 0) failed += 1
      results.push({ file: path.relative(root, item), attestationId: cert.attestationId, ...result })
    } catch (error) {
      failed += 1
      results.push({ file: path.relative(root, item), errors: [`parse error: ${error.message}`], warnings: [] })
    }
  }
  if (json) {
    console.log(JSON.stringify({ ok: failed === 0, results }, null, 2))
  } else {
    for (const result of results) {
      for (const warning of result.warnings) console.log(`WARN ${result.file}: ${warning}`)
      for (const error of result.errors) console.log(`FAIL ${result.file}: ${error}`)
      console.log(`${result.errors.length === 0 ? 'PASS' : 'FAIL'} ${result.file}`)
    }
    console.log(`${failed === 0 ? 'PASS' : 'FAIL'} attestation: ${results.length} file(s), ${failed} failed`)
  }
  return failed === 0 ? 0 : 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}

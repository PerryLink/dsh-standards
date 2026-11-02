/**
 * Label primitives: canonical hash, schema-level checks, and effective status.
 * A label is an immutable evidence record. It is not a grade or a ranking.
 */
import crypto from 'node:crypto'

const LEVELS = new Set(['entry', 'flow', 'boost'])
const STATUS = {
  entry: new Set(['recognized', 'static', 'runtime', 'blocked', 'failed', 'not-run', 'stale', 'withdrawn', 'not-applicable']),
  flow: new Set(['manual', 'runtime', 'failed', 'not-run', 'stale', 'withdrawn', 'not-applicable']),
  boost: new Set(['measured', 'not-measured', 'failed', 'stale', 'withdrawn', 'not-applicable']),
}
const CLAIM = new Set(['observation', 'reference', 'advice'])
const REQUIRED = ['schema', 'subject', 'level', 'status', 'claimLevel', 'scope', 'validity', 'evidence', 'disclaimer', 'verifyUrl', 'issuer', 'recordHash']
const ALLOWED = new Set([...REQUIRED, 'withdrawn', 'revokedAt', 'supersedes'])
const DATE = /^\d{4}-\d{2}-\d{2}$/
const HASH = /^sha256:[0-9a-f]{64}$/
const COMMIT = /^[0-9a-f]{7,40}$/
const FORBIDDEN = ['grade', 'score', 'rank', 'recommended', 'official', 'certified', 'secure']

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key])
    return out
  }
  return value
}

export function recordHash(record) {
  const copy = { ...record }
  delete copy.recordHash
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonicalize(copy))).digest('hex')}`
}

export function normalizeLabel(record) {
  const computed = recordHash(record)
  return { ...record, recordHash: computed }
}

export function labelId(record) {
  const repo = String(record?.subject?.repo ?? 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '__')
  const version = String(record?.subject?.version ?? 'unversioned').replace(/[^a-zA-Z0-9._+-]+/g, '_')
  return `${repo}@${version}`
}

export function effectiveStatus(record, now = new Date()) {
  if (record?.withdrawn === true || record?.status === 'withdrawn' || record?.revokedAt) return 'withdrawn'
  const today = now.toISOString().slice(0, 10)
  if (String(record?.validity?.expiresAt ?? '') < today) return 'stale'
  return record?.status ?? 'not-run'
}

export function validateLabel(record, { requireReference = true } = {}) {
  const errors = []
  const warnings = []
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { valid: false, errors: ['record must be an object'], warnings, computedHash: null, effective: 'not-run' }
  }
  for (const key of Object.keys(record)) {
    if (!ALLOWED.has(key)) errors.push(`unknown field: ${key}`)
  }
  for (const key of REQUIRED) {
    if (record[key] === undefined || record[key] === null || record[key] === '') errors.push(`missing: ${key}`)
  }
  if (record.schema !== 'dsh-market-label/1') errors.push('schema must be dsh-market-label/1')
  if (!LEVELS.has(record.level)) errors.push(`invalid level: ${record.level}`)
  if (!STATUS[record.level]?.has(record.status)) errors.push(`invalid status for ${record.level}: ${record.status}`)
  if (!CLAIM.has(record.claimLevel)) errors.push(`invalid claimLevel: ${record.claimLevel}`)
  if (requireReference && record.claimLevel !== 'reference') errors.push('directory labels must use claimLevel=reference')
  const subject = record.subject ?? {}
  for (const key of ['repo', 'version', 'commit']) {
    if (typeof subject[key] !== 'string' || subject[key].length === 0) errors.push(`subject.${key} must be a non-empty string`)
  }
  if (subject.commit && !COMMIT.test(subject.commit)) errors.push('subject.commit must be 7-40 lowercase hex')
  for (const key of ['dsh', 'cordis']) {
    if (typeof record.scope?.[key] !== 'string' || record.scope[key].length === 0) errors.push(`scope.${key} must be a non-empty string`)
  }
  for (const key of ['generatedAt', 'expiresAt']) {
    if (!DATE.test(String(record.validity?.[key] ?? ''))) errors.push(`validity.${key} must be YYYY-MM-DD`)
  }
  if (DATE.test(String(record.validity?.generatedAt ?? '')) && DATE.test(String(record.validity?.expiresAt ?? ''))) {
    if (record.validity.expiresAt < record.validity.generatedAt) errors.push('validity.expiresAt must be >= generatedAt')
  }
  if (!Array.isArray(record.evidence) || record.evidence.length === 0) errors.push('evidence must be a non-empty array')
  else {
    for (const [index, item] of record.evidence.entries()) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) { errors.push(`evidence[${index}] must be an object`); continue }
      for (const key of Object.keys(item)) if (!['url', 'sha256'].includes(key)) errors.push(`evidence[${index}] unknown field: ${key}`)
      if (typeof item.url !== 'string' || !item.url.startsWith('https://')) errors.push(`evidence[${index}].url must be https://`)
      if (item.sha256 !== undefined && !/^[0-9a-f]{64}$/.test(String(item.sha256))) errors.push(`evidence[${index}].sha256 must be 64 hex`)
    }
  }
  if (typeof record.disclaimer !== 'string' || record.disclaimer.length < 12) errors.push('disclaimer is too short')
  else {
    if (!/非官方|non-official/i.test(record.disclaimer)) errors.push('disclaimer must say 非官方/non-official')
    if (!/非认证|non-certification/i.test(record.disclaimer)) errors.push('disclaimer must say 非认证/non-certification')
  }
  if (typeof record.verifyUrl !== 'string' || !record.verifyUrl.startsWith('https://')) errors.push('verifyUrl must be https://')
  if (typeof record.issuer !== 'string' || record.issuer.length === 0) errors.push('issuer must be a non-empty string')
  if (!HASH.test(String(record.recordHash ?? ''))) errors.push('recordHash must be sha256:<64 hex>')
  const computed = recordHash(record)
  if (HASH.test(String(record.recordHash ?? '')) && record.recordHash !== computed) errors.push('recordHash does not match the canonical record')
  for (const key of FORBIDDEN) {
    if (Object.prototype.hasOwnProperty.call(record, key)) errors.push(`forbidden field: ${key}`)
    if (Object.prototype.hasOwnProperty.call(record.subject ?? {}, key)) errors.push(`forbidden subject field: ${key}`)
  }
  if (record.withdrawn !== undefined && typeof record.withdrawn !== 'boolean') errors.push('withdrawn must be boolean')
  if (record.revokedAt !== undefined && !DATE.test(String(record.revokedAt))) errors.push('revokedAt must be YYYY-MM-DD')
  if (record.supersedes !== undefined && !HASH.test(String(record.supersedes))) errors.push('supersedes must be sha256:<64 hex>')
  const effective = effectiveStatus(record)
  if (effective === 'stale') warnings.push('label is stale at read time; hide it from the valid view')
  if (effective === 'withdrawn') warnings.push('label is withdrawn; keep it in history, exclude it from the valid view')
  return { valid: errors.length === 0, errors, warnings, computedHash: computed, effective }
}

export function validateIndex(index) {
  const errors = []
  if (!index || typeof index !== 'object') return { valid: false, errors: ['index must be an object'] }
  if (index.schema !== 'dsh-label-index/1') errors.push('index.schema must be dsh-label-index/1')
  if (!Array.isArray(index.records)) errors.push('index.records must be an array')
  else {
    for (const [i, record] of index.records.entries()) {
      const result = validateLabel(record)
      for (const error of result.errors) errors.push(`records[${i}]: ${error}`)
    }
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Join a dsh-conformance/1 report with the remediation rule table.
 *
 * This module is additive: it never writes, and it never changes the report it
 * receives. Its one file access is best-effort: it reads the subject's own
 * `package.json` to turn symbolic `package.json#field` references into a
 * `package.json:<line>` locator. When the subject, the file, or the field is
 * absent the reference is left exactly as the check emitted it.
 */

import fs from 'node:fs'
import path from 'node:path'
import packageJson from '../../package.json' with { type: 'json' }

/** Release-pinned guide base. `docs` in the rule table is a relative path. */
export const DOCS_BASE = 'https://github.com/PerryLink/dsh-plugin-guide/blob/v0.4.6/'

const LIVE = new Set(['FAIL', 'WARN'])
const SEVERITY_RANK = { FAIL: 2, WARN: 1 }

/**
 * Rule pairs that can report the same literal from two different checks. When
 * their evidence arrays are identical they are one finding: one advice entry
 * survives (the higher severity, then the first key) and `reason` names both.
 */
export const EQUIVALENT_RULES = [['C-11.4', 'C-12.4']]

function tableOf(rules) {
  if (!rules || typeof rules !== 'object') return {}
  // Accept either the whole spec/1 object or a bare key→rule map.
  if (rules.rules && typeof rules.rules === 'object') return rules.rules
  if (rules.items && typeof rules.items === 'object') return rules.items
  return rules
}

function versionOf(rules) {
  if (rules && typeof rules.version === 'string') return rules.version
  return typeof packageJson.version === 'string' ? packageJson.version : null
}

function docsUrlOf(rule, docsBase) {
  if (!rule || typeof rule.docs !== 'string' || rule.docs.trim() === '') return null
  const base = String(docsBase ?? DOCS_BASE)
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}${rule.docs.replace(/^\/+/, '')}`
}

function uniqueEvidence(...lists) {
  const seen = new Set()
  const out = []
  for (const list of lists) {
    for (const value of Array.isArray(list) ? list : []) {
      if (typeof value !== 'string' || value === '' || seen.has(value)) continue
      seen.add(value)
      out.push(value)
    }
  }
  return out.slice(0, 10)
}

/** Read the subject's package.json once; null when it cannot be located. */
function packageJsonText(subjectPath) {
  if (typeof subjectPath !== 'string' || subjectPath === '') return null
  const candidates = path.extname(subjectPath).toLowerCase() === '.json'
    ? [subjectPath]
    : [path.join(subjectPath, 'package.json')]
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return fs.readFileSync(candidate, 'utf8')
    } catch {
      // Best effort only: a missing/unreadable file is not an advice error.
    }
  }
  return null
}

/** 1-based line of `"<leaf>":` in the manifest text, or null. */
function fieldLine(text, ref) {
  if (typeof text !== 'string' || !ref.startsWith('package.json#')) return null
  const leaf = ref.slice('package.json#'.length).split('.').filter(Boolean).pop()
  if (!leaf) return null
  const needle = JSON.stringify(leaf)
  let index = text.indexOf(needle)
  while (index !== -1) {
    if (/^\s*:/.test(text.slice(index + needle.length))) {
      return text.slice(0, index).split('\n').length
    }
    index = text.indexOf(needle, index + needle.length)
  }
  return null
}

/**
 * Prefix each `package.json#field` reference with a concrete
 * `package.json:<line>` alongside it. Nothing is dropped; unresolvable
 * references are kept verbatim.
 */
function withLineLocators(evidence, text) {
  if (!text) return evidence
  const out = []
  const seen = new Set()
  for (const value of evidence) {
    if (typeof value !== 'string' || value === '' || seen.has(value)) continue
    seen.add(value)
    out.push(value)
    const line = fieldLine(text, value)
    if (line === null) continue
    const locator = `package.json:${line}`
    if (!seen.has(locator)) {
      seen.add(locator)
      out.push(locator)
    }
  }
  return out.slice(0, 10)
}

function sameEvidenceSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false
  if (left.length === 0 || left.length !== right.length) return false
  const a = [...left].sort()
  const b = [...right].sort()
  return a.every((value, index) => value === b[index])
}

/**
 * Collapse the pairs in EQUIVALENT_RULES when both checks reported the same
 * evidence. The surviving entry keeps its own key/docs/severity; `reason`
 * records the merged key, and `occurrences` sums both findings.
 */
function mergeEquivalentAdvice(advice) {
  const dropped = new Set()
  for (const [leftKey, rightKey] of EQUIVALENT_RULES) {
    const left = advice.find(item => item.key === leftKey && !dropped.has(item))
    const right = advice.find(item => item.key === rightKey && !dropped.has(item))
    if (!left || !right || !sameEvidenceSet(left.evidence, right.evidence)) continue
    const keepLeft = (SEVERITY_RANK[left.gate] ?? 0) >= (SEVERITY_RANK[right.gate] ?? 0)
    const keep = keepLeft ? left : right
    const drop = keepLeft ? right : left
    keep.occurrences += drop.occurrences
    keep.evidence = uniqueEvidence(keep.evidence, drop.evidence)
    const aliasReason = drop.reason && drop.reason !== keep.reason ? `: ${drop.reason}` : ''
    const note = `identical evidence to ${drop.key} (${drop.source})${aliasReason}; merged into ${keep.key}`
    keep.reason = keep.reason ? `${keep.reason} | ${note}` : note
    dropped.add(drop)
  }
  return advice.filter(item => !dropped.has(item))
}

/**
 * Build additive advice from a report.
 *
 * One entry is produced per (check.id, detail.item) pair with FAIL/WARN — or,
 * for a FAIL/WARN check with no live details, one entry keyed by check.clause.
 * `gate` is the check's final result (PASS/WARN/FAIL) after report adjustments
 * such as the ENTRY static-claim downgrade; `severity` follows that gate, so a
 * FAIL detail under a check downgraded to WARN yields a WARN advice entry. The
 * detail's own reason stays in `reason` for diagnostics.
 *
 * Duplicate details are merged: evidence is unioned, occurrences counted, and
 * the specific reasons are joined for diagnostics. Duplicate findings that the
 * same literal produces from two checks are merged by EQUIVALENT_RULES.
 *
 * @param {object} report dsh-conformance/1 report
 * @param {object} rules flat key→rule map (also accepts a { rules } or { items } wrapper)
 * @param {string} [docsBase] absolute release-pinned guide base
 * @returns {object[]} advice entries
 */
export function joinAdvice(report, rules, docsBase = DOCS_BASE) {
  const table = tableOf(rules)
  const version = versionOf(rules)
  const subjectPath = typeof report?.subject?.path === 'string' ? report.subject.path : null
  const manifestText = packageJsonText(subjectPath)
  const merged = new Map()

  const add = (check, key, gate, reason, evidence) => {
    if (typeof key !== 'string' || key === '' || !LIVE.has(gate)) return false
    const id = `${check.id}|${key}`
    const current = merged.get(id)
    if (!current) {
      merged.set(id, {
        check,
        key,
        gate,
        reasons: typeof reason === 'string' && reason !== '' ? [reason] : [],
        evidence: uniqueEvidence(evidence),
        occurrences: 1,
      })
      return true
    }
    current.occurrences += 1
    if (typeof reason === 'string' && reason !== '' && !current.reasons.includes(reason)) current.reasons.push(reason)
    current.evidence = uniqueEvidence(current.evidence, evidence)
    return true
  }

  for (const check of Array.isArray(report?.checks) ? report.checks : []) {
    const liveDetails = (Array.isArray(check.details) ? check.details : [])
      .filter(detail => detail && LIVE.has(detail.result))
    let added = 0
    for (const detail of liveDetails) if (add(check, detail.item, check.result, detail.reason, detail.evidence)) added += 1
    // A runtime FAIL (DSC-04 / DSC-14) has no details; its clause is the only
    // joinable key. Only use the fallback when no joinable detail was produced,
    // so a specific detail always wins over the check-level summary.
    if (added === 0 && LIVE.has(check.result)) {
      add(check, check.clause, check.result, check.reason, check.evidence)
    }
  }

  const advice = []
  for (const entry of merged.values()) {
    const rule = table[entry.key] ?? null
    const item = {
      key: entry.key,
      gate: entry.gate,
      severity: entry.gate,
      title: rule?.title ?? entry.key,
      why: rule?.why ?? null,
      fix: rule?.fix ?? null,
      docsUrl: docsUrlOf(rule, docsBase),
      source: entry.check.id,
      version,
      evidence: withLineLocators(entry.evidence, manifestText),
      reason: entry.reasons.slice(0, 3).join(' | '),
      occurrences: entry.occurrences,
      advisory: entry.check.advisory === true,
    }
    if (!rule) item.ruleMissing = true
    advice.push(item)
  }

  // FAIL before WARN, then key/source for deterministic output.
  advice.sort((a, b) => (
    (SEVERITY_RANK[b.gate] ?? 0) - (SEVERITY_RANK[a.gate] ?? 0)
    || a.key.localeCompare(b.key)
    || a.source.localeCompare(b.source)
  ))
  return mergeEquivalentAdvice(advice)
}

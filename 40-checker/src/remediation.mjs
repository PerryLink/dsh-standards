/**
 * Join a dsh-conformance/1 report with the remediation rule table.
 *
 * This module is deliberately pure: it never reads files, never writes, and
 * never changes the report it receives. `buildReport()` calls it at the end so
 * every report carries additive `advice[]` entries; the checker's verdict is
 * untouched.
 */

import packageJson from '../../package.json' with { type: 'json' }

/** Release-pinned guide base. `docs` in the rule table is a relative path. */
export const DOCS_BASE = 'https://github.com/PerryLink/dsh-plugin-guide/blob/v0.4.4/'

const LIVE = new Set(['FAIL', 'WARN'])
const SEVERITY_RANK = { FAIL: 2, WARN: 1 }

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
 * the specific reasons are joined for diagnostics.
 *
 * @param {object} report dsh-conformance/1 report
 * @param {object} rules flat key→rule map (also accepts a { rules } or { items } wrapper)
 * @param {string} [docsBase] absolute release-pinned guide base
 * @returns {object[]} advice entries
 */
export function joinAdvice(report, rules, docsBase = DOCS_BASE) {
  const table = tableOf(rules)
  const version = versionOf(rules)
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
      evidence: entry.evidence,
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
  return advice
}

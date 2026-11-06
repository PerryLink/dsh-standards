import path from 'node:path'
import remediationSpec from '../../spec/remediation.json' with { type: 'json' }
import { DOCS_BASE, joinAdvice } from './remediation.mjs'
import { parseVersion } from './semver.mjs'

export const PACKAGE_MANDATORY = [
  'DSC-01', 'DSC-02', 'DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09', 'DSC-11', 'DSC-12', 'DSC-13',
]
export const LISTING_MANDATORY = [...PACKAGE_MANDATORY, 'DSC-03']
export const MVP_CHECKS = ['DSC-01', 'DSC-02', 'DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09']
export const STATIC_MANDATORY = ['DSC-01', 'DSC-02', 'DSC-03', 'DSC-11', 'DSC-12', 'DSC-13']
export const ENTRY_RUN = ['DSC-01', 'DSC-02', 'DSC-03', 'DSC-11', 'DSC-12', 'DSC-13', 'DSC-14']
export const ENTRY_BLOCKING = ['C-1.1', 'C-1.2', 'C-1.4', 'C-3.1', 'C-3.2', 'C-3.5']
export const ENTRY_RUNTIME_BLOCKING = [...ENTRY_BLOCKING, 'C-2.2', 'C-2.3']

/** The four security checks that block in `--scope security`; the rest are advisory. */
export const SECURITY_MANDATORY = ['DSC-15', 'DSC-16', 'DSC-17', 'DSC-21']
export const SECURITY_CHECKS = new Set(['DSC-15', 'DSC-16', 'DSC-17', 'DSC-18', 'DSC-19', 'DSC-20', 'DSC-21', 'DSC-22'])

function mandatoryFor(scope, profile, staticOnly, entryClaim) {
  if (scope === 'mvp') return MVP_CHECKS
  if (scope === 'security') return SECURITY_MANDATORY
  if (scope === 'entry') return ENTRY_RUN.filter(id => (entryClaim !== 'static' || id !== 'DSC-14') && (id !== 'DSC-03' || profile === 'listing' || profile === 'both'))
  if (staticOnly) return STATIC_MANDATORY
  return profile === 'listing' || profile === 'both' ? LISTING_MANDATORY : PACKAGE_MANDATORY
}

function adjustEntryCheck(item, entryClaim) {
  if (['DSC-11', 'DSC-12', 'DSC-13'].includes(item.id) && item.result === 'FAIL') {
    return { ...item, result: 'WARN', reason: 'entry treats safety/brand fields as WARN; they do not block loadability' }
  }
  if (item.id !== 'DSC-02' || item.result !== 'FAIL') return item
  const details = item.details ?? []
  if (entryClaim === 'static') return { ...item, result: 'WARN', reason: 'entry static claim: version declaration is WARN, not blocking' }
  const hard = details.some(detail => detail.result === 'FAIL' && ['C-2.2', 'C-2.3'].includes(detail.item))
  if (hard) return item
  return { ...item, result: 'WARN', reason: 'C-2.1 version declaration missing/invalid; entry treats it as WARN (C-2.2/C-2.3 remain blocking)' }
}

/** Declaration-class checks: a WARN here is hygiene, not a loadability defect. */
export const DECLARATION_CHECKS = new Set(['DSC-11', 'DSC-12', 'DSC-13'])
const DETAIL_RANK = { FAIL: 5, ERROR: 4, WARN: 3, PASS: 2, NA: 1 }

function bucketRow(item, extra = {}) {
  return {
    id: item.id,
    clause: item.clause ?? null,
    result: item.result,
    coverage: item.coverage ?? null,
    reason: item.reason ?? '',
    ...extra,
  }
}

/**
 * Explicit "how to make this check runnable" text for every row that is not
 * fully checked. NA/ERROR findings must explain themselves; they are not
 * silently empty.
 */
export function howToEnableFor(item) {
  const id = item?.id
  const reason = String(item?.reason ?? '')
  if (id === 'DSC-03') return 'pass --install-spec <spec>, or --market-index <file> --plugin-name <name>'
  if (['DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09'].includes(id)) {
    if (item?.coverage === 'partial') return 'omit --no-exec; pass --treat-as-plugin --runtime <path> for L1-L3, and --host <dir> for bundle G0-G3'
    return 'pass --runtime <path> (plugin L1-L3) or --host <dir> (bundle G0-G3); do not use --no-exec'
  }
  if (id === 'DSC-10') {
    if (/truncated at \d+ files/.test(reason)) return 'raise the source scan budget with --max-files <n> / --max-bytes <n>; the entry may be outside the current scan'
    if (/entry module/.test(reason)) return 'fix package.json exports/main so the entry is inside the package, or adjust --max-files/--max-bytes'
    return 'provide a readable entry and sources; re-run with a larger --max-files/--max-bytes if the scan is bounded'
  }
  if (id === 'DSC-14') {
    return 'pass --host <app-boot/lib/index.js> for bundle G0-G3, or --runtime <path> for a plugin; omit --no-exec and --entry-claim static'
  }
  if (id === 'DSC-15') return 'fix package.json#scripts so install lifecycle commands are auditable; --scope security makes DSC-15 blocking'
  if (['DSC-16', 'DSC-17', 'DSC-21'].includes(id)) return 'provide a readable entry/source tree and rerun; --scope security makes this check blocking'
  if (id === 'DSC-19') return 'provide a readable package tree; binaries are recorded by sha256, never executed'
  if (id === 'DSC-22') return 'supply registry metadata or an attestation/signature field; without input this check is not-run'
  if (['DSC-18', 'DSC-20'].includes(id)) return 'this check is advisory; it never blocks and needs no extra input'
  if (['DSC-11', 'DSC-12', 'DSC-13'].includes(id)) {
    if (/manifest unavailable/.test(reason)) return 'fix package.json; these declaration checks cannot run without a manifest'
    return 'run the full profile without --no-exec; declaration checks need source files'
  }
  return 'run the full 14-check profile (see --help) so this check can produce a result'
}

/**
 * `entryBlocking` is only sound when every prerequisite was actually evaluated.
 * C-1.x always produce details; C-3.1/3.2/3.5 only produce them when an install
 * spec or market index was supplied. Missing details must therefore make
 * `pass` false instead of silently claiming the gate held.
 */
export function summarizeBlocking(checks, blocking) {
  const seen = new Map()
  for (const item of checks) {
    for (const detail of item.details ?? []) {
      if (!blocking.includes(detail.item)) continue
      const rank = DETAIL_RANK[detail.result] ?? 0
      if (!seen.has(detail.item) || rank > (DETAIL_RANK[seen.get(detail.item)] ?? 0)) seen.set(detail.item, detail.result)
    }
  }
  const checked = blocking.filter(id => seen.has(id))
  // C-2.3 (workspace: range) has no detail when C-2.2 was evaluated against a
  // normal range; evaluating C-2.2 rules the workspace form out, so count it.
  if (seen.has('C-2.2') && blocking.includes('C-2.3') && !checked.includes('C-2.3')) checked.push('C-2.3')
  checked.sort((a, b) => blocking.indexOf(a) - blocking.indexOf(b))
  const failed = blocking.filter(id => seen.get(id) === 'FAIL')
  const notChecked = blocking.filter(id => !checked.includes(id))
  return { required: blocking.length, checked, notChecked, failed, pass: failed.length === 0 && notChecked.length === 0 }
}

function allowedNa(check, scope, profile, kind) {
  if (check.result !== 'NA') return false
  if (check.id === 'DSC-03' && scope !== 'mvp' && profile === 'package') return true
  if (check.id === 'DSC-14' && ['client', 'preset', 'skill', 'theme', 'mcp-config', 'unknown'].includes(kind)) return true
  if (['DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09'].includes(check.id) && ['bundle', 'client', 'preset', 'skill', 'theme', 'mcp-config', 'unknown'].includes(kind)) return true
  return false
}

function capSecurityCheck(item) {
  if (item.result !== 'FAIL') return item
  return {
    ...item,
    result: 'WARN',
    reason: `capped WARN (non-security scope): ${item.reason ?? ''}`.trim(),
    details: (item.details ?? []).map(detailRow => (
      detailRow.result === 'FAIL'
        ? { ...detailRow, result: 'WARN', reason: `capped WARN (non-security scope): ${detailRow.reason ?? ''}`.trim() }
        : detailRow
    )),
  }
}

/**
 * The additive `security` block. In `--scope security` the eight checks keep
 * their real verdict (and DSC-15/16/17 are blocking); in every other scope a
 * FAIL is capped to WARN so the default verdict cannot change.
 *
 * `status` only says `pass` when all eight checks are PASS with full coverage.
 * A WARN, an advisory WARN or a partial coverage is `warn`; a check that did not
 * run is `incomplete`; a blocking DSC-15/16/17 FAIL is `fail`. Before this fix
 * a report could say `pass` while `notRun`/partial were non-empty, which markets
 * read as "everything was checked".
 */
export function buildSecurityView(securityChecks, scope) {
  const input = Array.isArray(securityChecks) ? securityChecks.filter(item => SECURITY_CHECKS.has(item.id)) : []
  const checks = scope === 'security' ? input : input.map(capSecurityCheck)
  // Only DSC-15/16/17 may block; DSC-21 is mandatory but its findings are
  // capped at WARN, and DSC-18/19/20/22 are advisory by definition.
  const blocking = checks
    .filter(item => item.result === 'FAIL' && ['DSC-15', 'DSC-16', 'DSC-17'].includes(item.id))
    .map(item => item.id)
  const warn = checks.filter(item => item.result === 'WARN' && item.advisory !== true).map(item => item.id)
  const advisory = checks.filter(item => item.result === 'WARN' && item.advisory === true).map(item => item.id)
  const notRun = checks
    .filter(item => item.result === 'NA' || item.result === 'ERROR' || item.coverage === 'not-run')
    .map(item => item.id)
  const missing = [...SECURITY_CHECKS].filter(id => !checks.some(item => item.id === id && ['PASS', 'WARN', 'FAIL'].includes(item.result)))
  // Partial coverage is not a verdict of its own: a check that was only partly
  // evaluated can still be PASS/WARN/FAIL. It is listed here with its reason so
  // "what was only statically covered" is machine-readable, and it prevents
  // `status=pass` (which now means all eight fully checked and PASS).
  const partial = checks
    .filter(item => item.coverage === 'partial')
    .map(item => ({
      id: item.id,
      reason: item.reason
        || (item.details ?? []).find(detailRow => ['NA', 'WARN', 'FAIL'].includes(detailRow.result) && detailRow.reason)?.reason
        || 'coverage=partial (reason not reported)',
    }))
  let status
  if (blocking.length > 0) status = 'fail'
  else if (notRun.length > 0 || missing.length > 0) status = 'incomplete'
  else if (warn.length > 0 || advisory.length > 0 || partial.length > 0) status = 'warn'
  else status = 'pass'
  return {
    scope: scope === 'security' ? 'security' : 'advisory',
    status,
    checks,
    blocking,
    warn,
    advisory,
    partial,
    notRun,
  }
}

export function buildReport({ subject, anchor, checks, g4 = null, scope, profile, kind, staticOnly = false, entryRuntime = 'require', entryClaim = 'runtime', advice = true, declarations = null, runtimeChecks = null, securityChecks = null }) {
  const mandatory = mandatoryFor(scope, profile, staticOnly, entryClaim)
  const security = buildSecurityView(securityChecks, scope)
  const adjustedChecks = scope === 'entry' ? checks.map(item => adjustEntryCheck(item, entryClaim)) : checks
  const runtimeIds = new Set(['DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09'])
  const effectiveChecks = staticOnly
    ? adjustedChecks.map(item => runtimeIds.has(item.id) ? { ...item, result: 'NA', coverage: 'not-run', reason: 'out of scope for M1 static-only' } : item)
    : adjustedChecks
  const byId = new Map(effectiveChecks.map(item => [item.id, item]))
  const selectedAll = mandatory.map(id => byId.get(id)).filter(Boolean)
  // Advisory checks are reported but never move the verdict.
  const selected = selectedAll.filter(item => item.advisory !== true)
  const advisoryWarnings = selectedAll.filter(item => item.advisory === true && item.result === 'WARN')
  const missing = mandatory.filter(id => !byId.has(id))
  // In --scope security the verdict belongs to the security layer: only
  // DSC-15/16/17 may fail it. Other DSC FAILs are still reported in checks[],
  // but they are not blocking in this scope (see the bucket split below).
  const securityScope = scope === 'security'
  const securityBlockingIds = new Set(securityScope
    ? effectiveChecks
      .filter(item => item.advisory !== true && item.result === 'FAIL' && ['DSC-15', 'DSC-16', 'DSC-17'].includes(item.id))
      .map(item => item.id)
    : [])
  const failed = securityScope
    ? selected.filter(item => securityBlockingIds.has(item.id))
    : selected.filter(item => item.result === 'FAIL')
  const errored = selected.filter(item => item.result === 'ERROR')
  // A static `partial` PASS is still a PASS for the mandatory set: it is
  // recorded in buckets.partial / coverage.partial, and "what was not run" is
  // its own signal. Only a check that did not run at all makes the report
  // incomplete. Otherwise every bundle would be exit 2 forever, because the
  // static subset can never be full without executing the package.
  const notRun = selected.filter(item => !allowedNa(item, scope, profile, kind) && item.coverage === 'not-run')
  const notRunIds = [...new Set([...missing, ...errored.map(item => item.id), ...notRun.map(item => item.id)])]
  const warnings = selected.filter(item => item.result === 'WARN')
  const pass = selected.filter(item => item.result === 'PASS')

  // Coverage counts every check the report carries (14 in a full run), not just
  // the mandatory subset. A report that only counts its mandatory five hides
  // the runtime checks it never ran; that is the bug this block fixes.
  const evaluatedAll = effectiveChecks.filter(item => ['PASS', 'WARN', 'FAIL'].includes(item.result))
  const naAll = effectiveChecks.filter(item => item.result === 'NA')
  const errorAll = effectiveChecks.filter(item => item.result === 'ERROR')
  const notRunAll = effectiveChecks.filter(item => item.result !== 'NA' && item.coverage === 'not-run')
  const notRunAllIds = [...new Set([...notRunAll.map(item => item.id), ...errorAll.map(item => item.id), ...missing])]
  const entryBlockingIds = scope === 'entry' ? (entryClaim === 'static' ? ENTRY_BLOCKING : ENTRY_RUNTIME_BLOCKING) : null
  const entryBlocking = entryBlockingIds ? summarizeBlocking(effectiveChecks, entryBlockingIds) : null

  let status
  let exitCode
  if (failed.length > 0) { status = 'fail'; exitCode = 1 }
  else if (notRunIds.length > 0) { status = 'incomplete'; exitCode = 2 }
  else if (warnings.length > 0) { status = 'warn'; exitCode = 0 }
  else { status = 'pass'; exitCode = 0 }

  let level = null
  if (scope === 'entry') {
    const run = byId.get('DSC-14')
    if (entryClaim === 'static') {
      level = (status === 'pass' || status === 'warn') ? `DSH-ENTRY recognized${status === 'warn' ? ' (warnings)' : ''}` : null
    } else if ((status === 'pass' || status === 'warn') && run?.result === 'PASS') {
      level = `DSH-ENTRY runtime${entryRuntime === 'server-entry' ? ' (server-entry)' : ''}${status === 'warn' ? ' (warnings)' : ''}`
    } else if (status === 'pass' || status === 'warn') {
      level = `DSH-ENTRY static${status === 'warn' ? ' (warnings)' : ''}`
    }
  } else if (scope !== 'mvp' && scope !== 'security' && (status === 'pass' || status === 'warn')) {
    const suffix = status === 'warn' ? ', warnings' : ''
    level = staticOnly ? `DS-C static${status === 'warn' ? ' (warnings)' : ''}` : profile === 'listing' || profile === 'both' ? `DS-C (listing${suffix})` : `DS-C (package${suffix})`
  }

  const partialIds = selected.filter(item => item.coverage === 'partial').map(item => item.id)
  const fullyNotRun = notRunIds.filter(id => !partialIds.includes(id))
  const reasonParts = []
  if (failed.length > 0) reasonParts.push(`FAIL: ${failed.map(item => item.id).join(', ')}`)
  if (fullyNotRun.length > 0) reasonParts.push(`not run: ${fullyNotRun.join(', ')}`)
  if (partialIds.length > 0) reasonParts.push(`partial: ${partialIds.join(', ')}`)
  if (warnings.length > 0) reasonParts.push(`WARN: ${warnings.map(item => item.id).join(', ')}`)
  if (advisoryWarnings.length > 0) reasonParts.push(`advisory: ${advisoryWarnings.map(item => item.id).join(', ')}`)

  // Findings by reader-relevant bucket. A check appears in exactly one bucket:
  // FAIL -> blocking, WARN -> hygiene, NA/ERROR/not-run -> notChecked. In
  // --scope security only a mandatory security FAIL blocks; any other FAIL is
  // out of scope there and moves to hygiene as a non-blocking row, so the
  // headline's "blocking N" can never contradict conclusion.status.
  const blockingBucket = (securityScope
    ? effectiveChecks.filter(item => securityBlockingIds.has(item.id))
    : effectiveChecks.filter(item => item.result === 'FAIL')).map(item => bucketRow(item))
  const outOfScopeFailures = securityScope
    ? effectiveChecks.filter(item => item.result === 'FAIL' && !securityBlockingIds.has(item.id))
    : []
  const hygieneBucket = effectiveChecks.filter(item => item.result === 'WARN').map(item => bucketRow(item, {
    declaration: DECLARATION_CHECKS.has(item.id),
    advisory: item.advisory === true,
    ...(SECURITY_CHECKS.has(item.id) ? { security: true } : {}),
  }))
  for (const item of outOfScopeFailures) {
    hygieneBucket.push(bucketRow(item, {
      result: 'WARN',
      reason: `capped WARN (not blocking in --scope security): ${item.reason ?? ''}`.trim(),
      declaration: DECLARATION_CHECKS.has(item.id),
      advisory: item.advisory === true,
      ...(SECURITY_CHECKS.has(item.id) ? { security: true } : {}),
    }))
  }
  const notCheckedBucket = effectiveChecks
    .filter(item => item.result === 'NA' || item.result === 'ERROR')
    .map(item => bucketRow(item, { howToEnable: howToEnableFor(item) }))
  for (const id of missing) {
    notCheckedBucket.push({ id, clause: null, result: 'NOT-RUN', coverage: 'not-run', reason: 'mandatory check missing', howToEnable: howToEnableFor({ id, reason: 'mandatory check missing' }) })
  }
  // A coverage view, not a verdict view: a partial check may also be blocking
  // or hygiene. It is listed here so "what was only statically covered" is
  // machine-readable instead of disappearing into a NA count. NA/ERROR rows
  // already live in notChecked; do not duplicate them.
  const partialBucket = effectiveChecks
    .filter(item => item.coverage === 'partial' && item.result !== 'NA' && item.result !== 'ERROR')
    .map(item => bucketRow(item, { howToEnable: howToEnableFor(item) }))
  const partialCount = effectiveChecks.filter(item => item.coverage === 'partial').length
  const buckets = { blocking: blockingBucket, hygiene: hygieneBucket, partial: partialBucket, notChecked: notCheckedBucket }
  const notChecked = [...notCheckedBucket, ...partialBucket]
    .map(row => ({
      id: row.id,
      clause: row.clause,
      result: row.result,
      coverage: row.coverage,
      reason: row.reason || 'not checked',
      howToEnable: row.howToEnable ?? howToEnableFor(row),
    }))
    .filter((row, index, list) => list.findIndex(item => item.id === row.id) === index)
  const declaredFields = Array.isArray(declarations?.present) ? declarations.present.length : 0
  const canMarkSuspect = anchor?.suspect === true

  const metrics = {
    checked: evaluatedAll.length,
    total: effectiveChecks.length,
    declaredFields,
  }
  const prereq = entryBlocking ? ` (prereq ${entryBlocking.checked.length}/${entryBlocking.required})` : ''
  const headline = `${scope}/${profile} · runtime ${anchor?.dsh ?? 'unknown'}${anchor?.runtimeSource ? ` ${anchor.runtimeSource}` : ''}${canMarkSuspect ? ' SUSPECT' : ''} · blocking ${buckets.blocking.length}${prereq} · hygiene ${buckets.hygiene.length} · partial ${partialCount} · not checked ${buckets.notChecked.length}/${effectiveChecks.length}`

  const report = {
    schema: 'dsh-conformance/1',
    standard: { id: 'DS-C', version: '1.0.0' },
    subject,
    anchor,
    g4,
    checks: effectiveChecks,
    coverage: {
      total: effectiveChecks.length,
      mandatory: mandatory.length,
      checked: evaluatedAll.length,
      pass: evaluatedAll.filter(item => item.result === 'PASS').length,
      warn: evaluatedAll.filter(item => item.result === 'WARN').length,
      advisory: advisoryWarnings.length,
      fail: evaluatedAll.filter(item => item.result === 'FAIL').length,
      na: naAll.length,
      notRun: notRunAllIds.length,
      partial: partialCount,
      error: errorAll.length,
      entryBlocking,
    },
    buckets,
    security,
    notChecked,
    metrics,
    conclusion: {
      headline,
      level,
      status,
      exitCode,
      profile,
      scope,
      subset: scope === 'mvp' ? 'MVP-13' : null,
      staticOnly,
      entryRuntime: scope === 'entry' ? entryRuntime : null,
      entryClaim: scope === 'entry' ? entryClaim : null,
      reason: reasonParts.join('; '),
    },
  }
  // Additive only: describes what actually executed (runtime/host), the
  // elapsed time, and the isolation it used. It is a sibling of `checks` and
  // never changes the verdict. Kept out of the 1.0.0 schema shape and only
  // emitted when a runtime/host run was requested.
  if (runtimeChecks) report.runtimeChecks = runtimeChecks
  // Additive only: `advice` is a sibling of `checks`, never part of a check,
  // and the verdict is computed above without reading it.
  if (advice !== false) {
    report.advice = retargetCompatibilityAdvice(
      capAdviceGates(joinAdvice(report, remediationSpec, DOCS_BASE), effectiveChecks),
      anchor,
    )
  }
  return report
}

/**
 * `joinAdvice` gates every advice entry with the check's final result. That is
 * right for a check downgraded to WARN (the FAIL detail is then a WARN finding),
 * but it can also *upgrade* a WARN-only detail: a DSC-16 FAIL caused by eval()
 * would show the harmless `import child_process` site (C-16.3 WARN) as FAIL
 * advice. Downgrade only, and only when every live detail for that key is WARN;
 * one FAIL detail keeps the entry at FAIL.
 */
function capAdviceGates(advice, checks) {
  const byId = new Map(checks.map(item => [item.id, item]))
  for (const entry of advice) {
    if (entry.gate !== 'FAIL') continue
    const details = (byId.get(entry.source)?.details ?? [])
      .filter(detailRow => detailRow && ['FAIL', 'WARN'].includes(detailRow.result) && detailRow.item === entry.key)
    if (details.length === 0 || details.some(detailRow => detailRow.result === 'FAIL')) continue
    entry.gate = 'WARN'
    entry.severity = 'WARN'
  }
  return advice
}

/**
 * C-2.2 advice is a compatibility finding: the declared range is valid but does
 * not cover the runtime the report was run against. The static spec example
 * (`>=0.2.2-0`) can itself be outside an older host, so append the exact floor
 * that would include this anchor. This keeps advice from contradicting the
 * FAIL it is attached to.
 */
function retargetCompatibilityAdvice(advice, anchor) {
  const version = parseVersion(anchor?.dsh)
  if (!version) return advice
  const floor = `${version.major}.${version.minor}.${version.patch}-0`
  const upper = `${version.major}.${version.minor + 1}.0`
  const hint = `当前锚是 ${anchor.dsh}：要兼容它，engines.dsh/peer 下限不得高于 ${floor}（例如 >=${floor} <${upper}），并用 --runtime-version ${anchor.dsh} 复跑。`
  for (const item of advice) {
    if (item.key !== 'C-2.2') continue
    item.fix = item.fix ? `${item.fix} ${hint}` : hint
    item.reason = item.reason ? `${item.reason} | ${hint}` : hint
  }
  return advice
}

const ICON = { PASS: 'PASS', WARN: 'WARN', FAIL: 'FAIL', NA: 'NA  ', ERROR: 'ERR ' }

function renderBucket(lines, title, rows, byId) {
  lines.push(`${title} (${rows.length}):`)
  if (rows.length === 0) {
    lines.push('  none')
    return
  }
  for (const row of rows) {
    const tags = [row.declaration ? 'declaration' : null, row.advisory ? 'advisory' : null].filter(Boolean)
    const reason = String(row.reason ?? '').replace(/\s+/g, ' ').slice(0, 150)
    lines.push(`  ${(ICON[row.result] ?? row.result).padEnd(4)} ${String(row.id).padEnd(7)} ${String(row.clause ?? '-').padEnd(6)} ${String(row.coverage ?? '-').padEnd(8)} ${reason}${tags.length > 0 ? ` [${tags.join(',')}]` : ''}`)
    if (row.howToEnable) lines.push(`          enable: ${String(row.howToEnable).replace(/\s+/g, ' ').slice(0, 180)}`)
    const item = byId.get(row.id)
    if (!item || (row.result !== 'FAIL' && row.result !== 'WARN')) continue
    for (const detail of item.details ?? []) {
      if (detail.result === 'PASS') continue
      lines.push(`          - ${detail.item}: ${detail.result} ${String(detail.reason ?? '').replace(/\s+/g, ' ').slice(0, 140)}`)
    }
  }
}

/**
 * Runtime provenance: what actually ran, for how long, and where. A failed
 * run must say why instead of silently falling back to static rows.
 */
function renderRuntime(lines, runtime) {
  if (!runtime) return
  if (!runtime.executed) {
    // Do not repeat six not-run rows that the partial/not-checked buckets
    // already explain; one line is enough to say nothing executed.
    lines.push(`Runtime checks (not executed): ${runtime.reason ?? runtime.failure ?? 'no runtime requested'}`)
    lines.push('')
    return
  }
  const modes = Array.isArray(runtime.modes) && runtime.modes.length > 0 ? runtime.modes.join('+') : 'none'
  const elapsed = Number.isFinite(runtime.durationMs) ? `${runtime.durationMs} ms` : 'n/a'
  const isolation = runtime.isolation?.isolatedHome ? 'temporary DSH_HOME' : 'un-isolated'
  lines.push(`Runtime checks (${modes}, ${elapsed}, ${isolation}):`)
  if (runtime.failure) lines.push(`  failure: ${String(runtime.failure).replace(/\s+/g, ' ').slice(0, 200)}`)
  const rows = Array.isArray(runtime.checks) ? runtime.checks : []
  if (rows.length === 0) {
    lines.push('  none')
  } else {
    for (const row of rows) {
      const reason = String(row.reason ?? '').replace(/\s+/g, ' ').slice(0, 140)
      lines.push(`  ${(ICON[row.result] ?? row.result).padEnd(4)} ${String(row.id).padEnd(7)} ${String(row.coverage ?? '-').padEnd(8)} ${reason}`)
    }
  }
  const entry = runtime.entry
  if (entry) {
    const reason = String(entry.reason ?? '').replace(/\s+/g, ' ').slice(0, 140)
    lines.push(`  ${(ICON[entry.result] ?? entry.result).padEnd(4)} ${String(entry.id).padEnd(7)} ${String(entry.coverage ?? '-').padEnd(8)} ${reason}`)
  }
  lines.push('')
}

export function formatText(report) {
  const lines = []
  const { subject, anchor = {}, conclusion, coverage } = report
  const byId = new Map((report.checks ?? []).map(item => [item.id, item]))
  lines.push(`DS-C check — ${subject.name ?? '<unknown>'}@${subject.version ?? '?'} (${subject.kind}${subject.kindInferred ? ', inferred' : ''})`)
  lines.push(`anchor: repo=${anchor.repo ?? '?'} commit=${String(anchor.commit ?? '').slice(0, 12)} dsh=${anchor.dsh ?? '?'} cordis=${anchor.cordis ?? '?'}${anchor.runtimeSource ? ` source=${anchor.runtimeSource}` : ''}${anchor.suspect ? ' suspect=true' : ''}`)
  lines.push(`scope=${conclusion.scope} profile=${conclusion.profile} status=${conclusion.status} exit=${conclusion.exitCode}${conclusion.subset ? ` subset=${conclusion.subset}` : ''}${conclusion.staticOnly ? ' static-only' : ''}`)
  if (conclusion.level) lines.push(`level: ${conclusion.level}`)
  if (conclusion.headline) lines.push(`headline: ${conclusion.headline}`)
  lines.push('')
  renderBucket(lines, 'Blocking (FAIL)', report.buckets?.blocking ?? [], byId)
  lines.push('')
  renderBucket(lines, 'Hygiene (WARN)', report.buckets?.hygiene ?? [], byId)
  lines.push('')
  renderBucket(lines, 'Partly checked (static subset)', report.buckets?.partial ?? [], byId)
  lines.push('')
  renderRuntime(lines, report.runtimeChecks)
  renderBucket(lines, 'Not checked (NA / not-run / ERROR)', report.buckets?.notChecked ?? [], byId)
  lines.push('')
  const passed = (report.checks ?? []).filter(item => item.result === 'PASS')
  lines.push(`passed (${passed.length}): ${passed.map(item => item.id).join(', ') || 'none'}`)
  lines.push(`coverage: total=${coverage.total ?? report.checks.length} checked=${coverage.checked ?? coverage.pass + coverage.warn + coverage.fail} pass=${coverage.pass} warn=${coverage.warn} fail=${coverage.fail} na=${coverage.na} notRun=${coverage.notRun} partial=${coverage.partial ?? 0} error=${coverage.error} advisory=${coverage.advisory}`)
  if (report.security) {
    const security = report.security
    lines.push(`security: scope=${security.scope} status=${security.status} blocking=[${(security.blocking ?? []).join(', ')}] warn=[${(security.warn ?? []).join(', ')}] advisory=[${(security.advisory ?? []).join(', ')}] partial=[${(security.partial ?? []).map(item => item.id ?? item).join(', ')}] notRun=[${(security.notRun ?? []).join(', ')}]`)
  }
  if (coverage.entryBlocking) {
    const blocking = coverage.entryBlocking
    lines.push(`entryBlocking: checked=${blocking.checked?.length ?? '?'}/${blocking.required} failed=[${(blocking.failed ?? []).join(', ')}] notChecked=[${(blocking.notChecked ?? []).join(', ')}] pass=${blocking.pass}`)
  }
  lines.push(`metrics: checked=${report.metrics?.checked ?? '?'}/${report.metrics?.total ?? '?'} declaredFields=${report.metrics?.declaredFields ?? 0}/5`)
  if (conclusion.reason) lines.push(`reason: ${conclusion.reason}`)
  if (conclusion.status === 'incomplete') lines.push('NOT A DS-C PASS: at least one mandatory check did not run (see notRun).')
  if (Array.isArray(report.advice) && report.advice.length > 0) {
    lines.push('')
    lines.push('advice (non-blocking):')
    for (const item of report.advice) {
      const missing = item.ruleMissing ? ' [ruleMissing]' : ''
      lines.push(`  ${String(item.severity).padEnd(4)} ${String(item.key).padEnd(7)} ${item.source}${missing}: ${String(item.fix ?? item.title ?? '').replace(/\s+/g, ' ').slice(0, 160)}`)
      if (item.docsUrl) lines.push(`          ${item.docsUrl}`)
    }
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

function sarifLevel(item) {
  if (item.result === 'FAIL' || item.result === 'ERROR') return 'error'
  if (item.result === 'WARN') return 'warning'
  return 'note'
}

function locationOf(item) {
  const evidence = item.evidence?.find(value => /^[^:]+:\d+$/.test(value))
  if (!evidence) return undefined
  const index = evidence.lastIndexOf(':')
  const file = evidence.slice(0, index)
  const line = Number(evidence.slice(index + 1))
  return {
    physicalLocation: {
      artifactLocation: { uri: file.replace(/\\/g, '/') },
      region: { startLine: Number.isFinite(line) && line > 0 ? line : 1 },
    },
  }
}

export function formatSarif(report) {
  const rules = report.checks.map(item => ({
    id: item.id,
    name: item.id,
    shortDescription: { text: `${item.clause} ${item.layer}` },
    fullDescription: { text: `${item.clause} conformance check; coverage=${item.coverage}${item.advisory ? '; advisory' : ''}` },
    properties: { clause: item.clause, layer: item.layer, coverage: item.coverage, advisory: item.advisory === true },
  }))
  const results = report.checks
    .filter(item => item.result !== 'PASS' && item.result !== 'NA')
    .map(item => ({
      ruleId: item.id,
      level: sarifLevel(item),
      message: { text: item.reason || `${item.result} ${item.clause}` },
      locations: locationOf(item) ? [locationOf(item)] : [],
      properties: { clause: item.clause, result: item.result, coverage: item.coverage, advisory: item.advisory === true },
    }))
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'dsh-plugin-verify', version: '0.1.0', informationUri: 'https://github.com/dsh-community/dsh-plugin-verify', rules } },
      properties: { standard: report.standard, anchor: report.anchor, conclusion: report.conclusion, subject: report.subject },
      results,
    }],
  }
}

export function writeReport(report, format) {
  if (format === 'json') return JSON.stringify(report, null, 2)
  if (format === 'sarif') return JSON.stringify(formatSarif(report), null, 2)
  return formatText(report)
}

export function defaultOutPath(dir, format) {
  const extension = format === 'json' ? 'json' : format === 'sarif' ? 'sarif' : 'txt'
  return path.join(dir, `dsh-ds-c.${extension}`)
}

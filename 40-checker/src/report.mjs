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

function mandatoryFor(scope, profile, staticOnly, entryClaim) {
  if (scope === 'mvp') return MVP_CHECKS
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

export function buildReport({ subject, anchor, checks, g4 = null, scope, profile, kind, staticOnly = false, entryRuntime = 'require', entryClaim = 'runtime', advice = true, declarations = null }) {
  const mandatory = mandatoryFor(scope, profile, staticOnly, entryClaim)
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
  const failed = selected.filter(item => item.result === 'FAIL')
  const errored = selected.filter(item => item.result === 'ERROR')
  const notRun = selected.filter(item => !allowedNa(item, scope, profile, kind) && (item.coverage === 'not-run' || item.coverage === 'partial'))
  const notRunIds = [...new Set([...missing, ...errored.map(item => item.id), ...notRun.map(item => item.id)])]
  const warnings = selected.filter(item => item.result === 'WARN')
  const pass = selected.filter(item => item.result === 'PASS')

  // Coverage counts every check the report carries (14 in a full run), not just
  // the mandatory subset. A report that only counts its mandatory five hides
  // the runtime checks it never ran; that is the bug this block fixes.
  const evaluatedAll = effectiveChecks.filter(item => ['PASS', 'WARN', 'FAIL'].includes(item.result))
  const naAll = effectiveChecks.filter(item => item.result === 'NA')
  const errorAll = effectiveChecks.filter(item => item.result === 'ERROR')
  const notRunAll = effectiveChecks.filter(item => item.result !== 'NA' && (item.coverage === 'not-run' || item.coverage === 'partial'))
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
  } else if (scope !== 'mvp' && (status === 'pass' || status === 'warn')) {
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
  // FAIL -> blocking, WARN -> hygiene, NA/ERROR/not-run -> notChecked.
  const blockingBucket = effectiveChecks.filter(item => item.result === 'FAIL').map(item => bucketRow(item))
  const hygieneBucket = effectiveChecks.filter(item => item.result === 'WARN').map(item => bucketRow(item, {
    declaration: DECLARATION_CHECKS.has(item.id),
    advisory: item.advisory === true,
  }))
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
  // Additive only: `advice` is a sibling of `checks`, never part of a check,
  // and the verdict is computed above without reading it.
  if (advice !== false) {
    report.advice = retargetCompatibilityAdvice(joinAdvice(report, remediationSpec, DOCS_BASE), anchor)
  }
  return report
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
  renderBucket(lines, 'Not checked (NA / not-run / ERROR)', report.buckets?.notChecked ?? [], byId)
  lines.push('')
  const passed = (report.checks ?? []).filter(item => item.result === 'PASS')
  lines.push(`passed (${passed.length}): ${passed.map(item => item.id).join(', ') || 'none'}`)
  lines.push(`coverage: total=${coverage.total ?? report.checks.length} checked=${coverage.checked ?? coverage.pass + coverage.warn + coverage.fail} pass=${coverage.pass} warn=${coverage.warn} fail=${coverage.fail} na=${coverage.na} notRun=${coverage.notRun} partial=${coverage.partial ?? 0} error=${coverage.error} advisory=${coverage.advisory}`)
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

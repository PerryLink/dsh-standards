import path from 'node:path'

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

function allowedNa(check, scope, profile, kind) {
  if (check.result !== 'NA') return false
  if (check.id === 'DSC-03' && scope !== 'mvp' && profile === 'package') return true
  if (check.id === 'DSC-14' && ['client', 'preset', 'skill', 'theme', 'mcp-config', 'unknown'].includes(kind)) return true
  if (['DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09'].includes(check.id) && ['bundle', 'client', 'preset', 'skill', 'theme', 'mcp-config', 'unknown'].includes(kind)) return true
  return false
}

export function buildReport({ subject, anchor, checks, g4 = null, scope, profile, kind, staticOnly = false, entryRuntime = 'require', entryClaim = 'runtime' }) {
  const mandatory = mandatoryFor(scope, profile, staticOnly, entryClaim)
  const adjustedChecks = scope === 'entry' ? checks.map(item => adjustEntryCheck(item, entryClaim)) : checks
  const runtimeIds = new Set(['DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09'])
  const effectiveChecks = staticOnly
    ? adjustedChecks.map(item => runtimeIds.has(item.id) ? { ...item, result: 'NA', coverage: 'not-run', reason: 'out of scope for M1 static-only' } : item)
    : adjustedChecks
  const byId = new Map(effectiveChecks.map(item => [item.id, item]))
  const selected = mandatory.map(id => byId.get(id)).filter(Boolean)
  const missing = mandatory.filter(id => !byId.has(id))
  const failed = selected.filter(item => item.result === 'FAIL')
  const errored = selected.filter(item => item.result === 'ERROR')
  const notRun = selected.filter(item => !allowedNa(item, scope, profile, kind) && (item.coverage === 'not-run' || item.coverage === 'partial'))
  const notRunIds = [...new Set([...missing, ...errored.map(item => item.id), ...notRun.map(item => item.id)])]
  const warnings = selected.filter(item => item.result === 'WARN')
  const pass = selected.filter(item => item.result === 'PASS')

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

  const reasonParts = []
  if (failed.length > 0) reasonParts.push(`FAIL: ${failed.map(item => item.id).join(', ')}`)
  if (notRunIds.length > 0) reasonParts.push(`not run: ${notRunIds.join(', ')}`)
  if (warnings.length > 0) reasonParts.push(`WARN: ${warnings.map(item => item.id).join(', ')}`)

  return {
    schema: 'dsh-conformance/1',
    standard: { id: 'DS-C', version: '1.0.0' },
    subject,
    anchor,
    g4,
    checks: effectiveChecks,
    coverage: {
      mandatory: mandatory.length,
      pass: pass.length,
      warn: warnings.length,
      fail: failed.length,
      na: selected.filter(item => item.result === 'NA').length,
      notRun: notRunIds.length,
      error: errored.length,
      entryBlocking: scope === 'entry' ? (() => {
        const blocking = entryClaim === 'static' ? ENTRY_BLOCKING : ENTRY_RUNTIME_BLOCKING
        const failedItems = effectiveChecks.flatMap(item => (item.details ?? []).filter(detail => detail.result === 'FAIL' && blocking.includes(detail.item)).map(detail => detail.item))
        return { required: blocking.length, failed: failedItems, pass: failedItems.length === 0 }
      })() : null,
    },
    conclusion: {
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
}

const ICON = { PASS: 'PASS', WARN: 'WARN', FAIL: 'FAIL', NA: 'NA  ', ERROR: 'ERR ' }

export function formatText(report) {
  const lines = []
  const { subject, anchor, conclusion, coverage } = report
  lines.push(`DS-C check — ${subject.name ?? '<unknown>'}@${subject.version ?? '?'} (${subject.kind}${subject.kindInferred ? ', inferred' : ''})`)
  lines.push(`anchor: repo=${anchor.repo} commit=${anchor.commit.slice(0, 12)} dsh=${anchor.dsh} cordis=${anchor.cordis}`)
  lines.push(`scope=${conclusion.scope} profile=${conclusion.profile} status=${conclusion.status} exit=${conclusion.exitCode}${conclusion.subset ? ` subset=${conclusion.subset}` : ''}${conclusion.staticOnly ? ' static-only' : ''}`)
  if (conclusion.level) lines.push(`level: ${conclusion.level}`)
  lines.push('')
  lines.push('id      result  clause  layer   reason')
  for (const item of report.checks) {
    const reason = (item.reason || '').replace(/\s+/g, ' ').slice(0, 120)
    lines.push(`${item.id.padEnd(7)} ${ICON[item.result] ?? item.result}  ${item.clause.padEnd(6)} ${item.layer.padEnd(6)} ${reason}`)
    for (const detail of item.details ?? []) {
      if (detail.result === 'PASS') continue
      lines.push(`        - ${detail.item}: ${detail.result} ${String(detail.reason).slice(0, 140)}`)
    }
  }
  lines.push('')
  lines.push(`coverage: mandatory=${coverage.mandatory} pass=${coverage.pass} warn=${coverage.warn} fail=${coverage.fail} na=${coverage.na} notRun=${coverage.notRun}`)
  if (conclusion.reason) lines.push(`reason: ${conclusion.reason}`)
  if (conclusion.status === 'incomplete') lines.push('NOT A DS-C PASS: at least one mandatory check did not run (see notRun).')
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

/**
 * Author-facing renderers for a `dsh-conformance/1` report.
 *
 * Markdown is the default `dsh-standards check` output; HTML is a single
 * self-contained file with inline CSS, no scripts, no external assets, and
 * every dynamic value escaped. Both read the same report object the checker
 * already produced, so the verdict and exit code never change here.
 */

const DISCLAIMER =
  'Non-official report. This is not a certification, security audit, endorsement, or ranking. '
  + 'Hygiene warnings are not a clean pass; items under "Not checked" were not inspected.'

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function mdCell(value) {
  return text(value).replace(/\|/g, '\\|')
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]))
}

function headlineOf(report) {
  return text(report?.conclusion?.headline) || text(report?.conclusion?.reason) || 'no conclusion'
}

export function priorityFixes(report, limit = 3) {
  const advice = Array.isArray(report?.advice) ? report.advice : []
  const seen = new Set()
  const fixes = []
  for (const item of advice) {
    const key = item?.key ?? item?.title
    if (key === undefined || seen.has(key)) continue
    seen.add(key)
    fixes.push(item)
    if (fixes.length >= limit) break
  }
  if (fixes.length > 0) return fixes
  // Advice may be disabled; fall back to the FAIL/WARN rows themselves.
  const rows = [...(report?.buckets?.blocking ?? []), ...(report?.buckets?.hygiene ?? [])]
  for (const row of rows) {
    if (fixes.length >= limit) break
    fixes.push({ key: row.id, gate: row.result, severity: row.result, source: row.id, fix: row.reason, why: null, docsUrl: null })
  }
  return fixes
}

function passedIds(report) {
  return (report?.checks ?? []).filter(item => item.result === 'PASS').map(item => item.id)
}

function adviceRows(report) {
  return Array.isArray(report?.advice) ? report.advice : []
}

const BUCKETS = [
  { key: 'blocking', title: 'Blocking (FAIL)' },
  { key: 'hygiene', title: 'Hygiene (WARN)' },
  { key: 'partial', title: 'Partly checked (static subset)' },
  { key: 'notChecked', title: 'Not checked (NA / not-run / ERROR)' },
]

function bucketRows(report, key) {
  return Array.isArray(report?.buckets?.[key]) ? report.buckets[key] : []
}

const SECURITY_ROW_LIMIT = 8

/** The additive `security` block, or null when the report carries no checks. */
function securityView(report) {
  const security = report?.security
  if (!security || !Array.isArray(security.checks) || security.checks.length === 0) return null
  return security
}

function securityScope(security) {
  return text(security.scope) || 'advisory'
}

function securityCount(security, key) {
  return Array.isArray(security[key]) ? security[key].length : 0
}

/** Non-PASS rows, capped at eight; `hidden` counts what was folded away. */
function securityRows(security, limit = SECURITY_ROW_LIMIT) {
  const rows = security.checks
    .filter(item => text(item?.result).toUpperCase() !== 'PASS')
    .map(item => ({
      id: text(item.id),
      result: text(item.result).toUpperCase() || 'UNKNOWN',
      reason: text(item.reason) || 'no reason reported',
    }))
  return { shown: rows.slice(0, limit), hidden: Math.max(0, rows.length - limit) }
}

function securityCounts(security) {
  return `blocking ${securityCount(security, 'blocking')} · warn ${securityCount(security, 'warn')} · advisory ${securityCount(security, 'advisory')} · partial ${securityCount(security, 'partial')} · notRun ${securityCount(security, 'notRun')}`
}

const SECURITY_NOTE = 'Static clues only: this block is not a security proof, audit, or certification.'

export function renderMarkdown(report) {
  const subject = report?.subject ?? {}
  const conclusion = report?.conclusion ?? {}
  const coverage = report?.coverage ?? {}
  const metrics = report?.metrics ?? {}
  const anchor = report?.anchor ?? {}
  const lines = []
  lines.push(`# DSH standards check — ${text(subject.name) || '<unknown>'}@${text(subject.version) || '?'}`)
  lines.push('')
  lines.push(`**Conclusion:** ${headlineOf(report)}`)
  lines.push('')
  lines.push(`- Status: **${text(conclusion.status) || 'unknown'}** (exit ${conclusion.exitCode ?? '?'})`)
  if (conclusion.level) lines.push(`- Level: ${text(conclusion.level)}`)
  lines.push(`- Anchor: dsh=${text(anchor.dsh) || '?'}${anchor.runtimeSource ? ` (source=${anchor.runtimeSource}${anchor.suspect ? ', suspect=true' : ''})` : ''}`)
  lines.push(`- Coverage: ${metrics.checked ?? coverage.checked ?? 0}/${metrics.total ?? coverage.total ?? (report?.checks ?? []).length} checks evaluated · declared fields ${metrics.declaredFields ?? 0}/5`)
  lines.push('')

  lines.push('## Priority fixes (up to 3)')
  lines.push('')
  const fixes = priorityFixes(report)
  if (fixes.length === 0) {
    lines.push('_None: no FAIL or WARN finding produced advice._')
  } else {
    fixes.forEach((item, index) => {
      lines.push(`${index + 1}. **${text(item.severity ?? item.gate ?? 'WARN')} ${text(item.key) || text(item.title)}** (${text(item.source)}) — ${text(item.fix ?? item.title ?? item.reason)}`)
      if (item.why) lines.push(`   - Why: ${text(item.why)}`)
      if (item.docsUrl) lines.push(`   - Docs: ${text(item.docsUrl)}`)
    })
  }
  lines.push('')

  for (const bucket of BUCKETS) {
    const rows = bucketRows(report, bucket.key)
    lines.push(`## ${bucket.title} — ${rows.length}`)
    lines.push('')
    if (rows.length === 0) {
      lines.push('_None._')
    } else {
      lines.push('| id | clause | result | coverage | reason |')
      lines.push('|---|---|---|---|---|')
      for (const row of rows) {
        const tags = [row.declaration ? 'declaration' : null, row.advisory ? 'advisory' : null].filter(Boolean)
        const reason = tags.length > 0 ? `${text(row.reason)} [${tags.join(',')}]` : text(row.reason)
        lines.push(`| ${mdCell(row.id)} | ${mdCell(row.clause ?? '-')} | ${mdCell(row.result)} | ${mdCell(row.coverage ?? '-')} | ${mdCell(reason)} |`)
      }
    }
    lines.push('')
  }

  const security = securityView(report)
  if (security) {
    const { shown, hidden } = securityRows(security)
    lines.push(`## Security (${securityScope(security)})`)
    lines.push('')
    lines.push(`- Status: **${text(security.status) || 'unknown'}** · ${securityCounts(security)}`)
    if (shown.length === 0) {
      lines.push('- No security check reported a non-PASS result.')
    } else {
      for (const row of shown) lines.push(`- ${row.id} ${row.result} — ${row.reason}`)
    }
    if (hidden > 0) lines.push(`- …and ${hidden} more non-PASS checks (not shown; run with \`--json\` for the full security block).`)
    lines.push(`- ${SECURITY_NOTE}`)
    lines.push('')
  }

  const passed = passedIds(report)
  lines.push(`## Passed — ${passed.length}`)
  lines.push('')
  lines.push(passed.length > 0 ? passed.join(', ') : '_None._')
  lines.push('')

  const advice = adviceRows(report)
  lines.push(`## Advice (non-blocking) — ${advice.length}`)
  lines.push('')
  if (advice.length === 0) {
    lines.push('_None._')
  } else {
    for (const item of advice) {
      const missing = item.ruleMissing ? ' [ruleMissing]' : ''
      lines.push(`- ${text(item.severity)} ${text(item.key)} (${text(item.source)}${missing}): ${text(item.fix ?? item.title ?? '')}`)
      if (item.docsUrl) lines.push(`  ${text(item.docsUrl)}`)
    }
  }
  lines.push('')

  const notChecked = bucketRows(report, 'notChecked')
  const partial = bucketRows(report, 'partial')
  lines.push('## What this report does not check')
  lines.push('')
  if (notChecked.length === 0 && partial.length === 0) {
    lines.push('- No check was skipped in this run.')
  } else {
    for (const row of notChecked) {
      lines.push(`- ${text(row.id)}${row.clause ? ` (${text(row.clause)})` : ''}: ${text(row.reason) || 'not checked'}`)
      if (row.howToEnable) lines.push(`  - enable: ${text(row.howToEnable)}`)
    }
    for (const row of partial) {
      lines.push(`- ${text(row.id)}${row.clause ? ` (${text(row.clause)})` : ''}: partial coverage${row.reason ? ` — ${text(row.reason)}` : ''}`)
      if (row.howToEnable) lines.push(`  - still needs: ${text(row.howToEnable)}`)
    }
  }
  lines.push(`- Runtime execution beyond the checks listed above is not observed by this report${anchor.suspect ? '; the anchor differs from the host and is flagged suspect' : ''}.`)
  lines.push('- It does not certify, rank, audit security, or endorse the package.')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(DISCLAIMER)
  lines.push('')
  return `${lines.join('\n')}\n`
}

export function renderHtml(report) {
  const subject = report?.subject ?? {}
  const conclusion = report?.conclusion ?? {}
  const metrics = report?.metrics ?? {}
  const anchor = report?.anchor ?? {}
  const title = `DSH standards check — ${text(subject.name) || '<unknown>'}@${text(subject.version) || '?'}`
  const fixes = priorityFixes(report)
  const advice = adviceRows(report)
  const passed = passedIds(report)
  const notChecked = bucketRows(report, 'notChecked')
  const partial = bucketRows(report, 'partial')
  const security = securityView(report)
  const securityShown = security ? securityRows(security) : null
  const securitySection = security ? [
    `<h2>Security (${escapeHtml(securityScope(security))})</h2>`,
    '<ul class="security">',
    `<li>Status: <strong>${escapeHtml(text(security.status) || 'unknown')}</strong> · ${escapeHtml(securityCounts(security))}</li>`,
    ...(securityShown.shown.length === 0
      ? ['<li>No security check reported a non-PASS result.</li>']
      : securityShown.shown.map(row => `<li><strong class="result ${escapeHtml(row.result.toLowerCase())}">${escapeHtml(row.id)} ${escapeHtml(row.result)}</strong> — ${escapeHtml(row.reason)}</li>`)),
    ...(securityShown.hidden > 0
      ? [`<li class="muted">…and ${securityShown.hidden} more non-PASS checks (not shown; run with --json for the full security block).</li>`]
      : []),
    `<li class="muted">${escapeHtml(SECURITY_NOTE)}</li>`,
    '</ul>',
  ].join('\n') : ''

  const table = (key) => {
    const rows = bucketRows(report, key)
    if (rows.length === 0) return '<p class="none">None.</p>'
    const body = rows.map(row => {
      const tags = [row.declaration ? 'declaration' : null, row.advisory ? 'advisory' : null].filter(Boolean)
      const reason = tags.length > 0 ? `${text(row.reason)} [${tags.join(',')}]` : text(row.reason)
      return `<tr><td>${escapeHtml(row.id)}</td><td>${escapeHtml(row.clause ?? '-')}</td><td class="result ${escapeHtml(String(row.result).toLowerCase())}">${escapeHtml(row.result)}</td><td>${escapeHtml(row.coverage ?? '-')}</td><td>${escapeHtml(reason)}</td></tr>`
    }).join('\n')
    return `<table><thead><tr><th>id</th><th>clause</th><th>result</th><th>coverage</th><th>reason</th></tr></thead><tbody>\n${body}\n</tbody></table>`
  }

  const fixList = fixes.length === 0
    ? '<p class="none">None: no FAIL or WARN finding produced advice.</p>'
    : `<ol>${fixes.map(item => {
      const why = item.why ? `<br><span class="muted">Why: ${escapeHtml(text(item.why))}</span>` : ''
      const docs = item.docsUrl ? `<br><span class="muted">Docs: ${link(item.docsUrl)}</span>` : ''
      return `<li><strong>${escapeHtml(text(item.severity ?? item.gate ?? 'WARN'))} ${escapeHtml(text(item.key) || text(item.title))}</strong> (${escapeHtml(text(item.source))}) — ${escapeHtml(text(item.fix ?? item.title ?? item.reason))}${why}${docs}</li>`
    }).join('\n')}</ol>`

  const adviceList = advice.length === 0
    ? '<p class="none">None.</p>'
    : `<ul>${advice.map(item => `<li><strong>${escapeHtml(text(item.severity))} ${escapeHtml(text(item.key))}</strong> (${escapeHtml(text(item.source))}${item.ruleMissing ? ' [ruleMissing]' : ''}): ${escapeHtml(text(item.fix ?? item.title ?? ''))}${item.docsUrl ? ` ${link(item.docsUrl)}` : ''}</li>`).join('\n')}</ul>`

  const notCheckedList = notChecked.length === 0 && partial.length === 0
    ? '<li>No check was skipped in this run.</li>'
    : [
        ...notChecked.map(row => `<li><strong>${escapeHtml(text(row.id))}</strong>${row.clause ? ` (${escapeHtml(text(row.clause))})` : ''}: ${escapeHtml(text(row.reason) || 'not checked')}${row.howToEnable ? ` <span class="muted">enable: ${escapeHtml(text(row.howToEnable))}</span>` : ''}</li>`),
        ...partial.map(row => `<li><strong>${escapeHtml(text(row.id))}</strong>${row.clause ? ` (${escapeHtml(text(row.clause))})` : ''}: partial coverage${row.reason ? ` — ${escapeHtml(text(row.reason))}` : ''}${row.howToEnable ? ` <span class="muted">still needs: ${escapeHtml(text(row.howToEnable))}</span>` : ''}</li>`),
      ].join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light dark}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif;max-width:980px;margin:2rem auto;padding:0 1rem;line-height:1.55;color:#1f2328;background:#fff}
h1{font-size:1.45rem;margin:0 0 .35rem}
h2{font-size:1.1rem;margin:1.8rem 0 .5rem;border-bottom:1px solid #d0d7de;padding-bottom:.25rem}
.headline{font-size:1.05rem;font-weight:600;background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:.65rem .8rem}
.meta{margin:.6rem 0 0;padding-left:1.1rem;color:#57606a}
.muted{color:#57606a;font-size:.9rem}
table{border-collapse:collapse;width:100%;margin:.4rem 0 1rem;font-size:.9rem}
th,td{border:1px solid #d0d7de;padding:.3rem .5rem;text-align:left;vertical-align:top}
th{background:#f6f8fa}
td.result{font-weight:600;white-space:nowrap}
td.result.fail{color:#b42318}
td.result.warn{color:#9a6700}
td.result.na,td.result.error,td.result.not-run{color:#57606a}
.none{color:#57606a}
footer{margin-top:2rem;padding-top:.8rem;border-top:1px solid #d0d7de;color:#57606a;font-size:.9rem}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}h2,.headline,th,td,footer{border-color:#30363d}.headline,th{background:#161b22}.meta,.muted,.none,footer{color:#8b949e}td.result.fail{color:#ff7b72}td.result.warn{color:#d29922}}
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="headline">${escapeHtml(headlineOf(report))}</p>
<ul class="meta">
<li>Status: <strong>${escapeHtml(text(conclusion.status) || 'unknown')}</strong> (exit ${escapeHtml(conclusion.exitCode ?? '?')})${conclusion.level ? ` · Level: ${escapeHtml(text(conclusion.level))}` : ''}</li>
<li>Anchor: dsh=${escapeHtml(text(anchor.dsh) || '?')}${anchor.runtimeSource ? ` (source=${escapeHtml(anchor.runtimeSource)}${anchor.suspect ? ', suspect=true' : ''})` : ''}</li>
<li>Coverage: ${escapeHtml(metrics.checked ?? 0)}/${escapeHtml(metrics.total ?? (report?.checks ?? []).length)} checks evaluated · declared fields ${escapeHtml(metrics.declaredFields ?? 0)}/5</li>
</ul>
<h2>Priority fixes (up to 3)</h2>
${fixList}
${BUCKETS.map(bucket => `<h2>${escapeHtml(bucket.title)} — ${bucketRows(report, bucket.key).length}</h2>\n${table(bucket.key)}`).join('\n')}
${securitySection}
<h2>Passed — ${passed.length}</h2>
<p>${passed.length > 0 ? passed.map(escapeHtml).join(', ') : '<span class="none">None.</span>'}</p>
<h2>Advice (non-blocking) — ${advice.length}</h2>
${adviceList}
<h2>What this report does not check</h2>
<ul>
${notCheckedList}
<li>Runtime execution beyond the checks listed above is not observed by this report${anchor.suspect ? '; the anchor differs from the host and is flagged suspect' : ''}.</li>
<li>It does not certify, rank, audit security, or endorse the package.</li>
</ul>
<footer>${escapeHtml(DISCLAIMER)}</footer>
</body>
</html>
`
}

function link(url) {
  const value = text(url)
  if (!/^https:\/\//i.test(value)) return escapeHtml(value)
  return `<a href="${escapeHtml(value)}" rel="noreferrer noopener">${escapeHtml(value)}</a>`
}

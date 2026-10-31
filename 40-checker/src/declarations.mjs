import { isObject, regexHits } from './util.mjs'
import { check, detail, worst } from './result.mjs'
import { validateCommitments, validateDisclosure } from './permissions.mjs'

export const CAPABILITIES = new Set([
  'fs:read', 'fs:write', 'shell', 'subprocess', 'network:egress', 'network:ingress',
  'credentials:read', 'credentials:list', 'credentials:provider', 'llm:adapter',
  'sessions:read', 'system-prompt:write', 'tools:register', 'remote:expose', 'plugin:install',
])

export const LABELS = new Set([
  'prompt-modification', 'red-team', 'third-party-model-provider', 'remote-access', 'mirror',
])

export const FORBIDDEN_LABELS = new Set(['official', 'verified', 'certified', 'secure', 'audited'])

const TRIGGERS = [
  { cap: 'network:ingress', pattern: /ctx\.(?:webServer|webhookRuntime)\b/g },
  { cap: 'plugin:install', pattern: /\b(?:installBundle|removeBundle)\s*\(/g },
  { cap: 'llm:adapter', pattern: /registerAdapter\s*\(|ctx\.llm\.register/g },
  { cap: 'system-prompt:write', pattern: /ctx\.systemPrompt\.(?:section|context|variable)\s*\(/g },
  { cap: 'tools:register', pattern: /ctx\.tools\.register\s*\(/g },
  { cap: 'remote:expose', pattern: /@Remote(?:Scope)?\s*\(/g },
  { cap: 'credentials:list', pattern: /\.listRecords\s*\(/g },
  { cap: 'sessions:read', pattern: /ctx\.(?:sessions|sessionQuery)\b/g },
  { cap: 'shell', pattern: /ctx\.(?:shell|bash)\b/g },
  { cap: 'subprocess', pattern: /ctx\.subprocess\b/g },
  { cap: 'fs:read', pattern: /ctx\.fs\b/g },
  { cap: 'network:egress', pattern: /ctx\.web\b|\bfetch\s*\(/g },
]

function capabilityList(manifest) {
  const value = manifest?.dsh?.capabilities
  if (value === undefined) return { defined: false, list: [], error: null }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    return { defined: true, list: [], error: 'dsh.capabilities must be a string array' }
  }
  return { defined: true, list: value, error: null }
}

function labelList(manifest) {
  const value = manifest?.dsh?.labels
  if (value === undefined) return { defined: false, list: [], error: null }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    return { defined: true, list: [], error: 'dsh.labels must be a string array' }
  }
  return { defined: true, list: value, error: null }
}

function hitEvidence(hits, limit = 3) {
  return hits.slice(0, limit).map(hit => `${hit.file}:${hit.line}`)
}

/** DSC-10: advisory only; never FAIL. */
export function checkImportTimeAdvisory(sources) {
  const patterns = [
    { name: 'top-level await', pattern: /^await\s/m },
    { name: 'top-level setInterval', pattern: /^setInterval\s*\(/m },
    { name: 'top-level process.on', pattern: /^process\.on\s*\(/m },
    { name: 'top-level process.env assignment', pattern: /^process\.env\.[A-Za-z_][A-Za-z0-9_]*\s*=/m },
    { name: 'top-level globalThis assignment', pattern: /^globalThis\.[A-Za-z_][A-Za-z0-9_]*\s*=/m },
  ]
  const hits = []
  for (const item of patterns) {
    for (const hit of regexHits(sources, item.pattern)) hits.push({ ...hit, pattern: item.name })
  }
  const result = hits.length > 0 ? 'WARN' : sources.length === 0 ? 'WARN' : 'PASS'
  return check({
    id: 'DSC-10',
    clause: 'C-10',
    layer: 'L0',
    result,
    advisory: true,
    reason: hits.length > 0 ? `advisory: ${hits.length} import-time side-effect clue(s)` : sources.length === 0 ? 'no source files scanned' : '',
    details: hits.slice(0, 20).map(hit => detail('C-10.1/2', 'WARN', `${hit.pattern} at ${hit.file}:${hit.line}`, [`${hit.file}:${hit.line}`])),
    evidence: hitEvidence(hits),
  })
}

/** DSC-11: dsh.capabilities declaration + high-signal static triggers. */
export function checkCapabilities(manifest, sources, patch) {
  const caps = capabilityList(manifest)
  const details = []
  if (caps.error) details.push(detail('C-11.1', 'FAIL', caps.error, ['package.json#dsh.capabilities']))
  if (!caps.defined) {
    details.push(detail('C-11.1', 'WARN', 'dsh.capabilities is not declared (transitional WARN; host does not read it yet)', ['package.json#dsh.capabilities']))
  } else if (!caps.error) {
    for (const id of caps.list) {
      if (!CAPABILITIES.has(id)) details.push(detail('C-11.1', 'FAIL', `unknown capability id: ${id}`, ['package.json#dsh.capabilities']))
    }
    if (caps.list.length === 0) details.push(detail('C-11.1', 'WARN', 'dsh.capabilities is empty', ['package.json#dsh.capabilities']))
  }

  const triggered = new Map()
  for (const trigger of TRIGGERS) {
    const hits = regexHits(sources, trigger.pattern)
    if (hits.length > 0) triggered.set(trigger.cap, hits)
  }
  if (!caps.defined) {
    for (const [cap, hits] of triggered) {
      details.push(detail('C-11.2', 'WARN', `trigger for ${cap} observed but dsh.capabilities is absent`, hitEvidence(hits)))
    }
  } else if (!caps.error) {
    for (const [cap, hits] of triggered) {
      const satisfied = caps.list.includes(cap) || (cap === 'fs:read' && caps.list.includes('fs:write'))
      if (!satisfied) {
        details.push(detail('C-11.2', 'FAIL', `static trigger ${cap} is not declared in dsh.capabilities`, hitEvidence(hits)))
      }
    }
    for (const cap of caps.list) {
      const observed = triggered.has(cap) || (cap === 'fs:write' && triggered.has('fs:read'))
      if (!observed) details.push(detail('C-11.5', 'WARN', `declared capability ${cap} was not observed statically`, ['package.json#dsh.capabilities']))
    }
  }

  if (patch?.enabledPluginManagerTools) {
    details.push(detail('C-11.3', 'FAIL', 'bundle patch enables @deepseek-ai/dsh-plugin-manager/tools', ['dsh.bundle.patch']))
  }
  const dangerHits = regexHits(sources, /danger-full-access/g)
  if (dangerHits.length > 0) details.push(detail('C-11.4', 'WARN', 'danger-full-access literal found', hitEvidence(dangerHits)))
  if (details.length === 0) details.push(detail('C-11.1', 'PASS', 'dsh.capabilities is declared and consistent with static triggers'))

  const result = worst(details.map(item => item.result))
  return check({
    id: 'DSC-11', clause: 'C-11', layer: 'L0', result,
    reason: details.filter(item => item.result !== 'PASS').map(item => `${item.item}: ${item.reason}`).join(' | '),
    details,
    evidence: ['package.json#dsh.capabilities', 'dsh.bundle.patch'],
  })
}

/** DSC-12: direct credential backing-file access / listRecords. */
export function checkCredentials(manifest, sources) {
  const caps = capabilityList(manifest)
  const details = []
  const backingPatterns = [
    /\.credentials\.yaml/g,
    /\bCREDENTIALS_FILENAME\b/g,
    /@deepseek-ai\/dsh-credentials-local/g,
    /\$DSH_HOME[^\n]{0,80}credentials/gi,
  ]
  const backingHits = []
  for (const pattern of backingPatterns) backingHits.push(...regexHits(sources, pattern))
  const provider = caps.defined && caps.list.includes('credentials:provider')
  const hardHits = backingHits.filter(hit => {
    if (/credentials-local/.test(hit.text)) return true
    const source = sources.find(item => item.relative === hit.file)
    if (!source) return false
    const lines = source.text.split('\n')
    const window = lines.slice(Math.max(0, hit.line - 6), hit.line + 6).join('\n')
    return /readFile|readFileSync|createReadStream|openSync|\.load\s*\(|\.parse\s*\(/.test(window)
  })
  if (backingHits.length === 0) {
    details.push(detail('C-12.1', 'PASS', 'no credential backing-file reference found'))
  } else if (provider) {
    details.push(detail('C-12.1', 'PASS', 'credential backing-file reference is declared as credentials:provider', hitEvidence(backingHits)))
  } else if (hardHits.length > 0) {
    details.push(detail('C-12.1', 'FAIL', 'credential backing-file access near a file-read API without credentials:provider', hitEvidence(hardHits)))
  } else {
    details.push(detail('C-12.1', 'PASS', 'credential backing-file path appears in text/UI only; no file-read API found nearby', hitEvidence(backingHits)))
  }

  const listHits = regexHits(sources, /\.listRecords\s*\(/g)
  if (listHits.length > 0) {
    if (!caps.defined) details.push(detail('C-12.2', 'WARN', 'listRecords() used but dsh.capabilities is absent (transitional WARN)', hitEvidence(listHits)))
    else if (!caps.list.includes('credentials:list')) details.push(detail('C-12.2', 'FAIL', 'listRecords() used without credentials:list', hitEvidence(listHits)))
    else details.push(detail('C-12.2', 'PASS', 'listRecords() is declared as credentials:list'))
  } else {
    details.push(detail('C-12.2', 'PASS', 'listRecords() not used'))
  }

  const providerHits = regexHits(sources, /ctx\.provide\(\s*['"](?:shell|credentials|sandboxPolicy|sandbox|deepseekAccount)['"]/g)
  if (providerHits.length > 0) details.push(detail('C-12.3', 'WARN', 'global seam provider registration detected; declaration ownership needs review', hitEvidence(providerHits)))
  const dangerHits = regexHits(sources, /danger-full-access|--add-dir/g)
  if (dangerHits.length > 0) details.push(detail('C-12.4', 'WARN', 'danger-full-access/--add-dir literal found', hitEvidence(dangerHits)))
  details.push(...validateCommitments(manifest), ...validateDisclosure(manifest))

  const result = worst(details.map(item => item.result))
  return check({
    id: 'DSC-12', clause: 'C-12', layer: 'L0', result,
    reason: details.filter(item => item.result !== 'PASS' && item.result !== 'NA').map(item => `${item.item}: ${item.reason}`).join(' | '),
    details,
    evidence: ['package.json#dsh.capabilities'],
  })
}

/** DSC-13: high-risk labels + mirror/upstream. */
export function checkLabels(manifest, sources) {
  const caps = capabilityList(manifest)
  const labels = labelList(manifest)
  const details = []
  if (labels.error) details.push(detail('C-13.1', 'FAIL', labels.error, ['package.json#dsh.labels']))
  if (!labels.defined) {
    details.push(detail('C-13.1', 'WARN', 'dsh.labels is not declared', ['package.json#dsh.labels']))
  } else if (!labels.error) {
    for (const label of labels.list) {
      if (!LABELS.has(label)) details.push(detail('C-13.1', 'FAIL', `unknown label: ${label}`, ['package.json#dsh.labels']))
    }
  }

  for (const label of labels.list) {
    if (FORBIDDEN_LABELS.has(label)) details.push(detail('C-13.4', 'FAIL', `forbidden endorsement label: ${label}`, ['package.json#dsh.labels']))
  }

  const upstream = manifest?.dsh?.upstream
  if (upstream !== undefined) {
    let url = null
    try { url = new URL(String(upstream)) } catch { /* handled below */ }
    if (!url || url.protocol !== 'https:') {
      details.push(detail('C-13.3', 'FAIL', 'dsh.upstream must be an https URL', ['package.json#dsh.upstream']))
    } else if (isObject(manifest.repository) && typeof manifest.repository.url === 'string' && manifest.repository.url.includes(url.hostname + url.pathname)) {
      details.push(detail('C-13.3', 'FAIL', 'dsh.upstream points at the package itself', ['package.json#dsh.upstream']))
    } else if (!labels.list.includes('mirror')) {
      details.push(detail('C-13.2', 'FAIL', 'dsh.upstream is declared but the mirror label is missing', ['package.json#dsh.labels']))
    }
  }

  if (!caps.defined) {
    details.push(detail('C-13.2', 'WARN', 'dsh.capabilities is absent; trigger-to-label mapping cannot be evaluated', ['package.json#dsh.capabilities']))
  } else if (!caps.error) {
    const required = new Set()
    if (caps.list.includes('system-prompt:write')) required.add('prompt-modification')
    if (caps.list.includes('llm:adapter') && caps.list.includes('network:egress')) required.add('third-party-model-provider')
    if (caps.list.includes('network:ingress')) required.add('remote-access')
    for (const label of required) {
      if (!labels.list.includes(label)) details.push(detail('C-13.2', 'FAIL', `capability trigger requires label ${label}`, ['package.json#dsh.labels']))
    }
  }

  if (labels.list.includes('red-team') && manifest?.dsh?.usageScope === undefined) {
    details.push(detail('C-13.5', 'WARN', 'red-team label without dsh.usageScope', ['package.json#dsh.labels']))
  }
  if (details.length === 0) details.push(detail('C-13.1', 'PASS', 'dsh.labels is declared and consistent with capability triggers'))

  const result = worst(details.map(item => item.result))
  return check({
    id: 'DSC-13', clause: 'C-13', layer: 'L0', result,
    reason: details.filter(item => item.result !== 'PASS').map(item => `${item.item}: ${item.reason}`).join(' | '),
    details,
    evidence: ['package.json#dsh.labels', 'package.json#dsh.upstream'],
  })
}

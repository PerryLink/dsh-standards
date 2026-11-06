/**
 * Static partial coverage for the L1-L3 checks (DSC-04..DSC-09) when a bundle
 * or client package cannot be executed.
 *
 * These checks are NOT a runtime verdict. They cover the statically decidable
 * part of each clause (manifest/patch/entry/exports declarations, static
 * provide/effect/teardown clues and declaration consistency) and always report
 * `coverage: "partial"`. The report keeps them in the partial bucket and lists
 * what still needs `--host` / `--runtime`.
 */
import path from 'node:path'
import { check, detail, worst } from './result.mjs'
import { isFile, regexHits } from './util.mjs'

const PRIVATE_SURFACE = /(?:ctx\.events\._hooks|ctx\.reflect\.store|ctx\.registry\._internal|fiber\._disposables)\s*(?:\.|\[)[^\n]{0,40}=/g
const EFFECT_REGISTRATION = /\bctx\.(?:effect|on)\s*\(|\.effect\s*\(/g
const TEARDOWN = /\b(?:onDispose|dispose|disposed)\b|\.dispose\s*\(/g
const RESTART = /\brestart\b|_revision|\.restart\s*\(/g
const PROVIDE_DECLARATION = /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+provide\s*=|export\s*\{[^}]*\bprovide\b[^}]*\}/g
const CTX_PROVIDE = /\bctx\.provide\s*\(/g

function packageNameOf(name) {
  if (typeof name !== 'string') return ''
  if (name.startsWith('@')) {
    const parts = name.split('/')
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : name
  }
  return name.split('/')[0]
}

function runtimeNeed(kind) {
  if (kind === 'bundle') {
    return 'bundle G0-G3 needs --host <dir>; L1-L3 need --treat-as-plugin --runtime <path>'
  }
  return 'L1-L3 need --treat-as-plugin --runtime <path>'
}

function liveResult(details) {
  const live = details.filter(item => item.result === 'FAIL' || item.result === 'WARN')
  return live.length === 0 ? 'PASS' : worst(live.map(item => item.result))
}

function staticCheck({ id, clause, layer, details, kind, scan, extra = '' }) {
  const result = liveResult(details)
  const failures = details
    .filter(item => item.result === 'FAIL' || item.result === 'WARN')
    .map(item => `${item.item}: ${item.reason}`)
  const truncation = scan?.truncated
    ? `source scan truncated at ${scan.maxFiles} files / ${scan.maxBytes} bytes`
    : ''
  const reasonParts = []
  if (failures.length > 0) reasonParts.push(failures.join(' | '))
  else reasonParts.push(`static subset passed${extra ? `: ${extra}` : ''}`)
  reasonParts.push(runtimeNeed(kind))
  if (truncation) reasonParts.push(truncation)
  return check({
    id,
    clause,
    layer,
    result,
    coverage: 'partial',
    reason: reasonParts.join('; '),
    details,
    evidence: details.flatMap(item => item.evidence ?? []).slice(0, 5),
  })
}

/** @returns {object[]} the six DSC-04..DSC-09 checks with coverage "partial". */
export function runStaticBundleChecks({ manifest, kind, entry, patch, sources = [], g4 = null, scan = null, dir = null }) {
  const name = manifest?.name ?? null
  const deps = new Set([
    ...Object.keys(manifest?.dependencies ?? {}),
    ...Object.keys(manifest?.peerDependencies ?? {}),
    ...Object.keys(manifest?.optionalDependencies ?? {}),
  ])
  const self = packageNameOf(name)

  // C-4: entry / patch / client export shape, all statically resolvable.
  const c4 = []
  if (entry?.escape) c4.push(detail('C-4', 'FAIL', `entry escapes the package: ${entry.target}`, ['package.json#exports']))
  else if (entry?.declaredMissing) c4.push(detail('C-4', 'FAIL', `declared entry is missing: ${entry.target}`, ['package.json#exports']))
  else if (entry?.exists) c4.push(detail('C-4', 'PASS', `declared entry resolves: ${entry.relative}`, [entry.relative]))
  else if (kind === 'bundle' && patch?.present) c4.push(detail('C-4', 'PASS', 'patch-only bundle; dsh.bundle.patch is the carrier'))
  else c4.push(detail('C-4', 'NA', 'no runtime entry declared'))
  if (patch?.present) {
    if (patch.problems?.length > 0) {
      c4.push(detail('C-4', 'FAIL', `bundle patch problems: ${patch.problems.join('; ')}`, patch.files?.map(file => file.relative) ?? []))
    } else {
      c4.push(detail('C-4', 'PASS', `bundle patch parsed (${patch.files?.length ?? 0} file(s), ${patch.rows?.length ?? 0} row(s))`))
    }
  }
  if (g4?.hasClient) {
    if (g4.result === 'FAIL') c4.push(detail('C-4', 'FAIL', g4.reason ?? 'dsh.client shape failed'))
    else if (g4.result === 'PASS') c4.push(detail('C-4', 'PASS', 'dsh.client + exports["./client"] resolvable'))
  }
  const c4Check = staticCheck({ id: 'DSC-04', clause: 'C-4', layer: 'L1', details: c4, kind, scan, extra: 'entry/export/patch shape' })

  // C-5: can a static provide declaration be enumerated?
  const c5 = []
  const provideDecl = regexHits(sources, PROVIDE_DECLARATION)
  const ctxProvide = regexHits(sources, CTX_PROVIDE)
  if (provideDecl.length > 0) {
    c5.push(detail('C-5.1', 'PASS', `static provide declaration found (${provideDecl.length} site(s))`, provideDecl.slice(0, 3).map(hit => `${hit.file}:${hit.line}`)))
  } else if (ctxProvide.length > 0) {
    c5.push(detail('C-5.1', 'PASS', `ctx.provide registration found (${ctxProvide.length} site(s))`, ctxProvide.slice(0, 3).map(hit => `${hit.file}:${hit.line}`)))
  } else {
    c5.push(detail('C-5.1', 'NA', 'no static provide declaration or ctx.provide call found; service ownership needs runtime'))
  }
  const c5Check = staticCheck({ id: 'DSC-05', clause: 'C-5', layer: 'L1', details: c5, kind, scan, extra: 'provide declarations enumerated' })

  // C-6: static private-surface writes; effect registration is runtime-only.
  const c6 = []
  const privateHits = regexHits(sources, PRIVATE_SURFACE)
  if (privateHits.length > 0) {
    c6.push(detail('C-6.1', 'FAIL', 'static write to a Cordis private registration surface', privateHits.slice(0, 3).map(hit => `${hit.file}:${hit.line}`)))
  } else if (sources.length > 0) {
    c6.push(detail('C-6.1', 'PASS', 'no static write to a private registration surface'))
  }
  const effectHits = regexHits(sources, EFFECT_REGISTRATION)
  if (effectHits.length > 0) {
    c6.push(detail('C-6.2', 'PASS', `${effectHits.length} static effect registration site(s); effect lifetime needs runtime`, effectHits.slice(0, 3).map(hit => `${hit.file}:${hit.line}`)))
  } else {
    c6.push(detail('C-6.2', 'NA', 'effect registration/lifetime needs runtime'))
  }
  const c6Check = staticCheck({ id: 'DSC-06', clause: 'C-6', layer: 'L1+L2', details: c6, kind, scan, extra: 'no private-surface writes found' })

  // C-7: static teardown clue; effect/store/registry baselines need runtime.
  const c7 = []
  const teardownHits = regexHits(sources, TEARDOWN)
  if (teardownHits.length > 0) {
    c7.push(detail('C-7.1', 'PASS', `${teardownHits.length} static teardown site(s); dispose baseline needs runtime`, teardownHits.slice(0, 3).map(hit => `${hit.file}:${hit.line}`)))
  } else {
    c7.push(detail('C-7.1', 'NA', 'dispose/effect baseline needs runtime'))
  }
  const c7Check = staticCheck({ id: 'DSC-07', clause: 'C-7', layer: 'L2', details: c7, kind, scan, extra: 'teardown references enumerated' })

  // C-8: static restart/remount clue; repeatability needs runtime.
  const c8 = []
  const restartHits = regexHits(sources, RESTART)
  if (restartHits.length > 0) {
    c8.push(detail('C-8.1', 'PASS', `${restartHits.length} static restart/revision site(s); repeatability needs runtime`, restartHits.slice(0, 3).map(hit => `${hit.file}:${hit.line}`)))
  } else {
    c8.push(detail('C-8.1', 'NA', 'restart/remount repeatability needs runtime'))
  }
  const c8Check = staticCheck({ id: 'DSC-08', clause: 'C-8', layer: 'L3', details: c8, kind, scan, extra: 'restart references enumerated' })

  // C-9: declaration consistency that is decidable from the manifest + patch.
  const c9 = []
  const mismatched = []
  for (const row of patch?.rows ?? []) {
    if (!row.name || row.disabled) continue
    // A patch row may mount a local module (a bundle's own server entry) rather
    // than a registry package. Verify the file; do not compare it to deps.
    if (row.name.startsWith('.') || path.isAbsolute(row.name)) {
      const absolute = dir ? path.resolve(dir, row.name) : null
      if (!absolute || !isFile(absolute)) mismatched.push(`${row.name} (missing local module)`)
      continue
    }
    const target = packageNameOf(row.name)
    if (!target || target === self || deps.has(target) || target.startsWith('@deepseek-ai/')) continue
    mismatched.push(row.name)
  }
  if (mismatched.length > 0) {
    c9.push(detail('C-9.2', 'WARN', `patch mounts package(s) that are not declared in dependencies/peerDependencies: ${[...new Set(mismatched)].join(', ')}`, patch.files?.map(file => file.relative) ?? []))
  } else if (patch?.present) {
    c9.push(detail('C-9.1', 'PASS', 'patch mount targets match package.json declarations or host-provided @deepseek-ai packages'))
  }
  const inject = Array.isArray(manifest?.dsh?.client?.inject) ? manifest.dsh.client.inject : []
  const unread = []
  for (const service of inject) {
    if (typeof service !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(service)) continue
    if (regexHits(sources, new RegExp(`\\bctx\\.${service.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')).length === 0) unread.push(service)
  }
  if (unread.length > 0) {
    c9.push(detail('C-9.3', 'WARN', `dsh.client.inject declares service(s) with no static ctx.<service> read: ${unread.join(', ')}`))
  }
  if (c9.length === 0) c9.push(detail('C-9.1', 'NA', 'no statically decidable declaration mismatch found'))
  const c9Check = staticCheck({ id: 'DSC-09', clause: 'C-9', layer: 'L1', details: c9, kind, scan, extra: 'declaration cross-check' })

  return [c4Check, c5Check, c6Check, c7Check, c8Check, c9Check]
}

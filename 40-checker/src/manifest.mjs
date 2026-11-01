import path from 'node:path'
import {
  asArray, exists, isDirectory, isFile, isObject, readJsonMaybe, readText, rootExportTarget,
} from './util.mjs'
import { parseVersion, satisfies, validRange } from './semver.mjs'
import { parseInstallSpec } from './install-spec.mjs'
import { check, detail, worst } from './result.mjs'
import { checkClientShape } from './client-shape.mjs'

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/
const PACKAGE_NAME_MAX_LENGTH = 214
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const COMMIT = /^[0-9a-f]{40}$/

export const DEFAULT_RUNTIME_VERSION = '0.2.2-alpha.2'

export function inferKind(manifest, entryExists) {
  const declared = manifest?.dsh?.kind
  if (typeof declared === 'string' && declared !== '') return { kind: declared, inferred: false }
  if (manifest?.dsh?.bundle?.patch !== undefined) return { kind: 'bundle', inferred: true }
  if (manifest?.dsh?.client !== undefined) return { kind: 'client', inferred: true }
  if (entryExists) return { kind: 'plugin', inferred: true }
  return { kind: 'unknown', inferred: true }
}

function inside(root, target) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function resolveEntry(dir, manifest) {
  const candidates = []
  const exportTarget = rootExportTarget(manifest)
  if (exportTarget) candidates.push({ source: 'exports["."]', target: exportTarget })
  if (typeof manifest.main === 'string' && manifest.main.trim() !== '') candidates.push({ source: 'main', target: manifest.main })
  for (const fallback of ['index.js', 'index.mjs', 'index.cjs', 'index.ts']) candidates.push({ source: 'fallback', target: fallback })

  for (const candidate of candidates) {
    const absolute = path.resolve(dir, candidate.target)
    if (!inside(dir, absolute)) {
      return { exists: false, escape: true, source: candidate.source, target: candidate.target, absolute }
    }
    if (isFile(absolute)) {
      return { exists: true, source: candidate.source, target: candidate.target, absolute, relative: path.relative(dir, absolute).split(path.sep).join('/') }
    }
  }

  const sourceCandidates = ['src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.mjs']
  const sourceEntry = sourceCandidates.find(relative => isFile(path.join(dir, relative))) ?? null
  const scripts = isObject(manifest.scripts) ? manifest.scripts : {}
  const buildHint = Boolean(sourceEntry) || ['build', 'prepare', 'compile'].some(name => typeof scripts[name] === 'string')
  return { exists: false, escape: false, source: 'none', target: null, absolute: null, sourceEntry, buildHint }
}

function checkExportShape(entry, kind) {
  if (!entry?.exists || kind !== 'plugin') return { result: 'NA', reason: 'not a directly loadable plugin entry', evidence: [] }
  if (entry.related === '.d.ts' || entry.absolute.endsWith('.d.ts')) return { result: 'WARN', reason: 'entry is a declaration file; runtime shape not judged', evidence: [entry.relative] }
  let text
  try { text = readText(entry.absolute) } catch { return { result: 'WARN', reason: 'entry is not readable', evidence: [entry.relative] } }
  const patterns = [
    /export\s+(?:async\s+)?function\s+apply\s*\(/,
    /export\s+const\s+apply\s*=/,
    /export\s+\{[^}]*\bapply\b[^}]*\}/,
    /export\s+default\s+class\s+/,
    /module\.exports\s*=/,
  ]
  if (patterns.some(pattern => pattern.test(text))) {
    return { result: 'PASS', reason: 'entry exposes apply or a default class', evidence: [entry.relative] }
  }
  return { result: 'WARN', reason: 'no apply/default-class shape found by static scan; L1 is authoritative', evidence: [entry.relative] }
}

function analyzePatch(dir, manifest) {
  const raw = manifest?.dsh?.bundle?.patch
  if (raw === undefined) return { present: false, files: [], problems: [], enabledPluginManagerTools: false }
  const files = []
  const problems = []
  let enabledPluginManagerTools = false
  for (const entry of asArray(raw)) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      problems.push('dsh.bundle.patch must be a non-empty string or string array')
      continue
    }
    if (path.isAbsolute(entry) || entry.startsWith('~') || entry.includes('$') || entry.split(/[\\/]/).includes('..')) {
      problems.push(`patch path escapes the package: ${entry}`)
      continue
    }
    const absolute = path.resolve(dir, entry)
    if (!inside(dir, absolute)) {
      problems.push(`patch path escapes the package: ${entry}`)
      continue
    }
    if (!isFile(absolute)) {
      problems.push(`patch file is missing: ${entry}`)
      continue
    }
    files.push({ relative: entry, absolute })
    let text = ''
    try { text = readText(absolute) } catch { problems.push(`patch file is unreadable: ${entry}`); continue }
    const lines = text.split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const match = /^\s*name:\s*['"]?([^'"\s#]+)['"]?/.exec(line)
      if (!match) continue
      const name = match[1]
      if (path.isAbsolute(name) || name.startsWith('~') || name.includes('$') || name.split(/[\\/]/).includes('..')) {
        problems.push(`patch row name escapes the package: ${name}`)
      }
      if (name === '@deepseek-ai/dsh-plugin-manager/tools') {
        const window = lines.slice(index, index + 4).join('\n')
        if (!/disabled:\s*true/.test(window)) enabledPluginManagerTools = true
      }
    }
  }
  return { present: true, files, problems, enabledPluginManagerTools }
}

function supplyChain(dir, manifest) {
  const details = []
  const dependencies = isObject(manifest.dependencies) ? manifest.dependencies : {}
  const peers = isObject(manifest.peerDependencies) ? manifest.peerDependencies : {}
  const all = { ...dependencies, ...peers }
  for (const [name, value] of Object.entries(all)) {
    if (typeof value !== 'string') continue
    if (/^(?:workspace|file|link|portal):/i.test(value)) {
      details.push(detail('C-3.3', 'WARN', `non-registry dependency ${name}: ${value}`, [`package.json#dependencies.${name}`]))
      continue
    }
    if (/^(?:git\+|git@|github:|gitlab:|bitbucket:|gist:|https?:)/i.test(value)) {
      if (!/#[0-9a-f]{40}$/.test(value) && !/^https?:\/\/[^#]+\.(?:tgz|tar\.gz)/i.test(value)) {
        details.push(detail('C-3.3', 'WARN', `non-registry dependency ${name} is not pinned to a commit: ${value}`, [`package.json#dependencies.${name}`]))
      }
    }
  }
  const scripts = isObject(manifest.scripts) ? manifest.scripts : {}
  for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) {
    if (typeof scripts[name] === 'string') {
      details.push(detail('C-3.4', 'WARN', `install-time build script present: scripts.${name}`, [`package.json#scripts.${name}`]))
    }
  }
  return details
}

/**
 * @param {string} dir
 * @param {{runtimeVersion?: string, installSpec?: string, marketIndex?: string, pluginName?: string}} options
 */
export function runManifestChecks(dir, options = {}) {
  const runtimeVersion = options.runtimeVersion ?? DEFAULT_RUNTIME_VERSION
  const parsed = readJsonMaybe(path.join(dir, 'package.json'))
  if (parsed.error) {
    return {
      manifest: null,
      kind: 'unknown',
      entry: null,
      patch: null,
      g4: { hasClient: false, ok: true, result: 'NA', reason: 'manifest unavailable' },
      checks: [
        check({ id: 'DSC-01', clause: 'C-1', layer: 'L0', result: 'FAIL', reason: `package.json is missing or invalid: ${parsed.error.message}`, details: [detail('C-1.1', 'FAIL', parsed.error.message)], evidence: ['package.json'] }),
        check({ id: 'DSC-02', clause: 'C-2', layer: 'L0', result: 'ERROR', coverage: 'not-run', reason: 'manifest unavailable' }),
        check({ id: 'DSC-03', clause: 'C-3', layer: 'L0', result: 'NA', reason: 'manifest unavailable' }),
      ],
    }
  }
  const manifest = parsed.value
  const entry = resolveEntry(dir, manifest)
  const kindInfo = inferKind(manifest, entry.exists)
  const kind = kindInfo.kind
  const patch = analyzePatch(dir, manifest)
  const g4 = checkClientShape(manifest)

  const manifestDetails = []
  const name = manifest.name
  if (typeof name !== 'string' || name.trim() === '' || name.length > PACKAGE_NAME_MAX_LENGTH || !PACKAGE_NAME.test(name)) {
    manifestDetails.push(detail('C-1.1', 'FAIL', 'name must be a valid npm package name', ['package.json#name']))
  } else {
    manifestDetails.push(detail('C-1.1', 'PASS', `name=${name}`))
  }
  if (typeof manifest.version !== 'string' || !EXACT_VERSION.test(manifest.version)) {
    manifestDetails.push(detail('C-1.1', 'FAIL', 'version must be an exact SemVer version', ['package.json#version']))
  } else {
    manifestDetails.push(detail('C-1.1', 'PASS', `version=${manifest.version}`))
  }
  if (entry.escape) {
    manifestDetails.push(detail('C-1.2', 'FAIL', `entry escapes the package: ${entry.target}`, ['package.json#exports']))
  } else if (entry.exists) {
    manifestDetails.push(detail('C-1.2', 'PASS', `entry resolves via ${entry.source}: ${entry.relative}`, [entry.relative]))
  } else if (entry.buildHint) {
    manifestDetails.push(detail('C-1.2', 'WARN', `entry not present in checkout; source/build hint exists (${entry.sourceEntry ?? 'build script'})`, ['package.json#scripts']))
  } else if (kind === 'bundle' || kind === 'client') {
    manifestDetails.push(detail('C-1.2', 'WARN', `no runtime entry; ${kind} packages may be patch/client only`, ['package.json#exports']))
  } else {
    manifestDetails.push(detail('C-1.2', 'FAIL', 'no resolvable runtime entry', ['package.json#exports', 'package.json#main']))
  }
  const shape = checkExportShape(entry, kind)
  manifestDetails.push(detail('C-1.3', shape.result, shape.reason, shape.evidence))
  if (!patch.present) {
    manifestDetails.push(detail('C-1.4', 'PASS', 'no dsh.bundle.patch declared'))
  } else if (patch.problems.length > 0) {
    manifestDetails.push(detail('C-1.4', 'FAIL', patch.problems.join('; '), patch.files.map(file => file.relative)))
  } else {
    manifestDetails.push(detail('C-1.4', 'PASS', `bundle patch present (${patch.files.length} file(s))`, patch.files.map(file => file.relative)))
  }
  if (typeof manifest.license !== 'string' || manifest.license.trim() === '') {
    manifestDetails.push(detail('C-1.5', 'WARN', 'license is missing', ['package.json#license']))
  } else {
    manifestDetails.push(detail('C-1.5', 'PASS', `license=${manifest.license}`))
  }
  if (manifest.private === true) {
    manifestDetails.push(detail('C-1.6', 'WARN', 'private:true; not publishable to a registry', ['package.json#private']))
  }
  const manifestResult = worst(manifestDetails.map(item => item.result))
  const manifestCheck = check({
    id: 'DSC-01',
    clause: 'C-1',
    layer: 'L0',
    result: manifestResult,
    reason: manifestDetails.filter(item => item.result !== 'PASS' && item.result !== 'NA').map(item => `${item.item}: ${item.reason}`).join(' | '),
    details: manifestDetails,
    evidence: ['package.json'],
  })

  const compatDetails = []
  const engines = isObject(manifest.engines) ? manifest.engines : {}
  const dshEngine = engines.dsh
  const peers = isObject(manifest.peerDependencies) ? manifest.peerDependencies : {}
  const dshPeers = Object.entries(peers).filter(([peer]) => peer === '@deepseek-ai/dsh' || peer.startsWith('@deepseek-ai/dsh-'))
  if (typeof dshEngine === 'string') {
    if (dshEngine.startsWith('workspace:')) {
      compatDetails.push(detail('C-2.3', 'FAIL', 'engines.dsh must not be a workspace: range', ['package.json#engines.dsh']))
    } else if (!validRange(dshEngine)) {
      compatDetails.push(detail('C-2.1', 'FAIL', `engines.dsh is not a SemVer range: ${dshEngine}`, ['package.json#engines.dsh']))
    } else if (!satisfies(runtimeVersion, dshEngine)) {
      compatDetails.push(detail('C-2.2', 'FAIL', `engines.dsh ${dshEngine} does not satisfy runtime ${runtimeVersion}`, ['package.json#engines.dsh']))
    } else {
      compatDetails.push(detail('C-2.1', 'PASS', `engines.dsh=${dshEngine}`))
      compatDetails.push(detail('C-2.2', 'PASS', `runtime ${runtimeVersion} satisfies ${dshEngine}`))
    }
    for (const [peer, rangeValue] of dshPeers) {
      if (typeof rangeValue !== 'string' || rangeValue.startsWith('workspace:')) continue
      if (validRange(rangeValue) && !satisfies(runtimeVersion, rangeValue)) {
        compatDetails.push(detail('C-2.4', 'WARN', `peer ${peer} range ${rangeValue} conflicts with engines.dsh`, [`package.json#peerDependencies.${peer}`]))
      }
    }
  } else if (dshPeers.length > 0) {
    let failed = false
    for (const [peer, rangeValue] of dshPeers) {
      if (typeof rangeValue !== 'string') {
        compatDetails.push(detail('C-2.1', 'FAIL', `peer ${peer} must be a string range`, [`package.json#peerDependencies.${peer}`]))
        failed = true
        continue
      }
      const effective = /^workspace:(?:\^|~|\*)$/.test(rangeValue) ? runtimeVersion : rangeValue
      if (!validRange(effective)) {
        compatDetails.push(detail('C-2.1', 'FAIL', `peer ${peer} is not a SemVer range: ${rangeValue}`, [`package.json#peerDependencies.${peer}`]))
        failed = true
      } else if (!satisfies(runtimeVersion, effective)) {
        compatDetails.push(detail('C-2.2', 'FAIL', `peer ${peer} ${rangeValue} does not satisfy runtime ${runtimeVersion}`, [`package.json#peerDependencies.${peer}`]))
        failed = true
      }
    }
    compatDetails.push(detail('C-2.1', failed ? 'FAIL' : 'WARN', failed ? 'one or more dsh peers are unsatisfied' : 'no engines.dsh; dsh peer range is the weaker alternate declaration'))
  } else {
    compatDetails.push(detail('C-2.1', 'FAIL', 'neither engines.dsh nor a @deepseek-ai/dsh* peer range is declared', ['package.json#engines', 'package.json#peerDependencies']))
  }
  const compatResult = worst(compatDetails.map(item => item.result))
  const compatCheck = check({
    id: 'DSC-02',
    clause: 'C-2',
    layer: 'L0',
    result: compatResult,
    reason: compatDetails.filter(item => item.result !== 'PASS' && item.result !== 'NA').map(item => `${item.item}: ${item.reason}`).join(' | '),
    details: compatDetails,
    evidence: ['package.json#engines', 'package.json#peerDependencies'],
  })

  const supplyDetails = supplyChain(dir, manifest)
  const installDetails = [...supplyDetails]
  let installResult = 'NA'
  let installReason = 'install spec not supplied (package profile)'
  if (typeof options.installSpec === 'string' && options.installSpec.trim() !== '') {
    try {
      const spec = parseInstallSpec(options.installSpec)
      installDetails.push(detail('C-3.1', 'PASS', `parsed kind=${spec.kind}`, ['--install-spec']))
      installDetails.push(detail('C-3.2', spec.pinned ? 'PASS' : 'WARN', spec.pinned ? 'source is pinned' : 'registry spec is a bare name/tag', ['--install-spec']))
      installResult = worst(installDetails.map(item => item.result))
      installReason = installResult === 'PASS' ? '' : 'install spec or supply-chain issue'
    } catch (error) {
      installDetails.push(detail('C-3.1', 'FAIL', error.message, ['--install-spec']))
      installResult = 'FAIL'
      installReason = error.message
    }
  } else if (typeof options.marketIndex === 'string' && options.marketIndex.trim() !== '') {
    const market = checkMarketEntry(options.marketIndex, options.pluginName)
    installDetails.push(...market.details)
    installResult = worst([market.result, ...supplyDetails.map(item => item.result)])
    installReason = market.reason || (installResult === 'WARN' ? 'market entry is pinned but supply-chain warnings remain' : '')
  }
  const installCheck = check({
    id: 'DSC-03',
    clause: 'C-3',
    layer: 'L0',
    result: installResult,
    coverage: installResult === 'NA' ? 'not-run' : 'full',
    reason: installReason,
    details: installDetails,
    evidence: ['package.json#dependencies', 'package.json#scripts', options.marketIndex ?? '--install-spec'],
  })

  return { manifest, kind, kindInferred: kindInfo.inferred, entry, patch, g4, checks: [manifestCheck, compatCheck, installCheck] }
}

export function checkMarketEntry(indexPath, pluginName) {
  const details = []
  let parsed
  try { parsed = readJsonMaybe(indexPath) } catch (error) {
    return { result: 'FAIL', reason: error.message, details: [detail('C-3.5', 'FAIL', error.message, [indexPath])] }
  }
  if (parsed.error) {
    return { result: 'FAIL', reason: parsed.error.message, details: [detail('C-3.5', 'FAIL', parsed.error.message, [indexPath])] }
  }
  const value = parsed.value
  if (!isObject(value) || value.format !== 1) {
    return { result: 'FAIL', reason: 'market index format must be 1', details: [detail('C-3.5', 'FAIL', 'format !== 1', [indexPath])] }
  }
  if (!Array.isArray(value.plugins)) {
    return { result: 'FAIL', reason: 'plugins must be an array', details: [detail('C-3.5', 'FAIL', 'plugins is not an array', [indexPath])] }
  }
  const name = pluginName ?? null
  const plugin = name
    ? value.plugins.find(entry => isObject(entry) && entry.name === name)
    : value.plugins.length === 1 ? value.plugins[0] : null
  if (!isObject(plugin)) {
    return { result: 'FAIL', reason: name ? `plugin ${name} not found` : 'plugin name is required for a multi-plugin index', details: [detail('C-3.5', 'FAIL', 'plugin not found', [indexPath])] }
  }
  if (typeof plugin.name !== 'string' || !PACKAGE_NAME.test(plugin.name)) {
    details.push(detail('C-3.5', 'FAIL', `invalid plugin name: ${plugin.name}`, [indexPath]))
  }
  if (!Array.isArray(plugin.versions) || plugin.versions.length === 0) {
    details.push(detail('C-3.5', 'FAIL', 'versions must be a non-empty array', [indexPath]))
  } else {
    for (const version of plugin.versions) {
      if (!isObject(version) || typeof version.version !== 'string' || !EXACT_VERSION.test(version.version)) {
        details.push(detail('C-3.5', 'FAIL', 'version must be an exact SemVer', [indexPath]))
        continue
      }
      if (!isObject(version.source) || !['npm', 'git'].includes(version.source.type)) {
        details.push(detail('C-3.5', 'FAIL', `source.type must be npm or git for ${version.version}`, [indexPath]))
        continue
      }
      if (version.source.type === 'git' && (typeof version.source.commit !== 'string' || !COMMIT.test(version.source.commit))) {
        details.push(detail('C-3.5', 'FAIL', `git source must pin a 40-hex commit for ${version.version}`, [indexPath]))
      }
      if (isObject(version.engines) && version.engines.dsh !== undefined) {
        if (typeof version.engines.dsh !== 'string' || version.engines.dsh.startsWith('workspace:') || !validRange(version.engines.dsh)) {
          details.push(detail('C-3.5', 'FAIL', `engines.dsh invalid for ${version.version}`, [indexPath]))
        }
      }
    }
  }
  if (details.length === 0) details.push(detail('C-3.5', 'PASS', `market index entry ${plugin.name}@${plugin.versions?.[0]?.version ?? '?'} is pinned`))
  const result = worst(details.map(item => item.result))
  return { result, reason: result === 'PASS' ? '' : 'market index entry failed validation', details }
}

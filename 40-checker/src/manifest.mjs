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
// A dsh registry id is `<owner>/<name>` (the sidebar uses
// `dsh-external/dsh-better-sidebar`); it is not required to be an npm name.
const REGISTRY_ID = /^[a-z0-9][a-z0-9._~-]*(?:\/[a-z0-9][a-z0-9._~-]*)?$/
const UNKNOWN_HOST_HOW = 'pass --host-version <v> (or run `check --allow-host-probe`); without a host version C-2.1/C-2.2 stay NA and compatibility is not judged'
const UNKNOWN_HOST_REASON = '未指定 host 版本（host version not specified），兼容性未判定（compatibility not judged）；C-2.1/C-2.2 are NA, not FAIL/PASS'

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

/**
 * Every local file target declared by `exports` (including conditional
 * objects), labelled with the subpath that declares it. Wildcard patterns and
 * non-relative targets cannot be checked statically and are skipped.
 */
function exportTargets(exportsValue) {
  const targets = []
  const visit = (node, label) => {
    if (typeof node === 'string') { targets.push({ label, target: node }); return }
    if (Array.isArray(node)) { for (const item of node) visit(item, label); return }
    if (isObject(node)) { for (const item of Object.values(node)) visit(item, label) }
  }
  if (typeof exportsValue === 'string') {
    visit(exportsValue, 'exports["."]')
  } else if (isObject(exportsValue)) {
    for (const [subpath, node] of Object.entries(exportsValue)) {
      visit(node, subpath === '.' ? 'exports["."]' : `exports["${subpath}"]`)
    }
  }
  return targets
}

export function resolveEntry(dir, manifest) {
  const candidates = []
  const exportTarget = rootExportTarget(manifest)
  if (exportTarget) {
    const absolute = path.resolve(dir, exportTarget)
    if (!inside(dir, absolute)) {
      return { exists: false, escape: true, source: 'exports["."]', target: exportTarget, absolute }
    }
    if (!isFile(absolute)) {
      const sourceCandidates = ['src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.mjs']
      const sourceEntry = sourceCandidates.find(relative => isFile(path.join(dir, relative))) ?? null
      const scripts = isObject(manifest.scripts) ? manifest.scripts : {}
      const buildHint = Boolean(sourceEntry) || ['build', 'prepare', 'compile'].some(name => typeof scripts[name] === 'string')
      return { exists: false, escape: false, source: 'exports["."]', target: exportTarget, absolute, declaredMissing: true, sourceEntry, buildHint }
    }
  }
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
  if (raw === undefined) return { present: false, files: [], problems: [], rows: [], enabledPluginManagerTools: false }
  const files = []
  const problems = []
  const rows = []
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
    let lastId = null
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const idMatch = /^\s*-?\s*id:\s*['"]?([^'"\s#]+)['"]?/.exec(line)
      if (idMatch) lastId = idMatch[1]
      const match = /^\s*name:\s*['"]?([^'"\s#]+)['"]?/.exec(line)
      if (!match) continue
      const name = match[1]
      if (path.isAbsolute(name) || name.startsWith('~') || name.includes('$') || name.split(/[\\/]/).includes('..')) {
        problems.push(`patch row name escapes the package: ${name}`)
      }
      const window = lines.slice(Math.max(0, index - 3), index + 6).join('\n')
      const disabledLine = /disabled:\s*([^\n#]+)/.exec(window)
      const disabled = disabledLine !== null && /^true\b/.test(disabledLine[1].trim())
      rows.push({ name, id: lastId, disabled, conditional: disabledLine !== null && !disabled })
      if (name === '@deepseek-ai/dsh-plugin-manager/tools') {
        if (!/disabled:\s*true/.test(window)) enabledPluginManagerTools = true
      }
    }
  }
  return { present: true, files, problems, rows, enabledPluginManagerTools }
}

function supplyChain(dir, manifest, { registry = false, packageJsonAvailable = true } = {}) {
  const details = []
  const label = registry ? 'dsh.plugin.json' : 'package.json'
  if (registry && !packageJsonAvailable) {
    details.push(detail('C-3.3', 'NA', 'registry layout has no package.json; dependency provenance is not judged', [`${label}#dependencies`]))
    details.push(detail('C-3.4', 'NA', 'registry layout has no package.json scripts; install-time scripts are not judged', [`${label}#scripts`]))
    return details
  }
  const dependencies = isObject(manifest.dependencies) ? manifest.dependencies : {}
  const peers = isObject(manifest.peerDependencies) ? manifest.peerDependencies : {}
  const all = { ...dependencies, ...peers }
  for (const [name, value] of Object.entries(all)) {
    if (typeof value !== 'string') continue
    if (/^(?:workspace|file|link|portal):/i.test(value)) {
      details.push(detail('C-3.3', 'WARN', `non-registry dependency ${name}: ${value}`, [`${label}#dependencies.${name}`]))
      continue
    }
    if (/^(?:git\+|git@|github:|gitlab:|bitbucket:|gist:|https?:)/i.test(value)) {
      if (!/#[0-9a-f]{40}$/.test(value) && !/^https?:\/\/[^#]+\.(?:tgz|tar\.gz)/i.test(value)) {
        details.push(detail('C-3.3', 'WARN', `non-registry dependency ${name} is not pinned to a commit: ${value}`, [`${label}#dependencies.${name}`]))
      }
    }
  }
  const scripts = isObject(manifest.scripts) ? manifest.scripts : {}
  for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) {
    if (typeof scripts[name] === 'string') {
      details.push(detail('C-3.4', 'WARN', `install-time build script present: scripts.${name}`, [`${label}#scripts.${name}`]))
    }
  }
  return details
}

/**
 * A `dsh.plugin.json` registry layout is not an npm package: it has no
 * package.json, and its fields are `id`/`main`/`client.main`/`engines.dsh`
 * instead of `name`/`exports`/`dsh.client`. Normalize it into the shape the
 * existing checks understand, and let the registry-specific branches below
 * downgrade package.json-only fields to NA instead of inventing them.
 */
export function normalizeRegistryManifest(raw, packageJson = null) {
  const value = isObject(raw) ? raw : {}
  const pkg = isObject(packageJson) ? packageJson : {}
  const pkgDsh = isObject(pkg.dsh) ? pkg.dsh : null
  const client = isObject(value.client)
    ? value.client
    : isObject(pkgDsh?.client) ? pkgDsh.client : null
  const main = typeof value.main === 'string' && value.main.trim() !== ''
    ? value.main
    : typeof pkg.main === 'string' && pkg.main.trim() !== '' ? pkg.main : null
  const clientMain = typeof client?.main === 'string' && client.main.trim() !== '' ? client.main : null
  const exportsField = value.exports !== undefined
    ? value.exports
    : {
        ...(main ? { '.': main } : {}),
        ...(clientMain ? { './client': clientMain } : {}),
      }
  const dsh = isObject(value.dsh) ? { ...value.dsh } : {}
  if (typeof dsh.kind !== 'string' || dsh.kind === '') dsh.kind = 'plugin'
  if (client) dsh.client = { ...client }
  const capabilities = Array.isArray(value.capabilities)
    ? value.capabilities
    : isObject(value.contributes) && Array.isArray(value.contributes.capabilities)
      ? value.contributes.capabilities
      : Array.isArray(pkgDsh?.capabilities) ? pkgDsh.capabilities : undefined
  if (capabilities) dsh.capabilities = capabilities
  if (Array.isArray(pkgDsh?.labels) && dsh.labels === undefined) dsh.labels = pkgDsh.labels
  return {
    name: typeof value.name === 'string' && value.name.trim() !== '' ? value.name : value.id ?? pkg.name,
    version: value.version ?? pkg.version,
    main,
    exports: exportsField,
    engines: value.engines ?? pkg.engines,
    peerDependencies: value.peerDependencies ?? pkg.peerDependencies,
    license: value.license ?? pkg.license,
    repository: value.repository ?? value.repo ?? pkg.repository,
    dependencies: value.dependencies ?? pkg.dependencies,
    scripts: value.scripts ?? pkg.scripts,
    private: value.private ?? pkg.private,
    workspaces: value.workspaces ?? pkg.workspaces,
    type: value.type ?? pkg.type,
    dsh,
  }
}

/**
 * @param {string} dir
 * @param {{runtimeVersion?: string, installSpec?: string, marketIndex?: string, pluginName?: string, registry?: boolean, compatibilityKnown?: boolean}} options
 */
export function runManifestChecks(dir, options = {}) {
  const runtimeVersion = options.runtimeVersion ?? DEFAULT_RUNTIME_VERSION
  const compatibilityKnown = options.compatibilityKnown !== false
  const packagePath = path.join(dir, 'package.json')
  const registryPath = path.join(dir, 'dsh.plugin.json')
  const packageJsonAvailable = isFile(packagePath)
  const registryMode = options.registry === true || (!packageJsonAvailable && isFile(registryPath))
  const manifestPath = registryMode ? registryPath : packagePath
  const manifestLabel = registryMode ? 'dsh.plugin.json' : 'package.json'
  const parsed = readJsonMaybe(manifestPath)
  if (parsed.error) {
    const source = registryMode ? 'dsh.plugin.json' : 'package.json'
    return {
      manifest: null,
      manifestSource: registryMode ? 'registry' : 'package',
      manifestPath,
      kind: 'unknown',
      entry: null,
      patch: null,
      g4: { hasClient: false, ok: true, result: 'NA', reason: 'manifest unavailable' },
      checks: [
        check({ id: 'DSC-01', clause: 'C-1', layer: 'L0', result: 'FAIL', reason: `${source} is missing or invalid: ${parsed.error.message}`, details: [detail('C-1.1', 'FAIL', parsed.error.message)], evidence: [source] }),
        check({ id: 'DSC-02', clause: 'C-2', layer: 'L0', result: 'ERROR', coverage: 'not-run', reason: 'manifest unavailable' }),
        check({ id: 'DSC-03', clause: 'C-3', layer: 'L0', result: 'NA', reason: 'manifest unavailable' }),
      ],
    }
  }
  const packageJsonValue = packageJsonAvailable ? readJsonMaybe(packagePath).value : null
  const manifest = registryMode ? normalizeRegistryManifest(parsed.value, packageJsonValue) : parsed.value
  const entry = resolveEntry(dir, manifest)
  const kindInfo = inferKind(manifest, entry.exists)
  const kind = kindInfo.kind
  const patch = analyzePatch(dir, manifest)
  const g4 = checkClientShape(manifest, dir)
  const packageFieldsJudged = !registryMode || packageJsonAvailable

  const manifestDetails = []
  const name = manifest.name
  const validName = typeof name === 'string' && name.trim() !== '' && name.length <= PACKAGE_NAME_MAX_LENGTH
    && (PACKAGE_NAME.test(name) || (registryMode && REGISTRY_ID.test(name)))
  if (!validName) {
    manifestDetails.push(detail('C-1.1', 'FAIL', registryMode ? 'id must be a valid registry plugin id (<owner>/<name>)' : 'name must be a valid npm package name', [`${manifestLabel}#${registryMode ? 'id' : 'name'}`]))
  } else {
    manifestDetails.push(detail('C-1.1', 'PASS', `name=${name}`))
  }
  if (typeof manifest.version !== 'string' || !EXACT_VERSION.test(manifest.version)) {
    manifestDetails.push(detail('C-1.1', 'FAIL', 'version must be an exact SemVer version', [`${manifestLabel}#version`]))
  } else {
    manifestDetails.push(detail('C-1.1', 'PASS', `version=${manifest.version}`))
  }
  if (entry.escape) {
    manifestDetails.push(detail('C-1.2', 'FAIL', `entry escapes the package: ${entry.target}`, [`${manifestLabel}#exports`]))
  } else if (entry.declaredMissing) {
    // A declared entry that is absent is a packaging defect. A build hint only
    // explains it; it does not make the package loadable from the tarball.
    const hint = entry.buildHint
      ? ` (build hint: ${entry.sourceEntry ?? 'build script'}; publish the built file)`
      : ''
    manifestDetails.push(detail('C-1.2', 'FAIL', `exports["."] points to a missing file: ${entry.target}${hint}`, [`${manifestLabel}#exports`]))
  } else if (entry.exists) {
    manifestDetails.push(detail('C-1.2', 'PASS', `entry resolves via ${entry.source}: ${entry.relative}`, [entry.relative]))
  } else if (entry.buildHint) {
    manifestDetails.push(detail('C-1.2', 'WARN', `entry not present in checkout; source/build hint exists (${entry.sourceEntry ?? 'build script'})`, [`${manifestLabel}#scripts`]))
  } else if (kind === 'bundle' && patch.present) {
    // 2026-11-04: a bundle that ships only a cordis.patch.yml has no runtime entry
    // by design (dsh.bundle.patch is the carrier). Report NA, not WARN, so the
    // mandatory coverage is not charged for something the package never claimed.
    manifestDetails.push(detail('C-1.2', 'NA', 'patch-only bundle; no runtime entry by design', patch.files.map(f => f.relative)))
  } else if (kind === 'bundle' || kind === 'client') {
    manifestDetails.push(detail('C-1.2', 'WARN', `no runtime entry; ${kind} packages may be patch/client only`, [`${manifestLabel}#exports`]))
  } else if (Array.isArray(manifest.workspaces) || (manifest.workspaces && typeof manifest.workspaces === 'object')) {
    manifestDetails.push(detail('C-1.2', 'NA', 'workspace root; run the checker on a package subdirectory', [`${manifestLabel}#workspaces`]))
  } else {
    manifestDetails.push(detail('C-1.2', 'FAIL', 'no resolvable runtime entry', [`${manifestLabel}#exports`, `${manifestLabel}#main`]))
  }

  // Declared `exports` subpaths and `main` must point at files that ship with
  // the package. This is a pure file-existence check: it works for bundles
  // (which may have no root entry) and for client subpaths that the host
  // resolves through the package root.
  const checkedTargets = new Map()
  const missingTargetDetails = []
  const noteTarget = (label, target, source, { allowBare = false } = {}) => {
    if (typeof target !== 'string' || target.trim() === '') return
    if (!allowBare && !target.startsWith('./')) return
    if (target.includes('*')) return
    const key = `${label}|${target}`
    if (checkedTargets.has(key)) return
    checkedTargets.set(key, true)
    const absolute = path.resolve(dir, target)
    if (!inside(dir, absolute)) {
      missingTargetDetails.push(detail('C-1.2', 'FAIL', `${label} target escapes the package: ${target}`, [source]))
      return
    }
    if (!isFile(absolute)) {
      missingTargetDetails.push(detail('C-1.2', 'FAIL', `${label} points to a missing file: ${target}`, [source]))
    }
  }
  for (const item of exportTargets(manifest.exports)) {
    if (item.label === 'exports["."]') continue // resolveEntry() already judged the root export
    noteTarget(item.label, item.target, `${manifestLabel}#exports`)
  }
  if (typeof manifest.main === 'string' && manifest.main.trim() !== '') {
    noteTarget('main', manifest.main, `${manifestLabel}#main`, { allowBare: true })
  }
  manifestDetails.push(...missingTargetDetails.slice(0, 8))
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
    if (!packageFieldsJudged) {
      manifestDetails.push(detail('C-1.5', 'NA', 'registry layout has no package.json and dsh.plugin.json declares no license; license not judged', [`${manifestLabel}#license`]))
    } else {
      manifestDetails.push(detail('C-1.5', 'WARN', 'license is missing', [`${manifestLabel}#license`]))
    }
  } else {
    manifestDetails.push(detail('C-1.5', 'PASS', `license=${manifest.license}`))
  }
  if (manifest.private === true) {
    manifestDetails.push(detail('C-1.6', 'NA', 'private:true; not publishable to a registry', [`${manifestLabel}#private`]))
  } else if (!packageFieldsJudged) {
    manifestDetails.push(detail('C-1.6', 'NA', 'registry layout has no package.json; private/publishability is not judged', [`${manifestLabel}#private`]))
  }
  const manifestResult = worst(manifestDetails.map(item => item.result))
  const manifestNaReasons = registryMode
    ? manifestDetails.filter(item => item.result === 'NA').map(item => `${item.item}: ${item.reason}`)
    : []
  const manifestCheck = {
    ...check({
      id: 'DSC-01',
      clause: 'C-1',
      layer: 'L0',
      result: manifestResult,
      coverage: packageFieldsJudged ? 'full' : 'partial',
      reason: [
        manifestDetails.filter(item => item.result !== 'PASS' && item.result !== 'NA').map(item => `${item.item}: ${item.reason}`).join(' | '),
        ...manifestNaReasons,
      ].filter(Boolean).join(' | '),
      details: manifestDetails,
      evidence: [manifestLabel],
    }),
    ...(packageFieldsJudged ? {} : {
      howToEnable: 'run against the npm package directory (package.json) to judge license/dependencies/scripts; a registry layout only carries dsh.plugin.json fields',
    }),
  }

  const compatDetails = []
  const engines = isObject(manifest.engines) ? manifest.engines : {}
  const dshEngine = engines.dsh
  const peers = isObject(manifest.peerDependencies) ? manifest.peerDependencies : {}
  const dshPeers = Object.entries(peers).filter(([peer]) => peer === '@deepseek-ai/dsh' || peer.startsWith('@deepseek-ai/dsh-'))
  const compatEvidence = [`${manifestLabel}#engines.dsh`, `${manifestLabel}#peerDependencies`]
  if (!compatibilityKnown) {
    // The fallback constant is not a host. Never turn it into a C-2 FAIL:
    // record the declared ranges as NA/partial and point at the flag that
    // would make the verdict possible.
    const declared = typeof dshEngine === 'string'
      ? `engines.dsh=${dshEngine}`
      : dshPeers.length > 0
        ? `dsh peer range(s)=${dshPeers.map(([peer, range]) => `${peer}:${range}`).join(', ')}`
        : 'no engines.dsh or @deepseek-ai/dsh* peer range declared'
    compatDetails.push(detail('C-2.1', 'NA', `${UNKNOWN_HOST_REASON}; declaration recorded (${declared}) but validity is not judged`, compatEvidence))
    compatDetails.push(detail('C-2.2', 'NA', `${UNKNOWN_HOST_REASON}; runtime compatibility is not judged`, compatEvidence))
  } else if (typeof dshEngine === 'string') {
    if (dshEngine.startsWith('workspace:')) {
      compatDetails.push(detail('C-2.3', 'FAIL', 'engines.dsh must not be a workspace: range', [`${manifestLabel}#engines.dsh`]))
    } else if (!validRange(dshEngine)) {
      compatDetails.push(detail('C-2.1', 'FAIL', `engines.dsh is not a SemVer range: ${dshEngine}`, [`${manifestLabel}#engines.dsh`]))
    } else if (!satisfies(runtimeVersion, dshEngine)) {
      compatDetails.push(detail('C-2.2', 'FAIL', `engines.dsh ${dshEngine} is valid but does not satisfy runtime ${runtimeVersion}`, [`${manifestLabel}#engines.dsh`]))
    } else {
      compatDetails.push(detail('C-2.1', 'PASS', `engines.dsh=${dshEngine}`))
      compatDetails.push(detail('C-2.2', 'PASS', `runtime ${runtimeVersion} satisfies ${dshEngine}`))
    }
    for (const [peer, rangeValue] of dshPeers) {
      if (typeof rangeValue !== 'string' || rangeValue.startsWith('workspace:')) continue
      if (validRange(rangeValue) && !satisfies(runtimeVersion, rangeValue)) {
        compatDetails.push(detail('C-2.4', 'WARN', `peer ${peer} range ${rangeValue} conflicts with engines.dsh`, [`${manifestLabel}#peerDependencies.${peer}`]))
      }
    }
  } else if (dshPeers.length > 0) {
    let invalid = false
    let unsatisfied = false
    for (const [peer, rangeValue] of dshPeers) {
      if (typeof rangeValue !== 'string') {
        compatDetails.push(detail('C-2.1', 'FAIL', `peer ${peer} must be a string range`, [`${manifestLabel}#peerDependencies.${peer}`]))
        invalid = true
        continue
      }
      const effective = /^workspace:(?:\^|~|\*)$/.test(rangeValue) ? runtimeVersion : rangeValue
      if (!validRange(effective)) {
        compatDetails.push(detail('C-2.1', 'FAIL', `peer ${peer} is not a SemVer range: ${rangeValue}`, [`${manifestLabel}#peerDependencies.${peer}`]))
        invalid = true
      } else if (!satisfies(runtimeVersion, effective)) {
        // A syntactically valid range that does not cover this runtime is a
        // compatibility finding (C-2.2), never an invalid declaration (C-2.1).
        compatDetails.push(detail('C-2.2', 'FAIL', `peer ${peer} range ${rangeValue} is valid but does not satisfy runtime ${runtimeVersion}`, [`${manifestLabel}#peerDependencies.${peer}`]))
        unsatisfied = true
      }
    }
    if (!invalid) {
      compatDetails.push(detail('C-2.1', 'PASS', 'dsh peer range(s) are valid SemVer; no engines.dsh declared'))
    }
    if (invalid) {
      compatDetails.push(detail('C-2.1', 'FAIL', 'one or more dsh peer ranges are invalid'))
    } else if (!unsatisfied) {
      compatDetails.push(detail('C-2.2', 'PASS', `runtime ${runtimeVersion} satisfies the dsh peer range(s)`))
    }
  } else {
    compatDetails.push(detail('C-2.1', 'FAIL', 'neither engines.dsh nor a @deepseek-ai/dsh* peer range is declared', [`${manifestLabel}#engines`, `${manifestLabel}#peerDependencies`]))
  }
  const compatResult = worst(compatDetails.map(item => item.result))
  const compatCheck = {
    ...check({
      id: 'DSC-02',
      clause: 'C-2',
      layer: 'L0',
      result: compatResult,
      coverage: compatibilityKnown ? 'full' : 'partial',
      reason: compatibilityKnown
        ? compatDetails.filter(item => item.result !== 'PASS' && item.result !== 'NA').map(item => `${item.item}: ${item.reason}`).join(' | ')
        : UNKNOWN_HOST_REASON,
      details: compatDetails,
      evidence: [manifestLabel === 'dsh.plugin.json' ? 'dsh.plugin.json#engines' : 'package.json#engines', `${manifestLabel}#peerDependencies`],
    }),
    ...(compatibilityKnown ? {} : { howToEnable: UNKNOWN_HOST_HOW }),
  }

  const supplyDetails = supplyChain(dir, manifest, { registry: registryMode, packageJsonAvailable })
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
  if (registryMode && !packageJsonAvailable && installResult !== 'FAIL') {
    // C-3.3/C-3.4 need package.json. Do not let a pinned --install-spec turn
    // that missing input into a clean C-3 PASS.
    installResult = 'NA'
    installReason = 'registry layout has no package.json; dependency/lifecycle checks are NA (install-spec shape alone is not a C-3 pass)'
  }
  const installCheck = check({
    id: 'DSC-03',
    clause: 'C-3',
    layer: 'L0',
    result: installResult,
    coverage: installResult === 'NA' ? 'not-run' : 'full',
    reason: installReason,
    details: installDetails,
    evidence: [`${manifestLabel}#dependencies`, `${manifestLabel}#scripts`, options.marketIndex ?? '--install-spec'],
  })

  return {
    manifest,
    manifestSource: registryMode ? 'registry' : 'package',
    manifestPath,
    kind,
    kindInferred: kindInfo.inferred,
    entry,
    patch,
    g4,
    checks: [manifestCheck, compatCheck, installCheck],
  }
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

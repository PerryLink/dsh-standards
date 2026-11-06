import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runManifestChecks, DEFAULT_RUNTIME_VERSION } from './manifest.mjs'
import { checkCapabilities, checkCredentials, checkImportTimeAdvisory, checkLabels } from './declarations.mjs'
import { runRuntimeChecks } from './runtime.mjs'
import { runStaticBundleChecks } from './bundle-static.mjs'
import { spawn, spawnSync } from 'node:child_process'
import { sanitizedEnv } from './sandbox-env.mjs'
import { readSourcesWithStats } from './util.mjs'
import { buildReport, writeReport } from './report.mjs'

const VERSION = '0.1.0'
const DEFAULT_COMMIT = 'ce7073d51254c26cd63b22a60835b8f948deb447'
const DEFAULT_CORDIS = '4.0.6-alpha.1'
const HOST_RUNTIME_TIMEOUT_MS = 5000

function binName() {
  const brand = process.env.DSH_CHECKER_BRAND
  if (typeof brand === 'string' && brand.trim() !== '') return brand.trim().split(/\s+/)[0]
  return 'dsh-plugin-verify'
}

function usage() {
  const bin = binName()
  return `${process.env.DSH_CHECKER_BRAND || 'dsh-plugin-verify ' + VERSION} — DS-C conformance checker (MVP)

Usage:
  ${bin} check [dir] [--json] [--html <file>]  author-facing report (Markdown by default)
  ${bin} <package-dir> [options]                raw conformance report

Options:
  --format text|json|sarif   output format (default: text)
  --scope mvp|ds-c|entry     mvp = 8 MVP ids; ds-c = full claim (default); entry = compatibility gate
  --profile package|listing|both  evaluation profile (default: package; listing if --market-index is set)
  --runtime <path>           path to a built @deepseek-ai/cordis lib/index.js; enables L1-L3
  --runtime-version <v>      dsh runtime version used for C-2 (default: host via \`dsh --version\`, else ${DEFAULT_RUNTIME_VERSION})
  --cordis-version <v>       cordis version recorded in the anchor (default: ${DEFAULT_CORDIS})
  --commit <sha>             harness commit recorded in the anchor (default: ${DEFAULT_COMMIT.slice(0, 12)})
  --install-spec <spec>      recommended install spec for C-3 (listing/install check)
  --market-index <file>      format-1 market index JSON for C-3 listing mode
  --plugin-name <name>       plugin name inside the market index
  --timeout <ms>             L1-L3 timeout (default: 10000)
  --max-files <n>            source scan file budget (default: 400)
  --max-bytes <n>            source scan byte budget (default: 2000000)
  --no-exec                  skip L1-L3 entirely (reported as not-run/NA, never PASS)
  --static-only              M1 mode: listing profile, only C-1/C-2/C-3/C-11/C-12/C-13; C-4..C-9 are out of scope
  --treat-as-plugin          run L1-L3 on a bundle's server entry (lib/index.js, index.js, lib/public-entry.js, src/index.ts)
  --entry-runtime require|server-entry  entry scope: require full G0-G3 (default) or accept server-entry proxy (not bundle)
  --entry-claim runtime|static  entry scope: runtime (default, needs DSC-14) or static recognized (no runtime claim)
  --host <file>              app-boot lib/index.js; enables bundle G0-G3 smoke
  --base <file>              optional base cordis.patch.yml for bundle smoke
  --web <file>               optional web-app cordis.patch.yml for bundle smoke
  --bare <dir>               optional bare-module base for bundle smoke (host farm)
  --out <file>               write the report to a file (stdout otherwise)
  --advice                   include remediation advice in the report (default: on)
  --no-advice                omit the additive advice[] field
  --help                     show this help
  --version                  show the checker version

Exit codes:
  0  completed, no FAIL (PASS or WARN; WARN does not claim a clean PASS)
  1  completed, at least one FAIL
  2  incomplete: a mandatory check did not run, or the checker itself failed
  3  usage error
`
}

function parseArgs(argv) {
  const options = {
    target: null,
    format: 'text',
    scope: 'ds-c',
    profile: null,
    runtime: null,
    runtimeVersion: null,
    cordisVersion: DEFAULT_CORDIS,
    commit: DEFAULT_COMMIT,
    installSpec: null,
    marketIndex: null,
    pluginName: null,
    timeoutMs: 10_000,
    maxFiles: 400,
    maxBytes: 2_000_000,
    noExec: false,
    staticOnly: false,
    treatAsPlugin: false,
    entryRuntime: 'require',
    entryClaim: 'runtime',
    host: null,
    base: null,
    web: null,
    bare: null,
    out: null,
    advice: true,
    help: false,
    version: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') { options.help = true; continue }
    if (arg === '--version' || arg === '-v') { options.version = true; continue }
    if (!arg.startsWith('--')) {
      if (options.target !== null) throw new Error(`unexpected positional argument: ${arg}`)
      options.target = arg
      continue
    }
    const [key, inline] = arg.split('=', 2)
    const value = () => {
      if (inline !== undefined) return inline
      const next = argv[index + 1]
      if (next === undefined || next.startsWith('--')) throw new Error(`missing value for ${key}`)
      index += 1
      return next
    }
    switch (key) {
      case '--format': options.format = value(); break
      case '--scope': options.scope = value(); break
      case '--profile': options.profile = value(); break
      case '--runtime': options.runtime = value(); break
      case '--runtime-version': options.runtimeVersion = value(); break
      case '--cordis-version': options.cordisVersion = value(); break
      case '--commit': options.commit = value(); break
      case '--install-spec': options.installSpec = value(); break
      case '--market-index': options.marketIndex = value(); break
      case '--plugin-name': options.pluginName = value(); break
      case '--timeout': options.timeoutMs = Number(value()); break
      case '--max-files': options.maxFiles = Number(value()); break
      case '--max-bytes': options.maxBytes = Number(value()); break
      case '--out': options.out = value(); break
      case '--no-exec': options.noExec = true; break
      case '--static-only': options.staticOnly = true; break
      case '--treat-as-plugin': options.treatAsPlugin = true; break
      case '--entry-runtime': options.entryRuntime = value(); break
      case '--entry-claim': options.entryClaim = value(); break
      case '--host': options.host = value(); break
      case '--base': options.base = value(); break
      case '--web': options.web = value(); break
      case '--bare': options.bare = value(); break
      case '--advice': options.advice = inline === undefined ? true : inline !== 'false'; break
      case '--no-advice': options.advice = false; break
      default: throw new Error(`unknown option: ${key}`)
    }
  }
  if (!['text', 'json', 'sarif'].includes(options.format)) throw new Error(`unsupported --format: ${options.format}`)
  if (!['mvp', 'ds-c', 'entry'].includes(options.scope)) throw new Error(`unsupported --scope: ${options.scope}`)
  if (!['require', 'server-entry'].includes(options.entryRuntime)) throw new Error('--entry-runtime must be require or server-entry')
  if (!['runtime', 'static'].includes(options.entryClaim)) throw new Error('--entry-claim must be runtime or static')
  if (options.staticOnly) { options.scope = 'ds-c'; options.profile = 'listing' }
  if (!options.profile) options.profile = options.marketIndex ? 'listing' : 'package'
  if (!['package', 'listing', 'both'].includes(options.profile)) throw new Error(`unsupported --profile: ${options.profile}`)
  if (options.staticOnly && options.treatAsPlugin) throw new Error('--static-only and --treat-as-plugin are mutually exclusive')
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 120_000) throw new Error('--timeout must be between 100 and 120000 ms')
  if (!Number.isInteger(options.maxFiles) || options.maxFiles < 1 || options.maxFiles > 200_000) throw new Error('--max-files must be an integer between 1 and 200000')
  if (!Number.isInteger(options.maxBytes) || options.maxBytes < 1000 || options.maxBytes > 2_000_000_000) throw new Error('--max-bytes must be an integer between 1000 and 2000000000')
  if (options.target === null) options.target = '.'
  return options
}

function runtimeNotRun(reason) {
  const meta = {
    'DSC-04': ['C-4', 'L1'], 'DSC-05': ['C-5', 'L1'], 'DSC-06': ['C-6', 'L1+L2'],
    'DSC-07': ['C-7', 'L2'], 'DSC-08': ['C-8', 'L3'], 'DSC-09': ['C-9', 'L1'],
  }
  return Object.entries(meta).map(([id, [clause, layer]]) => ({
    id, clause, layer, result: 'ERROR', coverage: 'not-run', reason,
    details: [], evidence: [], method: 'M', advisory: false,
  }))
}

/**
 * L1-L3 run in a child process so that a plugin cannot block the event loop,
 * read the checker's environment, or kill the process. The child is hard-killed
 * after timeoutMs + 3s; a kill is reported as not-run, never as a pass.
 */
function isolatedRuntimeChecks(input) {
  return new Promise((resolve) => {
    const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'runtime-child.mjs')
    // The child imports the inspected package: never inherit the caller's env.
    const child = spawn(process.execPath, [script], { stdio: ['pipe', 'pipe', 'pipe'], env: sanitizedEnv() })
    let out = ''
    let err = ''
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, input.timeoutMs + 3000)
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { err += chunk })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve(runtimeNotRun(`L1 child failed to start: ${error.message}`))
    })
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      if (signal === 'SIGKILL' || signal === 'SIGTERM') {
        return resolve(runtimeNotRun(`L1 killed after ${input.timeoutMs}ms; plugin blocked the event loop`))
      }
      try {
        const parsed = JSON.parse(out)
        resolve(parsed.checks)
      } catch {
        resolve(runtimeNotRun(`L1 child produced no JSON (exit ${code}): ${String(err).slice(0, 200)}`))
      }
    })
    child.stdin.end(JSON.stringify(input))
  })
}

async function entryRunCheck(kind, runtimeChecks, options, dir) {
  const byId = new Map(runtimeChecks.map(item => [item.id, item]))
  const c4 = byId.get('DSC-04')
  const base = {
    id: 'DSC-14', clause: 'C-14', layer: 'L1', method: 'M', advisory: false,
    details: [], evidence: c4?.evidence ?? [],
  }
  if (options.entryClaim === 'static') {
    return { ...base, result: 'NA', coverage: 'not-run', reason: 'entry static claim: no runtime evidence' }
  }
  if (['client', 'preset', 'skill', 'theme', 'mcp-config', 'unknown'].includes(kind)) {
    return { ...base, result: 'NA', coverage: 'not-run', reason: `kind=${kind}; no runtime claim` }
  }
  if (kind === 'bundle' && options.entryRuntime !== 'server-entry') {
    if (!options.host) return { ...base, result: 'ERROR', coverage: 'not-run', reason: 'bundle runtime requires --host <app-boot/lib/index.js> for G0-G3' }
    const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'bundle-smoke.mjs')
    const args = [script, '--package', dir, '--host', options.host, '--json', '--timeout', String(options.timeoutMs)]
    if (options.base) args.push('--base', options.base)
    if (options.web) args.push('--web', options.web)
    if (options.bare) args.push('--bare', options.bare)
    const run = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: options.timeoutMs + 5000, maxBuffer: 8 * 1024 * 1024, env: sanitizedEnv() })
    if (run.error) return { ...base, result: 'ERROR', coverage: 'not-run', reason: `bundle smoke failed to start: ${run.error.message}` }
    let smoke
    try { smoke = JSON.parse(run.stdout) } catch { return { ...base, result: 'ERROR', coverage: 'not-run', reason: `bundle smoke produced no JSON: ${(run.stderr || '').slice(0, 300)}` } }
    const state = smoke.g3?.state
    if (smoke.g2?.compatibility === 'reject') return { ...base, result: 'FAIL', coverage: 'full', reason: 'G2 gate rejected: host would skip this bundle', details: [{ item: 'G2', result: 'FAIL', reason: JSON.stringify(smoke.g2) }] }
    if (state === 'verified' && smoke.g4?.ok === false) return { ...base, result: 'FAIL', coverage: 'full', reason: 'G4 failed: dsh.client has no package-root row or missing client export', details: [{ item: 'G4', result: 'FAIL', reason: JSON.stringify(smoke.g4) }] }
    if (state === 'verified') return { ...base, result: 'PASS', coverage: 'full', reason: `G0-G3 verified; rows=${smoke.g3.active}/${smoke.g3.rows.length}${smoke.g4?.hasClient ? '; G4 static ok' : ''}`, details: [{ item: 'G0', result: 'PASS', reason: 'patch parsed' }, { item: 'G1', result: 'PASS', reason: `rows ${smoke.g1.targetRows}` }, { item: 'G3', result: 'PASS', reason: `rows ${smoke.g3.active}/${smoke.g3.rows.length} ACTIVE` }] }
    if (state === 'partial') return { ...base, result: 'ERROR', coverage: 'not-run', reason: `G3 partial: ${smoke.g3.active}/${smoke.g3.rows.length} ACTIVE; target profile does not provide all services`, details: [{ item: 'G3', result: 'WARN', reason: JSON.stringify(smoke.g3.rows) }] }
    return { ...base, result: 'FAIL', coverage: 'full', reason: `bundle smoke failed: ${JSON.stringify(smoke.g3?.rows ?? [])}` }
  }
  if (c4?.result === 'PASS') {
    return { ...base, result: 'PASS', coverage: 'full', reason: kind === 'bundle' ? 'server-entry ACTIVE only; bundle G0-G4 not run' : '' }
  }
  if (c4?.result === 'FAIL') return { ...base, result: 'FAIL', coverage: 'full', reason: c4.reason || 'runtime failed' }
  return { ...base, result: 'ERROR', coverage: 'not-run', reason: c4?.reason || 'no runtime evidence' }
}

/**
 * Read the runtime version the host actually runs. The anchor used to be a
 * hard-coded `0.2.2-alpha.2`, which manufactured dozens of C-2.2 failures on a
 * host that had already moved on. Detection is best-effort: when `dsh` is not
 * usable the anchor falls back to the checked-in constant and says so.
 */
export function detectHostRuntime({ bin = process.env.DSH_BIN || (process.platform === 'win32' ? 'dsh.cmd' : 'dsh'), timeoutMs = HOST_RUNTIME_TIMEOUT_MS } = {}) {
  const run = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: timeoutMs })
  if (run.error || run.status !== 0) return { version: null, bin, error: run.error?.message ?? `exit ${run.status}` }
  const text = `${run.stdout ?? ''}\n${run.stderr ?? ''}`
  const match = /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/.exec(text)
  if (!match) return { version: null, bin, error: 'no semver in `dsh --version` output' }
  return { version: match[1], bin, error: null }
}

/**
 * Resolve what `anchor.dsh` means:
 *   cli       the caller passed --runtime-version; suspect when it differs from the host
 *   host      no flag: the host version is the anchor, so it cannot be suspect
 *   fallback  dsh unavailable: keep the constant, flagged as not host-derived
 */
export function resolveRuntimeAnchor(requestedVersion = null, hostVersion = null) {
  if (typeof requestedVersion === 'string' && requestedVersion.trim() !== '') {
    const requested = requestedVersion.trim()
    return {
      dsh: requested,
      runtimeSource: 'cli',
      hostVersion: hostVersion ?? null,
      suspect: typeof hostVersion === 'string' && hostVersion !== '' && hostVersion !== requested,
    }
  }
  if (typeof hostVersion === 'string' && hostVersion !== '') {
    return { dsh: hostVersion, runtimeSource: 'host', hostVersion, suspect: false }
  }
  return { dsh: DEFAULT_RUNTIME_VERSION, runtimeSource: 'fallback', hostVersion: null, suspect: false }
}

/** The five optional declaration surfaces, counted but never scored. */
export function declarationsOf(manifest) {
  const dsh = manifest?.dsh ?? {}
  const present = []
  if (Array.isArray(dsh.capabilities) && dsh.capabilities.length > 0) present.push('capabilities')
  if (Array.isArray(dsh.labels) && dsh.labels.length > 0) present.push('labels')
  if (dsh.commitments && typeof dsh.commitments === 'object' && !Array.isArray(dsh.commitments)) present.push('commitments')
  if (dsh.disclosure && typeof dsh.disclosure === 'object' && !Array.isArray(dsh.disclosure)) present.push('disclosure')
  if (typeof manifest?.engines?.dsh === 'string' && manifest.engines.dsh.trim() !== '') present.push('engines.dsh')
  return { total: 5, present }
}

function anchorOf(options, runtimeInfo, runtimePath) {
  return {
    repo: 'deepseek-ai/deepseek-harness',
    commit: options.commit,
    scanner: `dsh-plugin-verify@${VERSION}`,
    dsh: runtimeInfo.dsh,
    cordis: options.cordisVersion,
    runtime: runtimePath ? path.resolve(runtimePath) : null,
    runtimeSource: runtimeInfo.runtimeSource,
    hostVersion: runtimeInfo.hostVersion,
    suspect: runtimeInfo.suspect,
  }
}

export async function main(argv = process.argv.slice(2)) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    process.stderr.write(`dsh-plugin-verify: ${error.message}\n`)
    process.stderr.write(usage())
    return 3
  }
  if (options.help) { process.stdout.write(usage()); return 0 }
  if (options.version) { process.stdout.write(`${VERSION}\n`); return 0 }

  const dir = path.resolve(options.target)
  let stat
  try { stat = fs.statSync(dir) } catch {
    process.stderr.write(`dsh-plugin-verify: target not found: ${dir}\n`)
    return 3
  }
  if (!stat.isDirectory()) {
    process.stderr.write(`dsh-plugin-verify: target must be a package directory (tarball support is not in the MVP): ${dir}\n`)
    return 3
  }
  if (!fs.existsSync(path.join(dir, 'package.json'))) {
    process.stderr.write(`dsh-plugin-verify: not a package directory (no package.json): ${dir}\n`)
    return 3
  }

  const host = detectHostRuntime()
  const runtimeInfo = resolveRuntimeAnchor(options.runtimeVersion, host.version)

  const { manifest, kind, kindInferred, entry, patch, g4, checks: manifestChecks } = runManifestChecks(dir, {
    runtimeVersion: runtimeInfo.dsh,
    installSpec: options.installSpec,
    marketIndex: options.marketIndex,
    pluginName: options.pluginName,
  })

  let sources = []
  let scan = null
  try {
    const read = readSourcesWithStats(dir, { maxFiles: options.maxFiles, maxBytes: options.maxBytes })
    sources = read.sources
    scan = read.scan
  } catch { sources = [] }
  const declarationChecks = manifest ? [
    checkCapabilities(manifest, sources, patch),
    checkCredentials(manifest, sources),
    checkLabels(manifest, sources),
  ] : [
    { id: 'DSC-11', clause: 'C-11', layer: 'L0', result: 'ERROR', coverage: 'not-run', reason: 'manifest unavailable', details: [], evidence: [], method: 'M', advisory: false },
    { id: 'DSC-12', clause: 'C-12', layer: 'L0', result: 'ERROR', coverage: 'not-run', reason: 'manifest unavailable', details: [], evidence: [], method: 'M', advisory: false },
    { id: 'DSC-13', clause: 'C-13', layer: 'L0', result: 'ERROR', coverage: 'not-run', reason: 'manifest unavailable', details: [], evidence: [], method: 'M', advisory: false },
  ]
  const declarationAdjusted = declarationChecks.map(item => (item.result === 'WARN' && ['DSC-11', 'DSC-13'].includes(item.id) ? { ...item, advisory: true } : item))
  const advisoryChecks = [checkImportTimeAdvisory(sources, entry?.relative, scan)]

  if (options.scope === 'entry' && options.entryRuntime === 'server-entry' && kind !== 'plugin') options.treatAsPlugin = true
  let runtimeKind = kind
  let runtimeEntry = entry
  if (options.treatAsPlugin && manifest) {
    runtimeKind = 'plugin'
    if (!runtimeEntry?.exists) {
      const candidates = ['lib/index.js', 'index.js', 'lib/public-entry.js', 'src/index.ts', 'src/index.js', 'src/index.mjs']
      for (const relative of candidates) {
        const absolute = path.resolve(dir, relative)
        if (fs.existsSync(absolute)) { runtimeEntry = { exists: true, absolute, relative, source: '--treat-as-plugin' }; break }
      }
    }
  }

  let runtimeChecks
  if (options.noExec || !manifest) {
    const reason = options.noExec ? '--no-exec' : 'manifest unavailable'
    runtimeChecks = ['DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09'].map(id => ({
      id, clause: { 'DSC-04': 'C-4', 'DSC-05': 'C-5', 'DSC-06': 'C-6', 'DSC-07': 'C-7', 'DSC-08': 'C-8', 'DSC-09': 'C-9' }[id],
      layer: { 'DSC-04': 'L1', 'DSC-05': 'L1', 'DSC-06': 'L1+L2', 'DSC-07': 'L2', 'DSC-08': 'L3', 'DSC-09': 'L1' }[id],
      result: 'ERROR', coverage: 'not-run', reason, details: [], evidence: [], method: 'M', advisory: false,
    }))
  } else {
    runtimeChecks = await isolatedRuntimeChecks({
      dir, manifest, kind: runtimeKind, entry: runtimeEntry,
      runtimePath: options.runtime, timeoutMs: options.timeoutMs,
    })
  }

  // A bundle/client has no plugin entry for L1-L3. Instead of leaving all six
  // runtime checks NA, cover their statically decidable part explicitly and
  // mark the coverage partial (the report says what still needs --host/--runtime).
  const runtimeUsable = runtimeChecks.some(item => ['PASS', 'WARN', 'FAIL'].includes(item.result))
  if (manifest && ['bundle', 'client'].includes(kind) && !runtimeUsable) {
    const staticChecks = runStaticBundleChecks({ manifest, kind, entry, patch, sources, g4, scan, dir })
    const staticById = new Map(staticChecks.map(item => [item.id, item]))
    runtimeChecks = runtimeChecks.map(item => staticById.get(item.id) ?? item)
  }

  const runCheck = await entryRunCheck(kind, runtimeChecks, options, dir)
  const checks = [
    manifestChecks[0], manifestChecks[1], manifestChecks[2],
    ...runtimeChecks,
    runCheck,
    advisoryChecks[0],
    ...declarationAdjusted,
  ]

  if (g4?.result === 'FAIL') {
    const dsc01 = checks.find(item => item.id === 'DSC-01')
    if (dsc01 && dsc01.result !== 'FAIL') {
      dsc01.result = 'FAIL'
      dsc01.reason = dsc01.reason ? `${dsc01.reason}; ${g4.reason ?? 'G4 failed'}` : (g4.reason ?? 'G4 failed')
      dsc01.details = [...(dsc01.details ?? []), { item: 'G4', result: 'FAIL', reason: g4.reason ?? 'client shape failed' }]
    }
  }

  const subject = {
    mode: options.profile === 'listing' || options.profile === 'both' ? 'listing' : 'package',
    profile: options.profile,
    kind,
    kindInferred,
    kindEvaluated: runtimeKind,
    name: manifest?.name ?? null,
    version: manifest?.version ?? null,
    path: dir,
  }
  const report = buildReport({
    subject,
    anchor: anchorOf(options, runtimeInfo, options.runtime),
    checks,
    g4,
    scope: options.scope,
    profile: options.profile,
    kind,
    staticOnly: options.staticOnly,
    entryRuntime: options.entryRuntime,
    entryClaim: options.entryClaim,
    advice: options.advice,
    declarations: declarationsOf(manifest),
  })
  const output = writeReport(report, options.format)
  if (options.out) {
    const outPath = path.resolve(options.out)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, output)
    process.stderr.write(`dsh-plugin-verify: wrote ${outPath}\n`)
  } else {
    process.stdout.write(output)
  }
  return report.conclusion.exitCode
}

export { parseArgs, usage, VERSION }

import fs from 'node:fs'
import os from 'node:os'
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
  --runtime [path|auto]      built @deepseek-ai/cordis lib/index.js (or its package dir); bare or
                             'auto' resolves from the installed dsh; enables real L1-L3
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
  --host [file|auto]         app-boot lib/index.js (or its package dir); bare or 'auto'
                             resolves from the installed dsh; enables real bundle G0-G3 smoke.
                             Nothing executes unless this or --runtime is given.
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
      case '--runtime': {
        if (inline !== undefined) { options.runtime = inline; break }
        const next = argv[index + 1]
        if (next === undefined || next.startsWith('--')) { options.runtime = 'auto'; break }
        index += 1
        options.runtime = next
        break
      }
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
      case '--host': {
        if (inline !== undefined) { options.host = inline; break }
        const next = argv[index + 1]
        if (next === undefined || next.startsWith('--')) { options.host = 'auto'; break }
        index += 1
        options.host = next
        break
      }
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
 * Resolve an installed dsh's own package root. `--runtime auto` / `--host auto`
 * use this so a real run needs no hand-copied path. The launcher may be a shim
 * (`dsh`, `dsh.cmd`, `dsh.ps1`); its directory is the npm global prefix, and
 * the package lives under node_modules/@deepseek-ai/dsh.
 */
export function resolveDshInstall({ env = process.env, bin = null } = {}) {
  const candidates = []
  if (typeof env.DSH_INSTALL_DIR === 'string' && env.DSH_INSTALL_DIR.trim() !== '') {
    candidates.push(env.DSH_INSTALL_DIR.trim())
  }
  const launcher = bin || env.DSH_BIN || (process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
  const launcherPaths = []
  if (path.isAbsolute(launcher) || launcher.includes('/') || launcher.includes('\\')) {
    launcherPaths.push(launcher)
  } else {
    // `which dsh` is not available in every child env; walk PATH directly so
    // `--runtime auto` also works when dsh is only reachable as a command name.
    const separator = process.platform === 'win32' ? ';' : ':'
    for (const dir of String(env.PATH ?? '').split(separator)) {
      if (!dir) continue
      for (const name of process.platform === 'win32' ? [`${launcher}.cmd`, `${launcher}.ps1`, launcher] : [launcher]) {
        const candidate = path.join(dir, name)
        try { if (fs.existsSync(candidate)) launcherPaths.push(candidate) } catch { /* ignore */ }
      }
    }
  }
  for (const launcherPath of launcherPaths) {
    const absolute = (() => { try { return fs.realpathSync(launcherPath) } catch { return path.resolve(launcherPath) } })()
    candidates.push(path.join(path.dirname(absolute), 'node_modules', '@deepseek-ai', 'dsh'))
  }
  for (const prefix of [env.APPDATA && path.join(env.APPDATA, 'npm'), env.npm_config_prefix, '/usr/local', '/usr']) {
    if (!prefix) continue
    candidates.push(path.join(prefix, 'node_modules', '@deepseek-ai', 'dsh'))
  }
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate
    } catch { /* unreadable candidate */ }
  }
  return null
}

/**
 * The file a `--runtime`/`--host` value points at. Directories are expanded to
 * their package entry, and `auto` is resolved from the installed dsh. A value
 * that stays missing is returned as-is on purpose: the run then fails with a
 * recorded reason instead of pretending the check passed.
 */
export function resolveRuntimeTarget(value, kind = 'cordis', { env = process.env } = {}) {
  if (typeof value !== 'string' || value.trim() === '') return null
  const raw = value.trim()
  if (raw === 'auto' || raw === 'host') {
    const install = resolveDshInstall({ env })
    if (!install) return null
    const name = kind === 'host' ? 'dsh-app-boot' : 'cordis'
    const candidates = [
      path.join(install, 'node_modules', '@deepseek-ai', name, 'lib', 'index.js'),
      // npm may hoist the package next to @deepseek-ai/dsh instead of nesting it.
      path.join(install, '..', '..', '@deepseek-ai', name, 'lib', 'index.js'),
    ]
    for (const candidate of candidates) {
      try { if (fs.existsSync(candidate)) return path.resolve(candidate) } catch { /* keep looking */ }
    }
    return null
  }
  const absolute = path.resolve(raw)
  try {
    if (fs.statSync(absolute).isDirectory()) return path.join(absolute, 'lib', 'index.js')
  } catch { /* not a directory; treat as a file */ }
  return absolute
}

/** A disposable HOME/DSH_HOME/TMPDIR for one explicit runtime run. */
export function createRuntimeIsolation(base = os.tmpdir()) {
  const root = fs.mkdtempSync(path.join(base, 'dsh-checker-runtime-'))
  const home = path.join(root, 'home')
  const tmp = path.join(root, 'tmp')
  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(tmp, { recursive: true })
  let cleaned = false
  return {
    root,
    home,
    tmp,
    cleanup() {
      if (cleaned) return
      cleaned = true
      try { fs.rmSync(root, { recursive: true, force: true }) } catch { /* best effort */ }
    },
  }
}

/** The only environment a child that may import plugin code receives. */
export function isolationEnv(isolation) {
  if (!isolation) return {}
  return {
    HOME: isolation.home,
    USERPROFILE: isolation.home,
    DSH_HOME: isolation.home,
    TMPDIR: isolation.tmp,
    TEMP: isolation.tmp,
    TMP: isolation.tmp,
    XDG_CONFIG_HOME: path.join(isolation.home, '.config'),
    XDG_DATA_HOME: path.join(isolation.home, '.local', 'share'),
    XDG_CACHE_HOME: path.join(isolation.home, '.cache'),
  }
}

const RUNTIME_MARKER = '__DSH_RUNTIME_CHECKS__'

function parseRuntimeOutput(text) {
  const index = text.lastIndexOf(RUNTIME_MARKER)
  if (index >= 0) {
    const line = text.slice(index + RUNTIME_MARKER.length).split('\n', 1)[0]
    try { return JSON.parse(line) } catch { /* fall through to the raw form */ }
  }
  const raw = text.trim()
  if (raw.startsWith('{')) {
    try { return JSON.parse(raw) } catch { /* not complete yet */ }
  }
  return null
}

/**
 * L1-L3 run in a child process so that a plugin cannot block the event loop,
 * read the checker's environment, or kill the process. The child writes one
 * marker line as soon as the checks finish; the parent resolves on that line
 * and terminates the child, so a plugin that leaves timers behind cannot turn
 * a completed run into "killed after timeout". A kill before the marker is
 * reported as not-run, never as a pass.
 */
function isolatedRuntimeChecks(input) {
  return new Promise((resolve) => {
    const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'runtime-child.mjs')
    const startedAt = Date.now()
    // The child imports the inspected package: never inherit the caller's env.
    const child = spawn(process.execPath, [script], {
      // fd 3 is the result pipe: plugin stdout/stderr cannot forge the payload.
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
      env: sanitizedEnv(isolationEnv(input.isolation)),
    })
    let out = ''
    let err = ''
    let result = ''
    const RESULT_LIMIT = 4 * 1024 * 1024
    let settled = false
    let timer = null
    const finish = (payload, failure = null) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      try { child.kill('SIGKILL') } catch { /* already gone */ }
      const wallMs = Date.now() - startedAt
      if (!payload) {
        resolve({ checks: runtimeNotRun(failure), durationMs: wallMs, error: failure })
        return
      }
      const error = payload.error ? String(payload.error).slice(0, 500) : null
      const checks = Array.isArray(payload.checks) && payload.checks.length > 0 ? payload.checks : runtimeNotRun(error || 'L1 child produced no checks')
      resolve({ checks, durationMs: Number.isFinite(payload.durationMs) ? payload.durationMs : wallMs, error })
    }
    timer = setTimeout(() => {
      finish(null, `L1 killed after ${input.timeoutMs}ms; plugin blocked the event loop`)
    }, input.timeoutMs + 3000)
    child.stdout.on('data', (chunk) => {
      if (out.length < RESULT_LIMIT) out += chunk
    })
    child.stdio[3]?.on('data', (chunk) => {
      if (result.length >= RESULT_LIMIT) return
      result += chunk
      const payload = parseRuntimeOutput(result)
      if (payload) finish(payload)
    })
    child.stderr.on('data', (chunk) => {
      if (err.length < RESULT_LIMIT) err += chunk
    })
    child.on('error', (error) => finish(null, `L1 child failed to start: ${error.message}`))
    child.on('exit', (code, signal) => {
      const payload = parseRuntimeOutput(result) ?? parseRuntimeOutput(out)
      if (payload) return finish(payload)
      if (signal === 'SIGKILL' || signal === 'SIGTERM') return finish(null, `L1 killed after ${input.timeoutMs}ms; plugin blocked the event loop`)
      finish(null, `L1 child produced no JSON (exit ${code}): ${String(err).slice(0, 200)}`)
    })
    child.stdin.end(JSON.stringify(input))
  })
}

async function entryRunCheck(kind, runtimeChecks, options, dir, context = {}) {
  const byId = new Map(runtimeChecks.map(item => [item.id, item]))
  const c4 = byId.get('DSC-04')
  const runtimeKind = context.runtimeKind ?? kind
  const runtimeUsable = context.runtimeUsable === true
  const noRuntime = { executed: false, modes: [], durationMs: null, failure: null }
  const base = {
    id: 'DSC-14', clause: 'C-14', layer: 'L1', method: 'M', advisory: false,
    details: [], evidence: c4?.evidence ?? [],
  }
  if (options.entryClaim === 'static') {
    return { check: { ...base, result: 'NA', coverage: 'not-run', reason: 'entry static claim: no runtime evidence' }, runtime: noRuntime }
  }
  if (['client', 'preset', 'skill', 'theme', 'mcp-config', 'unknown'].includes(kind)) {
    return { check: { ...base, result: 'NA', coverage: 'not-run', reason: `kind=${kind}; no runtime claim` }, runtime: noRuntime }
  }
  if (kind === 'bundle' && options.entryRuntime !== 'server-entry') {
    if (options.host) {
      const startedAt = Date.now()
      const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'bundle-smoke.mjs')
      const smokeTimeout = Math.max(options.timeoutMs, 5000)
      const args = [script, '--package', dir, '--host', options.host, '--json', '--timeout', String(smokeTimeout)]
      if (options.base) args.push('--base', options.base)
      if (options.web) args.push('--web', options.web)
      if (options.bare) args.push('--bare', options.bare)
      const run = spawnSync(process.execPath, args, {
        encoding: 'utf8',
        timeout: smokeTimeout + 5000,
        maxBuffer: 8 * 1024 * 1024,
        env: sanitizedEnv(isolationEnv(context.isolation)),
      })
      const durationMs = Date.now() - startedAt
      const meta = mode => ({ executed: true, modes: ['bundle-host'], durationMs, failure: null, ...mode })
      if (run.error) {
        const reason = `bundle smoke failed to start: ${run.error.message}`
        return { check: { ...base, result: 'ERROR', coverage: 'not-run', reason }, runtime: meta({ failure: reason }) }
      }
      let smoke
      try { smoke = JSON.parse(run.stdout) } catch {
        const reason = `bundle smoke produced no JSON: ${(run.stderr || '').slice(0, 300)}`
        return { check: { ...base, result: 'ERROR', coverage: 'not-run', reason }, runtime: meta({ failure: reason }) }
      }
      const state = smoke.g3?.state
      if (smoke.g2?.compatibility === 'reject') {
        const reason = 'G2 gate rejected: host would skip this bundle'
        return { check: { ...base, result: 'FAIL', coverage: 'full', reason, details: [{ item: 'G2', result: 'FAIL', reason: JSON.stringify(smoke.g2) }] }, runtime: meta({ failure: reason }) }
      }
      if (state === 'verified' && smoke.g4?.ok === false) {
        const reason = 'G4 failed: dsh.client has no package-root row or missing client export'
        return { check: { ...base, result: 'FAIL', coverage: 'full', reason, details: [{ item: 'G4', result: 'FAIL', reason: JSON.stringify(smoke.g4) }] }, runtime: meta({}) }
      }
      if (state === 'verified') {
        const reason = `G0-G3 verified; rows=${smoke.g3.active}/${smoke.g3.rows.length}${smoke.g4?.hasClient ? '; G4 static ok' : ''}`
        return {
          check: { ...base, result: 'PASS', coverage: 'full', reason, details: [{ item: 'G0', result: 'PASS', reason: 'patch parsed' }, { item: 'G1', result: 'PASS', reason: `rows ${smoke.g1.targetRows}` }, { item: 'G3', result: 'PASS', reason: `rows ${smoke.g3.active}/${smoke.g3.rows.length} ACTIVE` }] },
          runtime: meta({}),
        }
      }
      if (state === 'partial') {
        const reason = `G3 partial: ${smoke.g3.active}/${smoke.g3.rows.length} ACTIVE; target profile does not provide all services`
        return { check: { ...base, result: 'ERROR', coverage: 'not-run', reason, details: [{ item: 'G3', result: 'WARN', reason: JSON.stringify(smoke.g3.rows) }] }, runtime: meta({ failure: reason }) }
      }
      const reason = `bundle smoke failed: ${JSON.stringify(smoke.g3?.rows ?? [])}`
      return { check: { ...base, result: 'FAIL', coverage: 'full', reason }, runtime: meta({ failure: reason }) }
    }
    // A bundle with a real server entry can still be exercised by L1-L3 with
    // --treat-as-plugin. That is runtime evidence for the entry, but it is not
    // a full G0-G3 boot; the reason says so instead of requiring --host forever.
    if (runtimeKind === 'plugin' && runtimeUsable) {
      return {
        check: { ...base, result: 'PASS', coverage: 'full', reason: 'server-entry L1-L3 PASS; bundle G0-G3 not run (pass --host <app-boot/lib/index.js> for the full boot)' },
        runtime: { executed: true, modes: [], durationMs: 0, failure: null },
      }
    }
    const reason = 'bundle runtime requires --host <app-boot/lib/index.js> or --treat-as-plugin --runtime <path>'
    return { check: { ...base, result: 'ERROR', coverage: 'not-run', reason }, runtime: { ...noRuntime, failure: reason } }
  }
  if (c4?.result === 'PASS') {
    return {
      check: { ...base, result: 'PASS', coverage: 'full', reason: kind === 'bundle' ? 'server-entry ACTIVE only; bundle G0-G4 not run' : '' },
      runtime: { executed: true, modes: [], durationMs: 0, failure: null },
    }
  }
  if (c4?.result === 'FAIL') {
    const reason = c4.reason || 'runtime failed'
    return { check: { ...base, result: 'FAIL', coverage: 'full', reason }, runtime: { executed: true, modes: [], durationMs: 0, failure: reason } }
  }
  const reason = c4?.reason || 'no runtime evidence'
  return { check: { ...base, result: 'ERROR', coverage: 'not-run', reason }, runtime: { ...noRuntime, failure: reason } }
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

  // `--runtime auto` / `--host auto` resolve from the installed dsh. A value
  // that still cannot be resolved is a usage error: silently skipping the run
  // would turn "asked for runtime" into a static report.
  try {
    if (options.runtime) {
      const resolved = resolveRuntimeTarget(options.runtime, 'cordis')
      if (!resolved) throw new Error("--runtime auto could not locate the installed dsh's cordis lib/index.js; pass an explicit path")
      options.runtime = resolved
    }
    if (options.host) {
      const resolved = resolveRuntimeTarget(options.host, 'host')
      if (!resolved) throw new Error("--host auto could not locate the installed dsh's dsh-app-boot/lib/index.js; pass an explicit path")
      options.host = resolved
    }
  } catch (error) {
    process.stderr.write(`dsh-plugin-verify: ${error.message}\n`)
    return 3
  }

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
  // An explicit --runtime is already an opt-in to execute code. A bundle that
  // carries a real server entry can therefore be exercised without repeating
  // --treat-as-plugin; a patch-only bundle still has no entry and needs --host.
  const runServerEntry = options.treatAsPlugin || (Boolean(options.runtime) && kind === 'bundle' && entry?.exists === true)
  if (runServerEntry && manifest) {
    runtimeKind = 'plugin'
    if (!runtimeEntry?.exists) {
      const candidates = ['lib/index.js', 'index.js', 'lib/public-entry.js', 'src/index.ts', 'src/index.js', 'src/index.mjs']
      for (const relative of candidates) {
        const absolute = path.resolve(dir, relative)
        if (fs.existsSync(absolute)) { runtimeEntry = { exists: true, absolute, relative, source: '--treat-as-plugin' }; break }
      }
    }
  }

  const runtimeWillExecute = !options.noExec && Boolean(manifest) && Boolean(options.runtime) && runtimeKind === 'plugin' && runtimeEntry?.exists === true
  const hostWillExecute = !options.noExec && Boolean(manifest) && Boolean(options.host) && kind === 'bundle'
  const isolation = runtimeWillExecute || hostWillExecute ? createRuntimeIsolation() : null

  let runtimeChecks = null
  let runCheck = null
  let runtimeRun = { checks: [], durationMs: null, error: null }
  let entryRun = { executed: false, modes: [], durationMs: null, failure: null }
  let runtimeSummary = null
  try {
    if (options.noExec || !manifest) {
      const reason = options.noExec ? '--no-exec' : 'manifest unavailable'
      runtimeChecks = ['DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09'].map(id => ({
        id, clause: { 'DSC-04': 'C-4', 'DSC-05': 'C-5', 'DSC-06': 'C-6', 'DSC-07': 'C-7', 'DSC-08': 'C-8', 'DSC-09': 'C-9' }[id],
        layer: { 'DSC-04': 'L1', 'DSC-05': 'L1', 'DSC-06': 'L1+L2', 'DSC-07': 'L2', 'DSC-08': 'L3', 'DSC-09': 'L1' }[id],
        result: 'ERROR', coverage: 'not-run', reason, details: [], evidence: [], method: 'M', advisory: false,
      }))
    } else if (!options.runtime) {
      runtimeChecks = runtimeNotRun('no --runtime supplied; L1-L3 not run')
    } else if (runtimeKind !== 'plugin') {
      const reason = kind === 'bundle' && !entry?.exists
        ? 'kind=bundle has no server entry; L1-L3 not run (use --host <app-boot/lib/index.js> for G0-G3)'
        : `kind=${runtimeKind}; L1-L3 apply to plugin entries only (pass --treat-as-plugin for a bundle's server entry)`
      runtimeChecks = runtimeNotRun(reason)
    } else if (!runtimeEntry?.exists) {
      runtimeChecks = runtimeNotRun('no resolvable runtime entry; L1-L3 not run')
    } else {
      runtimeRun = await isolatedRuntimeChecks({
        dir, manifest, kind: runtimeKind, entry: runtimeEntry,
        runtimePath: options.runtime, timeoutMs: options.timeoutMs,
        home: isolation?.home, tmp: isolation?.tmp, isolation,
      })
      runtimeChecks = runtimeRun.checks
    }
    const rawRuntimeChecks = runtimeChecks
    const rawRuntimeUsable = runtimeChecks.some(item => ['PASS', 'WARN', 'FAIL'].includes(item.result))
    if (runtimeWillExecute && !rawRuntimeUsable && !runtimeRun.error) {
      // The child may exit cleanly while every check is not-run (bad
      // --runtime path, missing entry, blocked import). That is a failed run,
      // not a quiet static result: surface its reason in runtimeChecks.
      const reason = runtimeChecks.find(item => String(item.reason ?? '') !== '')?.reason || 'runtime produced no usable result'
      runtimeRun = { ...runtimeRun, error: reason }
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

    const run = await entryRunCheck(kind, runtimeChecks, options, dir, { runtimeKind, runtimeUsable, isolation })
    runCheck = run.check
    entryRun = run.runtime

    // Runtime provenance is additive: what actually ran, for how long, under
    // which isolation, and why it failed. Static rows stay exactly as they are.
    const modes = []
    if (runtimeWillExecute) modes.push('cordis')
    if (entryRun.modes.includes('bundle-host')) modes.push('bundle-host')
    const failure = [runtimeRun.error, entryRun.executed ? entryRun.failure : null].filter(Boolean).join('; ') || null
    const durationMs = (Number.isFinite(runtimeRun.durationMs) ? runtimeRun.durationMs : 0) + (Number.isFinite(entryRun.durationMs) ? entryRun.durationMs : 0)
    let notRunReason = null
    if (!runtimeWillExecute && !hostWillExecute) {
      if (options.noExec) notRunReason = '--no-exec: nothing executed'
      else if (options.runtime) notRunReason = (rawRuntimeChecks ?? []).find(item => String(item.reason ?? '') !== '')?.reason ?? '--runtime supplied but it was not executed'
      else if (options.host) notRunReason = `--host supplied but kind=${kind} is not a bundle; G0-G3 not run`
      else notRunReason = 'no --runtime/--host supplied; nothing executed'
    }
    const summary = {
      schema: 'dsh-runtime-checks/1',
      executed: runtimeWillExecute || entryRun.executed === true,
      modes,
      durationMs,
      isolation: {
        isolatedHome: Boolean(isolation),
        env: 'allowlist',
        timeoutMs: options.timeoutMs,
      },
      reason: notRunReason,
      failure,
      checks: (rawRuntimeChecks ?? []).map(item => ({
        id: item.id, result: item.result, coverage: item.coverage, reason: item.reason ?? '',
      })),
      entry: runCheck ? { id: 'DSC-14', result: runCheck.result, coverage: runCheck.coverage, reason: runCheck.reason ?? '', durationMs: entryRun.durationMs ?? null } : null,
    }
    runtimeSummary = summary
  } finally {
    isolation?.cleanup()
  }

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
    runtimeChecks: runtimeSummary,
  })
  // An explicitly requested runtime/host run that could not produce a result
  // is not a clean static pass: the caller asked for execution, so say the run
  // is incomplete. A static report (no flag) is unaffected.
  if ((runtimeWillExecute || hostWillExecute) && runtimeSummary?.failure && report.conclusion.status !== 'fail') {
    report.conclusion.status = 'incomplete'
    report.conclusion.exitCode = 2
    report.conclusion.reason = [report.conclusion.reason, `runtime/host did not complete: ${runtimeSummary.failure}`].filter(Boolean).join('; ')
  }
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

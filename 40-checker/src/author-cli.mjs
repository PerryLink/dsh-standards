/**
 * `dsh-standards check [dir]` — the author-facing entry point.
 *
 * It shells out to the existing checker in JSON mode and only changes how the
 * same report is presented: Markdown by default, `--json` for the raw
 * `dsh-conformance/1` document, `--html <file>` for a single self-contained
 * file. Exit codes are the checker's, never rewritten here.
 *
 * Safety defaults live here, not in the checker:
 *  - unless the caller explicitly opts in, `--entry-claim static --no-exec` is
 *    forwarded, so `check` never imports the inspected plugin;
 *  - the PATH `dsh` is never executed unconditionally. The anchor comes from
 *    `--host-version`, then `$DSH_HOST_VERSION`, then an opt-in
 *    `--allow-host-probe` (which resolves the `dsh` JS entry and runs it with
 *    `node ... --version`). With no source the report says the host version is
 *    unknown and records `anchor.runtimeSource=default`, `suspect=true`.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { renderHtml, renderMarkdown } from './author-report.mjs'
import { sanitizedEnv } from './sandbox-env.mjs'
import { parseVersion } from './semver.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CHECKER = path.resolve(HERE, '..', 'bin', 'dsh-plugin-verify.mjs')
const MAX_BUFFER = 64 * 1024 * 1024
const HOST_PROBE_TIMEOUT_MS = 5000
const RUNTIME_IDS = new Set(['DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09'])
// The checker falls back to `dsh --version` when DSH_BIN is unset. `check` must
// never do that implicitly, so the child always gets a path that cannot exist.
const NO_PROBE_BIN = path.join(os.tmpdir(), `dsh-standards-no-host-probe-${process.pid}`)

/** Checker flags that take a value, so `check --scope entry` is not read as a directory. */
const VALUE_FLAGS = new Set([
  '--scope', '--profile', '--runtime', '--runtime-version', '--cordis-version', '--commit',
  '--install-spec', '--market-index', '--plugin-name', '--timeout', '--host', '--base',
  '--web', '--bare', '--entry-runtime', '--entry-claim', '--max-files', '--max-bytes',
  '--registry-dir',
])

export function checkUsage() {
  return `dsh-standards check — author-facing standards report

Usage:
  dsh-standards check [dir] [options]

  dir defaults to the current directory. Output defaults to Markdown.

Options:
  --json                 print the raw dsh-conformance/1 report
  --html <file>          write a single-file HTML report (inline CSS, no assets)
  --host-version <v>     host dsh version for the anchor (default: $DSH_HOST_VERSION)
  --allow-host-probe     resolve the \`dsh\` JS entry and run \`node <entry> --version\`
  --registry-dir <dir>   read a dsh registry layout (dsh.plugin.json) instead of package.json
  --help                 show this help

Safety:
  check defaults to --entry-claim static --no-exec: the inspected plugin code
  is NOT executed. Runtime checks need an explicit --runtime <path>, --host <file>,
  or --entry-claim runtime. PATH \`dsh\` is never executed unless --allow-host-probe
  is passed; with no host version the report says "host 版本未知" and marks the
  anchor source=default, suspect=true.

Any other flag is forwarded to the checker, e.g.:
  --scope entry --entry-claim static --no-exec
  --runtime-version 0.2.2-rc.3
  --market-index index.json --plugin-name @scope/name

Exit codes (same as the checker):
  0  completed, no FAIL (PASS or WARN)
  1  completed, at least one FAIL
  2  incomplete: a mandatory check did not run
  3  usage error
`
}

function hasFlag(args, name) {
  return args.some(arg => arg === name || arg.startsWith(`${name}=`))
}

function flagValue(args, name) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === name) return args[index + 1]
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1)
  }
  return undefined
}

/**
 * The one place that decides whether a run may execute plugin code.
 *
 * `--runtime`, `--host` and `--entry-claim runtime` are explicit opt-ins. Every
 * other invocation gets `--no-exec`; a missing entry claim also gets the static
 * claim so DSC-14 cannot pretend runtime evidence exists.
 */
export function safetyDefaultsFor(passthrough = []) {
  const entryClaim = flagValue(passthrough, '--entry-claim')
  const claimProvided = hasFlag(passthrough, '--entry-claim')
  const runtimeRequested = hasFlag(passthrough, '--runtime')
    || hasFlag(passthrough, '--host')
    || entryClaim === 'runtime'
  const noExecRequested = hasFlag(passthrough, '--no-exec')
  const args = []
  if (!runtimeRequested) {
    if (!claimProvided) args.push('--entry-claim', 'static')
    if (!noExecRequested) args.push('--no-exec')
  }
  return {
    args,
    defaulted: !runtimeRequested,
    runtimeRequested,
    entryClaim: entryClaim ?? (runtimeRequested ? 'runtime' : 'static'),
    noExec: runtimeRequested ? noExecRequested : true,
  }
}

function normalizeVersion(value, label) {
  const normalized = String(value ?? '').trim().replace(/^v/, '')
  if (normalized === '' || parseVersion(normalized) === null) {
    throw new Error(`${label} must be an exact semver version`)
  }
  return normalized
}

function realpathOrNull(value) {
  try { return fs.realpathSync(value) } catch { return null }
}

/**
 * Turn a `dsh` PATH entry into the JS file that `node` can run. npm installs a
 * shell/cmd shim, so running the shim itself with node would fail; the shim's
 * text points at `node_modules/@deepseek-ai/dsh/lib/bin.js`.
 */
function nodeEntryOf(candidate) {
  const resolved = realpathOrNull(candidate)
  if (!resolved) return null
  if (/\.(?:mjs|cjs|js)$/i.test(resolved)) return resolved
  let head = ''
  try { head = fs.readFileSync(resolved, 'utf8').slice(0, 8192) } catch { return null }
  if (/^#![^\n]*\bnode\b/m.test(head)) return resolved
  const shimRelative = head.match(/node_modules[\\/]@deepseek-ai[\\/]dsh[\\/][^\s"']+\.js/)
  if (shimRelative) {
    const fromShim = path.join(path.dirname(resolved), shimRelative[0].replace(/\\/g, '/'))
    if (fs.existsSync(fromShim)) return fromShim
  }
  const fallback = path.join(path.dirname(resolved), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  return fs.existsSync(fallback) ? fallback : null
}

function resolveDshEntry(env = process.env) {
  const candidates = []
  if (typeof env.DSH_BIN === 'string' && env.DSH_BIN.trim() !== '') candidates.push(env.DSH_BIN.trim())
  try {
    const require = createRequire(path.join(process.cwd(), 'noop.cjs'))
    candidates.push(require.resolve('@deepseek-ai/dsh/lib/bin.js'))
  } catch { /* not installed next to the caller */ }
  const names = process.platform === 'win32' ? ['dsh.cmd', 'dsh.exe', 'dsh'] : ['dsh']
  for (const dir of String(env.PATH ?? env.Path ?? '').split(path.delimiter)) {
    if (dir.trim() === '') continue
    for (const name of names) candidates.push(path.join(dir, name))
  }
  for (const candidate of candidates) {
    const entry = nodeEntryOf(candidate)
    if (entry) return entry
  }
  return null
}

/** Opt-in only: resolve `dsh` and run its JS entry as `node <entry> --version`. */
export function probeHostVersion(env = process.env) {
  const entry = resolveDshEntry(env)
  if (!entry) return { version: null, source: 'none', error: 'no resolvable dsh JS entry' }
  const run = spawnSync(process.execPath, [entry, '--version'], {
    encoding: 'utf8',
    timeout: HOST_PROBE_TIMEOUT_MS,
    env: sanitizedEnv(),
  })
  if (run.error || run.status !== 0) {
    return { version: null, source: 'none', error: run.error?.message ?? `dsh --version exited ${run.status}` }
  }
  const match = /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/.exec(`${run.stdout ?? ''}\n${run.stderr ?? ''}`)
  if (!match) return { version: null, source: 'none', error: 'no semver in the probed dsh output' }
  return { version: match[1], source: 'probe', entry, error: null }
}

/**
 * Priority: explicit flag, environment, opt-in probe, then unknown. An invalid
 * environment value is reported as unknown rather than failing the whole run.
 */
export function resolveHostVersion({ hostVersion = null, allowHostProbe = false, env = process.env } = {}) {
  if (hostVersion !== null && hostVersion !== undefined) {
    return { version: normalizeVersion(hostVersion, '--host-version'), source: 'flag', error: null }
  }
  const fromEnv = typeof env.DSH_HOST_VERSION === 'string' ? env.DSH_HOST_VERSION.trim() : ''
  if (fromEnv !== '') {
    try {
      return { version: normalizeVersion(fromEnv, 'DSH_HOST_VERSION'), source: 'env', error: null }
    } catch {
      return { version: null, source: 'none', error: 'DSH_HOST_VERSION is not an exact semver; ignored' }
    }
  }
  if (allowHostProbe) return probeHostVersion(env)
  return { version: null, source: 'none', error: 'host version unknown' }
}

export function parseCheckArgs(argv = []) {
  const options = {
    dir: null, json: false, html: null, help: false, hostVersion: null, allowHostProbe: false, passthrough: [],
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') { options.help = true; continue }
    if (arg === '--json') { options.json = true; continue }
    if (arg === '--allow-host-probe' || arg.startsWith('--allow-host-probe=')) {
      const inline = arg.startsWith('--allow-host-probe=') ? arg.slice('--allow-host-probe='.length) : undefined
      options.allowHostProbe = inline === undefined ? true : inline !== 'false'
      continue
    }
    if (arg === '--host-version' || arg.startsWith('--host-version=')) {
      const inline = arg.startsWith('--host-version=') ? arg.slice('--host-version='.length) : undefined
      if (inline !== undefined) {
        if (inline.trim() === '') throw new Error('--host-version needs a value')
        options.hostVersion = inline
      } else {
        const next = argv[index + 1]
        if (next === undefined || next.startsWith('--')) throw new Error('--host-version needs a value')
        options.hostVersion = next
        index += 1
      }
      continue
    }
    if (arg === '--html' || arg.startsWith('--html=')) {
      const inline = arg.startsWith('--html=') ? arg.slice('--html='.length) : undefined
      if (inline !== undefined) {
        if (inline.trim() === '') throw new Error('--html needs a file path')
        options.html = inline
      } else {
        const next = argv[index + 1]
        if (next === undefined || next.startsWith('--')) throw new Error('--html needs a file path')
        options.html = next
        index += 1
      }
      continue
    }
    if (arg === '--format' || arg.startsWith('--format=')) throw new Error('`check` owns the output format; use --json or --html <file>')
    if (arg === '--out' || arg.startsWith('--out=')) throw new Error('`check` writes to stdout or --html <file>; --out is not forwarded')
    if (arg.startsWith('-')) {
      options.passthrough.push(arg)
      if (arg.includes('=')) continue
      if (VALUE_FLAGS.has(arg)) {
        const next = argv[index + 1]
        if (next === undefined) throw new Error(`${arg} needs a value`)
        options.passthrough.push(next)
        index += 1
      }
      continue
    }
    if (options.dir !== null) throw new Error(`unexpected positional argument: ${arg}`)
    options.dir = arg
  }
  if (options.json && options.html) throw new Error('--json and --html are mutually exclusive')
  if (options.dir === null) options.dir = '.'
  options.dir = path.resolve(options.dir)
  if (options.hostVersion !== null) options.hostVersion = normalizeVersion(options.hostVersion, '--host-version')
  return options
}

function invokeChecker(options, forwarded) {
  const args = [CHECKER, options.dir, '--format', 'json', ...forwarded]
  const run = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    timeout: 600_000,
    maxBuffer: MAX_BUFFER,
    // Never let the checker fall back to the PATH `dsh`: the anchor is resolved
    // here, under --host-version / DSH_HOST_VERSION / --allow-host-probe.
    env: sanitizedEnv({ DSH_BIN: NO_PROBE_BIN }),
  })
  if (run.error) throw new Error(`could not run the checker: ${run.error.message}`)
  let report
  try {
    report = JSON.parse(run.stdout)
  } catch {
    throw new Error(`checker produced no JSON (exit ${run.status}): ${String(run.stderr ?? '').slice(0, 400)}`)
  }
  return { report, status: run.status }
}

function applyHostAnchor(report, options, hostInfo) {
  const anchor = report.anchor ?? {}
  const runtimeVersionExplicit = hasFlag(options.passthrough, '--runtime-version')
  if (hostInfo.version) {
    if (!runtimeVersionExplicit) {
      anchor.dsh = hostInfo.version
      anchor.runtimeSource = 'host'
      anchor.suspect = false
    } else {
      anchor.suspect = anchor.dsh !== hostInfo.version
    }
    anchor.hostVersion = hostInfo.version
    anchor.hostVersionKnown = true
    anchor.hostVersionSource = hostInfo.source
  } else {
    if (!runtimeVersionExplicit) {
      anchor.runtimeSource = 'default'
      anchor.suspect = true
    }
    anchor.hostVersion = null
    anchor.hostVersionKnown = false
    anchor.hostVersionSource = 'none'
  }
  report.anchor = anchor
  return runtimeVersionExplicit
}

function applySafety(report, options, safety, hostInfo, runtimeVersionExplicit) {
  applyHostAnchor(report, options, hostInfo)
  const runtimeRan = (report.checks ?? []).some(check => RUNTIME_IDS.has(check.id)
    && ['PASS', 'WARN', 'FAIL'].includes(check.result)
    && check.coverage !== 'not-run')
  const hostSmoke = hasFlag(options.passthrough, '--host') && !hasFlag(options.passthrough, '--no-exec')
  const executed = !safety.noExec && (runtimeRan || hostSmoke)
  report.safety = {
    executed,
    defaultSafety: safety.defaulted,
    entryClaim: safety.entryClaim,
    noExec: !executed,
    hostVersionKnown: Boolean(hostInfo.version),
    hostVersionSource: hostInfo.source,
    hostProbeAllowed: options.allowHostProbe,
    runtimeVersionExplicit,
  }
  if (hostInfo.error) report.safety.hostVersionError = hostInfo.error
  return report
}

function safetyBanner(report) {
  const safety = report.safety ?? {}
  const anchor = report.anchor ?? {}
  const lines = []
  if (safety.executed) {
    lines.push('> ⚠️ 本次已执行插件代码（显式开启运行时；L1–L3 在隔离子进程中运行，超时硬杀）。')
  } else if (safety.defaultSafety) {
    lines.push('> ⚠️ 本次未执行插件代码（默认安全模式：`--entry-claim static --no-exec`；运行时检查记为 not-run，不是 PASS）。')
  } else {
    lines.push('> ⚠️ 本次未执行插件代码（运行时检查没有产生完整装载证据；not-run 不是 PASS）。')
  }
  if (!safety.hostVersionKnown) {
    lines.push(`> host 版本未知：anchor.dsh=\`${anchor.dsh ?? '?'}\` 是默认值（source=${anchor.runtimeSource ?? 'default'}, suspect=${anchor.suspect ?? true}）。用 \`--host-version\`、\`DSH_HOST_VERSION\` 或 \`--allow-host-probe\` 指定宿主版本。`)
    // An explicit --runtime-version still judges C-2, even without a host.
    if (!safety.runtimeVersionExplicit && anchor.runtimeSource !== 'host') {
      lines.push('> C-2.1/C-2.2 兼容性未判定（NA/partial）：未指定 host 版本，不能把默认常量当成真实宿主。')
    }
  } else {
    lines.push(`> host 版本 \`${anchor.dsh}\`（来源：${anchor.hostVersionSource ?? 'host'}）；anchor.source=${anchor.runtimeSource ?? 'host'}。`)
  }
  return lines.join('\n')
}

function insertBanner(markdown, banner) {
  const newline = markdown.indexOf('\n')
  if (newline < 0) return `${markdown}\n\n${banner}\n`
  return `${markdown.slice(0, newline + 1)}\n${banner}\n${markdown.slice(newline + 1)}`
}

export function runCheck(argv = process.argv.slice(2)) {
  let options
  try {
    options = parseCheckArgs(argv)
  } catch (error) {
    process.stderr.write(`dsh-standards check: ${error.message}\n`)
    process.stderr.write(checkUsage())
    return 3
  }
  if (options.help) {
    process.stdout.write(checkUsage())
    return 0
  }
  let result
  let hostInfo
  let safety
  try {
    safety = safetyDefaultsFor(options.passthrough)
    hostInfo = resolveHostVersion({ hostVersion: options.hostVersion, allowHostProbe: options.allowHostProbe })
    const forwarded = [...safety.args, ...options.passthrough]
    if (hostInfo.version && !hasFlag(options.passthrough, '--runtime-version')) {
      // Pass the host anchor as --host-version so the checker's own headline
      // and anchor source already say `host`; applyHostAnchor then only fills
      // in the author-facing provenance fields.
      forwarded.push('--host-version', hostInfo.version)
    }
    result = invokeChecker(options, forwarded)
  } catch (error) {
    process.stderr.write(`dsh-standards check: ${error.message}\n`)
    return 3
  }
  const { report, status } = result
  applySafety(report, options, safety, hostInfo, hasFlag(options.passthrough, '--runtime-version'))
  const exitCode = Number.isInteger(report?.conclusion?.exitCode) ? report.conclusion.exitCode : (status ?? 3)
  if (options.html) {
    const out = path.resolve(options.html)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, renderHtml(report))
    process.stdout.write(`wrote ${out}\n`)
  } else if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    process.stdout.write(insertBanner(renderMarkdown(report), safetyBanner(report)))
  }
  return exitCode
}

/**
 * Sandbox execution for FLOW evidence collection.
 *
 * `flow collect --sandbox` runs the runtime probe (which executes
 * `dsh plugin add` and boots the tree) behind a containment layer:
 *
 *   env      allowlist from `sandbox-env.mjs`; GH_TOKEN / NPM_TOKEN /
 *            GITHUB_TOKEN are asserted absent, and any secret-shaped name is
 *            reported rather than silently forwarded;
 *   home     caller-supplied temporary HOME/DSH_HOME/TMPDIR (never the real
 *            profile);
 *   network  `unshare -n` when permitted, falling back to
 *            `unshare -Urn` (user+network namespace); if neither works the run
 *            continues degraded and records `unshare-missing`;
 *   limits   `prlimit --nproc --as --nofile --fsize` when util-linux prlimit
 *            is available; the probe reads `/proc/self/limits` so only limits
 *            that actually took effect are recorded;
 *   privileges `setpriv --no-new-privs --bounding-set=-all` inside the user
 *            namespace when available (the bounding-set drop needs CAP_SETPCAP,
 *            which an unprivileged user only has inside `unshare -Ur`); when
 *            the full command fails the probe records the partial or missing
 *            state instead of claiming it applied;
 *   read-only probe  `unshare -Urm` + `mount --bind -o ro` (and a tmpfs
 *            read-only mount) in a throwaway mount namespace; the report
 *            records the observed exit status/stderr. A failed probe is a
 *            degraded reason, never a silent pass. When the probe succeeds,
 *            `sandboxArgv` wraps the spawned command so the child's working
 *            directory (the inspected package copy) is bind-mounted read-only
 *            and `cd`-ed into before exec;
 *   timeout  the child is spawned as its own process-group leader and the
 *            whole group receives SIGKILL, so `dsh` grandchildren die too
 *            (Windows: `taskkill /T /F`).
 *
 * This is containment, not a security boundary: no seccomp, no cgroup memory/
 * pids accounting, no OCI image. Even with every hardening item effective the
 * host root filesystem stays readable. Evidence is only allowed to call itself
 * `sandbox` when every required item above is effective; any missing item
 * switches the producer to `sandbox-degraded`, which `level-audit` never reports
 * as runtime.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { isSecretEnvName, sanitizedEnv } from './sandbox-env.mjs'

export const SANDBOX_REPORT_SCHEMA = 'dsh-sandbox-report/1'
export const SANDBOX_DEGRADED = Object.freeze({
  unshare: 'unshare-missing',
  prlimit: 'prlimit-missing',
  env: 'env-token-present',
  home: 'home-not-isolated',
  treeKill: 'process-tree-kill-unavailable',
  execution: 'sandbox-execution-failed',
  setpriv: 'setpriv-missing',
  setprivBounding: 'setpriv-bounding-set-missing',
  rlimitExtra: 'rlimit-extra-missing',
  mountNamespace: 'mount-namespace-missing',
  roBind: 'ro-bind-missing',
})

/** Extra rlimits requested on top of the historical nproc/as pair. */
export const DEFAULT_NOFILE = 4096
export const DEFAULT_FSIZE = 1024 ** 3

/** Names that must never reach a child that may import plugin code. */
export const CREDENTIAL_ENV_NAMES = Object.freeze(['GH_TOKEN', 'NPM_TOKEN', 'GITHUB_TOKEN'])

/** Inherited or caller-supplied names that look like credentials. */
export function credentialEnvOffenders(env = process.env, names = CREDENTIAL_ENV_NAMES) {
  const offenders = new Set()
  for (const name of names) {
    if (env && Object.prototype.hasOwnProperty.call(env, name) && env[name] !== undefined && env[name] !== null) {
      offenders.add(name)
    }
  }
  for (const name of Object.keys(env ?? {})) {
    if (isSecretEnvName(name)) offenders.add(name)
  }
  return [...offenders].sort()
}

/** Hard gate: refuse to boot a plugin when a credential survived scrubbing. */
export function assertNoCredentialEnv(env = process.env, names = CREDENTIAL_ENV_NAMES) {
  const offenders = credentialEnvOffenders(env, names)
  if (offenders.length > 0) {
    throw new Error(`sandbox env assertion failed: ${offenders.join(', ')} present in the child environment`)
  }
  return { policy: 'allowlist', checked: [...names], absent: true, offenders: [] }
}

/** Count tasks (processes + threads) owned by this uid, for a safe RLIMIT_NPROC. */
export function userTaskCount(uid = typeof process.getuid === 'function' ? process.getuid() : null) {
  if (process.platform !== 'linux' || uid === null) return 0
  let tasks = 0
  try {
    for (const entry of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue
      try {
        if (fs.statSync(`/proc/${entry}`).uid !== uid) continue
        const status = fs.readFileSync(`/proc/${entry}/status`, 'utf8')
        const match = /^Threads:\s+(\d+)$/m.exec(status)
        tasks += match ? Number(match[1]) : 1
      } catch { /* process vanished */ }
    }
  } catch { return 0 }
  return tasks
}

export function defaultNproc() {
  // RLIMIT_NPROC counts tasks, so a fixed small value (e.g. 64) breaks Node on
  // a busy desktop. Keep headroom above the current task count.
  return Math.max(1024, userTaskCount() + 512)
}

function probeFailure(error) {
  if (!error) return null
  return String(error.message ?? error).slice(0, 300)
}

/**
 * Try a real network namespace. `unshare -n` needs CAP_SYS_ADMIN; in an
 * unprivileged container/WSL that fails, so `unshare -Urn` (user namespace +
 * network namespace) is the fallback. `true` is the probe target so no plugin
 * code runs while deciding.
 */
export function probeNetworkIsolation({ platform = process.platform, unshare = 'unshare', timeoutMs = 5_000 } = {}) {
  if (platform === 'win32') {
    return {
      isolated: false,
      degraded: SANDBOX_DEGRADED.unshare,
      reason: 'unshare is not available on win32',
      attempts: [],
    }
  }
  const attempts = []
  for (const args of [['-n'], ['-Urn']]) {
    const command = [unshare, ...args, 'true']
    const result = spawnSync(unshare, [...args, 'true'], {
      encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'], timeout: timeoutMs, env: sanitizedEnv(),
    })
    const exitCode = Number.isInteger(result.status) ? result.status : null
    const attempt = {
      command,
      exitCode,
      signal: result.signal ?? null,
      error: probeFailure(result.error),
      stderr: String(result.stderr ?? '').trim().slice(0, 300) || null,
    }
    attempts.push(attempt)
    if (!result.error && result.status === 0) {
      return {
        isolated: true,
        mechanism: args[0] === '-n' ? 'unshare -n (network namespace)' : 'unshare -Urn (user+network namespace)',
        bin: unshare,
        args,
        probe: attempt,
        attempts,
      }
    }
  }
  return {
    isolated: false,
    degraded: SANDBOX_DEGRADED.unshare,
    reason: 'unshare -n and unshare -Urn both failed; no network namespace',
    attempts,
  }
}

function readLimitsProbe() {
  return [
    "const t = require('fs').readFileSync('/proc/self/limits', 'utf8')",
    "const pick = (label) => { const m = new RegExp('^' + label + '\\\\s+(\\\\d+)', 'm').exec(t); return m ? Number(m[1]) : null }",
    "console.log(JSON.stringify({ nproc: pick('Max processes'), as: pick('Max address space'), nofile: pick('Max open files'), fsize: pick('Max file size') }))",
  ].join(';')
}

function parseLimitsOutput(result) {
  try {
    const line = String(result.stdout ?? '').trim().split(/\r?\n/).filter(Boolean).pop()
    return line ? JSON.parse(line) : null
  } catch { return null }
}

function limitAttempt({ prlimit, args, requested, node, timeoutMs }) {
  const command = [prlimit, ...args, '--', node, '-e', readLimitsProbe()]
  const result = spawnSync(prlimit, command.slice(1), {
    encoding: 'utf8', timeout: timeoutMs, env: sanitizedEnv(),
  })
  const exitCode = Number.isInteger(result.status) ? result.status : null
  const observed = parseLimitsOutput(result)
  const applied = []
  for (const [key, value] of Object.entries(requested)) {
    if (observed?.[key] === value) applied.push(key)
  }
  return {
    command,
    result,
    exitCode,
    observed,
    applied,
    probe: {
      command,
      exitCode,
      signal: result.signal ?? null,
      error: probeFailure(result.error),
      stderr: String(result.stderr ?? '').trim().slice(0, 300) || null,
    },
  }
}

/**
 * Apply and verify `prlimit --nproc --as --nofile --fsize`. The probe prints
 * the child's own `/proc/self/limits`, so `applied` lists effects, not
 * intentions. If the four-limit invocation fails (for example an older
 * prlimit without `--fsize`), the historical nproc/as pair is retried and the
 * extra limits are recorded as missing rather than dropping every limit.
 */
export function probeLimits({
  platform = process.platform,
  prlimit = 'prlimit',
  nproc = null,
  asBytes = 4 * 1024 ** 3,
  nofile = DEFAULT_NOFILE,
  fsize = DEFAULT_FSIZE,
  node = process.execPath,
  timeoutMs = 15_000,
} = {}) {
  if (platform === 'win32') {
    return {
      available: false, degraded: SANDBOX_DEGRADED.prlimit, reason: 'prlimit is a util-linux tool; win32 has no equivalent here',
      applied: [], extraApplied: [], nofile: null, fsize: null, attempts: [],
    }
  }
  const requestedNproc = Number.isFinite(nproc) && nproc > 0 ? Math.trunc(nproc) : defaultNproc()
  const requestedAs = Number.isFinite(asBytes) && asBytes > 0 ? Math.trunc(asBytes) : 4 * 1024 ** 3
  const requestedNofile = Number.isFinite(nofile) && nofile > 0 ? Math.trunc(nofile) : DEFAULT_NOFILE
  const requestedFsize = Number.isFinite(fsize) && fsize > 0 ? Math.trunc(fsize) : DEFAULT_FSIZE
  const requested = { nproc: requestedNproc, as: requestedAs, nofile: requestedNofile, fsize: requestedFsize }
  const attempts = []
  let effective = limitAttempt({
    prlimit,
    args: [`--nproc=${requestedNproc}`, `--as=${requestedAs}`, `--nofile=${requestedNofile}`, `--fsize=${requestedFsize}`],
    requested,
    node,
    timeoutMs,
  })
  attempts.push(effective.probe)
  const baseApplied = effective.applied.includes('nproc') && effective.applied.includes('as')
  if (!baseApplied || effective.exitCode !== 0 || effective.result.error) {
    effective = limitAttempt({
      prlimit,
      args: [`--nproc=${requestedNproc}`, `--as=${requestedAs}`],
      requested,
      node,
      timeoutMs,
    })
    attempts.push(effective.probe)
  }
  const applied = effective.applied
  const available = !effective.result.error && effective.exitCode === 0
    && applied.includes('nproc') && applied.includes('as')
  const extraApplied = ['nofile', 'fsize'].filter(key => applied.includes(key))
  return {
    available,
    ...(available ? {} : { degraded: SANDBOX_DEGRADED.prlimit }),
    ...(available && extraApplied.length < 2 ? { extraDegraded: SANDBOX_DEGRADED.rlimitExtra } : {}),
    bin: prlimit,
    nproc: requestedNproc,
    asBytes: requestedAs,
    nofile: requestedNofile,
    fsize: requestedFsize,
    applied,
    extraApplied,
    observed: effective.observed,
    attempts,
    probe: effective.probe,
    ...(available ? {} : { reason: 'prlimit did not apply and verify nproc+as' }),
  }
}

/**
 * Probe `setpriv --no-new-privs --bounding-set=-all`. Dropping the bounding
 * set needs CAP_SETPCAP, so the full command is evaluated inside the same
 * unprivileged user/network namespace prefix used for the run (`unshare -Urn`);
 * outside it, an unprivileged process can only apply `--no-new-privs`.
 */
export function probeSetpriv({
  platform = process.platform,
  setpriv = 'setpriv',
  prefix = [],
  timeoutMs = 5_000,
} = {}) {
  if (platform === 'win32') {
    return {
      available: false, status: 'unavailable', applied: [], degraded: SANDBOX_DEGRADED.setpriv,
      reason: 'setpriv is a util-linux tool; win32 has no equivalent here', attempts: [],
    }
  }
  const attempts = []
  const run = (args) => {
    const command = [...prefix, setpriv, ...args, 'true']
    const result = spawnSync(command[0], command.slice(1), {
      encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'], timeout: timeoutMs, env: sanitizedEnv(),
    })
    const exitCode = Number.isInteger(result.status) ? result.status : null
    const attempt = {
      command,
      exitCode,
      signal: result.signal ?? null,
      error: probeFailure(result.error),
      stderr: String(result.stderr ?? '').trim().slice(0, 300) || null,
    }
    attempts.push(attempt)
    return { ...attempt, ok: !result.error && exitCode === 0 }
  }
  const fullArgs = ['--no-new-privs', '--bounding-set=-all']
  const full = run(fullArgs)
  if (full.ok) {
    return {
      available: true, status: 'applied', bin: setpriv, command: [setpriv, ...fullArgs],
      applied: ['no-new-privs', 'bounding-set'], prefix: [...prefix], attempts, probe: full,
    }
  }
  const partialArgs = ['--no-new-privs']
  const partial = run(partialArgs)
  if (partial.ok) {
    return {
      available: false, status: 'partial', bin: setpriv, command: [setpriv, ...partialArgs],
      applied: ['no-new-privs'], degraded: SANDBOX_DEGRADED.setprivBounding,
      reason: `setpriv --bounding-set=-all failed (${full.stderr ?? `exit ${full.exitCode ?? 'unknown'}`}); only --no-new-privs applied`,
      prefix: [...prefix], attempts, probe: full,
    }
  }
  return {
    available: false, status: 'unavailable', bin: setpriv, command: null, applied: [],
    degraded: SANDBOX_DEGRADED.setpriv,
    reason: `setpriv did not apply no-new-privs (${partial.stderr ?? `exit ${partial.exitCode ?? 'unknown'}`})`,
    prefix: [...prefix], attempts,
  }
}

/** Probe whether an unprivileged user+mount namespace can be created. */
export function probeMountNamespace({
  platform = process.platform,
  unshare = 'unshare',
  timeoutMs = 5_000,
} = {}) {
  if (platform === 'win32') {
    return {
      available: false, degraded: SANDBOX_DEGRADED.mountNamespace,
      reason: 'unshare is not available on win32', attempts: [],
    }
  }
  const args = ['-Urm', 'true']
  const result = spawnSync(unshare, args, {
    encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'], timeout: timeoutMs, env: sanitizedEnv(),
  })
  const exitCode = Number.isInteger(result.status) ? result.status : null
  const available = !result.error && exitCode === 0
  const probe = {
    command: [unshare, ...args],
    exitCode,
    signal: result.signal ?? null,
    error: probeFailure(result.error),
    stderr: String(result.stderr ?? '').trim().slice(0, 300) || null,
  }
  return available
    ? { available: true, mechanism: 'unshare -Urm (user+mount namespace)', bin: unshare, args: ['-Urm'], probe }
    : {
      available: false, degraded: SANDBOX_DEGRADED.mountNamespace,
      reason: `unshare -Urm failed: ${probe.stderr ?? probe.error ?? `exit ${exitCode}`}`, attempts: [probe],
    }
}

function runMountProbe({ unshare, script, args, timeoutMs }) {
  const command = [unshare, '-Urm', 'sh', '-c', script, 'sh', ...args]
  const result = spawnSync(unshare, command.slice(1), {
    encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'], timeout: timeoutMs, env: sanitizedEnv(),
  })
  const exitCode = Number.isInteger(result.status) ? result.status : null
  return {
    command,
    ok: !result.error && exitCode === 0,
    exitCode,
    signal: result.signal ?? null,
    error: probeFailure(result.error),
    stderr: String(result.stderr ?? '').trim().slice(0, 300) || null,
  }
}

/**
 * Attempt a throwaway read-only bind mount and a read-only tmpfs mount in a
 * private mount namespace. Nothing here runs against the inspected tree: a
 * temp source/target pair is used, so a failure can only degrade the report.
 * `mount --bind -o ro` is followed by `mount -o remount,bind,ro` because some
 * kernels accept the first call without actually making the bind read-only;
 * then a write is attempted and must fail.
 */
export function probeReadOnlyBind({
  platform = process.platform,
  unshare = 'unshare',
  timeoutMs = 10_000,
} = {}) {
  if (platform === 'win32') {
    return {
      available: false, status: 'unavailable', degraded: SANDBOX_DEGRADED.roBind,
      reason: 'mount namespaces need unshare (Linux); win32 has no equivalent', bind: null, tmpfs: null,
    }
  }
  const mountNamespace = probeMountNamespace({ platform, unshare, timeoutMs: 5_000 })
  if (!mountNamespace.available) {
    return {
      available: false, status: 'unavailable',
      degraded: mountNamespace.degraded ?? SANDBOX_DEGRADED.mountNamespace,
      reason: mountNamespace.reason, mountNamespace, bind: null, tmpfs: null,
    }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-ro-bind-'))
  try {
    const source = path.join(dir, 'source')
    const target = path.join(dir, 'target')
    const tmpfs = path.join(dir, 'tmpfs')
    fs.mkdirSync(source)
    fs.mkdirSync(target)
    fs.mkdirSync(tmpfs)
    fs.writeFileSync(path.join(source, 'keep.txt'), 'read-only probe\n')
    const bindScript = [
      'if ! mount --bind -o ro "$1" "$2"; then exit 31; fi',
      'if ! mount -o remount,bind,ro "$2" 2>/dev/null; then exit 32; fi',
      'if printf x > "$2/.dsh-probe" 2>/dev/null; then exit 33; fi',
      'exit 0',
    ].join('\n')
    const tmpfsScript = [
      'if ! mount -t tmpfs -o ro tmpfs "$1"; then exit 41; fi',
      'if printf x > "$1/.dsh-probe" 2>/dev/null; then exit 42; fi',
      'exit 0',
    ].join('\n')
    const bind = runMountProbe({ unshare, script: bindScript, args: [source, target], timeoutMs })
    const tmpfsProbe = runMountProbe({ unshare, script: tmpfsScript, args: [tmpfs], timeoutMs })
    const available = bind.ok
    const reason = available
      ? 'mount --bind -o ro+remount,bind,ro is effective and rejected a write'
      : `mount --bind -o ro probe failed (${bind.stderr ?? bind.error ?? `exit ${bind.exitCode}`})`
    return {
      available,
      status: available ? 'applied' : 'degraded',
      ...(available ? {} : { degraded: SANDBOX_DEGRADED.roBind }),
      mechanism: available ? 'unshare -Urm + mount --bind -o ro + remount,bind,ro' : null,
      reason,
      mountNamespace,
      bind,
      tmpfs: {
        attempted: true,
        available: tmpfsProbe.ok,
        reason: tmpfsProbe.ok
          ? 'mount -t tmpfs -o ro rejected a write'
          : `mount -t tmpfs -o ro probe failed (${tmpfsProbe.stderr ?? tmpfsProbe.error ?? `exit ${tmpfsProbe.exitCode}`})`,
        probe: tmpfsProbe,
      },
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

export function processTreeKillCapability(platform = process.platform) {
  if (platform === 'win32') {
    const probe = spawnSync('taskkill', ['/?'], { stdio: 'ignore', timeout: 5_000 })
    const available = !probe.error
    return {
      available,
      mechanism: available ? 'taskkill /T /F' : 'taskkill-missing',
      ...(available ? {} : { degraded: SANDBOX_DEGRADED.treeKill, reason: 'taskkill is unavailable' }),
    }
  }
  return { available: true, mechanism: 'process-group SIGKILL (detached child, kill(-pgid))' }
}

/**
 * Build the containment report for one collection. Degraded reasons are
 * deduplicated; `mode` is `sandbox` only when the list is empty.
 */
export function buildSandboxPlan({
  platform = process.platform,
  env = process.env,
  unshare = 'unshare',
  prlimit = 'prlimit',
  nproc = null,
  asBytes = 4 * 1024 ** 3,
  nofile = DEFAULT_NOFILE,
  fsize = DEFAULT_FSIZE,
  homeIsolated = true,
  force = {},
} = {}) {
  const degraded = []
  const envOffenders = credentialEnvOffenders(env)
  if (envOffenders.length > 0) degraded.push(SANDBOX_DEGRADED.env)
  if (!homeIsolated) degraded.push(SANDBOX_DEGRADED.home)

  const network = force.network
    ? { isolated: false, degraded: SANDBOX_DEGRADED.unshare, reason: 'network isolation disabled by caller', attempts: [] }
    : probeNetworkIsolation({ platform, unshare })
  if (!network.isolated) degraded.push(network.degraded ?? SANDBOX_DEGRADED.unshare)

  const limits = force.limits
    ? { available: false, degraded: SANDBOX_DEGRADED.prlimit, reason: 'rlimits disabled by caller', applied: [], extraApplied: [], nofile: null, fsize: null }
    : probeLimits({ platform, prlimit, nproc, asBytes, nofile, fsize })
  if (!limits.available) degraded.push(limits.degraded ?? SANDBOX_DEGRADED.prlimit)

  const processTreeKill = processTreeKillCapability(platform)
  if (!processTreeKill.available) degraded.push(processTreeKill.degraded ?? SANDBOX_DEGRADED.treeKill)

  // Hardening probes are part of a real collection. When the caller forces
  // network/limit isolation off, the run is already degraded by definition;
  // skip the extra probes and say so instead of inventing a second verdict.
  const hardening = []
  const hardeningDegraded = []
  if (force.network || force.limits) {
    for (const item of ['setpriv', 'rlimits-extra', 'read-only-bind']) {
      hardening.push({ item, status: 'skipped', reason: 'core isolation disabled by caller; hardening not evaluated' })
    }
  } else {
    const prefix = network.isolated ? [network.bin, ...network.args] : []
    const setpriv = probeSetpriv({ platform, prefix })
    if (setpriv.status !== 'applied') hardeningDegraded.push(setpriv.degraded ?? SANDBOX_DEGRADED.setpriv)
    hardening.push({
      item: 'setpriv',
      status: setpriv.status,
      command: setpriv.command,
      applied: [...setpriv.applied],
      ...(setpriv.probe ? { probe: setpriv.probe } : {}),
      ...(setpriv.reason ? { reason: setpriv.reason } : {}),
    })

    if (limits.available) {
      const extra = Array.isArray(limits.extraApplied) ? limits.extraApplied : []
      if (extra.length < 2) hardeningDegraded.push(SANDBOX_DEGRADED.rlimitExtra)
      hardening.push({
        item: 'rlimits-extra',
        status: extra.length === 2 ? 'applied' : 'degraded',
        applied: extra,
        requested: { nofile: limits.nofile, fsize: limits.fsize },
        ...(extra.length === 2 ? {} : { reason: `nofile/fsize not applied (${extra.join(', ') || 'none'})` }),
      })
    } else {
      hardening.push({ item: 'rlimits-extra', status: 'unavailable', reason: 'prlimit did not apply nproc/as' })
    }

    // A successful probe enables the `sandboxArgv` mount wrapper (the child
    // cwd is the package copy). A failed probe is always recorded as a
    // degraded reason; it is never reported as an applied read-only root.
    const readOnlyBind = probeReadOnlyBind({ platform, unshare })
    if (!readOnlyBind.available) hardeningDegraded.push(readOnlyBind.degraded ?? SANDBOX_DEGRADED.roBind)
    hardening.push({
      item: 'read-only-bind',
      status: readOnlyBind.available ? 'applied' : 'degraded',
      available: readOnlyBind.available,
      // `sandboxArgv` wraps the spawned command with this mount when enabled;
      // the recorded execution command shows the actual wrapper.
      enabled: readOnlyBind.available && platform !== 'win32',
      applied: readOnlyBind.available && platform !== 'win32',
      ...(readOnlyBind.mechanism ? { mechanism: readOnlyBind.mechanism } : {}),
      reason: readOnlyBind.reason,
      mountNamespace: readOnlyBind.mountNamespace
        ? { available: readOnlyBind.mountNamespace.available, mechanism: readOnlyBind.mountNamespace.mechanism ?? null }
        : null,
      bind: readOnlyBind.bind,
      tmpfs: readOnlyBind.tmpfs,
    })
  }

  const unique = [...new Set([...degraded, ...hardeningDegraded])]
  return {
    schema: SANDBOX_REPORT_SCHEMA,
    mode: unique.length === 0 ? 'sandbox' : 'sandbox-degraded',
    platform,
    env: {
      policy: 'allowlist',
      checked: [...CREDENTIAL_ENV_NAMES],
      absent: envOffenders.length === 0,
      offenders: envOffenders,
    },
    home: { isolated: homeIsolated, mode: 'temporary HOME/DSH_HOME/TMPDIR' },
    network,
    limits,
    processTreeKill,
    hardening,
    hardeningDegraded: [...new Set(hardeningDegraded)],
    degraded: unique,
    note: 'containment only: no seccomp, no cgroup memory/pids accounting, no OCI image; read access is not restricted; hardening items are probes, not a security certification',
  }
}

/**
 * The mount wrapper runs inside a private mount namespace and binds the
 * child's working directory (the read-only package copy) onto itself, remounts
 * it read-only, then execs the real command. `pwd -P` is used instead of $PWD
 * so a stale environment variable cannot point the mount at the wrong tree.
 * Exit 31/32 means the mount did not take effect; the wrapper fails closed.
 */
const READ_ONLY_WRAPPER = [
  'target=$(pwd -P) || exit 1',
  'if ! mount --bind -o ro "$target" "$target"; then exit 31; fi',
  'if ! mount -o remount,bind,ro "$target" 2>/dev/null; then exit 32; fi',
  // The process cwd still points at the covered mount underneath; cd into the
  // read-only mount or relative writes bypass it.
  'cd "$target" || exit 33',
  'exec "$@"',
].join('\n')

function unshareArgsFor(plan, mountNamespace) {
  const args = plan?.network?.isolated && Array.isArray(plan.network.args) ? [...plan.network.args] : []
  if (!mountNamespace) return args
  // `mount` needs a private mount namespace, and an unprivileged mount needs a
  // user namespace as well. Never assume the network probe already created
  // them: add each flag only when absent.
  const joined = args.join(' ')
  if (!joined.includes('U')) args.push('-U')
  if (!joined.includes('r')) args.push('-r')
  if (!joined.includes('m')) args.push('-m')
  return args
}

/** Wrap `command args...` in the effective unshare + setpriv + prlimit prefixes. */
export function sandboxArgv(plan, command, args = []) {
  let argv = [command, ...args]
  if (plan?.limits?.available) {
    const applied = Array.isArray(plan.limits.applied) ? plan.limits.applied : ['nproc', 'as']
    const limitArgs = [`--nproc=${plan.limits.nproc}`, `--as=${plan.limits.asBytes}`]
    if (applied.includes('nofile') && Number.isFinite(plan.limits.nofile)) limitArgs.push(`--nofile=${plan.limits.nofile}`)
    if (applied.includes('fsize') && Number.isFinite(plan.limits.fsize)) limitArgs.push(`--fsize=${plan.limits.fsize}`)
    argv = [plan.limits.bin, ...limitArgs, '--', ...argv]
  }
  const setpriv = Array.isArray(plan?.hardening)
    ? plan.hardening.find(item => item.item === 'setpriv' && Array.isArray(item.command) && item.command.length > 0)
    : null
  if (setpriv) argv = [...setpriv.command, '--', ...argv]
  const readOnlyBind = Array.isArray(plan?.hardening)
    ? plan.hardening.find(item => item.item === 'read-only-bind' && item.enabled === true)
    : null
  const mountNamespace = Boolean(readOnlyBind)
  if (mountNamespace) argv = ['sh', '-c', READ_ONLY_WRAPPER, 'sh', ...argv]
  if (plan?.network?.isolated || mountNamespace) {
    const bin = plan?.network?.bin ?? 'unshare'
    argv = [bin, ...unshareArgsFor(plan, mountNamespace), ...argv]
  }
  return argv
}

function groupAlive(pgid, platform) {
  try {
    process.kill(platform === 'win32' ? pgid : -pgid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function waitForGroupExit(pgid, platform, timeoutMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    const tick = () => {
      if (!groupAlive(pgid, platform)) { resolve(true); return }
      if (Date.now() >= deadline) { resolve(false); return }
      setTimeout(tick, 50)
    }
    tick()
  })
}

/** Terminate the child *and its whole process group* (never just the parent). */
export function killProcessTree(pid, { platform = process.platform, signal = 'SIGKILL' } = {}) {
  if (!pid) return { mechanism: 'none', signalled: false, pid: null }
  if (platform === 'win32') {
    const result = spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', timeout: 10_000 })
    return { mechanism: 'taskkill /pid <pid> /T /F', signalled: !result.error && result.status === 0, pid, exitCode: result.status ?? null }
  }
  let signalled = false
  try { process.kill(-pid, signal); signalled = true } catch { /* group already gone */ }
  try { process.kill(pid, signal); signalled = true } catch { /* parent already gone */ }
  return { mechanism: `process-group ${signal}`, signalled, pid, pgid: pid }
}

/**
 * Spawn and supervise one command. On timeout the process group is SIGKILLed
 * and `treeKill.cleared` is verified before resolving.
 */
export function runInProcessTree({
  command,
  args = [],
  cwd = process.cwd(),
  env = sanitizedEnv(),
  timeoutMs = 120_000,
  platform = process.platform,
  maxBufferBytes = 8 * 1024 * 1024,
  killGraceMs = 2_000,
} = {}) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString()
    const t0 = Date.now()
    let child
    try {
      child = spawn(command, args, {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: platform !== 'win32',
        windowsHide: true,
      })
    } catch (error) {
      resolve({
        command: [command, ...args], exitCode: null, signal: null, killed: false, timedOut: false,
        stdout: '', stderr: `spawn error: ${error.message}`, startedAt, endedAt: new Date().toISOString(),
        durationMs: Date.now() - t0, treeKill: null, spawnError: error.message,
      })
      return
    }
    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let timedOut = false
    let treeKill = null
    let settled = false
    let timer = null
    const append = (chunk, stream) => {
      const text = String(chunk)
      if (stream === 'stdout') {
        if (stdoutBytes < maxBufferBytes) stdout += text.slice(0, maxBufferBytes - stdoutBytes)
        stdoutBytes += Buffer.byteLength(text)
      } else {
        if (stderrBytes < maxBufferBytes) stderr += text.slice(0, maxBufferBytes - stderrBytes)
        stderrBytes += Buffer.byteLength(text)
      }
    }
    const finalize = async (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (treeKill) {
        treeKill.cleared = await waitForGroupExit(child.pid, platform, killGraceMs)
      }
      resolve({
        command: [command, ...args],
        exitCode: Number.isInteger(code) ? code : timedOut ? 124 : null,
        signal: signal ?? null,
        killed: Boolean(treeKill),
        timedOut,
        stdout,
        stderr,
        startedAt,
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
        treeKill,
        stdoutTruncated: stdoutBytes > maxBufferBytes,
        stderrTruncated: stderrBytes > maxBufferBytes,
        pid: child.pid ?? null,
      })
    }
    child.stdout?.on('data', (chunk) => append(chunk, 'stdout'))
    child.stderr?.on('data', (chunk) => append(chunk, 'stderr'))
    child.on('error', (error) => {
      stderr += `\n[spawn error] ${error.message}`
      void finalize(null, null)
    })
    child.on('close', (code, signal) => { void finalize(code, signal) })
    timer = setTimeout(() => {
      timedOut = true
      treeKill = killProcessTree(child.pid, { platform })
    }, timeoutMs)
    timer.unref?.()
  })
}

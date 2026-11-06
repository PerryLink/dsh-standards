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
 *   limits   `prlimit --nproc --as` when util-linux prlimit is available; the
 *            probe reads `/proc/self/limits` so only limits that actually took
 *            effect are recorded;
 *   timeout  the child is spawned as its own process-group leader and the
 *            whole group receives SIGKILL, so `dsh` grandchildren die too
 *            (Windows: `taskkill /T /F`).
 *
 * This is containment, not a security boundary: no seccomp, no cgroup memory/
 * pids accounting, no OCI image. Evidence is only allowed to call itself
 * `sandbox` when every item above is effective; any missing item switches the
 * producer to `sandbox-degraded`, which `level-audit` never reports as runtime.
 */
import fs from 'node:fs'
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
})

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
    "console.log(JSON.stringify({ nproc: pick('Max processes'), as: pick('Max address space') }))",
  ].join(';')
}

/**
 * Apply and verify `prlimit --nproc --as`. The probe prints the child's own
 * `/proc/self/limits`, so `applied` lists effects, not intentions.
 */
export function probeLimits({
  platform = process.platform,
  prlimit = 'prlimit',
  nproc = null,
  asBytes = 4 * 1024 ** 3,
  node = process.execPath,
  timeoutMs = 15_000,
} = {}) {
  if (platform === 'win32') {
    return { available: false, degraded: SANDBOX_DEGRADED.prlimit, reason: 'prlimit is a util-linux tool; win32 has no equivalent here', applied: [] }
  }
  const requestedNproc = Number.isFinite(nproc) && nproc > 0 ? Math.trunc(nproc) : defaultNproc()
  const requestedAs = Number.isFinite(asBytes) && asBytes > 0 ? Math.trunc(asBytes) : 4 * 1024 ** 3
  const command = [prlimit, `--nproc=${requestedNproc}`, `--as=${requestedAs}`, '--', node, '-e', readLimitsProbe()]
  const result = spawnSync(prlimit, command.slice(1), {
    encoding: 'utf8', timeout: timeoutMs, env: sanitizedEnv(),
  })
  const exitCode = Number.isInteger(result.status) ? result.status : null
  let observed = null
  try {
    const line = String(result.stdout ?? '').trim().split(/\r?\n/).filter(Boolean).pop()
    observed = line ? JSON.parse(line) : null
  } catch { observed = null }
  const applied = []
  if (observed?.nproc === requestedNproc) applied.push('nproc')
  if (observed?.as === requestedAs) applied.push('as')
  const available = !result.error && exitCode === 0 && applied.length === 2
  return {
    available,
    ...(available ? {} : { degraded: SANDBOX_DEGRADED.prlimit }),
    bin: prlimit,
    nproc: requestedNproc,
    asBytes: requestedAs,
    applied,
    observed,
    probe: {
      command,
      exitCode,
      signal: result.signal ?? null,
      error: probeFailure(result.error),
      stderr: String(result.stderr ?? '').trim().slice(0, 300) || null,
    },
    ...(available ? {} : { reason: 'prlimit did not apply and verify nproc+as' }),
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
    ? { available: false, degraded: SANDBOX_DEGRADED.prlimit, reason: 'rlimits disabled by caller', applied: [] }
    : probeLimits({ platform, prlimit, nproc, asBytes })
  if (!limits.available) degraded.push(limits.degraded ?? SANDBOX_DEGRADED.prlimit)

  const processTreeKill = processTreeKillCapability(platform)
  if (!processTreeKill.available) degraded.push(processTreeKill.degraded ?? SANDBOX_DEGRADED.treeKill)

  const unique = [...new Set(degraded)]
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
    degraded: unique,
    note: 'containment only: no seccomp, no cgroup memory/pids accounting, no OCI image; read access is not restricted',
  }
}

/** Wrap `command args...` in the effective prlimit + unshare prefixes. */
export function sandboxArgv(plan, command, args = []) {
  let argv = [command, ...args]
  if (plan?.limits?.available) {
    argv = [plan.limits.bin, `--nproc=${plan.limits.nproc}`, `--as=${plan.limits.asBytes}`, '--', ...argv]
  }
  if (plan?.network?.isolated) {
    argv = [plan.network.bin, ...plan.network.args, ...argv]
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

#!/usr/bin/env node
/**
 * flow-collect — produce a `dsh-flow-evidence/2` document for one plugin.
 *
 * What it does:
 *   1. bind the subject: name@version from package.json, `npm pack
 *      --ignore-scripts` tarball sha256 + integrity, `git rev-parse HEAD`,
 *      and a deterministic tree sha256 of the package directory;
 *   2. copy the package to a temp dir and run every journey against that copy
 *      only; the original directory is never written;
 *   3. static preflight (`journey.mjs`) for J1-J8, then the runtime probe
 *      (`journey-runtime.mjs`, which runs `dsh plugin add` and boots the tree)
 *      with a temp HOME/DSH_HOME and an allowlisted child env; with
 *      `--sandbox` the runtime probe runs behind `unshare` (network),
 *      `prlimit` (nproc/as), and a process-group timeout that kills the whole
 *      tree. Any missing isolation item makes `producer.kind`
 *      `sandbox-degraded`, which is never runtime;
 *   4. re-hash the original tree and record `subject.treeStable`; a changed
 *      tree invalidates the evidence;
 *   5. write the JSON, per-check logs, the chain hash, and SHA256SUMS.
 *
 * Missing prerequisites (no dsh, no --previous, host compatibility gate
 * rejected the install) are recorded as `blocked` with a reason and exit 0.
 * A failed check exits 1 with the five-element hint: sub-check, command,
 * exitCode, last 20 stderr lines, absolute log path, plus the clause anchor.
 *
 * Usage:
 *   node 40-checker/bin/dsh-flow-collect.mjs --package <dir> [--out flow-evidence.json]
 *     [--logs <dir>] [--previous <dir>] [--dsh <bin>] [--timeout <ms>]
 *     [--static] [--ci] [--sandbox [--sandbox-no-network] [--sandbox-no-limits]
 *     [--sandbox-nproc <n>] [--sandbox-as <bytes>]] [--json]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  FLOW_IDS, FLOW_EVIDENCE_SCHEMA, ciAttribution, clauseAnchor, finalizeEvidence, journeyAggregate,
  sha256File, sha256Value, treeSha256, validateFlowEvidence,
} from '../src/flow-evidence.mjs'
import { sanitizedEnv } from '../src/sandbox-env.mjs'
import {
  assertNoCredentialEnv, buildSandboxPlan, runInProcessTree, sandboxArgv,
} from '../src/sandbox-run.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const JOURNEY_STATIC = path.join(HERE, 'journey.mjs')
const JOURNEY_RUNTIME = path.join(HERE, 'journey-runtime.mjs')
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const GIT = process.platform === 'win32' ? 'git.exe' : 'git'

const STATIC_CHECK_IDS = {
  J1: 'J1.install', J2: 'J2.toggle', J3: 'J3.config', J4: 'J4.first-run',
  J5: 'J5.permissions', J6: 'J6.upgrade', J7: 'J7.observe', J8: 'J8.client',
}
const RUNTIME_JOURNEYS = ['J1', 'J2', 'J4', 'J6']
const STATIC_COMMAND = [process.execPath, path.relative(STD, JOURNEY_STATIC).split(path.sep).join('/'), '--package', '<pkg>', '--json']
const NOT_CLAIMED = [
  'certification', 'security audit', 'official endorsement', 'ranking',
  'real network/browser behavior', 'sandbox confinement (local collector)',
]

function usage() {
  console.log(`flow-collect — collect a ${FLOW_EVIDENCE_SCHEMA} document

Usage:
  node 40-checker/bin/dsh-flow-collect.mjs --package <dir> [options]

Options:
  --package <dir>       plugin/bundle directory to inspect (required)
  --out <file>          evidence JSON (default: ./flow-evidence.json)
  --logs <dir>          log directory (default: <out>.logs)
  --previous <dir>      previous version for J6 upgrade/rollback
  --dsh <bin>           dsh executable (default: dsh / $DSH_BIN)
  --timeout <ms>        per-command budget (default: 120000)
  --static              skip the runtime probe (J1/J2/J4/J6 become static/blocked)
  --ci                  mark producer.kind=ci, claims.claimLevel=ci-attested
                        (CI attribution is also read from GITHUB_* and stays self-declared)
  --sandbox             run the runtime probe under unshare/prlimit/process-group
                        timeout with an allowlisted env; producer.kind=sandbox only
                        when every isolation item is effective (otherwise
                        sandbox-degraded, never runtime)
  --sandbox-no-network  force the degraded path (records unshare-missing)
  --sandbox-no-limits   force the degraded path (records prlimit-missing)
  --sandbox-nproc <n>   RLIMIT_NPROC (default: current task count + headroom)
  --sandbox-as <bytes>  RLIMIT_AS (default: 4 GiB)
  --no-assert-unchanged skip the before/after tree hash comparison (not recommended)
  --json                print the evidence JSON instead of the summary
  --help                show this help

The inspected directory is copied to a temp dir and never written. No
allowBuilds/allow-version is granted. Missing prerequisites are recorded as
blocked and exit 0; a failed check exits 1 with a five-element hint.`)
}

function parse(argv) {
  const out = {
    package: null, out: path.resolve('flow-evidence.json'), logs: null, previous: null,
    dsh: process.env.DSH_BIN || null, timeout: 120_000, static: false, ci: false,
    assertUnchanged: true, json: false,
    sandbox: false, sandboxNoNetwork: false, sandboxNoLimits: false,
    sandboxNproc: null, sandboxAs: 4 * 1024 ** 3,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const next = () => {
      const value = argv[i + 1]
      if (value === undefined) throw new Error(`${argv[i]} needs a value`)
      i += 1
      return value
    }
    const arg = argv[i]
    if (arg === '--package') out.package = next()
    else if (arg === '--out') out.out = path.resolve(next())
    else if (arg === '--logs') out.logs = path.resolve(next())
    else if (arg === '--previous') out.previous = path.resolve(next())
    else if (arg === '--dsh') out.dsh = next()
    else if (arg === '--timeout') out.timeout = Number(next())
    else if (arg === '--static' || arg === '--no-runtime') out.static = true
    else if (arg === '--ci') out.ci = true
    else if (arg === '--sandbox') out.sandbox = true
    else if (arg === '--sandbox-no-network' || arg === '--no-sandbox-network') out.sandboxNoNetwork = true
    else if (arg === '--sandbox-no-limits' || arg === '--no-sandbox-limits') out.sandboxNoLimits = true
    else if (arg === '--sandbox-nproc') out.sandboxNproc = Number(next())
    else if (arg === '--sandbox-as') out.sandboxAs = Number(next())
    else if (arg === '--no-assert-unchanged') out.assertUnchanged = false
    else if (arg === '--json') out.json = true
    else if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
    else throw new Error(`unknown option: ${arg}`)
  }
  if (!out.package) throw new Error('--package is required')
  if (!Number.isFinite(out.timeout) || out.timeout < 1000) throw new Error('--timeout must be >= 1000')
  if (out.sandboxNproc !== null && (!Number.isFinite(out.sandboxNproc) || out.sandboxNproc < 2)) throw new Error('--sandbox-nproc must be >= 2')
  if (!Number.isFinite(out.sandboxAs) || out.sandboxAs < 64 * 1024 * 1024) throw new Error('--sandbox-as must be >= 67108864')
  if (out.sandbox && out.static) throw new Error('--sandbox cannot be combined with --static')
  if (out.sandbox && out.ci) throw new Error('--sandbox cannot be combined with --ci (a sandboxed run is sandbox-attested)')
  return out
}

function nowIso() { return new Date().toISOString() }
function tailLines(text, count = 20) {
  const lines = String(text ?? '').trimEnd().split(/\r?\n/)
  return lines.slice(-count).join('\n')
}
function quoteCommand(command) {
  return command.map(part => (/^[A-Za-z0-9_./:@=+-]+$/.test(part) ? part : `'${String(part).replace(/'/g, "'\\''")}'`)).join(' ')
}

function run(command, args, { cwd, env, timeout = 120_000 } = {}) {
  const startedAt = nowIso()
  const t0 = Date.now()
  const result = spawnSync(command, args, {
    cwd, env, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024, killSignal: 'SIGKILL',
  })
  const endedAt = nowIso()
  return {
    command: [command, ...args],
    exitCode: Number.isInteger(result.status) ? result.status : result.error?.code === 'ETIMEDOUT' ? 124 : 127,
    startedAt,
    endedAt,
    durationMs: Date.now() - t0,
    stdoutText: result.stdout ?? '',
    stderrText: result.stderr ?? '',
    timedOut: result.error?.code === 'ETIMEDOUT',
    error: result.error ? result.error.message : null,
  }
}

function writeLog(logDir, name, text) {
  const file = path.join(logDir, name)
  fs.writeFileSync(file, text ?? '')
  return { file, sha256: sha256Value(text ?? '') }
}

async function main() {
  const options = parse(process.argv.slice(2))
  const pkg = path.resolve(options.package)
  if (!fs.existsSync(path.join(pkg, 'package.json'))) throw new Error(`not a package directory: ${pkg}`)
  const manifest = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'))
  const generatedAt = nowIso()
  const outFile = path.resolve(options.out)
  const outDir = path.dirname(outFile)
  const logDir = path.resolve(options.logs ?? `${outFile}.logs`)
  fs.mkdirSync(outDir, { recursive: true })
  fs.mkdirSync(logDir, { recursive: true })
  const toEvidencePath = file => path.relative(outDir, file).split(path.sep).join('/')
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-flow-collect-'))
  const tmpHome = path.join(tmpRoot, 'home')
  const tmpCache = path.join(tmpRoot, 'npm-cache')
  fs.mkdirSync(tmpHome, { recursive: true })
  fs.mkdirSync(tmpCache, { recursive: true })
  const childEnv = () => sanitizedEnv({
    HOME: tmpHome, DSH_HOME: tmpHome, USERPROFILE: tmpHome, TMPDIR: path.join(tmpRoot, 'tmp'), TEMP: path.join(tmpRoot, 'tmp'), TMP: path.join(tmpRoot, 'tmp'),
    npm_config_cache: tmpCache, npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false',
  })
  // The sandbox is planned before any plugin code runs. `assertNoCredentialEnv`
  // is a hard gate: a surviving token aborts collection instead of booting with it.
  let sandboxPlan = null

  const warnings = []
  try {
    if (options.sandbox) {
      assertNoCredentialEnv(childEnv())
      sandboxPlan = buildSandboxPlan({
        env: childEnv(),
        nproc: options.sandboxNproc,
        asBytes: options.sandboxAs,
        force: { network: options.sandboxNoNetwork, limits: options.sandboxNoLimits },
      })
      sandboxPlan.env = assertNoCredentialEnv(childEnv())
    }
    // 0. Never let our own output/log dirs count as a tree change.
    const treeExclude = []
    for (const candidate of [outFile, logDir]) {
      const rel = path.relative(pkg, candidate)
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) treeExclude.push(rel.split(path.sep).join('/'))
    }
    const before = treeSha256(pkg, { exclude: treeExclude })

    // 1. Read-only copy. Everything below runs against the copy.
    const copy = path.join(tmpRoot, 'package')
    fs.cpSync(pkg, copy, {
      recursive: true,
      dereference: false,
      filter: source => path.basename(source) !== '.git',
    })
    let previousCopy = null
    if (options.previous) {
      const previousSource = path.resolve(options.previous)
      if (!fs.existsSync(path.join(previousSource, 'package.json'))) throw new Error(`not a package directory: ${previousSource}`)
      previousCopy = path.join(tmpRoot, 'previous')
      fs.cpSync(previousSource, previousCopy, { recursive: true, dereference: false, filter: source => path.basename(source) !== '.git' })
    }

    // 2. Subject binding.
    const packed = packSubject(copy, tmpRoot, childEnv, options.timeout)
    const commit = gitCommit(pkg)
    const subject = {
      name: manifest.name,
      version: manifest.version,
      integrity: packed.integrity,
      tarballSha256: packed.tarballSha256,
      commit,
      treeSha256: before.hash,
      treeExclude,
      source: options.ci ? 'ci-checkout' : 'local-directory',
    }

    // 3. Host.
    const dshBin = options.dsh || (process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
    const versionRun = run(dshBin, ['--version'], { env: childEnv(), timeout: 30_000 })
    const dshVersion = versionRun.exitCode === 0 ? versionRun.stdoutText.trim() || null : null
    const host = { dsh: dshVersion, node: process.version, platform: `${process.platform}-${process.arch}` }

    // 4. Static preflight (never imports the plugin).
    const staticChecks = {}
    const staticRun = run(process.execPath, [JOURNEY_STATIC, '--package', copy, '--json'], { env: childEnv(), timeout: options.timeout })
    const staticLog = writeLog(logDir, 'preflight-journey.json', staticRun.stdoutText)
    let staticResult = null
    try { staticResult = JSON.parse(staticRun.stdoutText) } catch { /* handled below */ }
    for (const id of FLOW_IDS) {
      const wanted = STATIC_CHECK_IDS[id]
      const mapped = (staticResult?.checks ?? []).find(check => check.id === wanted) ?? null
      const observed = mapped?.result === 'PASS'
      staticChecks[id] = [{
        id: `${wanted}.preflight`,
        kind: 'static',
        command: STATIC_COMMAND.map(part => (part === '<pkg>' ? pkg : part)),
        exitCode: mapped?.result === 'FAIL' || !mapped ? 1 : 0,
        startedAt: staticRun.startedAt,
        endedAt: staticRun.endedAt,
        stdout: { path: toEvidencePath(staticLog.file), sha256: staticLog.sha256 },
        assertions: [{
          claim: mapped ? `${wanted}: ${mapped.reason}` : `${wanted}: static preflight produced no row`,
          observed,
        }],
      }]
    }
    if (!staticResult) warnings.push(`static preflight produced no JSON (exit ${staticRun.exitCode}); J1-J8 recorded as static preflight failure`)

    // 5. Runtime probe (J1/J2/J4/J6), unless disabled or dsh is missing.
    const runtimeChecks = Object.fromEntries(FLOW_IDS.map(id => [id, []]))
    const runtimeResults = {}
    const blockerReasons = {}
    let runtimeSkipped = null
    if (options.static) runtimeSkipped = 'runtime collection disabled (--static)'
    else if (dshVersion === null) runtimeSkipped = `dsh executable not usable: ${dshBin} (exit ${versionRun.exitCode})`
    let runtimeVerdict = null
    let sandboxExecution = null
    if (runtimeSkipped === null) {
      const args = [JOURNEY_RUNTIME, '--package', copy, '--dsh', dshBin, '--json', '--log-dir', logDir, '--timeout', String(options.timeout)]
      if (previousCopy) args.push('--previous', previousCopy)
      let runtimeRun
      if (sandboxPlan) {
        // journey-runtime spawns `dsh plugin add` and the boot as its own
        // children; they inherit this process group and network namespace.
        const argv = sandboxArgv(sandboxPlan, process.execPath, args)
        runtimeRun = await runInProcessTree({
          command: argv[0],
          args: argv.slice(1),
          cwd: copy,
          env: childEnv(),
          timeoutMs: options.timeout * 2 + 60_000,
        })
        sandboxExecution = {
          command: argv,
          exitCode: runtimeRun.exitCode,
          timedOut: runtimeRun.timedOut,
          killed: runtimeRun.killed,
          spawnError: runtimeRun.spawnError ?? null,
          durationMs: runtimeRun.durationMs,
          pid: runtimeRun.pid ?? null,
          processTree: {
            mechanism: runtimeRun.treeKill?.mechanism ?? sandboxPlan.processTreeKill.mechanism,
            signalled: runtimeRun.treeKill?.signalled ?? null,
            cleared: runtimeRun.treeKill?.cleared ?? null,
          },
        }
        if (runtimeRun.spawnError) {
          // The probe passed but the sandboxed spawn itself failed: do not keep
          // calling this run `sandbox`.
          sandboxPlan.degraded = [...new Set([...sandboxPlan.degraded, 'sandbox-execution-failed'])]
          sandboxPlan.mode = 'sandbox-degraded'
        }
        if (runtimeRun.timedOut) {
          runtimeSkipped = `sandboxed runtime probe timed out after ${options.timeout * 2 + 60_000} ms; whole process tree killed (${sandboxExecution.processTree.mechanism}, cleared=${sandboxExecution.processTree.cleared})`
        }
      } else {
        runtimeRun = run(process.execPath, args, { env: childEnv(), timeout: options.timeout * 2 + 60_000 })
      }
      const stdoutText = runtimeRun.stdoutText ?? runtimeRun.stdout ?? ''
      const stderrText = runtimeRun.stderrText ?? runtimeRun.stderr ?? ''
      writeLog(logDir, 'runtime-journey.json', stdoutText)
      if (stderrText) writeLog(logDir, 'runtime-journey.err.log', stderrText)
      if (runtimeSkipped === null) {
        try {
          runtimeVerdict = JSON.parse(stdoutText)
        } catch {
          runtimeSkipped = `runtime probe produced no JSON (exit ${runtimeRun.exitCode}): ${tailLines(stderrText, 5)}`
        }
      }
      if (runtimeVerdict) {
        for (const check of runtimeVerdict.checks ?? []) {
          const mapped = toEvidenceCheck(check, logDir, toEvidencePath)
          if (!mapped) continue
          const journey = mapped.id.slice(0, 2)
          if (!runtimeChecks[journey]) continue
          runtimeChecks[journey].push(mapped)
          runtimeResults[mapped.id] = check.result
        }
        for (const blocker of runtimeVerdict.blockers ?? []) {
          blockerReasons[blocker.journey] = blockerReasons[blocker.journey] ?? []
          blockerReasons[blocker.journey].push(blocker.reason)
        }
      }
    }
    if (sandboxPlan) {
      writeLog(logDir, 'sandbox-plan.json', JSON.stringify({ ...sandboxPlan, execution: sandboxExecution }, null, 2))
    }
    if (runtimeSkipped !== null) warnings.push(`runtime probe skipped: ${runtimeSkipped}`)

    // 6. Journey statuses + reasons (never upgrade a skip to a pass).
    const journeys = {}
    const hints = []
    for (const id of FLOW_IDS) {
      const checks = [...staticChecks[id], ...runtimeChecks[id]]
      let status
      let reason = null
      if (RUNTIME_JOURNEYS.includes(id)) {
        const results = checks.filter(check => check.kind !== 'static').map(check => runtimeResults[check.id]).filter(Boolean)
        const staticDeclared = staticResult?.checks?.find(check => check.id === STATIC_CHECK_IDS[id])?.result ?? null
        const upstream = id !== 'J1' && blockerReasons.J1?.length
          ? `blocked by J1: ${blockerReasons.J1.join('; ')}`
          : null
        if (runtimeSkipped !== null) {
          status = staticDeclared === 'NA' ? 'na' : staticDeclared === 'FAIL' ? 'fail' : checks.length > 0 ? 'static' : 'blocked'
          if (staticDeclared === 'NA') reason = 'no dsh.client (static preflight NA)'
          else if (staticDeclared === 'FAIL') reason = 'static preflight FAIL'
          else reason = runtimeSkipped
        } else if (blockerReasons[id]?.length) {
          status = 'blocked'
          reason = blockerReasons[id].join('; ')
        } else if (id === 'J6' && !previousCopy) {
          status = 'blocked'
          reason = 'no --previous package supplied; upgrade/rollback not exercised'
        } else if (results.includes('FAIL')) {
          status = 'fail'
          reason = `${results.filter(item => item === 'FAIL').length} runtime check(s) failed`
        } else if (results.includes('BLOCKED')) {
          status = 'blocked'
          reason = 'runtime probe reported BLOCKED'
        } else if (results.includes('WARN')) {
          status = 'warn'
          reason = 'runtime probe reported WARN (does not count as pass)'
        } else if (upstream) {
          status = 'blocked'
          reason = upstream
        } else if (results.length === 0 || results.every(item => item === 'not-run')) {
          status = 'not-run'
          reason = 'runtime probe did not cover this journey'
        } else {
          status = journeyAggregate(checks)
          if (status !== 'pass' && status !== 'fail') reason = `checks aggregate to ${status}`
        }
      } else {
        status = journeyAggregate(checks)
        if (id === 'J8' && staticResult?.checks?.find(check => check.id === 'J8.client')?.result === 'NA') status = 'na'
        if (status === 'static') reason = 'static preflight only; not a runtime pass'
      }
      const journey = { status, checks }
      if (reason) journey.reason = reason
      if (id === 'J8' && status === 'na') journey.limitations = ['no dsh.client: server-only shape is expected']
      journeys[id] = journey
      if (status === 'fail') collectHints(id, checks, hints, outDir, logDir, toEvidencePath)
      else if (status === 'blocked') hints.push(`BLOCKED ${id} — 前置缺失: ${reason ?? 'unknown'}\n  条款锚: ${clauseAnchor(id)}`)
    }

    // 7. The inspected tree must be unchanged; the copy is disposed afterwards.
    const after = options.assertUnchanged ? treeSha256(pkg, { exclude: treeExclude }) : null
    const treeStable = after ? after.hash === before.hash : true
    subject.treeStable = treeStable
    if (after) subject.treeSha256After = after.hash
    if (!treeStable) warnings.push(`package tree changed during collection (before ${before.hash}, after ${after.hash}); evidence is not trustworthy`)

    // 8. Assemble, chain, validate.
    const statuses = FLOW_IDS.map(id => journeys[id].status)
    const counts = statuses.reduce((acc, status) => {
      acc[status] = (acc[status] ?? 0) + 1
      return acc
    }, {})
    const conclusion = statuses.includes('fail') || !treeStable
      ? 'flow-fail'
      : statuses.includes('blocked') ? 'flow-blocked' : statuses.every(status => status === 'pass') ? 'flow-pass' : 'flow-warn'
    const producerCommand = [process.execPath, path.relative(STD, fileURLToPath(import.meta.url)).split(path.sep).join('/'), ...process.argv.slice(2)]
    const sandboxExecuted = Boolean(sandboxExecution)
    const sandboxKind = sandboxPlan && sandboxExecuted
      ? (sandboxPlan.degraded.length === 0 ? 'sandbox' : 'sandbox-degraded')
      : null
    const producerKind = sandboxKind ?? (options.ci ? 'ci' : 'local')
    const notClaimed = [...NOT_CLAIMED]
    if (sandboxKind === 'sandbox') {
      const localIndex = notClaimed.findIndex(item => item.startsWith('sandbox confinement'))
      if (localIndex >= 0) notClaimed.splice(localIndex, 1)
      notClaimed.push('OCI/container image, seccomp, and cgroup memory/pids limits (not implemented)', 'signature (not produced)')
    } else if (sandboxKind === 'sandbox-degraded') {
      notClaimed.push(`sandbox confinement (degraded: ${sandboxPlan.degraded.join(', ')})`)
    }
    const claimLevel = sandboxKind === 'sandbox' ? 'sandbox-attested' : options.ci ? 'ci-attested' : 'self-attested'
    const method = sandboxKind === 'sandbox'
      ? 'sandboxed collector: allowlisted env (no tokens), temporary HOME/DSH_HOME, network+user namespace, prlimit nproc/as, process-group SIGKILL timeout'
      : sandboxKind === 'sandbox-degraded'
        ? `sandboxed collector DEGRADED (${sandboxPlan.degraded.join(', ')}): allowlisted env, temporary HOME/DSH_HOME, process-group SIGKILL timeout; every missing isolation item is recorded`
        : 'local-collector: read-only copy, allowlisted child env, no allowBuilds, no exemption'
    const sandbox = sandboxPlan ? { ...sandboxPlan, executed: sandboxExecuted, execution: sandboxExecution } : null
    // CI attribution is display-only and self-declared. It is recorded from the
    // runner environment even without --ci; it never upgrades the claim level.
    const ci = ciAttribution()
    const ciFields = ci ? Object.fromEntries(Object.entries(ci).filter(([, value]) => value !== null)) : {}
    const document = finalizeEvidence({
      schema: FLOW_EVIDENCE_SCHEMA,
      generatedAt,
      producer: {
        command: producerCommand,
        at: generatedAt,
        kind: producerKind,
        runner: sandboxPlan ? 'flow-collect/2-sandbox' : 'flow-collect/1',
        ...ciFields,
      },
      ...(sandbox ? { sandbox } : {}),
      subject,
      host,
      journeys,
      claims: { claimLevel, notClaimed, method },
      conclusion,
    })
    const verdict = validateFlowEvidence(document)
    fs.writeFileSync(outFile, `${JSON.stringify(document, null, 2)}\n`)

    // 9. SHA256SUMS for the logs (the evidence file itself is listed too).
    const sums = []
    for (const name of fs.readdirSync(logDir).sort()) {
      const file = path.join(logDir, name)
      if (!fs.statSync(file).isFile()) continue
      sums.push(`${sha256File(file).slice('sha256:'.length)}  ${toEvidencePath(file)}`)
    }
    sums.push(`${sha256File(outFile).slice('sha256:'.length)}  ${path.basename(outFile)}`)
    fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), `${sums.join('\n')}\n`)

    // 10. Report.
    if (options.json) {
      process.stdout.write(`${JSON.stringify(document, null, 2)}\n`)
    } else {
      const lines = [
        `FLOW evidence: ${outFile}`,
        `  schema   : ${document.schema}`,
        `  subject  : ${subject.name}@${subject.version}`,
        `             integrity=${subject.integrity ?? 'null'} tarball=${subject.tarballSha256}`,
        `             tree=${subject.treeSha256} stable=${treeStable}${after ? ` after=${after.hash}` : ''}`,
        `             commit=${subject.commit ?? 'null'}`,
        `  host     : dsh=${host.dsh ?? 'null'} node=${host.node} platform=${host.platform}`,
        `  journeys : ${FLOW_IDS.map(id => `${id}=${journeys[id].status}`).join(' ')}`,
        `  totals   : ${JSON.stringify(counts)}`,
        `  conclusion: ${conclusion}`,
        `  chain    : ${document.chain.evidenceHash}`,
        ...(sandboxPlan ? [
          `  sandbox  : ${sandboxPlan.mode}${sandboxPlan.degraded.length > 0 ? ` degraded=[${sandboxPlan.degraded.join(', ')}]` : ''}`,
          `             env=${sandboxPlan.env.policy} tokens-absent=${sandboxPlan.env.absent} network=${sandboxPlan.network.isolated ? sandboxPlan.network.mechanism : 'off'} limits=${sandboxPlan.limits.available ? sandboxPlan.limits.applied.join('+') : 'off'} home=${sandboxPlan.home.isolated ? 'temp' : 'real'}`,
          `             execution=${sandboxExecuted ? `exit=${sandboxExecution.exitCode} timedOut=${sandboxExecution.timedOut} killed=${sandboxExecution.killed} treeCleared=${sandboxExecution.processTree.cleared}` : 'not-run'}`,
        ] : []),
        `  logs     : ${logDir} (+ ${path.join(outDir, 'SHA256SUMS')})`,
        sandboxKind === 'sandbox'
          ? 'Claims: sandbox-attested (containment only; no OCI image, seccomp, cgroup, signature); not a certification or security audit.'
          : sandboxKind === 'sandbox-degraded'
            ? `Claims: self-attested; sandbox DEGRADED (${sandboxPlan.degraded.join(', ')}). Degraded evidence is never FLOW runtime.`
            : 'Claims: self-attested structure + binding only; no certification, no security audit, not a sandbox.',
      ]
      if (warnings.length > 0) {
        lines.push('Warnings:')
        for (const warning of warnings) lines.push(`  - ${warning}`)
      }
      if (hints.length > 0) {
        lines.push('Journey hints (five elements + clause anchor):')
        for (const hint of hints) lines.push(hint)
      }
      lines.push(`Next: node 40-checker/scripts/level-audit.mjs ${pkg} --flow-evidence ${outFile} --format json`)
      process.stdout.write(`${lines.join('\n')}\n`)
    }
    if (!verdict.valid) {
      for (const error of verdict.errors) console.error(`flow-collect: evidence invalid: ${error}`)
      process.exitCode = 3
    } else {
      process.exitCode = conclusion === 'flow-fail' ? 1 : 0
    }
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

function packSubject(copy, tmpRoot, childEnv, timeout) {
  const destination = fs.mkdtempSync(path.join(tmpRoot, 'pack-'))
  const runResult = run(NPM, ['pack', '--ignore-scripts', '--json', '--pack-destination', destination], { cwd: copy, env: childEnv(), timeout })
  if (runResult.exitCode !== 0) {
    throw new Error(`npm pack failed (exit ${runResult.exitCode}): ${tailLines(runResult.stderrText, 10)}`)
  }
  let parsed
  try { parsed = JSON.parse(runResult.stdoutText) } catch {
    throw new Error(`npm pack did not print JSON: ${tailLines(runResult.stdoutText, 5)}`)
  }
  const info = Array.isArray(parsed) ? parsed[0] : parsed
  if (!info?.filename) throw new Error('npm pack did not report a tarball filename')
  const tarball = path.join(destination, info.filename)
  return {
    integrity: typeof info.integrity === 'string' ? info.integrity : null,
    tarballSha256: sha256File(tarball),
    files: Array.isArray(info.files) ? info.files.length : null,
    filename: info.filename,
  }
}

function gitCommit(dir) {
  const result = run(GIT, ['-C', dir, 'rev-parse', 'HEAD'], { env: sanitizedEnv(), timeout: 10_000 })
  const commit = result.exitCode === 0 ? result.stdoutText.trim() : ''
  return /^[0-9a-f]{40}$/.test(commit) ? commit : null
}

/** Map one journey-runtime check to the v2 check shape (null = not evidence). */
function toEvidenceCheck(check, logDir, toEvidencePath) {
  if (!check || !Array.isArray(check.command) || check.command.length === 0) return null
  if (!Number.isInteger(check.exitCode)) return null
  if (!check.startedAt || !check.endedAt) return null
  if (!check.stdout?.path) return null
  const output = {
    id: check.id,
    kind: 'observed',
    command: check.command,
    exitCode: check.exitCode,
    startedAt: check.startedAt,
    endedAt: check.endedAt,
    stdout: { path: toEvidencePath(path.join(logDir, check.stdout.path)), sha256: check.stdout.sha256 },
    assertions: Array.isArray(check.assertions) && check.assertions.length > 0
      ? check.assertions.map(assertion => ({ claim: String(assertion.claim), observed: assertion.observed === true }))
      : [{ claim: String(check.reason ?? check.id), observed: check.result === 'PASS' }],
  }
  if (check.stderrLog?.path && check.stderrLog?.sha256) {
    output.stderr = { path: toEvidencePath(path.join(logDir, check.stderrLog.path)), sha256: check.stderrLog.sha256 }
  }
  if (Number.isFinite(check.durationMs)) output.durationMs = check.durationMs
  return output
}

/** The fixed five elements + clause anchor. */
function collectHints(journeyId, checks, hints, outDir, logDir, toEvidencePath) {
  const failing = checks.filter(check => check.exitCode !== 0)
  for (const check of failing) {
    const logFiles = [check.stderr?.path, check.stdout?.path].filter(Boolean)
    const absolute = logFiles.map(rel => path.resolve(outDir, rel))
    const stderrAbs = check.stderr?.path ? path.resolve(outDir, check.stderr.path) : null
    let stderrTail = ''
    if (stderrAbs) {
      try { stderrTail = tailLines(fs.readFileSync(stderrAbs, 'utf8'), 20) } catch { /* keep empty */ }
    }
    const lines = [
      `FAIL ${check.id}`,
      `  1) 子检查: ${check.id}`,
      `  2) 命令: ${quoteCommand(check.command)}`,
      `  3) exitCode: ${check.exitCode}`,
      `  4) stderr(末20行): ${stderrTail ? `\n${stderrTail.split('\n').map(line => `     ${line}`).join('\n')}` : '(empty)'}`,
      `  5) 日志: ${absolute.join(', ') || '(no log written)'}`,
      `  条款锚: ${clauseAnchor(check.id) ?? journeyId}`,
    ]
    hints.push(lines.join('\n'))
  }
}

main().catch(error => {
  console.error(`flow-collect: ${error.message}`)
  process.exitCode = 3
})

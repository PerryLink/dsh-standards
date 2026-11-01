#!/usr/bin/env node
/**
 * M2 runner (MVP): execute one package's L1-L3 in an isolated child process.
 *
 * This is NOT a security sandbox. It isolates the checker from the developer's
 * real DSH_HOME/profile and kills the process tree on timeout; it does not
 * restrict the child's filesystem or network. The standard's M2 contract
 * (50 §5) still needs a container/image for untrusted packages.
 *
 * Usage:
 *   node scripts/m2-runner.mjs \
 *     --package /tmp/dsh-host/plugins/ci-diet \
 *     --runtime <dsh-checkout>/vendor/cordis/lib/index.js \
 *     --runtime-version 0.2.2-alpha.2 \
 *     --out results/m2/ci-diet.json
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

function parse(argv) {
  const options = {
    package: null, runtime: null, runtimeVersion: '0.2.2-alpha.2', cordisVersion: '4.0.6-alpha.1',
    timeoutMs: 60_000, out: null, keep: false, json: false, modules: null, backend: 'process', image: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--package') options.package = argv[++i]
    else if (arg === '--runtime') options.runtime = argv[++i]
    else if (arg === '--runtime-version') options.runtimeVersion = argv[++i]
    else if (arg === '--cordis-version') options.cordisVersion = argv[++i]
    else if (arg === '--timeout') options.timeoutMs = Number(argv[++i])
    else if (arg === '--out') options.out = argv[++i]
    else if (arg === '--keep') options.keep = true
    else if (arg === '--modules') options.modules = argv[++i]
    else if (arg === '--backend') options.backend = argv[++i]
    else if (arg === '--image') options.image = argv[++i]
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') { console.log('usage: node scripts/m2-runner.mjs --package <dir> --runtime <cordis-lib> [--backend process|unshare|landlock|unshare-landlock] [--image ref@sha256:<64hex>] [--out level.json]'); process.exit(0) }
    else throw new Error(`unknown option: ${arg}`)
  }
  if (!options.package) throw new Error('--package is required')
  if (!options.runtime) throw new Error('--runtime is required')
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000) throw new Error('--timeout must be >= 1000 ms')
  if (!['process', 'unshare', 'landlock', 'unshare-landlock'].includes(options.backend)) throw new Error('--backend must be process, unshare, landlock, or unshare-landlock')
  if (options.image && !/^[^@\s]+@sha256:[0-9a-f]{64}$/.test(options.image)) throw new Error('--image must be ref@sha256:<64 hex>')
  return options
}

function killTree(child, signal = 'SIGKILL') {
  if (!child.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try { process.kill(-child.pid, signal) } catch { try { child.kill(signal) } catch { /* gone */ } }
}

function runChecker(command, args, cwd, env, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let killed = false
    const timer = setTimeout(() => { killed = true; killTree(child) }, timeoutMs)
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', error => { clearTimeout(timer); resolve({ code: null, stdout, stderr: `${stderr}${error.message}`, killed }) })
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr, killed }) })
  })
}

function linkModules(pkg, modules) {
  if (!modules) return 0
  const source = path.resolve(modules)
  if (!fs.existsSync(source)) throw new Error(`--modules not found: ${source}`)
  const target = path.join(pkg, 'node_modules')
  fs.mkdirSync(target, { recursive: true })
  let linked = 0
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name)
    const to = path.join(target, entry.name)
    if (entry.isDirectory() && entry.name.startsWith('@')) {
      fs.mkdirSync(to, { recursive: true })
      for (const child of fs.readdirSync(from, { withFileTypes: true })) {
        const dest = path.join(to, child.name)
        if (fs.existsSync(dest)) continue
        try { fs.symlinkSync(path.join(from, child.name), dest, process.platform === 'win32' ? 'junction' : 'dir'); linked += 1 } catch { /* skip */ }
      }
    } else if (!fs.existsSync(to)) {
      try { fs.symlinkSync(from, to, process.platform === 'win32' ? 'junction' : 'dir'); linked += 1 } catch { /* skip */ }
    }
  }
  return linked
}

function ensureLandlock() {
  const source = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'landlock-exec.c')
  const binary = path.join(os.tmpdir(), 'dsh-landlock-exec')
  try {
    const sourceStat = fs.statSync(source)
    const binaryStat = fs.statSync(binary, { throwIfNoEntry: false })
    if (binaryStat && binaryStat.mtimeMs >= sourceStat.mtimeMs) return binary
  } catch { /* compile below */ }
  const result = spawnSync('cc', ['-O2', source, '-o', binary], { stdio: 'inherit' })
  if (result.error || result.status !== 0) throw new Error('cannot build landlock-exec (need a C compiler)')
  return binary
}

function mapStatus(report) {
  const status = report?.conclusion?.status
  if (status === 'pass') return 'verified'
  if (status === 'warn') return 'verified-warn'
  if (status === 'fail') return 'failed'
  return 'inconclusive'
}

async function main() {
  const options = parse(process.argv.slice(2))
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-m2-'))
  const home = path.join(root, 'home')
  const work = path.join(root, 'work')
  const pkg = path.join(root, 'package')
  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(work, { recursive: true })
  fs.cpSync(path.resolve(options.package), pkg, { recursive: true, dereference: false, filter: source => !source.includes(`${path.sep}.git${path.sep}`) })
  const linkedModules = linkModules(pkg, options.modules)
  const reportPath = path.join(work, 'report.json')
  const cli = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'bin', 'dsh-plugin-verify.mjs')
  const args = [cli, pkg, '--format', 'json', '--treat-as-plugin', '--runtime', path.resolve(options.runtime), '--runtime-version', options.runtimeVersion, '--cordis-version', options.cordisVersion, '--out', reportPath]
  const env = {
    ...process.env,
    DSH_HOME: home,
    HOME: home,
    USERPROFILE: home,
    TMPDIR: path.join(root, 'tmp'),
    TEMP: path.join(root, 'tmp'),
    TMP: path.join(root, 'tmp'),
  }
  fs.mkdirSync(env.TMPDIR, { recursive: true })
  const started = Date.now()
  const needsLandlock = options.backend === 'landlock' || options.backend === 'unshare-landlock'
  const needsUnshare = options.backend === 'unshare' || options.backend === 'unshare-landlock'
  const landlock = needsLandlock ? ensureLandlock() : null
  const command = needsUnshare ? 'unshare' : needsLandlock ? landlock : process.execPath
  const commandArgs = []
  if (needsUnshare) {
    commandArgs.push('-Urn', '--fork', '--pid', '--mount-proc')
    if (needsLandlock) commandArgs.push(landlock)
  }
  if (needsLandlock) commandArgs.push('--rw', home, '--rw', work, '--rw', env.TMPDIR, '--')
  commandArgs.push(process.execPath, ...args)
  const result = await runChecker(command, commandArgs, work, env, options.timeoutMs)
  const elapsedMs = Date.now() - started
  let report = null
  try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) } catch { /* report missing */ }
  const imageUnverified = Boolean(options.image)
  const status = result.killed || imageUnverified ? 'inconclusive' : mapStatus(report)
  const level = {
    schema: 'dsh-m2-level/1',
    status,
    standard: report?.standard ?? { id: 'DS-C', version: '1.0.0' },
    subject: report?.subject ?? { name: null, version: null, path: path.resolve(options.package) },
    anchor: report?.anchor ?? null,
    coverage: report?.coverage ?? null,
    conclusion: report?.conclusion ?? null,
    m1: { coverage: report?.coverage ?? null, conclusion: report?.conclusion ?? null },
    reason: imageUnverified ? 'image metadata is unverified; M2 cannot assert verified' : undefined,
    sandbox: {
      runner: 'm2-runner/1',
      node: process.version,
      timeoutMs: options.timeoutMs,
      elapsedMs,
      killed: result.killed,
      exitCode: result.code,
      isolatedHome: true,
      backend: options.backend,
      networkNamespace: needsUnshare,
      fsWriteRestricted: needsLandlock,
      securityBoundary: false,
      containment: options.backend === 'unshare-landlock'
        ? 'landlock-fs+network-namespace+process'
        : options.backend === 'landlock'
          ? 'landlock-fs+process'
          : options.backend === 'unshare'
            ? 'network-namespace+process'
            : 'none',
      linkedModules,
      image: options.image ? { reference: options.image.split('@')[0], digest: `sha256:${options.image.split('@sha256:')[1]}`, verified: false, assertion: 'unverified-metadata', reason: 'OCI/Docker backend not enabled; metadata only; cannot yield verified' } : null,
      note: needsLandlock
        ? 'Landlock restricts writes to HOME/TMP/cwd; read is allowed everywhere. Network isolation only with unshare-landlock.'
        : needsUnshare
          ? 'user+network namespace + process isolation; no filesystem write restriction'
          : 'process isolation only; no filesystem/network restriction',
    },
    checks: report?.checks ?? [],
    stderr: result.stderr.slice(0, 4000),
    ranAt: new Date().toISOString(),
  }
  if (!options.keep) fs.rmSync(root, { recursive: true, force: true })
  const output = JSON.stringify(level, null, 2)
  if (options.out) {
    const out = path.resolve(options.out)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, output)
  }
  if (options.json || !options.out) process.stdout.write(`${output}\n`)
  const exit = status === 'verified' || status === 'verified-warn' ? 0 : status === 'failed' ? 1 : 2
  process.exitCode = exit
}

main().catch(error => { console.error(`m2-runner: ${error.message}`); process.exitCode = 3 })

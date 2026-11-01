#!/usr/bin/env node
/**
 * entry18-web.mjs — boot one ENTRY sample in the REAL DSH web profile and
 * inspect the target rows of the composed loader tree.
 *
 * This is the "real web runner" for the 18/18 rich-profile experiment. It differs
 * from `bundle-smoke --web`: the web app's launcher provides `webStartup`,
 * `cmdlineArgs`, `webApp`, `fileUploads`, and `connection`, so the target rows
 * can actually activate. The install is a manual profile symlink (not
 * `dsh plugin add`) so the experiment does not depend on pnpm; that deviation is
 * recorded in the row.
 *
 * Evidence is a row JSON only. The launch token printed by the web app is
 * redacted from stdout/stderr and never written to the row.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STANDARDS = path.resolve(HERE, '..', '..')
const DEFAULT_OUT = path.join(STANDARDS, '40-checker', 'results', 'entry', '18', 'realweb')

function usage() {
  console.log(`usage: node 40-checker/scripts/entry18-web.mjs --id <id> --spec <spec> --pkg <name> [options]

  --id <id>            result id (manifest id)
  --spec <spec>        npm spec (pkg@version) or github:owner/repo#ref
  --pkg <name>         expected package name
  --version <v>        expected package version (optional)
  --out <dir>          result directory (default: 40-checker/results/entry/18/realweb)
  --dsh-root <dir>     installed @deepseek-ai/dsh package root
  --port <n>           web port (default: 18000 + pid % 1000)
  --boot-timeout <ms>  web boot budget (default 240000)
  --keep-work          keep the temp profile/package (debug)
  --help               show this help`)
}

function parseArgs(argv) {
  const options = {
    id: null, spec: null, pkg: null, version: null, out: DEFAULT_OUT,
    dshRoot: null, port: 18000 + (process.pid % 1000),
    bootTimeout: 240_000, keepWork: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[++i]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      return value
    }
    if (arg === '--id') options.id = next()
    else if (arg === '--spec') options.spec = next()
    else if (arg === '--pkg') options.pkg = next()
    else if (arg === '--version') options.version = next()
    else if (arg === '--out') options.out = path.resolve(next())
    else if (arg === '--dsh-root') options.dshRoot = path.resolve(next())
    else if (arg === '--port') options.port = Number(next())
    else if (arg === '--boot-timeout') options.bootTimeout = Number(next())
    else if (arg === '--keep-work') options.keepWork = true
    else if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (!options.id || !options.spec || !options.pkg) throw new Error('--id, --spec and --pkg are required')
  if (!Number.isFinite(options.port) || options.port < 1 || options.port > 65535) throw new Error('--port must be 1-65535')
  if (!Number.isFinite(options.bootTimeout) || options.bootTimeout < 30_000) throw new Error('--boot-timeout must be >= 30000')
  return options
}

function redact(text) {
  return String(text ?? '')
    .replace(/([?&]token=)[^&\s]+/g, '$1<redacted>')
    .replace(/(密码\s*[:：]\s*).*/g, '$1<redacted>')
}

// Redact the launch token and any bootstrap password from every stream.
for (const stream of [process.stdout, process.stderr]) {
  const write = stream.write.bind(stream)
  stream.write = (chunk, ...args) => write(redact(chunk), ...args)
}

function run(command, args, { cwd, timeout, env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    timeout,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', ...env },
  })
  return {
    status: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function defaultDshRoot() {
  const root = run('npm', ['root', '-g'], { timeout: 60_000 })
  if (root.status !== 0) throw new Error(`npm root -g failed: ${root.stderr.trim()}`)
  return path.join(root.stdout.trim(), '@deepseek-ai', 'dsh')
}

function fetchGithub(spec, destination) {
  const match = /^github:([^#]+)(?:#(.+))?$/.exec(spec)
  if (!match) throw new Error(`unsupported github spec: ${spec}`)
  const repo = match[1]
  const ref = match[2]
  const url = `https://github.com/${repo}.git`
  const clone = run('git', ['clone', '--depth', '1', url, destination], { timeout: 240_000 })
  if (clone.status !== 0) throw new Error(`git clone ${repo} failed: ${(clone.stderr || clone.stdout).trim().slice(-800)}`)
  if (ref) {
    const head = run('git', ['rev-parse', 'HEAD'], { cwd: destination })
    if (head.status !== 0 || head.stdout.trim() !== ref) {
      const fetch = run('git', ['fetch', '--depth', '1', 'origin', ref], { cwd: destination, timeout: 240_000 })
      if (fetch.status !== 0) throw new Error(`git fetch ${ref} failed: ${(fetch.stderr || fetch.stdout).trim().slice(-800)}`)
      const checkout = run('git', ['checkout', '--detach', 'FETCH_HEAD'], { cwd: destination })
      if (checkout.status !== 0) throw new Error(`git checkout ${ref} failed: ${(checkout.stderr || checkout.stdout).trim().slice(-800)}`)
    }
  }
  return { source: 'github', resolved: ref ?? 'default-branch' }
}

function fetchNpm(spec, work, destination) {
  const pack = run('npm', ['pack', spec, '--pack-destination', work, '--json'], { timeout: 300_000 })
  if (pack.status !== 0) throw new Error(`npm pack ${spec} failed: ${(pack.stderr || pack.stdout).trim().slice(-800)}`)
  let filename
  try {
    const parsed = JSON.parse(pack.stdout)
    filename = (Array.isArray(parsed) ? parsed.at(-1) : parsed)?.filename
  } catch {
    throw new Error(`npm pack ${spec} returned unparseable JSON`)
  }
  if (!filename) throw new Error(`npm pack ${spec} did not report a filename`)
  const tarball = path.join(work, filename)
  if (!fs.existsSync(tarball)) throw new Error(`npm pack ${spec} reported a missing tarball`)
  fs.mkdirSync(destination, { recursive: true })
  const extract = run('tar', ['-xzf', tarball, '-C', destination, '--strip-components=1'], { timeout: 120_000 })
  if (extract.status !== 0) throw new Error(`tar extraction failed: ${(extract.stderr || extract.stdout).trim().slice(-800)}`)
  return { source: 'npm', resolved: spec, tarball: filename }
}

function targetRows(pkgDir, manifest, loadOverlayPatches, composeEntries) {
  const patch = manifest.dsh?.bundle?.patch
  if (!patch) throw new Error('package has no dsh.bundle.patch')
  const patches = (Array.isArray(patch) ? patch : [patch])
    .map((file) => path.resolve(pkgDir, file))
    .flatMap((file) => loadOverlayPatches('dsh', file))
  const composed = composeEntries([patches])
  return {
    ids: new Set(composed.filter((row) => row.id).map((row) => row.id)),
    names: new Set(composed.filter((row) => typeof row.name === 'string').map((row) => row.name)),
    composed: composed.length,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const startedAt = new Date().toISOString()
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-entry18-web-'))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-entry18-home-'))
  process.env.DSH_HOME = home
  let ctx
  let shutdown
  let row = {
    schema: 'dsh-entry18-web/1',
    id: options.id,
    name: options.pkg,
    version: options.version,
    spec: options.spec,
    profile: 'web',
    method: {
      runner: 'real-dsh-web-profile',
      install: 'manual-profile-symlink',
      base: 'dsh-base/cordis.patch.yml',
      web: 'dsh-web-app/cordis.patch.yml',
      args: ['--no-open', `--port`, String(options.port)],
    },
    environment: { node: process.version, platform: process.platform, dshVersion: null },
    startedAt,
    finishedAt: null,
    elapsedMs: null,
    status: 'error',
    verdict: null,
    compatibility: null,
    compatibilityError: null,
    targetRows: 0,
    active: 0,
    rows: [],
    entries: 0,
    notClaimed: ['UI correctness', 'security', 'production readiness', 'official endorsement'],
    error: null,
  }
  try {
    const dshRoot = options.dshRoot ?? defaultDshRoot()
    const profileBoot = path.join(dshRoot, 'lib', 'profile-boot.js')
    const appBoot = path.join(dshRoot, '..', 'dsh-app-boot', 'lib', 'index.js')
    if (!fs.existsSync(profileBoot)) throw new Error(`not a DSH install: ${profileBoot}`)

    const pkgDir = path.join(work, 'pkg')
    const fetched = options.spec.startsWith('github:')
      ? fetchGithub(options.spec, pkgDir)
      : fetchNpm(options.spec, work, pkgDir)
    const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
    if (manifest.name !== options.pkg) throw new Error(`installed package name ${manifest.name} != ${options.pkg}`)
    if (options.version && manifest.version !== options.version) throw new Error(`installed version ${manifest.version} != ${options.version}`)
    row.version = manifest.version
    row.source = fetched.source
    row.artifact = fetched


    // Standalone install: strip dev-only specs/scripts, never run third-party scripts.
    const rewrite = []
    if (manifest.devDependencies) { delete manifest.devDependencies; rewrite.push('devDependencies') }
    if (manifest.scripts) { delete manifest.scripts; rewrite.push('scripts') }
    if (rewrite.length) fs.writeFileSync(path.join(pkgDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    row.method.manifestRewrite = rewrite.length ? `removed ${rewrite.join('+')}` : 'none'
    const install = run('npm', ['install', '--omit=dev', '--ignore-scripts', '--legacy-peer-deps', '--no-package-lock', '--no-audit', '--no-fund'], { cwd: pkgDir, timeout: 300_000 })
    if (install.status !== 0) throw new Error(`npm install in sample failed: ${(install.stderr || install.stdout).trim().slice(-800)}`)

    const { prepareProfile, runProfile } = await import(profileBoot)
    const { loadOverlayPatches, composeEntries, loadLayeredEnv, evaluatePluginCompatibility, getDshRuntimeVersion } = await import(appBoot)

    // G2 is the host compatibility gate. The manual install bypasses `dsh plugin add`,
    // so evaluate it explicitly; a reject stays `verified-gate-reject`, not clean.
    try {
      row.compatibility = evaluatePluginCompatibility(manifest, {}, getDshRuntimeVersion()) === undefined ? 'admit' : 'reject'
    } catch (error) {
      row.compatibility = 'error'
      row.compatibilityError = error.message
    }
    const profile = prepareProfile('wr', true, 'web')
    const dest = path.join(profile.dir, 'node_modules', ...options.pkg.split('/'))
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.symlinkSync(pkgDir, dest, 'dir')
    const profilePkgPath = path.join(profile.dir, 'package.json')
    const profilePkg = JSON.parse(fs.readFileSync(profilePkgPath, 'utf8'))
    profilePkg.dependencies = { ...(profilePkg.dependencies || {}), [options.pkg]: `file:${pkgDir}` }
    profilePkg.dsh.profile.bundles = [...new Set([...(profilePkg.dsh.profile.bundles || []), options.pkg])]
    fs.writeFileSync(profilePkgPath, `${JSON.stringify(profilePkg, null, 2)}\n`)

    const targets = targetRows(pkgDir, manifest, loadOverlayPatches, composeEntries)
    row.targetRows = targets.ids.size
    row.targetNames = targets.names.size

    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`web boot exceeded ${options.bootTimeout}ms`)), options.bootTimeout)
    })
    let booted
    try {
      booted = await Promise.race([
        runProfile({
          environment: loadLayeredEnv('dsh'),
          profile: 'wr',
          patchFiles: [],
          args: ['--no-open', '--port', String(options.port)],
        }),
        timeout,
      ])
    } finally {
      clearTimeout(timer)
    }
    ctx = booted.ctx
    shutdown = booted.shutdown
    row.environment.dshVersion = ctx.get?.('profileContext')?.version ?? null

    const entries = [...ctx.loader.entries()]
    row.entries = entries.length
    row.rows = entries
      .filter((entry) => [...targets.ids].some((id) => entry.id === id || String(entry.id).endsWith(`:${id}`)) || targets.names.has(entry.name))
      .map((entry) => ({ id: entry.id, name: entry.name, state: entry.fiber?.state ?? null, disabled: entry.disabled === true }))
    row.active = row.rows.filter((entry) => entry.state === 2 || entry.disabled).length
    row.status = row.rows.length > 0 && row.active === row.rows.length
      ? 'verified'
      : row.rows.length > 0 ? 'partial' : 'failed'
    row.verdict = row.status === 'verified' && row.compatibility === 'reject' ? 'verified-gate-reject' : row.status
    if (row.status === 'partial') row.error = { stage: 'target-rows', message: 'some target rows did not activate' }
    if (row.status === 'failed') row.error = { stage: 'target-rows', message: 'no target rows found in the booted tree' }
  } catch (error) {
    row.status = 'blocked'
    row.error = { stage: 'runner', message: redact(error.message) }
  } finally {
    row.finishedAt = new Date().toISOString()
    row.elapsedMs = Date.now() - Date.parse(startedAt)
    try { await shutdown?.shutdown(0) } catch { /* best effort */ }
    try { await ctx?.fiber?.dispose?.() } catch { /* best effort */ }
    fs.mkdirSync(options.out, { recursive: true })
    fs.writeFileSync(path.join(options.out, `${options.id}.json`), `${JSON.stringify(row, null, 2)}\n`)
    if (!options.keepWork) {
      try { fs.rmSync(home, { recursive: true, force: true }) } catch { /* best effort */ }
      try { fs.rmSync(work, { recursive: true, force: true }) } catch { /* best effort */ }
    }
    console.log(`[${options.id}] ${row.status} targetRows=${row.targetRows} active=${row.active} entries=${row.entries} ${row.elapsedMs}ms`)
  }
  return row.status === 'blocked' ? 3 : 0
}

try {
  process.exit(await main())
} catch (error) {
  console.error(`entry18-web: ${error.message}`)
  process.exit(3)
}

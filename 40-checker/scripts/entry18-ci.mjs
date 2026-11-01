#!/usr/bin/env node
/**
 * entry18-ci.mjs — reproducible base- or web-layer G0–G3 runtime evidence for
 * the 18 ENTRY packages.
 *
 * One invocation serves one CI matrix shard (`--only <id>`), or all shards in
 * sequence on a developer machine (`--all`). The script is zero-dependency:
 * it only shells out to `npm`, `git`, `tar` and `node`, which exist on the
 * GitHub Actions Ubuntu runner.
 *
 * Farm layout (a real directory, deleted after every package):
 *
 *   <farm>/node_modules/<entry>       symlink -> <dsh>/node_modules/<entry>
 *   <farm>/plugins/<id>               published tarball or git clone
 *   <farm>/node_modules/<pkg-name>    symlink -> ../plugins/<id>
 *
 * Keeping `<farm>/node_modules` a real directory matters: symlinking the whole
 * directory makes npm write into the global DSH install.
 *
 * Install policy: the copied package.json is first stripped of devDependencies
 * and scripts (published dev-only `workspace:*` specs and dev peer pins break a
 * standalone install), then `npm install --omit=dev --ignore-scripts
 * --legacy-peer-deps --no-package-lock --no-audit --no-fund` runs. No install
 * script from a third-party package is ever executed.
 *
 * Usage:
 *   node 40-checker/scripts/entry18-ci.mjs --only <id>
 *   node 40-checker/scripts/entry18-ci.mjs --all
 *   node 40-checker/scripts/entry18-ci.mjs --summary
 *
 * Options:
 *   --only <id>                  run one shard (id from samples/entry18.json)
 *   --all                        run every shard sequentially
 *   --summary                    do not boot; aggregate existing rows
 *   --out <dir>                  result directory (default: 40-checker/results/entry/18/fullbase)
 *   --farm <dir>                 farm directory (default: <tmp>/dsh-entry18-farm-<pid>)
 *   --dsh-root <dir>             installed @deepseek-ai/dsh package root
 *                                (default: `<npm root -g>/@deepseek-ai/dsh`)
 *   --web [patch]                also apply the web layer (default: @deepseek-ai/dsh-web-app/cordis.patch.yml)
 *   --expected-dsh-version <v>   fail before booting when the installed version differs
 *   --fixture <mode>             auto | published-tarball | git-clone (default: auto)
 *   --smoke-timeout <ms>         bundle-smoke boot budget (default: 150000)
 *   --install-timeout <ms>       npm install budget (default: 300000)
 *   --fetch-timeout <ms>         npm pack / git clone budget (default: 300000)
 *   --keep-farm                  keep the farm after the shard (debug only)
 *   --verbose                    echo captured command output to stdout
 *
 * Exit codes:
 *   0  a JSON row was written (verified / partial / failed)
 *   2  bad usage
 *   3  the row could not be produced (preflight or runner error)
 *
 * The script never upgrades a boot result: `status` is either the G3 state
 * reported by bundle-smoke or "error". Only a real all-rows-ACTIVE boot can
 * produce "verified".
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const MANIFEST_PATH = path.join(STD, '40-checker', 'samples', 'entry18.json')
const SMOKE_SCRIPT = path.join(STD, '40-checker', 'scripts', 'bundle-smoke.mjs')
const DEFAULT_OUT = path.join(STD, '40-checker', 'results', 'entry', '18', 'fullbase')
const HOST_ENTRY = path.join('@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js')
const BASE_PATCH = path.join('@deepseek-ai', 'dsh-base', 'cordis.patch.yml')
const WEB_PATCH = path.join('@deepseek-ai', 'dsh-web-app', 'cordis.patch.yml')
const FARM_MARKER = '.entry18-farm'
const MAX_LOG_BYTES = 4 * 1024 * 1024
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function usage() {
  console.log(`usage: node 40-checker/scripts/entry18-ci.mjs --only <id> | --all | --summary [options]

  --only <id>                  run one shard from 40-checker/samples/entry18.json
  --all                        run every shard sequentially
  --summary                    aggregate existing <id>.json rows (no boot)
  --out <dir>                  result dir (default: 40-checker/results/entry/18/fullbase)
  --farm <dir>                 farm dir (default: <tmp>/dsh-entry18-farm-<pid>)
  --dsh-root <dir>             @deepseek-ai/dsh package root (default: <npm root -g>/@deepseek-ai/dsh)
  --web [patch]                also apply the web layer (default: @deepseek-ai/dsh-web-app/cordis.patch.yml)
  --expected-dsh-version <v>   refuse to run on a different installed DSH version
  --fixture <mode>             auto | published-tarball | git-clone
  --smoke-timeout <ms>         bundle-smoke boot budget (default 150000)
  --install-timeout <ms>       npm install budget (default 300000)
  --fetch-timeout <ms>         npm pack / git clone budget (default 300000)
  --keep-farm                  keep the farm (debug)
  --verbose                    echo command output`)
}

function parseArgs(argv) {
  const options = {
    only: null, all: false, summary: false,
    out: DEFAULT_OUT, farm: null, dshRoot: null,
    expectedDshVersion: null, fixture: 'auto', web: null,
    smokeTimeout: 150_000, installTimeout: 300_000, fetchTimeout: 300_000,
    keepFarm: false, verbose: false,
  }
  const numeric = { '--smoke-timeout': 'smokeTimeout', '--install-timeout': 'installTimeout', '--fetch-timeout': 'fetchTimeout' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[++i]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      return value
    }
    if (arg === '--only') options.only = next()
    else if (arg === '--all') options.all = true
    else if (arg === '--summary') options.summary = true
    else if (arg === '--out') options.out = path.resolve(next())
    else if (arg === '--farm') options.farm = path.resolve(next())
    else if (arg === '--dsh-root') options.dshRoot = path.resolve(next())
    else if (arg === '--web') {
      const value = argv[i + 1]
      if (value !== undefined && !value.startsWith('-')) {
        options.web = path.resolve(value)
        i += 1
      } else {
        options.web = 'auto'
      }
    }
    else if (arg === '--expected-dsh-version') options.expectedDshVersion = next()
    else if (arg === '--fixture') options.fixture = next()
    else if (arg === '--keep-farm') options.keepFarm = true
    else if (arg === '--verbose') options.verbose = true
    else if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
    else if (numeric[arg]) {
      const value = Number(next())
      if (!Number.isFinite(value) || value < 1000) throw new Error(`${arg} must be >= 1000`)
      options[numeric[arg]] = value
    } else throw new Error(`unknown option: ${arg}`)
  }
  if (['auto', 'published-tarball', 'git-clone'].includes(options.fixture) === false) throw new Error(`--fixture must be auto, published-tarball or git-clone`)
  const selected = [options.only !== null, options.all, options.summary].filter(Boolean).length
  if (selected === 0) { usage(); process.exit(2) }
  if (selected > 1) throw new Error('choose exactly one of --only, --all, --summary')
  return options
}

function tail(text, limit = 600) {
  const clean = String(text ?? '').trim()
  return clean.length <= limit ? clean : `…${clean.slice(-limit)}`
}

function run(command, args, { cwd, timeout, env } = {}) {
  const startedAt = Date.now()
  const result = spawnSync(command, args, {
    cwd,
    timeout,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    killSignal: 'SIGKILL',
    env: {
      ...process.env,
      NO_COLOR: '1',
      npm_config_update_notifier: 'false',
      // Bound registry waits so one unresponsive metadata request cannot wedge
      // a shard past its job timeout.
      npm_config_fetch_timeout: '60000',
      npm_config_fetch_retries: '2',
      ...env,
    },
  })
  return {
    command,
    args,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut: result.error?.code === 'ETIMEDOUT',
    error: result.error ? result.error.message : null,
    elapsedMs: Math.max(0, Date.now() - startedAt),
  }
}

function describeRun(result) {
  if (result.timedOut) return `timed out after ${result.elapsedMs}ms`
  if (result.error) return result.error
  return `exit ${result.status ?? `signal ${result.signal}`}`
}

function logSection(lines, label, result) {
  lines.push(`[${label}] $ ${result.command} ${result.args.join(' ')}`)
  lines.push(`[${label}] ${describeRun(result)} (${result.elapsedMs}ms)`)
  if (result.stdout.trim()) lines.push(`[${label}:stdout]\n${result.stdout.trimEnd()}`)
  if (result.stderr.trim()) lines.push(`[${label}:stderr]\n${result.stderr.trimEnd()}`)
}

function writeAtomic(file, content) {
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, content)
  fs.renameSync(tmp, file)
}

function writeJson(file, value) {
  writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`)
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

// Global installs may keep the package's dependencies nested under the package
// (the Windows 0.2.1 layout) or hoist them next to it (a local `npm install`
// layout, and usually `npm install -g` on Linux). Resolve both, never assume.
function inspectDshRoot(dir) {
  try {
    const manifest = readJson(path.join(dir, 'package.json'))
    if (typeof manifest.version !== 'string') return null
    const candidates = [
      path.join(dir, 'node_modules'),
      path.dirname(path.dirname(dir)),
    ]
    for (const depsRoot of candidates) {
      const appBoot = path.join(depsRoot, HOST_ENTRY)
      const basePatch = path.join(depsRoot, BASE_PATCH)
      if (fs.existsSync(appBoot) && fs.existsSync(basePatch)) {
        return { dir, version: manifest.version, depsRoot, appBoot, basePatch }
      }
    }
    return null
  } catch {
    return null
  }
}

function resolveDshRoot(explicit) {
  if (explicit) {
    const layout = inspectDshRoot(explicit)
    if (!layout) throw new Error(`--dsh-root ${explicit} is not an installed @deepseek-ai/dsh package root (or its dependencies are not resolvable)`)
    return layout
  }
  const npmRoot = run(NPM, ['root', '-g'], { timeout: 60_000 })
  if (npmRoot.status !== 0) throw new Error(`npm root -g failed: ${tail(npmRoot.stderr)}`)
  const candidate = path.join(npmRoot.stdout.trim(), '@deepseek-ai', 'dsh')
  const layout = inspectDshRoot(candidate)
  if (!layout) {
    throw new Error(`cannot find @deepseek-ai/dsh under ${npmRoot.stdout.trim()}; install it globally or pass --dsh-root`)
  }
  return layout
}

function assertFarmOwned(dir) {
  if (!fs.existsSync(dir)) return
  if (!fs.existsSync(path.join(dir, FARM_MARKER))) {
    throw new Error(`refusing to delete ${dir}: it exists but has no ${FARM_MARKER} marker`)
  }
}

function removeFarm(dir) {
  assertFarmOwned(dir)
  fs.rmSync(dir, { recursive: true, force: true })
}

function prepareFarm(dir, depsRoot) {
  assertFarmOwned(dir)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'plugins'), { recursive: true })
  fs.writeFileSync(path.join(dir, FARM_MARKER), `dsh-entry18 farm\ncreatedAt=${new Date().toISOString()}\n`)
  const source = depsRoot
  let linked = 0
  for (const entry of fs.readdirSync(source)) {
    const target = path.join(source, entry)
    const destination = path.join(dir, 'node_modules', entry)
    const isDirectory = fs.statSync(target).isDirectory()
    try {
      if (process.platform === 'win32') fs.symlinkSync(target, destination, isDirectory ? 'junction' : 'file')
      else fs.symlinkSync(target, destination, isDirectory ? 'dir' : 'file')
    } catch (error) {
      throw new Error(`cannot link ${entry} into the farm: ${error.message}`)
    }
    linked += 1
  }
  return linked
}

function ensureScopeDir(farmDir, scope) {
  const destination = path.join(farmDir, 'node_modules', scope)
  let stat
  try { stat = fs.lstatSync(destination) } catch { fs.mkdirSync(destination, { recursive: true }); return }
  if (!stat.isSymbolicLink()) return
  // A host scope was linked as one symlink. Turn it into a real directory so
  // the sample can join that scope without writing through into the host.
  const target = path.resolve(path.dirname(destination), fs.readlinkSync(destination))
  fs.unlinkSync(destination)
  fs.mkdirSync(destination)
  for (const entry of fs.readdirSync(target)) {
    const source = path.join(target, entry)
    const link = path.join(destination, entry)
    if (process.platform === 'win32') fs.symlinkSync(source, link, fs.statSync(source).isDirectory() ? 'junction' : 'file')
    else fs.symlinkSync(source, link)
  }
}

function linkPlugin(farmDir, packageDir, name) {
  const parts = name.split('/')
  if (parts.length === 2) ensureScopeDir(farmDir, parts[0])
  const parent = path.join(farmDir, 'node_modules', ...parts.slice(0, -1))
  fs.mkdirSync(parent, { recursive: true })
  const destination = path.join(parent, parts.at(-1))
  try { fs.unlinkSync(destination) } catch { /* absent */ }
  const target = process.platform === 'win32' ? packageDir : path.relative(parent, packageDir)
  fs.symlinkSync(target, destination, process.platform === 'win32' ? 'junction' : 'dir')
}

function npmView(name, version) {
  const result = run(NPM, ['view', `${name}@${version}`, 'version', 'repository.url', '--json'], { timeout: 120_000 })
  if (result.status !== 0) return null
  try {
    const parsed = JSON.parse(result.stdout)
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    const row = rows.at(-1)
    // `npm view <pkg>@<v> version repository.url --json` returns a bare string
    // when only the version field exists (no repository metadata), not an object.
    if (typeof row === 'string') return row === version ? { version: row, repository: null } : null
    if (!row || typeof row !== 'object') return null
    if (row.version !== version) return null
    return { version: row.version, repository: row['repository.url'] ?? null }
  } catch {
    return null
  }
}

function normalizeRepo(value) {
  if (!value) return null
  let url = String(value).trim()
  url = url.replace(/^git\+/, '').replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, '').replace(/\/+$/, '')
  const match = url.match(/github\.com[/:]([^/]+)\/([^/]+)$/i)
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null
}

function fixturePlan(row, mode) {
  if (row.source === 'npm') {
    return { kind: 'published-tarball', reason: 'source=npm: the registry tarball is the installable artifact' }
  }
  if (mode === 'published-tarball') return { kind: 'published-tarball', reason: 'forced by --fixture published-tarball' }
  if (mode === 'git-clone') return { kind: 'git-clone', reason: 'forced by --fixture git-clone' }
  const published = npmView(row.name, row.version)
  if (!published) return { kind: 'git-clone', reason: `no published npm tarball at ${row.name}@${row.version}` }
  const repo = normalizeRepo(published.repository)
  if (!repo) return { kind: 'published-tarball', reason: `published tarball exists and has no GitHub repository field to contradict ${row.spec}` }
  if (repo === row.spec.toLowerCase()) {
    return { kind: 'published-tarball', reason: `published tarball repository matches ${row.spec}`, publishedRepository: published.repository }
  }
  return {
    kind: 'git-clone',
    reason: `published tarball repository ${repo} does not match ${row.spec}`,
    publishedRepository: published.repository,
  }
}

function fetchTarball(row, farmDir, tmpDir, options, lines) {
  const destination = path.join(farmDir, 'plugins', row.id)
  fs.mkdirSync(destination, { recursive: true })
  const spec = `${row.name}@${row.version}`
  const pack = run(NPM, ['pack', spec, '--pack-destination', tmpDir, '--json'], { timeout: options.fetchTimeout })
  logSection(lines, 'npm-pack', pack)
  if (pack.status !== 0) throw new Error(`npm pack ${spec} failed: ${tail(pack.stderr || pack.stdout)}`)
  let filename
  try {
    const parsed = JSON.parse(pack.stdout)
    filename = (Array.isArray(parsed) ? parsed.at(-1) : parsed)?.filename
  } catch {
    throw new Error(`npm pack ${spec} returned unparseable JSON`)
  }
  if (!filename) throw new Error(`npm pack ${spec} did not report a tarball filename`)
  const tarball = path.join(tmpDir, filename)
  if (!fs.existsSync(tarball)) throw new Error(`npm pack ${spec} reported ${filename} but the file is missing`)
  const extract = run('tar', ['-xzf', tarball, '-C', destination, '--strip-components=1'], { timeout: options.fetchTimeout })
  logSection(lines, 'tar-extract', extract)
  if (extract.status !== 0) throw new Error(`tar extraction of ${filename} failed: ${tail(extract.stderr)}`)
  return { kind: 'published-tarball', spec, tarball: filename, packageDir: destination }
}

function cloneRepo(row, farmDir, options, lines) {
  const destination = path.join(farmDir, 'plugins', row.id)
  const url = `https://github.com/${row.spec}.git`
  const clone = run('git', ['clone', '--depth', '1', url, destination], { timeout: options.fetchTimeout })
  logSection(lines, 'git-clone', clone)
  if (clone.status !== 0) throw new Error(`git clone ${row.spec} failed: ${tail(clone.stderr)}`)
  return { kind: 'git-clone', spec: row.spec, url, packageDir: destination }
}

function extractSmoke(stdout) {
  const marker = '"schema": "dsh-bundle-smoke/1"'
  const markerIndex = stdout.lastIndexOf(marker)
  if (markerIndex < 0) return null
  const start = stdout.lastIndexOf('{', markerIndex)
  if (start < 0) return null
  try { return JSON.parse(stdout.slice(start).trim()) } catch { return null }
}

function writeLog(outDir, id, lines) {
  let text = `${lines.join('\n')}\n`
  if (Buffer.byteLength(text) > MAX_LOG_BYTES) {
    text = `${text.slice(0, MAX_LOG_BYTES)}\n…[truncated to ${MAX_LOG_BYTES} bytes]…\n`
  }
  fs.writeFileSync(path.join(outDir, `${id}.log`), text)
}

function baseRow(row, context) {
  return {
    schema: context.webPatch ? 'dsh-entry18-web/1' : 'dsh-entry18-fullbase/1',
    id: row.id,
    name: row.name,
    version: row.version,
    source: row.source,
    spec: row.spec,
    profile: context.webPatch ? 'web' : 'base',
    base: { layer: 'dsh-base/cordis.patch.yml', webLayer: Boolean(context.webPatch), webLayerPath: context.webPatch ?? null },
    environment: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local',
    dshVersion: context.dshVersion,
    dshVersionExpected: context.options.expectedDshVersion,
    host: {
      packageRoot: context.layout.dir,
      depsRoot: context.layout.depsRoot,
      appBoot: context.layout.appBoot,
      basePatch: context.layout.basePatch,
      webPatch: context.webPatch ?? null,
    },
    startedAt: context.startedAt,
    finishedAt: null,
    elapsedMs: null,
    fixture: 'none',
    artifact: null,
    installScripts: 'skipped',
    installCommand: 'npm install --omit=dev --ignore-scripts --legacy-peer-deps --no-package-lock --no-audit --no-fund',
    manifestRewrite: 'none',
    install: null,
    status: 'error',
    verdict: null,
    g3State: null,
    g3Rows: null,
    g3Active: null,
    compatibility: null,
    exitCode: null,
    smoke: null,
    error: null,
  }
}

function runShard(row, options, context) {
  const startedAt = context.startedAt
  const lines = []
  lines.push(`# entry18 ${context.webPatch ? 'web' : 'fullbase'} shard: ${row.id}`)
  lines.push(`# name=${row.name} version=${row.version} source=${row.source} spec=${row.spec}`)
  lines.push(`# dshVersion=${context.dshVersion} profile=${context.webPatch ? 'web' : 'base'} webLayer=${Boolean(context.webPatch)} environment=${process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local'}`)
  lines.push(`# startedAt=${startedAt}`)
  const record = baseRow(row, context)
  // A shard that dies before writing must not leave an older row behind for
  // `--summary` or a CI artifact upload to pick up as fresh evidence.
  for (const extension of ['json', 'log']) {
    fs.rmSync(path.join(options.out, `${row.id}.${extension}`), { force: true })
  }
  const farmDir = options.farm ?? path.join(os.tmpdir(), `dsh-entry18-farm-${process.pid}`)
  let artifactTmp = null
  try {
    const linked = prepareFarm(farmDir, context.layout.depsRoot)
    lines.push(`[farm] ${farmDir} (${linked} host entries linked, marker=${FARM_MARKER})`)
    artifactTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-entry18-artifact-'))
    const plan = fixturePlan(row, options.fixture)
    lines.push(`[fixture] plan=${plan.kind} reason=${plan.reason}`)
    const fetched = plan.kind === 'published-tarball'
      ? fetchTarball(row, farmDir, artifactTmp, options, lines)
      : cloneRepo(row, farmDir, options, lines)
    const packageDir = fetched.packageDir
    const manifest = readJson(path.join(packageDir, 'package.json'))
    const versionMatches = manifest.version === row.version
    const nameMatches = manifest.name === row.name
    record.fixture = fetched.kind
    record.artifact = {
      requested: row.source === 'npm' ? `${row.name}@${row.version}` : row.spec,
      resolved: fetched.kind,
      reason: plan.reason,
      manifestName: manifest.name,
      manifestVersion: manifest.version,
      versionMatches,
      nameMatches,
      publishedRepository: plan.publishedRepository ?? null,
      tarball: fetched.tarball ?? null,
      repository: fetched.url ?? null,
    }
    if (!nameMatches) throw new Error(`artifact package name ${manifest.name} does not match ${row.name}`)
    if (!versionMatches) lines.push(`[fixture] WARNING manifest version ${manifest.version} != requested ${row.version}`)
    if (!manifest.dsh?.bundle?.patch) throw new Error('artifact manifest has no dsh.bundle.patch')
    lines.push(`[fixture] packageDir=${packageDir} manifest=${manifest.name}@${manifest.version} bundle=${JSON.stringify(manifest.dsh.bundle.patch)}`)

    // Dev-only `workspace:*` specs and dev peer pins make a published package
    // unresolvable when installed standalone (EUNSUPPORTEDPROTOCOL/ERESOLVE).
    // Runtime needs neither, so strip them before installing. The rewrite is
    // recorded in the row; the shipped tarball itself is not modified.
    const rewriteKeys = []
    if (manifest.devDependencies) rewriteKeys.push('devDependencies')
    if (manifest.scripts) rewriteKeys.push('scripts')
    if (rewriteKeys.length > 0) {
      delete manifest.devDependencies
      delete manifest.scripts
      fs.writeFileSync(path.join(packageDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
      record.manifestRewrite = `removed ${rewriteKeys.join('+')}`
    }
    lines.push(`[manifest] rewrite=${record.manifestRewrite}`)

    const installArgs = ['install', '--omit=dev', '--ignore-scripts', '--legacy-peer-deps', '--no-package-lock', '--no-audit', '--no-fund']
    const install = run(NPM, installArgs, { cwd: packageDir, timeout: options.installTimeout })
    record.install = {
      command: `npm ${installArgs.join(' ')}`,
      status: install.status === 0 ? 'ok' : 'failed',
      elapsedMs: install.elapsedMs,
      scripts: 'skipped',
    }
    logSection(lines, 'npm-install', install)
    if (install.status !== 0) throw new Error(`npm install in ${path.basename(packageDir)} failed: ${tail(install.stderr || install.stdout)}`)

    linkPlugin(farmDir, packageDir, row.name)
    lines.push(`[link] ${path.join('node_modules', row.name)} -> ${packageDir}`)

    const smokeArgs = [
      SMOKE_SCRIPT,
      '--package', packageDir,
      '--host', context.layout.appBoot,
      '--base', context.layout.basePatch,
      ...(context.webPatch ? ['--web', context.webPatch] : []),
      '--bare', `${farmDir}${path.sep}`,
      '--timeout', String(options.smokeTimeout),
      '--json',
    ]
    const smokeRun = run(process.execPath, smokeArgs, { timeout: options.smokeTimeout + 120_000 })
    logSection(lines, 'bundle-smoke', smokeRun)
    record.exitCode = smokeRun.status
    const smoke = extractSmoke(smokeRun.stdout)
    if (!smoke) {
      const reason = smokeRun.timedOut
        ? `bundle-smoke exceeded its ${options.smokeTimeout + 120_000}ms process budget`
        : tail(smokeRun.stderr || smokeRun.stdout, 400) || describeRun(smokeRun)
      record.error = { stage: smokeRun.timedOut ? 'smoke-timeout' : 'smoke', message: reason }
      record.status = 'error'
      record.verdict = 'error'
      record.finishedAt = new Date().toISOString()
      return record
    }
    record.smoke = smoke
    record.g3State = smoke.g3?.state ?? null
    record.g3Rows = Array.isArray(smoke.g3?.rows) ? smoke.g3.rows.length : null
    record.g3Active = smoke.g3?.active ?? null
    record.compatibility = smoke.g2?.compatibility ?? null
    record.status = ['verified', 'partial', 'failed'].includes(smoke.g3?.state) ? smoke.g3.state : 'error'
    // G2 is reported, not enforced, by bundle-smoke: a package can boot while
    // the host version gate would reject it. Keep that distinction visible.
    record.verdict = record.status === 'verified'
      ? (record.compatibility === 'reject' ? 'verified-gate-reject' : 'verified')
      : record.status
    if (record.status === 'error') record.error = { stage: 'smoke-result', message: `unexpected g3.state ${JSON.stringify(smoke.g3?.state)}` }
    if (record.status === 'failed') record.error = { stage: 'g3-failed', message: 'target rows did not activate' }
    record.finishedAt = new Date().toISOString()
    return record
  } catch (error) {
    record.status = 'error'
    record.verdict = 'error'
    record.error = { stage: record.fixture === 'none' ? 'fixture' : 'setup', message: error.message }
    record.finishedAt = new Date().toISOString()
    lines.push(`[error] ${error.message}`)
    return record
  } finally {
    record.elapsedMs = Date.now() - Date.parse(startedAt)
    if (!record.finishedAt) record.finishedAt = new Date().toISOString()
    if (!options.keepFarm) {
      try { removeFarm(farmDir) } catch (error) { lines.push(`[farm] cleanup failed: ${error.message}`) }
    }
    if (artifactTmp) {
      try { fs.rmSync(artifactTmp, { recursive: true, force: true }) } catch { /* best effort */ }
    }
    try { writeLog(options.out, row.id, lines) } catch { /* log is evidence, not a gate */ }
  }
}

function summarize(manifest, outDir, targetDshVersion, requestedProfile = 'base') {
  const rows = manifest.rows.map((row) => {
    const file = path.join(outDir, `${row.id}.json`)
    if (!fs.existsSync(file)) {
      return { id: row.id, name: row.name, version: row.version, source: row.source, profile: null, status: 'missing', fixture: null, g3State: null, targetRows: null, active: null, elapsedMs: null, error: null }
    }
    const record = readJson(file)
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      source: row.source,
      profile: record.profile ?? null,
      status: record.status,
      verdict: record.verdict ?? record.status,
      fixture: record.fixture,
      g3State: record.g3State,
      targetRows: record.g3Rows,
      active: record.g3Active,
      elapsedMs: record.elapsedMs,
      dshVersion: record.dshVersion,
      error: record.error,
    }
  })
  const counts = { verified: 0, partial: 0, failed: 0, error: 0, missing: 0 }
  const verdicts = {}
  for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
    verdicts[row.verdict ?? row.status] = (verdicts[row.verdict ?? row.status] ?? 0) + 1
  }
  const dshVersions = [...new Set(rows.map((row) => row.dshVersion).filter(Boolean))]
  const profiles = new Set(rows.map((row) => row.profile).filter(Boolean))
  const profile = profiles.has('web') ? 'web' : profiles.has('base') ? 'base' : requestedProfile
  return {
    schema: profile === 'web' ? 'dsh-entry18-web-summary/1' : 'dsh-entry18-fullbase-summary/1',
    generatedAt: new Date().toISOString(),
    profile,
    note: profile === 'web'
      ? 'Aggregates the <id>.json rows present in this directory with the web layer; a missing row is not a pass.'
      : 'Aggregates the <id>.json rows present in this directory. Run the entry18-runtime workflow to fill all 18 shards.',
    targetDshVersion,
    dshVersions,
    count: rows.length,
    present: rows.length - counts.missing,
    missing: counts.missing,
    status: counts,
    verdicts,
    rows,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const manifest = readJson(MANIFEST_PATH)
  if (manifest.rows.length !== 18) throw new Error(`manifest has ${manifest.rows.length} rows, expected 18`)
  if (options.summary) {
    fs.mkdirSync(options.out, { recursive: true })
    const summary = summarize(manifest, options.out, manifest.targetDshVersion, options.web ? 'web' : 'base')
    writeJson(path.join(options.out, 'summary.json'), summary)
    console.log(`summary: ${summary.present}/${summary.count} rows present, status=${JSON.stringify(summary.status)}, verdicts=${JSON.stringify(summary.verdicts)}`)
    return 0
  }

  const layout = resolveDshRoot(options.dshRoot)
  const dshVersion = layout.version
  if (options.expectedDshVersion && dshVersion !== options.expectedDshVersion) {
    throw new Error(`installed DSH is ${dshVersion}, expected ${options.expectedDshVersion}`)
  }
  const webPatch = options.web
    ? (options.web === 'auto' ? path.join(layout.depsRoot, WEB_PATCH) : options.web)
    : null
  if (webPatch && !fs.existsSync(webPatch)) throw new Error(`web patch not found: ${webPatch}`)
  const selected = options.all
    ? manifest.rows
    : [manifest.rows.find((row) => row.id === options.only) ?? (() => { throw new Error(`unknown id: ${options.only}`) })()]
  fs.mkdirSync(options.out, { recursive: true })
  console.log(`entry18 ${webPatch ? 'web' : 'fullbase'}: ${selected.length} shard(s), dsh ${dshVersion} at ${layout.dir}`)
  console.log(`deps root: ${layout.depsRoot}`)
  console.log(`base: ${layout.basePatch}`)
  console.log(webPatch ? `web layer: ${webPatch}` : 'web layer: none')

  let exitCode = 0
  for (const row of selected) {
    const record = runShard(row, options, { layout, dshVersion, options, webPatch, startedAt: new Date().toISOString() })
    writeJson(path.join(options.out, `${row.id}.json`), record)
    const verdict = record.status === 'error'
      ? `error(${record.error?.stage}: ${record.error?.message})`
      : `${record.status} fixture=${record.fixture} rows=${record.g3Active}/${record.g3Rows}`
    console.log(`[${row.id}] ${verdict} ${record.elapsedMs}ms -> ${path.join(options.out, `${row.id}.json`)}`)
    if (record.status === 'error') exitCode = 3
  }
  if (options.all) {
    const summary = summarize(manifest, options.out, manifest.targetDshVersion, webPatch ? 'web' : 'base')
    writeJson(path.join(options.out, 'summary.json'), summary)
    console.log(`summary: ${summary.present}/${summary.count} rows, status=${JSON.stringify(summary.status)}, verdicts=${JSON.stringify(summary.verdicts)}`)
  }
  return exitCode
}

try {
  process.exitCode = await main()
} catch (error) {
  console.error(`entry18-ci: ${error.message}`)
  process.exitCode = 3
}

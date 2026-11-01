#!/usr/bin/env node
/**
 * FLOW real-package CI: run J1/J2/J4 (+J6 when a previous version is supplied)
 * on a small representative slice of 40-checker/samples/entry18.json.
 *
 * What this script does, exactly:
 *   1. npm sample    -> `npm pack <name>@<version>`, extract to /tmp/flow-sample/<id>
 *      GitHub sample -> `git clone --depth 1`, HEAD/commit recorded
 *   2. dependencies  -> `npm install --omit=dev --ignore-scripts --legacy-peer-deps
 *                       --no-package-lock` (only when the manifest has dependencies)
 *   3. journey       -> `node 40-checker/scripts/journey-runtime.mjs --package <dir>
 *                       --dsh <bin> --json` (plus `--previous <dir>` for ci-diet)
 *   4. gate sample   -> a preflight `dsh plugin add` only; a compatibility rejection is
 *                       recorded as BLOCKED. This script NEVER calls allow-version and
 *                       never grants an exemption.
 *
 * Saved to 40-checker/results/flow/real/<id>.json plus `index.json`.
 *
 * Usage:
 *   node 40-checker/scripts/flow-sample-ci.mjs [--only id,id] [--refresh]
 *        [--dsh <bin>] [--out <dir>] [--timeout ms]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const SAMPLE_BASE = '/tmp/flow-sample'
const CACHE = path.join(SAMPLE_BASE, '_cache')
const JOURNEY = path.join(STD, '40-checker/scripts/journey-runtime.mjs')
const DEFAULT_DSH = process.env.DSH_BIN || 'dsh'
const REAL = path.join(STD, '40-checker/results/flow/real')

const SAMPLES = [
  {
    id: 'ci-diet', name: 'dsh-ci-diet', version: '0.5.2', source: 'npm', spec: 'dsh-ci-diet@0.5.2',
    why: 'simple npm bundle',
    previous: { spec: 'dsh-ci-diet@0.5.1', dir: 'ci-diet-v0.5.1', version: '0.5.1' },
  },
  {
    id: 'DDDMUC__dsh-free-search', name: 'dsh-free-search', version: '0.9.26', source: 'github', spec: 'DDDMUC/dsh-free-search',
    why: 'GitHub bundle',
  },
  {
    id: 'ui-auth', name: 'dsh-ui-auth', version: '0.7.1', source: 'npm', spec: 'dsh-ui-auth@0.7.1',
    why: 'bundle with a client',
  },
  {
    id: 'telemetry', name: 'dsh-telemetry-redactor', version: '0.1.0', source: 'npm', spec: 'dsh-telemetry-redactor@0.1.0',
    why: 'expected host compatibility-gate rejection', gate: 'expect-reject',
  },
  {
    id: 'YuJunZhiXue__dsh-purge', name: 'dsh-purge', version: '1.1.85', source: 'github', spec: 'YuJunZhiXue/dsh-purge',
    why: 'postinstall/profile behavior', j1Partial: true, j2Partial: true, layerProbe: true,
  },
  {
    id: 'daily-log', name: '@zzerx/dsh-plugin-daily-log', version: '0.4.3', source: 'npm', spec: '@zzerx/dsh-plugin-daily-log@0.4.3',
    why: 'second wave: scoped npm plugin',
  },
  {
    id: 'project-memory', name: '@yolk_vat-y/dsh-project-memory', version: '0.6.7', source: 'npm', spec: '@yolk_vat-y/dsh-project-memory@0.6.7',
    why: 'second wave: scoped npm plugin',
  },
  {
    id: 'qiushi', name: 'qiushi-dsh-evidence-audit', version: '0.1.0', source: 'npm', spec: 'qiushi-dsh-evidence-audit@0.1.0',
    why: 'second wave: evidence-oriented plugin',
  },
  {
    id: 'status-rotator', name: 'dsh-status-rotator', version: '0.38.0', source: 'npm', spec: 'dsh-status-rotator@0.38.0',
    why: 'second wave: npm plugin',
  },
  {
    id: 'verification', name: 'dsh-verification-receipt', version: '0.1.0', source: 'npm', spec: 'dsh-verification-receipt@0.1.0',
    why: 'second wave: expected gate/host edge',
  },
]

function parseArgs(argv) {
  const out = { only: null, refresh: false, dsh: process.env.DSH_BIN || DEFAULT_DSH, out: REAL, timeout: 180_000 }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--only') out.only = argv[++i].split(',').map(s => s.trim()).filter(Boolean)
    else if (argv[i] === '--refresh') out.refresh = true
    else if (argv[i] === '--dsh') out.dsh = argv[++i]
    else if (argv[i] === '--out') out.out = path.resolve(argv[++i])
    else if (argv[i] === '--timeout') out.timeout = Number(argv[++i])
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('usage: node 40-checker/scripts/flow-sample-ci.mjs [--only id,id] [--refresh] [--dsh <bin>] [--out <dir>] [--timeout ms]')
      process.exit(0)
    } else throw new Error(`unknown option: ${argv[i]}`)
  }
  return out
}

function quote(arg) {
  return /^[A-Za-z0-9_./:@=+-]+$/.test(arg) ? arg : `'${String(arg).replace(/'/g, "'\\''")}'`
}
function cmdline(cmd, args) { return [cmd, ...args].map(quote).join(' ') }

function run(cmd, args, { cwd, env, timeout = 180_000 } = {}) {
  const started = Date.now()
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 })
  return {
    command: cmdline(cmd, args),
    status: r.status,
    signal: r.signal ?? null,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.error ? String(r.error.message) : null,
    durationMs: Date.now() - started,
  }
}
function tail(text, n = 4000) { return String(text ?? '').slice(-n) }
function existsPackage(dir) { return fs.existsSync(path.join(dir, 'package.json')) }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }

function assertUnderSampleBase(target) {
  const base = path.resolve(SAMPLE_BASE)
  const resolved = path.resolve(target)
  if (resolved === base || !resolved.startsWith(`${base}${path.sep}`)) throw new Error(`refusing to remove outside ${base}: ${resolved}`)
  return resolved
}
function removeDir(dir) {
  if (!fs.existsSync(dir)) return
  fs.rmSync(assertUnderSampleBase(dir), { recursive: true, force: true })
}

function childEnv() {
  const env = { ...process.env }
  delete env.DEEPSEEK_API_KEY
  delete env.OPENAI_API_KEY
  return env
}

function manifestSummary(dir) {
  const m = readJson(path.join(dir, 'package.json'))
  return {
    name: m.name,
    version: m.version,
    engines: m.engines ?? null,
    peerDependencies: m.peerDependencies ?? null,
    dependencies: m.dependencies ?? null,
    scripts: m.scripts ? { postinstall: m.scripts.postinstall ?? null } : {},
    dsh: m.dsh ?? null,
  }
}

function prepareNpm(sample, opts) {
  fs.mkdirSync(CACHE, { recursive: true })
  const dir = path.join(SAMPLE_BASE, sample.id)
  if (opts.refresh) removeDir(dir)
  const pack = run('npm', ['pack', sample.spec, '--pack-destination', CACHE], { timeout: opts.timeout })
  const filename = pack.stdout.trim().split(/\r?\n/).filter(Boolean).pop()
  if (pack.status !== 0 || !filename) {
    return { ok: false, dir, download: { kind: 'npm-pack', command: pack.command, exit: pack.status, error: tail(pack.stderr || pack.error) } }
  }
  const tarball = path.join(CACHE, filename)
  if (!existsPackage(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    const extract = run('tar', ['-xzf', tarball, '-C', dir, '--strip-components=1'], { timeout: opts.timeout })
    if (extract.status !== 0) {
      return { ok: false, dir, download: { kind: 'npm-pack', command: pack.command, tarball, extract: extract.command, exit: extract.status, error: tail(extract.stderr) } }
    }
  }
  return {
    ok: true, dir,
    download: {
      kind: 'npm-pack', command: pack.command, tarball,
      registry: run('npm', ['config', 'get', 'registry']).stdout.trim(),
      actualVersion: readJson(path.join(dir, 'package.json')).version,
    },
  }
}

function prepareGithub(sample, opts) {
  const dir = path.join(SAMPLE_BASE, sample.id)
  if (opts.refresh) removeDir(dir)
  if (!existsPackage(dir)) {
    const clone = run('git', ['clone', '--depth', '1', `https://github.com/${sample.spec}.git`, dir], { timeout: opts.timeout })
    if (clone.status !== 0) return { ok: false, dir, download: { kind: 'git-clone', command: clone.command, exit: clone.status, error: tail(clone.stderr) } }
  }
  const head = run('git', ['-C', dir, 'rev-parse', 'HEAD'])
  const subject = run('git', ['-C', dir, 'log', '-1', '--format=%s'])
  return {
    ok: true, dir,
    download: {
      kind: 'git-clone', command: `git clone --depth 1 https://github.com/${sample.spec}.git ${dir}`,
      url: `https://github.com/${sample.spec}`, gitHead: head.stdout.trim() || null, gitSubject: subject.stdout.trim() || null,
      actualVersion: readJson(path.join(dir, 'package.json')).version,
    },
  }
}

function installDeps(dir, opts) {
  const m = readJson(path.join(dir, 'package.json'))
  const deps = { ...(m.dependencies || {}), ...(m.optionalDependencies || {}) }
  if (Object.keys(deps).length === 0) {
    return { needed: false, command: null, exit: 0, ignoredScripts: true, note: 'no dependencies in package.json; npm install skipped' }
  }
  const r = run('npm', ['install', '--omit=dev', '--ignore-scripts', '--legacy-peer-deps', '--no-package-lock'], { cwd: dir, timeout: opts.timeout })
  return {
    needed: true, command: r.command, exit: r.status, ignoredScripts: true,
    note: 'third-party lifecycle scripts were not run (--ignore-scripts)',
    stdout: tail(r.stdout, 1200), stderr: tail(r.stderr, 1200), error: r.error,
  }
}

function journeyRun(sample, dir, previousDir, opts) {
  const args = [JOURNEY, '--package', dir, '--dsh', opts.dsh, '--json']
  if (previousDir) args.push('--previous', previousDir)
  const r = run(process.execPath, args, { cwd: STD, env: childEnv(), timeout: opts.timeout })
  let result = null
  try { result = JSON.parse(r.stdout) } catch { /* leave null; recorded below */ }
  return { command: r.command, exit: r.status, stderr: tail(r.stderr), parseError: result ? null : tail(r.stdout, 1200), result }
}

function normalizeResult(value) {
  const v = String(value || '').toLowerCase()
  if (v === 'pass') return 'pass'
  if (v === 'fail') return 'fail'
  if (v === 'warn') return 'warn'
  if (v === 'blocked') return 'blocked'
  if (v === 'partial') return 'partial'
  return 'notRun'
}
function countChecks(checks) {
  const c = { pass: 0, warn: 0, fail: 0, blocked: 0, partial: 0, notRun: 0 }
  for (const ch of checks) c[normalizeResult(ch.result)] += 1
  return c
}
function groupChecks(checks, prefix) { return checks.filter(c => c.id.startsWith(`${prefix}.`)) }
function groupVerdict(checks, prefix, forcePartial = false) {
  const cs = groupChecks(checks, prefix)
  if (cs.length === 0) return 'not-run'
  if (cs.some(c => c.result === 'FAIL')) return 'fail'
  if (cs.some(c => c.result === 'BLOCKED')) return 'blocked'
  if (forcePartial) return 'partial'
  if (cs.every(c => c.result === 'not-run')) return 'not-run'
  if (cs.some(c => c.result === 'not-run')) return 'partial'
  return 'pass'
}
function verdictsOf(checks, sample) {
  return {
    J1: groupVerdict(checks, 'J1', sample.j1Partial === true),
    J2: groupVerdict(checks, 'J2', sample.j2Partial === true),
    J4: groupVerdict(checks, 'J4'),
    J6: groupVerdict(checks, 'J6'),
  }
}
function countVerdicts(verdicts) {
  const c = { pass: 0, fail: 0, blocked: 0, partial: 0, notRun: 0 }
  for (const v of Object.values(verdicts)) c[normalizeResult(v)] += 1
  return c
}
function conclusionOf(verdicts) {
  const values = Object.values(verdicts)
  if (values.includes('fail')) return 'flow-fail'
  if (values.includes('blocked')) return 'flow-blocked'
  if (values.includes('partial')) return 'flow-partial'
  return 'flow-warn'
}

/** Preflight only: a rejection is evidence. Never call allow-version here. */
function gatePreflight(sample, dir) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-flow-gate-'))
  const env = { ...childEnv(), DSH_HOME: home }
  const profile = 'flow-gate'
  const create = run(optsDsh, ['--profile', profile, '--from-default-profile', 'headless', '--dump-config'], { env, timeout: 180_000 })
  const add = run(optsDsh, ['plugin', '--profile', profile, 'add', dir], { env, timeout: 180_000 })
  const output = `${add.stdout}${add.stderr}`
  const rejected = add.status !== 0 && /installation rejected/.test(output)
  const compat = path.join(home, 'profiles', profile, 'compatibility.json')
  const requirementMatch = /requirements (\{.*?\})\./.exec(output)
  const result = {
    command: add.command,
    dshHome: home,
    profile,
    createExit: create.status,
    addExit: add.status,
    rejected,
    diagnostic: tail(output, 3000),
    requirements: requirementMatch ? requirementMatch[1] : null,
    exemptionGranted: false,
    compatibilityFilePresent: fs.existsSync(compat),
    cleanedUp: true,
  }
  try { fs.rmSync(home, { recursive: true, force: true }) } catch { result.cleanedUp = false }
  return result
}
let optsDsh = DEFAULT_DSH

/** Show why a skipped postinstall matters: the main row is absent, the patch rows exist. */
function layerProbe(sample, dir) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-flow-layer-'))
  const env = { ...childEnv(), DSH_HOME: home }
  const profile = 'flow-layer'
  const create = run(optsDsh, ['--profile', profile, '--from-default-profile', 'headless', '--dump-config'], { env, timeout: 180_000 })
  const add = run(optsDsh, ['plugin', '--profile', profile, 'add', dir], { env, timeout: 180_000 })
  const dump = run(optsDsh, ['--profile', profile, '--dump-config'], { env, timeout: 180_000 })
  const mainRowPresent = new RegExp(`^- id: ${sample.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm').test(dump.stdout)
  const redteamRowIds = [...dump.stdout.matchAll(/^- id: (dsh-purge-redteam\S*)$/gm)].map(m => m[1])
  const missingPatchEntries = [...dump.stderr.matchAll(/entry "([^"]+)" not found/g)].map(m => m[1])
  let profileBundles = null
  try { profileBundles = readJson(path.join(home, 'profiles', profile, 'package.json')).dsh?.profile?.bundles ?? null } catch { /* ignore */ }
  const result = {
    command: dump.command,
    dshHome: home,
    profile,
    createExit: create.status,
    addExit: add.status,
    dumpExit: dump.status,
    mainRowPresent,
    redteamRowIds,
    missingPatchEntries,
    profileBundles,
    dumpStderr: tail(dump.stderr, 2000),
    cleanedUp: true,
  }
  try { fs.rmSync(home, { recursive: true, force: true }) } catch { result.cleanedUp = false }
  return result
}

function emptyChecks(reason) {
  const ids = ['J1.profile', 'J1.install', 'J1.dump', 'J1.layer', 'J1.remove', 'J1.clean', 'J2.disable', 'J2.enable', 'J4.tree-load', 'J6.upgrade', 'J6.rollback', 'J3.config', 'J5.permissions', 'J7.observe', 'J8.client']
  return ids.map(id => ({ id, result: 'not-run', reason }))
}

function telemetryChecks(gate) {
  const why = 'compatibility gate rejected the install; nothing was installed'
  const checks = [
    { id: 'J1.profile', result: gate.createExit === 0 ? 'PASS' : 'FAIL', reason: `create profile exit=${gate.createExit}` },
    { id: 'J1.install', result: 'BLOCKED', reason: `installation rejected: ${gate.requirements || 'unmet dsh requirement'}`, stderr: gate.diagnostic },
    { id: 'J1.dump', result: 'not-run', reason: why },
    { id: 'J1.layer', result: 'not-run', reason: why },
    { id: 'J1.remove', result: 'not-run', reason: why },
    { id: 'J1.clean', result: 'not-run', reason: why },
    { id: 'J2.disable', result: 'not-run', reason: why },
    { id: 'J2.enable', result: 'not-run', reason: why },
    { id: 'J4.tree-load', result: 'not-run', reason: why },
    { id: 'J6.upgrade', result: 'not-run', reason: why },
    { id: 'J6.rollback', result: 'not-run', reason: why },
    { id: 'J3.config', result: 'not-run', reason: 'invalid-config harness not implemented' },
    { id: 'J5.permissions', result: 'not-run', reason: 'permissions/disclosure review is manual' },
    { id: 'J7.observe', result: 'not-run', reason: 'observability probe not implemented' },
    { id: 'J8.client', result: 'not-run', reason: 'client-shape probe not implemented' },
  ]
  return checks
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  optsDsh = opts.dsh
  fs.mkdirSync(opts.out, { recursive: true })
  const selected = SAMPLES.filter(s => !opts.only || opts.only.includes(s.id))
  if (selected.length === 0) throw new Error(`no sample matched --only ${opts.only}`)
  const dshVersion = run(opts.dsh, ['--version']).stdout.trim()
  const envInfo = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    dsh: { path: path.resolve(opts.dsh), version: dshVersion },
    pnpm: run('pnpm', ['--version']).stdout.trim(),
    npm: run('npm', ['--version']).stdout.trim(),
    registry: run('npm', ['config', 'get', 'registry']).stdout.trim(),
    sampleBase: SAMPLE_BASE,
    resultsDir: opts.out,
    command: cmdline(process.execPath, process.argv.slice(1)),
  }
  const rows = []
  for (const sample of selected) {
    console.log(`\n=== ${sample.id} (${sample.name}@${sample.version}, ${sample.source})`)
    const prep = sample.source === 'npm' ? prepareNpm(sample, opts) : prepareGithub(sample, opts)
    if (!prep.ok) {
      const result = {
        schema: 'dsh-flow-real/1', generatedAt: new Date().toISOString(), id: sample.id,
        package: sample.name, entry18Version: sample.version, source: sample.source, spec: sample.spec,
        packageDir: prep.dir, download: prep.download, dependencyInstall: null, journey: null,
        checks: emptyChecks(`download/prepare failed: ${prep.download.error || 'unknown error'}`),
        verdicts: { J1: 'not-run', J2: 'not-run', J4: 'not-run', J6: 'not-run' },
        classification: 'not-run', caveats: ['Download/prepare failed; this is not a plugin defect.'],
        summary: { checks: countChecks(emptyChecks('x')), verdicts: { pass: 0, fail: 0, blocked: 0, partial: 0, notRun: 4 } },
        conclusion: 'flow-warn',
      }
      fs.writeFileSync(path.join(opts.out, `${sample.id}.json`), `${JSON.stringify(result, null, 2)}\n`)
      rows.push(result)
      console.log(`not-run: ${prep.download.error || 'prepare failed'}`)
      continue
    }
    const manifest = manifestSummary(prep.dir)
    const deps = installDeps(prep.dir, opts)
    console.log(`manifest ${manifest.name}@${manifest.version}; deps ${deps.needed ? `install exit=${deps.exit}` : 'none'}`)
    if (deps.needed && deps.exit !== 0) {
      const result = {
        schema: 'dsh-flow-real/1', generatedAt: new Date().toISOString(), id: sample.id,
        package: manifest.name, entry18Version: sample.version, source: sample.source, spec: sample.spec,
        packageDir: prep.dir, download: prep.download, manifest, dependencyInstall: deps, journey: null,
        checks: emptyChecks(`dependency install failed (exit=${deps.exit}); not a plugin failure`),
        verdicts: { J1: 'not-run', J2: 'not-run', J4: 'not-run', J6: 'not-run' },
        classification: 'not-run', caveats: ['Dependency install failed; recorded not-run rather than a plugin failure.'],
        summary: { checks: countChecks(emptyChecks('x')), verdicts: { pass: 0, fail: 0, blocked: 0, partial: 0, notRun: 4 } },
        conclusion: 'flow-warn',
      }
      fs.writeFileSync(path.join(opts.out, `${sample.id}.json`), `${JSON.stringify(result, null, 2)}\n`)
      rows.push(result)
      console.log(`not-run: dependency install failed`)
      continue
    }

    let previous = null
    let previousInstall = null
    let previousDir = null
    if (sample.previous) {
      const prev = prepareNpm({ ...sample.previous, id: sample.previous.dir, source: 'npm' }, opts)
      if (prev.ok) {
        previousDir = prev.dir
        previousInstall = installDeps(prev.dir, opts)
        previous = { dir: prev.dir, download: prev.download, dependencyInstall: previousInstall, manifest: manifestSummary(prev.dir) }
      } else {
        previous = { error: prev.download.error || 'previous version prepare failed' }
      }
    }

    let gate = null
    let checks
    let journey = null
    let layer = null
    let classification = 'clean'
    const caveats = []
    if (sample.gate === 'expect-reject') {
      gate = gatePreflight(sample, prep.dir)
      console.log(`gate rejected=${gate.rejected} requirements=${gate.requirements}`)
      if (gate.rejected) {
        checks = telemetryChecks(gate)
        classification = 'host-gate'
        caveats.push('Compatibility gate rejected this exact version; no exemption was granted and no retry was attempted.')
        caveats.push('J2/J4 were not run because nothing was installed. This is a host gate, not a plugin defect.')
      } else {
        journey = journeyRun(sample, prep.dir, previousDir, opts)
        checks = journey.result?.checks || emptyChecks('gate did not reject and journey produced no JSON')
      }
    } else {
      journey = journeyRun(sample, prep.dir, previousDir, opts)
      checks = journey.result?.checks || emptyChecks(journey.parseError || `journey exit=${journey.exit} with no JSON`)
      if (!journey.result) caveats.push(`journey-runtime produced no parseable JSON (exit=${journey.exit}); recorded not-run.`)
    }
    if (sample.layerProbe && journey?.result) {
      layer = layerProbe(sample, prep.dir)
      classification = 'harness-partial'
      console.log(`layer probe mainRowPresent=${layer.mainRowPresent} missing=${layer.missingPatchEntries.join(',')}`)
      caveats.push('J1 is partial: the package postinstall was not run (`--ignore-scripts`); the main `dsh-purge` profile row is absent even though add/dump/remove succeeded.')
      caveats.push('J2 is partial: the overlay toggled `dsh-purge-redteam`, not the main `dsh-purge` row.')
      caveats.push('J4 reached the credential boundary, but the main plugin was not mounted; this proves tree-load only.')
    }
    if (sample.id === 'ui-auth') caveats.push('J4 reached MISSING_CREDENTIAL, but dsh-ui-auth stayed pending on services webServer/connection in headless; client activation (J8) is not proven.')
    if (sample.id === 'DDDMUC__dsh-free-search') caveats.push('J6 not run: only one version was fetched; the clone HEAD is 7c30dd059e1d9de4ffc8b779978b2152af84b0ec.')
    if (sample.id === 'ci-diet') caveats.push('J6 used the published 0.5.1 tarball as --previous; no persisted data/migration was exercised.')
    if (manifest.version !== sample.version) caveats.push(`Actual package version ${manifest.version} differs from entry18.json ${sample.version}.`)

    const verdicts = verdictsOf(checks, sample)
    const checkCounts = countChecks(checks)
    const verdictCounts = countVerdicts(verdicts)
    const result = {
      schema: 'dsh-flow-real/1',
      generatedAt: new Date().toISOString(),
      id: sample.id,
      package: manifest.name,
      version: manifest.version,
      entry18Version: sample.version,
      source: sample.source,
      spec: sample.spec,
      why: sample.why,
      packageDir: prep.dir,
      download: prep.download,
      manifest,
      dependencyInstall: deps,
      previous,
      gate,
      journey: journey ? { command: journey.command, exit: journey.exit, parseError: journey.parseError, stderr: journey.stderr, result: journey.result } : null,
      layerProbe: layer,
      checks,
      verdicts,
      classification,
      caveats,
      limitations: ['J3/J5/J7/J8 are not covered by journey-runtime.', 'This is a local-directory install (`dsh plugin add <dir>`), not a registry tarball install.'],
      summary: { checks: checkCounts, verdicts: verdictCounts },
      conclusion: conclusionOf(verdicts),
    }
    const file = path.join(opts.out, `${sample.id}.json`)
    fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`)
    rows.push(result)
    console.log(`saved ${file}`)
    console.log(`verdicts ${JSON.stringify(verdicts)} checks ${JSON.stringify(checkCounts)}`)
  }

  const totals = {
    packages: rows.length,
    checks: { pass: 0, warn: 0, fail: 0, blocked: 0, partial: 0, notRun: 0 },
    verdicts: { pass: 0, fail: 0, blocked: 0, partial: 0, notRun: 0 },
    classifications: {},
  }
  for (const row of rows) {
    for (const [k, v] of Object.entries(row.summary.checks)) totals.checks[k] += v
    for (const [k, v] of Object.entries(row.summary.verdicts)) totals.verdicts[k] += v
    totals.classifications[row.classification] = (totals.classifications[row.classification] || 0) + 1
  }
  const index = {
    schema: 'dsh-flow-real-index/1',
    generatedAt: new Date().toISOString(),
    environment: envInfo,
    samples: rows.map(r => ({
      id: r.id, package: r.package, version: r.version, source: r.source, why: r.why,
      verdicts: r.verdicts, classification: r.classification, conclusion: r.conclusion,
      checks: r.summary.checks, caveats: r.caveats, file: path.join(opts.out, `${r.id}.json`),
    })),
    totals,
    coverage: { J1: 'runtime', J2: 'runtime', J3: 'not-run', J4: 'runtime (tree-load only)', J5: 'not-run', J6: 'runtime for ci-diet only', J7: 'not-run', J8: 'not-run' },
    notes: [
      'A gate rejection is recorded as BLOCKED, never as PASS; this script never calls allow-version.',
      'The purge sample is J1/J2 partial because its postinstall was deliberately not run.',
      'J3/J5/J7/J8 remain not-run: this evidence does not claim full FLOW coverage.',
    ],
  }
  fs.writeFileSync(path.join(opts.out, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
  console.log(`\n${JSON.stringify(totals)}`)
  console.log(`index: ${path.join(opts.out, 'index.json')}`)
}
try { main() } catch (error) { console.error(`flow-sample-ci: ${error.message}`); process.exitCode = 3 }

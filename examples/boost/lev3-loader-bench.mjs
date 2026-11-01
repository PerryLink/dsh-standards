#!/usr/bin/env node
/**
 * LEV-3 real-loader benchmark: does a volatile config change remount the
 * plugin, or only update its live config reference?
 *
 * The harness boots a real Cordis `Context` + `Loader` + file-backed `Include`
 * over a two-entry YAML composition (probe service + fixture plugin). Each
 * iteration rewrites the YAML and calls `Include.refresh()` — the exact reload
 * entry point `@deepseek-ai/dsh-hmr` calls from its chokidar handler — then
 * awaits `loader.await()` and reads the lifecycle facts back through the probe
 * service.
 *
 * Two arms make the measurement falsifiable:
 *   volatile  — only `greeting` (Schema.string().volatile()) changes
 *   control   — only `mode` (ordinary field) changes
 * A working probe must show no re-apply for the first arm and a re-apply +
 * effect disposal for the second. If both arms behave identically, the harness
 * is reported as non-falsifiable rather than as evidence.
 *
 * Usage:
 *   node examples/boost/lev3-loader-bench.mjs
 *   node examples/boost/lev3-loader-bench.mjs --host installed --runs 20
 *   node examples/boost/lev3-loader-bench.mjs --host checkout --json
 *
 * Hosts:
 *   installed — npm-installed DSH, booted through its real `boot()` (app-boot).
 *   checkout  — DSH git checkout, vendored Cordis copied to a temp sandbox and
 *               booted directly (the checkout has no linked node_modules for
 *               the vendor packages); used because it is the source of truth.
 *
 * This is loader-level evidence, not a profile-level benchmark: no DSH CLI,
 * profile patch layers, client plugins, or live chokidar watcher participate.
 *
 * Exit codes: 0 measured (supported or refuted), 2 harness invalid/error.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE = path.resolve(HERE, '..', '..')
const FIXTURE_DIR = path.join(HERE, 'lev3-fixture')
const DEFAULT_OUT = path.join(WORKSPACE, '40-checker', 'results', 'lev3', 'lev3.json')
const DEFAULT_INSTALLED = '/mnt/c/Users/zzhdz/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh'
const DEFAULT_CHECKOUT = '<dsh-checkout>'
const VOLATILE_FIELD = 'greeting'
const CONTROL_FIELD = 'mode'

const LIMITATIONS = [
  'loader-level only: a real Context + Loader + Include over a two-entry fixture YAML, not a DSH CLI profile; no app plugins, profile patch layers, client UI, or CLI process participate.',
  'Reload trigger is Include.refresh() directly (the function dsh-hmr calls from its chokidar handler); chokidar debounce and awaitWriteFinish are excluded from the latency numbers.',
  'The fixture plugin is synthetic (Schemastery .volatile() field + one named effect). Shipped volatile consumers such as ui-theme and llm-pi-ai need browser/LLM services and are not booted here.',
  'Single WSL2 machine, single process, warm filesystem, Node 24.22.1; reload latency is not a production profile number.',
  'Cordis reuses the same Fiber object and uid across a config restart. "Remount" below means apply() ran again and the plugin effect was disposed, not that a new Fiber was created.',
  'Installed DSH 0.2.1-rc.5 ships Cordis 4.0.5 / loader 1.0.6; the checkout is DSH 0.2.2-alpha.2 with vendored Cordis 4.0.6-alpha.1 / loader 1.0.7-alpha.1. Both are reported separately; no upstream Cordis compatibility is claimed.',
  'The checkout host copies vendored packages into a temp node_modules sandbox before booting, because the checkout has no linked node_modules for those packages. Copied source hashes are recorded.',
  'The local dsh CLI hangs in this environment; app-boot and Cordis are imported directly instead of launching a profile.',
]

function parseArgs(argv) {
  const options = {
    host: 'both',
    runs: 20,
    warmup: 2,
    installed: null,
    checkout: null,
    out: DEFAULT_OUT,
    json: false,
    worker: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--host') options.host = argv[++i]
    else if (arg === '--runs') options.runs = Number(argv[++i])
    else if (arg === '--warmup') options.warmup = Number(argv[++i])
    else if (arg === '--installed' || arg === '--dsh') options.installed = argv[++i]
    else if (arg === '--checkout') options.checkout = argv[++i]
    else if (arg === '--out') options.out = path.resolve(argv[++i])
    else if (arg === '--json') options.json = true
    else if (arg === '--worker') options.worker = true
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: node examples/boost/lev3-loader-bench.mjs [--host both|installed|checkout] [--runs 20] [--warmup 2] [--installed <dsh dir>] [--checkout <repo>] [--out <file>]')
      process.exit(0)
    } else {
      throw new Error(`unknown option: ${arg}`)
    }
  }
  if (!['both', 'installed', 'checkout'].includes(options.host)) throw new Error(`unknown host: ${options.host}`)
  if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error('--runs must be a positive integer')
  if (!Number.isInteger(options.warmup) || options.warmup < 0) throw new Error('--warmup must be a non-negative integer')
  return options
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function exists(file) {
  try {
    fs.accessSync(file)
    return true
  } catch {
    return false
  }
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function packageVersion(dir) {
  try {
    return readJson(path.join(dir, 'package.json')).version ?? null
  } catch {
    return null
  }
}

function resolveInstalled(explicit) {
  const candidates = [explicit, process.env.DSH_INSTALL_DIR, DEFAULT_INSTALLED].filter(Boolean)
  for (const candidate of candidates) {
    if (exists(path.join(candidate, 'package.json')) && exists(path.join(candidate, 'node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js'))) {
      return path.resolve(candidate)
    }
  }
  throw new Error(`installed DSH not found; pass --installed <dir> (tried: ${candidates.join(', ')})`)
}

function resolveCheckout(explicit) {
  const candidates = [explicit, process.env.DSH_CHECKOUT_DIR, DEFAULT_CHECKOUT].filter(Boolean)
  for (const candidate of candidates) {
    if (exists(path.join(candidate, 'vendor/cordis/package.json')) && exists(path.join(candidate, 'vendor/loader/lib/index.js'))) {
      return path.resolve(candidate)
    }
  }
  throw new Error(`DSH checkout not found; pass --checkout <repo> (tried: ${candidates.join(', ')})`)
}

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    timer.unref?.()
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function quantile(sorted, p) {
  if (!sorted.length) return null
  const position = (sorted.length - 1) * p
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

function stats(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const sum = sorted.reduce((total, value) => total + value, 0)
  return {
    n: sorted.length,
    min: Number(sorted[0].toFixed(3)),
    max: Number(sorted.at(-1).toFixed(3)),
    median: Number(quantile(sorted, 0.5).toFixed(3)),
    p50: Number(quantile(sorted, 0.5).toFixed(3)),
    p95: Number(quantile(sorted, 0.95).toFixed(3)),
    mean: Number((sum / sorted.length).toFixed(3)),
  }
}

function effectiveConfig(fiber) {
  // Cordis 4.0.6: `effectiveConfig`; Cordis 4.0.5: `config`.
  return fiber?.effectiveConfig ?? fiber?.config
}

function configState(config) {
  if (!config) return null
  return {
    greeting: typeof config.greeting?.get === 'function' ? config.greeting.get() : config.greeting,
    mode: config.mode,
  }
}

function yamlFor({ mode, greeting }) {
  // Deliberately tiny and quote-safe: the fixture values are [a-z0-9-]+.
  return [
    '- id: lev3-probe',
    '  name: ./probe.mjs',
    '- id: lev3-fixture',
    '  name: ./plugin.mjs',
    '  config:',
    `    mode: ${mode}`,
    `    greeting: ${greeting}`,
    '',
  ].join('\n')
}

function countEvents(events, type) {
  return events.filter(event => event.type === type).length
}

function copyPackage(source, destination) {
  fs.cpSync(source, destination, {
    recursive: true,
    dereference: true,
    filter: file => !file.split(path.sep).includes('node_modules'),
  })
}

/**
 * Copy the checkout's vendored Cordis packages into a temp node_modules so the
 * built ESM resolves its bare peer imports. Only lib/package.json/src matter;
 * nested node_modules (pnpm links into the checkout store) are excluded.
 */
function buildCheckoutSandbox(checkout) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'lev3-checkout-'))
  const modules = path.join(sandbox, 'node_modules')
  const mapping = [
    ['vendor/cordis', '@deepseek-ai/cordis'],
    ['vendor/loader', '@deepseek-ai/cordis-plugin-loader'],
    ['vendor/include', '@deepseek-ai/cordis-plugin-include'],
    ['vendor/group', '@deepseek-ai/cordis-plugin-group'],
    ['vendor/cosmokit', '@deepseek-ai/cosmokit'],
    ['vendor/schemastery', '@deepseek-ai/schemastery'],
  ]
  for (const [source, name] of mapping) {
    const destination = path.join(modules, name)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    copyPackage(path.join(checkout, source), destination)
  }
  const jsYaml = path.join(checkout, 'node_modules/js-yaml')
  if (!exists(jsYaml)) throw new Error(`checkout js-yaml not found: ${jsYaml}`)
  fs.cpSync(jsYaml, path.join(modules, 'js-yaml'), { recursive: true, dereference: true })
  return sandbox
}

function inspectLoaderSource({ entryFile, diffFile, indexFile }) {
  const entry = fs.readFileSync(entryFile, 'utf8')
  const diff = fs.readFileSync(diffFile, 'utf8')
  const index = fs.readFileSync(indexFile, 'utf8')
  return {
    entry: {
      file: entryFile,
      sha256: sha256(entryFile),
      hasVolatileOnlyGate: entry.includes("const volatileOnly = changes.length === 1 && changes[0] === 'config'"),
      hasCommitVolatile: entry.includes('_commitVolatile'),
      checksActiveFiber: entry.includes('FiberState.ACTIVE'),
      checksEqualExceptVolatile: entry.includes('equalExceptVolatile'),
    },
    diff: {
      file: diffFile,
      sha256: sha256(diffFile),
      hasVolatileMeta: diff.includes('schema?.meta?.volatile'),
      hasEqualExceptVolatile: diff.includes('export function equalExceptVolatile'),
    },
    index: {
      file: indexFile,
      sha256: sha256(indexFile),
      declaresVolatileUpdateEvent: index.includes("'loader/volatile-update'"),
    },
  }
}

function installedProvenance(installed) {
  const modules = path.join(installed, 'node_modules/@deepseek-ai')
  const paths = {
    dsh: installed,
    cordis: path.join(modules, 'cordis'),
    loader: path.join(modules, 'cordis-plugin-loader'),
    include: path.join(modules, 'cordis-plugin-include'),
    schemastery: path.join(modules, 'schemastery'),
    appBoot: path.join(modules, 'dsh-app-boot'),
  }
  return {
    mode: 'app-boot',
    versions: {
      dsh: packageVersion(installed),
      cordis: packageVersion(paths.cordis),
      loader: packageVersion(paths.loader),
      include: packageVersion(paths.include),
      schemastery: packageVersion(paths.schemastery),
      appBoot: packageVersion(paths.appBoot),
    },
    paths: {
      context: path.join(paths.cordis, 'lib/index.js'),
      loader: path.join(paths.loader, 'lib/index.js'),
      include: path.join(paths.include, 'lib/index.js'),
      schemastery: path.join(paths.schemastery, 'lib/index.mjs'),
      appBoot: path.join(paths.appBoot, 'lib/index.js'),
      bareBaseUrl: pathToFileURL(modules + path.sep).href,
    },
    includeBoot: {
      kind: 'bundled-in-app-boot',
      file: path.join(paths.appBoot, 'lib/index.js'),
      sha256: sha256(path.join(paths.appBoot, 'lib/index.js')),
      note: 'the installed app-boot statically bundles Include; versions.include is the installed standalone package version of the same release',
    },
    source: inspectLoaderSource({
      entryFile: path.join(paths.loader, 'src/config/entry.ts'),
      diffFile: path.join(paths.loader, 'src/config/diff.ts'),
      indexFile: path.join(paths.loader, 'src/index.ts'),
    }),
  }
}

function checkoutProvenance(checkout, sandbox) {
  const modules = path.join(sandbox, 'node_modules/@deepseek-ai')
  const paths = {
    cordis: path.join(modules, 'cordis'),
    loader: path.join(modules, 'cordis-plugin-loader'),
    include: path.join(modules, 'cordis-plugin-include'),
    schemastery: path.join(modules, 'schemastery'),
  }
  const git = (() => {
    try {
      const commit = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      const status = execFileSync('git', ['-C', checkout, 'status', '--porcelain'], { encoding: 'utf8' }).trim()
      return { commit, dirty: status.length > 0, dirtyEntries: status.length ? status.split('\n').length : 0 }
    } catch (error) {
      return { commit: null, error: error.message }
    }
  })()
  return {
    mode: 'direct-loader',
    checkout,
    sandbox,
    sandboxNote: 'temporary node_modules copy, removed after the run',
    versions: {
      dsh: packageVersion(checkout),
      cordis: packageVersion(paths.cordis),
      loader: packageVersion(paths.loader),
      include: packageVersion(paths.include),
      schemastery: packageVersion(paths.schemastery),
    },
    paths: {
      context: path.join(paths.cordis, 'lib/index.js'),
      loader: path.join(paths.loader, 'lib/index.js'),
      include: path.join(paths.include, 'lib/index.js'),
      schemastery: path.join(paths.schemastery, 'lib/index.mjs'),
    },
    includeBoot: {
      kind: 'standalone-copied-package',
      file: path.join(paths.include, 'lib/index.js'),
      sha256: sha256(path.join(paths.include, 'lib/index.js')),
    },
    source: inspectLoaderSource({
      entryFile: path.join(checkout, 'vendor/loader/src/config/entry.ts'),
      diffFile: path.join(checkout, 'vendor/loader/src/config/diff.ts'),
      indexFile: path.join(checkout, 'vendor/loader/src/index.ts'),
    }),
    git,
  }
}

function fixtureProvenance() {
  const files = ['plugin.mjs', 'probe.mjs', 'cordis.yml'].map((name) => {
    const file = path.join(FIXTURE_DIR, name)
    return { name, path: path.relative(WORKSPACE, file), sha256: sha256(file) }
  })
  return { directory: path.relative(WORKSPACE, FIXTURE_DIR), files }
}

async function bootDirect(runtime, configFile) {
  const { Context } = await import(pathToFileURL(runtime.paths.context).href)
  const { default: Loader } = await import(pathToFileURL(runtime.paths.loader).href)
  const { default: Include } = await import(pathToFileURL(runtime.paths.include).href)
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(path.dirname(configFile)).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const includeId = await ctx.loader.create({
    id: 'include',
    name: 'cordis:include',
    config: { path: pathToFileURL(configFile).href },
  })
  await ctx.loader.await()
  const includeEntry = ctx.loader.resolve(includeId)
  return { ctx, includeEntry, include: includeEntry.subtree, bootMode: 'direct-loader' }
}

async function bootAppBoot(runtime, configFile, tempHome) {
  process.env.DSH_HOME = tempHome
  const { boot } = await import(pathToFileURL(runtime.paths.appBoot).href)
  const ctx = await withTimeout(
    boot('lev3-bench', configFile, [], undefined, runtime.paths.bareBaseUrl),
    60_000,
    'app-boot',
  )
  const includeEntry = [...ctx.loader.entries()].find(entry => entry.options?.name === 'cordis:include')
  if (!includeEntry?.subtree) throw new Error('app-boot did not expose the root Include subtree')
  return { ctx, includeEntry, include: includeEntry.subtree, bootMode: 'app-boot' }
}

async function settleIncludeWrites(include) {
  // Include.write() schedules a 0ms timer; let it fire, then await its queue.
  await new Promise(resolve => setTimeout(resolve, 2))
  if (typeof include.flushWrite === 'function') await include.flushWrite()
}

async function reload(include, ctx) {
  const started = performance.now()
  await include.refresh()
  await ctx.loader.await()
  return performance.now() - started
}

function armRow({ arm, index, from, to, writeMs, reloadMs, fiberBefore, fiberAfter, configBefore, configAfter, probeBefore, probeAfter }) {
  const events = probeAfter.events.slice(probeBefore.events.length)
  const appliesDelta = probeAfter.applies - probeBefore.applies
  const effectInstallsDelta = probeAfter.effectInstalls - probeBefore.effectInstalls
  const effectDisposalsDelta = probeAfter.effectDisposals - probeBefore.effectDisposals
  const volatileUpdatesDelta = probeAfter.volatileUpdates - probeBefore.volatileUpdates
  const uidBefore = fiberBefore?.uid ?? null
  const uidAfter = fiberAfter?.uid ?? null
  const stateBefore = fiberBefore?.state ?? null
  const stateAfter = fiberAfter?.state ?? null
  const configUpdated = arm === 'volatile'
    ? configAfter?.greeting === to && configAfter?.mode === configBefore?.mode
    : configAfter?.mode === to && configAfter?.greeting === configBefore?.greeting
  return {
    i: index,
    arm,
    field: arm === 'volatile' ? VOLATILE_FIELD : CONTROL_FIELD,
    from,
    to,
    writeMs: Number(writeMs.toFixed(3)),
    reloadMs: Number(reloadMs.toFixed(3)),
    uidBefore,
    uidAfter,
    fiberUidSame: uidBefore === uidAfter,
    fiberObjectSame: fiberAfter === fiberBefore,
    stateBefore,
    stateAfter,
    configBefore,
    configAfter,
    configUpdated,
    appliesDelta,
    effectInstallsDelta,
    effectDisposalsDelta,
    volatileUpdatesDelta,
    pluginReapplied: appliesDelta > 0,
    effectsTornDown: effectDisposalsDelta > 0,
    remounted: appliesDelta > 0 || effectDisposalsDelta > 0,
    events,
  }
}

function summarizeArm(rows) {
  const statsOf = key => stats(rows.map(row => row[key]))
  return {
    n: rows.length,
    remounts: rows.filter(row => row.remounted).length,
    restarts: rows.filter(row => row.pluginReapplied).length,
    pluginReapplied: rows.filter(row => row.pluginReapplied).length,
    effectsTornDown: rows.filter(row => row.effectsTornDown).length,
    configUpdates: rows.filter(row => row.configUpdated).length,
    fiberUidChanged: rows.filter(row => !row.fiberUidSame).length,
    fiberObjectChanged: rows.filter(row => !row.fiberObjectSame).length,
    appliesDeltaTotal: rows.reduce((total, row) => total + row.appliesDelta, 0),
    effectInstallsTotal: rows.reduce((total, row) => total + row.effectInstallsDelta, 0),
    effectDisposalsTotal: rows.reduce((total, row) => total + row.effectDisposalsDelta, 0),
    volatileUpdatesTotal: rows.reduce((total, row) => total + row.volatileUpdatesDelta, 0),
    writeMs: statsOf('writeMs'),
    reloadMs: statsOf('reloadMs'),
  }
}

async function mutateAndMeasure({ arm, index, value, state, include, ctx, fixtureEntry, probe }) {
  const next = { ...state, [arm === 'volatile' ? VOLATILE_FIELD : CONTROL_FIELD]: value }
  const from = arm === 'volatile' ? state.greeting : state.mode
  const configFile = state.configFile
  const before = probe.snapshot()
  const fiberBefore = fixtureEntry.fiber
  const configBefore = configState(effectiveConfig(fiberBefore))

  const writeStarted = performance.now()
  fs.writeFileSync(configFile, yamlFor(next))
  const writeMs = performance.now() - writeStarted

  const reloadMs = await withTimeout(reload(include, ctx), 15_000, `reload ${arm} #${index}`)
  await settleIncludeWrites(include)

  const after = probe.snapshot()
  const fiberAfter = fixtureEntry.fiber
  const configAfter = configState(effectiveConfig(fiberAfter))
  const row = armRow({
    arm,
    index,
    from,
    to: value,
    writeMs,
    reloadMs,
    fiberBefore,
    fiberAfter,
    configBefore,
    configAfter,
    probeBefore: before,
    probeAfter: after,
  })
  state.greeting = next.greeting
  state.mode = next.mode
  if (arm === 'volatile') state.greeting = value
  else state.mode = value
  return { row, configAfter }
}

async function runHost(options, hostId) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `lev3-${hostId}-`))
  const tempHome = path.join(tempRoot, 'home')
  fs.mkdirSync(tempHome, { recursive: true })
  const fixtureRuntimeDir = path.join(tempRoot, 'fixture')
  fs.mkdirSync(fixtureRuntimeDir, { recursive: true })
  for (const name of ['plugin.mjs', 'probe.mjs']) {
    fs.copyFileSync(path.join(FIXTURE_DIR, name), path.join(fixtureRuntimeDir, name))
  }
  const configFile = path.join(fixtureRuntimeDir, 'cordis.yml')
  const initialState = { mode: 'mode-0', greeting: 'greeting-0' }
  fs.writeFileSync(configFile, yamlFor(initialState))

  let sandbox
  let ctx
  const result = {
    host: hostId,
    status: 'error',
    runtime: null,
    fixture: fixtureProvenance(),
    boot: null,
    arms: { volatile: null, control: null },
    checks: {},
    errors: [],
  }
  try {
    let runtime
    if (hostId === 'installed') {
      const installed = resolveInstalled(options.installed)
      runtime = installedProvenance(installed)
      process.env.LEV3_SCHEMASTER_PATH = runtime.paths.schemastery
    } else {
      const checkout = resolveCheckout(options.checkout)
      sandbox = buildCheckoutSandbox(checkout)
      runtime = checkoutProvenance(checkout, sandbox)
      process.env.LEV3_SCHEMASTER_PATH = runtime.paths.schemastery
    }
    result.runtime = {
      host: hostId,
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      ...runtime,
      pathsNote: hostId === 'checkout'
        ? 'paths point into a temporary copy removed after the run; versions, source hashes, and checkout root above are stable'
        : undefined,
    }

    const bootStarted = performance.now()
    let booted
    if (hostId === 'installed') {
      try {
        booted = await bootAppBoot(runtime, configFile, tempHome)
      } catch (error) {
        result.errors.push(`app-boot failed, falling back to direct loader: ${error.message}`)
        booted = await bootDirect(runtime, configFile)
      }
    } else {
      booted = await bootDirect(runtime, configFile)
    }
    ctx = booted.ctx
    const bootMs = performance.now() - bootStarted

    const entries = [...ctx.loader.entries()].map(entry => ({
      id: entry.id,
      name: entry.options?.name ?? null,
      state: entry.fiber?.state ?? null,
      uid: entry.fiber?.uid ?? null,
      disabled: entry.disabled === true,
    }))
    const fixtureEntry = [...ctx.loader.entries()].find(entry => entry.options?.name === './plugin.mjs')
    const probe = ctx.get?.('lev3Probe') ?? ctx.lev3Probe
    if (!fixtureEntry) throw new Error('fixture entry ./plugin.mjs was not created by the Loader')
    if (!probe || typeof probe.snapshot !== 'function') throw new Error('lev3Probe service was not registered')
    const probeBoot = probe.snapshot()
    result.boot = {
      bootMs: Number(bootMs.toFixed(3)),
      bootMode: booted.bootMode,
      entries,
      fixture: {
        id: fixtureEntry.id,
        uid: fixtureEntry.fiber?.uid ?? null,
        state: fixtureEntry.fiber?.state ?? null,
        config: configState(effectiveConfig(fixtureEntry.fiber)),
        volatileReference: typeof effectiveConfig(fixtureEntry.fiber)?.greeting?.get === 'function',
        controlValueIsPlain: typeof effectiveConfig(fixtureEntry.fiber)?.mode === 'string',
      },
      probe: {
        applies: probeBoot.applies,
        effectInstalls: probeBoot.effectInstalls,
        effectDisposals: probeBoot.effectDisposals,
        volatileUpdates: probeBoot.volatileUpdates,
        instances: probeBoot.instances,
      },
    }
    result.checks.fixtureActive = fixtureEntry.fiber?.state === 2
    result.checks.probeRegistered = true
    result.checks.volatileReference = result.boot.fixture.volatileReference
    result.checks.controlValueIsPlain = result.boot.fixture.controlValueIsPlain
    result.checks.initialApplyOnce = probeBoot.applies === 1
    result.checks.initialEffectsInstalled = probeBoot.effectInstalls === 1

    const state = { ...initialState, configFile }
    const volatileRows = []
    const controlRows = []

    for (let i = 1; i <= options.warmup; i += 1) {
      await mutateAndMeasure({
        arm: 'volatile',
        index: -i,
        value: `warmup-greeting-${i}`,
        state,
        include: booted.include,
        ctx,
        fixtureEntry,
        probe,
      })
    }
    for (let i = 1; i <= options.runs; i += 1) {
      const { row } = await mutateAndMeasure({
        arm: 'volatile',
        index: i,
        value: `greeting-${i}`,
        state,
        include: booted.include,
        ctx,
        fixtureEntry,
        probe,
      })
      volatileRows.push(row)
    }

    for (let i = 1; i <= options.warmup; i += 1) {
      await mutateAndMeasure({
        arm: 'control',
        index: -i,
        value: `warmup-mode-${i}`,
        state,
        include: booted.include,
        ctx,
        fixtureEntry,
        probe,
      })
    }
    for (let i = 1; i <= options.runs; i += 1) {
      const { row } = await mutateAndMeasure({
        arm: 'control',
        index: i,
        value: `mode-${i}`,
        state,
        include: booted.include,
        ctx,
        fixtureEntry,
        probe,
      })
      controlRows.push(row)
    }

    const finalProbe = probe.snapshot()
    result.arms.volatile = {
      field: VOLATILE_FIELD,
      declaredVolatile: true,
      warmup: options.warmup,
      rows: volatileRows,
      summary: summarizeArm(volatileRows),
    }
    result.arms.control = {
      field: CONTROL_FIELD,
      declaredVolatile: false,
      warmup: options.warmup,
      rows: controlRows,
      summary: summarizeArm(controlRows),
    }
    result.final = {
      config: configState(effectiveConfig(fixtureEntry.fiber)),
      probe: {
        applies: finalProbe.applies,
        effectInstalls: finalProbe.effectInstalls,
        effectDisposals: finalProbe.effectDisposals,
        volatileUpdates: finalProbe.volatileUpdates,
        instanceCount: finalProbe.instances.length,
        eventCount: finalProbe.events.length,
      },
    }

    const volatileSummary = result.arms.volatile.summary
    const controlSummary = result.arms.control.summary
    const distinguishable = volatileSummary.remounts !== controlSummary.remounts
      || volatileSummary.effectDisposalsTotal !== controlSummary.effectDisposalsTotal
    result.checks.controlRestarts = controlSummary.pluginReapplied === options.runs
    result.checks.volatileNoRemount = volatileSummary.remounts === 0
    result.checks.volatileConfigUpdated = volatileSummary.configUpdates === options.runs
    result.checks.armsDistinguishable = distinguishable
    result.checks.falsifiable = result.checks.fixtureActive && result.checks.probeRegistered
      && result.checks.controlRestarts && result.checks.armsDistinguishable

    if (!result.checks.fixtureActive || !result.checks.probeRegistered) {
      result.status = 'invalid'
    } else if (!result.checks.controlRestarts) {
      result.status = 'invalid'
    } else if (result.checks.volatileNoRemount && result.checks.volatileConfigUpdated) {
      result.status = 'supported'
    } else {
      result.status = 'refuted'
    }
  } catch (error) {
    result.status = 'error'
    result.errors.push(`${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`)
    result.errorStack = error?.stack ?? null
  } finally {
    try {
      if (ctx?.fiber?.dispose) await withTimeout(ctx.fiber.dispose(), 10_000, 'dispose')
    } catch (error) {
      result.errors.push(`dispose: ${error.message}`)
    }
    try {
      if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true })
    } catch (error) {
      result.errors.push(`sandbox cleanup: ${error.message}`)
    }
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    } catch (error) {
      result.errors.push(`temp cleanup: ${error.message}`)
    }
  }
  return result
}

function hostSummary(host) {
  if (!host || host.status === 'error') return { status: host?.status ?? 'missing', error: host?.errors?.[0] ?? null }
  return {
    status: host.status,
    bootMode: host.runtime?.bootMode ?? host.boot?.bootMode ?? null,
    versions: host.runtime?.versions ?? null,
    volatile: host.arms?.volatile?.summary ?? null,
    control: host.arms?.control?.summary ?? null,
    checks: host.checks,
  }
}

function summarize(hosts) {
  const ids = Object.keys(hosts)
  const ok = ids.filter(id => hosts[id].status === 'supported' || hosts[id].status === 'refuted')
  const supported = ids.every(id => hosts[id].status === 'supported')
  const refuted = ids.every(id => hosts[id].status === 'refuted')
  const status = ids.length === 0 ? 'invalid'
    : ok.length !== ids.length ? 'invalid'
    : supported ? 'supported'
    : refuted ? 'refuted'
    : 'mixed'
  const perHost = Object.fromEntries(ids.map(id => [id, hostSummary(hosts[id])]))
  return {
    status,
    level: 'loader-level',
    byHost: perHost,
    volatileRuns: ids.map(id => hosts[id].arms?.volatile?.summary?.n ?? 0),
    controlRuns: ids.map(id => hosts[id].arms?.control?.summary?.n ?? 0),
    volatileRemounts: Object.fromEntries(ids.map(id => [id, hosts[id].arms?.volatile?.summary?.remounts ?? null])),
    controlRemounts: Object.fromEntries(ids.map(id => [id, hosts[id].arms?.control?.summary?.remounts ?? null])),
    volatileMedianReloadMs: Object.fromEntries(ids.map(id => [id, hosts[id].arms?.volatile?.summary?.reloadMs?.median ?? null])),
    controlMedianReloadMs: Object.fromEntries(ids.map(id => [id, hosts[id].arms?.control?.summary?.reloadMs?.median ?? null])),
    volatileRestarts: Object.fromEntries(ids.map(id => [id, hosts[id].arms?.volatile?.summary?.restarts ?? null])),
    controlRestarts: Object.fromEntries(ids.map(id => [id, hosts[id].arms?.control?.summary?.restarts ?? null])),
    allFalsifiable: ids.every(id => hosts[id].checks?.falsifiable === true),
  }
}

async function workerMain(options) {
  const hostId = options.host
  if (!['installed', 'checkout'].includes(hostId)) throw new Error(`worker host must be installed|checkout, got ${hostId}`)
  const result = await runHost(options, hostId)
  fs.mkdirSync(path.dirname(options.out), { recursive: true })
  fs.writeFileSync(options.out, JSON.stringify(result, null, 2) + '\n')
  const ok = result.status === 'supported' || result.status === 'refuted'
  process.exit(ok ? 0 : 2)
}

function parentMain(options) {
  const hostIds = options.host === 'both' ? ['installed', 'checkout'] : [options.host]
  const hosts = {}
  const workerOutputs = []
  for (const hostId of hostIds) {
    const workerOut = path.join(os.tmpdir(), `lev3-worker-${hostId}-${process.pid}.json`)
    const args = [
      fileURLToPath(import.meta.url),
      '--worker',
      '--host', hostId,
      '--runs', String(options.runs),
      '--warmup', String(options.warmup),
      '--out', workerOut,
    ]
    if (options.installed) args.push('--installed', options.installed)
    if (options.checkout) args.push('--checkout', options.checkout)
    const child = spawnSync(process.execPath, args, { stdio: 'inherit', timeout: 180_000 })
    let host
    if (exists(workerOut)) {
      try {
        host = readJson(workerOut)
      } catch (error) {
        host = { host: hostId, status: 'error', errors: [`cannot parse worker output: ${error.message}`] }
      }
      try {
        fs.rmSync(workerOut, { force: true })
      } catch { /* ignore */ }
    } else {
      host = {
        host: hostId,
        status: 'error',
        errors: [`worker produced no JSON (exit ${child.status}${child.signal ? `, signal ${child.signal}` : ''})`],
      }
    }
    hosts[hostId] = host
    workerOutputs.push({ host: hostId, exit: child.status, status: host.status })
  }

  const result = {
    schema: 'dsh-boost-lev3/1',
    practice: 'LEV-3',
    generatedAt: new Date().toISOString(),
    level: 'loader-level',
    config: {
      runs: options.runs,
      warmup: options.warmup,
      volatileField: VOLATILE_FIELD,
      controlField: CONTROL_FIELD,
      trigger: 'rewrite fixture cordis.yml, call Include.refresh(), await loader.await()',
      triggerCallSite: 'packages/boot/hmr/src/index.ts:472 calls include.refresh() from the watched-file handler',
      composition: 'real Cordis Context + Loader + Include; two YAML rows (probe service, fixture plugin)',
    },
    summary: summarize(hosts),
    hosts,
    provenance: {
      workspace: WORKSPACE,
      fixture: fixtureProvenance(),
      harness: { file: path.relative(WORKSPACE, fileURLToPath(import.meta.url)), sha256: sha256(fileURLToPath(import.meta.url)) },
      workers: workerOutputs,
    },
    limitations: LIMITATIONS,
  }

  fs.mkdirSync(path.dirname(options.out), { recursive: true })
  fs.writeFileSync(options.out, JSON.stringify(result, null, 2) + '\n')

  const printable = {
    schema: result.schema,
    practice: result.practice,
    level: result.level,
    generatedAt: result.generatedAt,
    config: result.config,
    summary: result.summary,
    hosts: Object.fromEntries(Object.entries(hosts).map(([id, host]) => [id, {
      status: host.status,
      runtime: host.runtime ? {
        mode: host.runtime.mode,
        versions: host.runtime.versions,
        git: host.runtime.git ?? null,
      } : null,
      boot: host.boot ? { bootMs: host.boot.bootMs, bootMode: host.boot.bootMode } : null,
      volatile: host.arms?.volatile?.summary ?? null,
      control: host.arms?.control?.summary ?? null,
      checks: host.checks ?? null,
      errors: host.errors ?? [],
    }])),
    output: path.relative(WORKSPACE, options.out),
    limitations: LIMITATIONS,
  }
  console.log(JSON.stringify(printable, null, 2))

  const allOk = hostIds.every(id => hosts[id].status === 'supported' || hosts[id].status === 'refuted')
  process.exit(allOk ? 0 : 2)
}

const options = parseArgs(process.argv.slice(2))
if (options.worker) {
  try {
    await workerMain(options)
  } catch (error) {
    const failure = { host: options.host, status: 'error', errors: [`${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`], errorStack: error?.stack ?? null }
    try {
      fs.mkdirSync(path.dirname(options.out), { recursive: true })
      fs.writeFileSync(options.out, JSON.stringify(failure, null, 2) + '\n')
    } catch { /* ignore */ }
    console.error(`lev3 worker: ${failure.errors[0]}`)
    process.exit(3)
  }
} else {
  parentMain(options)
}

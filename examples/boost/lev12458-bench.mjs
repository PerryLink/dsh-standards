#!/usr/bin/env node
/**
 * BOOST LEV-1 / LEV-2 / LEV-4 / LEV-5 / LEV-8 evidence harness.
 *
 * One process, five scenarios, one JSON result. Every scenario boots the
 * installed Cordis runtime from `/tmp/dsh022` (or `--dsh <dir>`):
 *
 *   LEV-1 loader-level  real Context + Loader; N config restarts of a fixture
 *                       plugin; interval-handle probe + effect disposer count.
 *                       Negative control: raw setInterval with no ctx.effect.
 *   LEV-2 loader-level  real Context + Loader; consumer injects a service that
 *                       does not exist yet (PENDING), then the provider entry is
 *                       inserted and one loader.await() activates it. Negative
 *                       controls: direct ctx.service access without inject, and
 *                       an uncaught access (fiber FAILED, not PENDING).
 *   LEV-4 context-level real Context + ctx.plugin() fibers; waterfall next() vs
 *                       veto, and a throwing notification listener under emit,
 *                       parallel, serial, bail. Records the observed mode.
 *   LEV-5 loader-level  real Loader isolate labels: two named realms with two
 *                       provider instances, two consumers, a provider swap in
 *                       realm A, and a root-scope consumer that must stay
 *                       PENDING (no cross-realm bleed).
 *   LEV-8 loader-level  composition only: two fake bundle manifests are
 *                       resolved with app-boot bundlePatchPaths() and loaded
 *                       with loadOverlayPatches(), then composed with
 *                       composeEntries(). One inserted row is toggled disabled.
 *                       No boot, no plugin import.
 *
 * Usage:
 *   node examples/boost/lev12458-bench.mjs
 *   node examples/boost/lev12458-bench.mjs --only LEV-1,LEV-5 --runs 5
 *   node examples/boost/lev12458-bench.mjs --dsh /tmp/dsh022/node_modules/@deepseek-ai/dsh
 *
 * Exit codes: 0 every requested practice measured; 2 a practice was not
 * measured or the harness errored (the JSON still records the reason).
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE = path.resolve(HERE, '..', '..')
const FIXTURE_DIR = path.join(HERE, 'lev12458-fixture')
const DEFAULT_OUT = path.join(WORKSPACE, '40-checker', 'results', 'boost', 'lev12458.json')
const DEFAULT_DSH = '/tmp/dsh022/node_modules/@deepseek-ai/dsh'
const DEFAULT_CHECKOUT = '<dsh-checkout>'
const PRACTICES = ['LEV-1', 'LEV-2', 'LEV-4', 'LEV-5', 'LEV-8']

const LIMITATIONS = [
  'Synthetic fixtures only: no DSH CLI, profile, bundle boot, real provider, network, API key, or user session data participates.',
  'The installed npm tree is DSH 0.2.2-alpha.2 with Cordis 4.0.6-alpha.1 / loader 1.0.7-alpha.1. npm packages carry no gitHead, so the checkout commit recorded below is provenance for the matching source tree, not proof that the installed bytes are identical.',
  'The checkout was dirty at run time (see environment.checkout.dirtyEntries); checkout commit + installed package versions are reported separately rather than conflated.',
  'Single WSL2 machine, single process, warm filesystem; latency numbers are observations from this fixture, not production profile guarantees.',
  'LEV-1/2/5 are loader-level and LEV-4 is context-level. None of these is a profile-level or end-to-end benchmark.',
]

// ---------------------------------------------------------------------------
// generic helpers

function parseArgs(argv) {
  const options = {
    only: PRACTICES.slice(),
    runs: 5,
    warmup: 0,
    dsh: null,
    checkout: DEFAULT_CHECKOUT,
    out: DEFAULT_OUT,
    json: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--only') {
      const value = argv[++i]
      if (!value) throw new Error('--only needs a comma-separated list')
      options.only = value.split(',').map(item => item.trim().toUpperCase()).filter(Boolean)
      for (const practice of options.only) {
        if (!PRACTICES.includes(practice)) throw new Error(`unknown practice: ${practice}`)
      }
    } else if (arg === '--runs') options.runs = Number(argv[++i])
    else if (arg === '--warmup') options.warmup = Number(argv[++i])
    else if (arg === '--dsh') options.dsh = argv[++i]
    else if (arg === '--checkout') options.checkout = argv[++i]
    else if (arg === '--out') options.out = path.resolve(argv[++i])
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: node examples/boost/lev12458-bench.mjs [--only LEV-1,LEV-2,LEV-4,LEV-5,LEV-8] [--runs 5] [--dsh <dsh package dir>] [--checkout <repo>] [--out <file>] [--json]')
      process.exit(0)
    } else {
      throw new Error(`unknown option: ${arg}`)
    }
  }
  if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error('--runs must be a positive integer')
  if (!Number.isInteger(options.warmup) || options.warmup < 0) throw new Error('--warmup must be a non-negative integer')
  if (!options.only.length) throw new Error('--only selected no practices')
  return options
}

function exists(file) {
  try {
    fs.accessSync(file)
    return true
  } catch {
    return false
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
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

function rel(file) {
  const relative = path.relative(WORKSPACE, file)
  return relative.startsWith('..') ? file : relative
}

function stats(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const at = p => {
    const position = (sorted.length - 1) * p
    const lower = Math.floor(position)
    const upper = Math.ceil(position)
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
  }
  return {
    n: sorted.length,
    min: Number(sorted[0].toFixed(3)),
    median: Number(at(0.5).toFixed(3)),
    p50: Number(at(0.5).toFixed(3)),
    p95: Number(at(0.95).toFixed(3)),
    max: Number(sorted.at(-1).toFixed(3)),
    mean: Number((sorted.reduce((total, value) => total + value, 0) / sorted.length).toFixed(3)),
  }
}

function stateName(state) {
  return { 0: 'PENDING', 1: 'LOADING', 2: 'ACTIVE', 3: 'FAILED', 4: 'DISPOSED', 5: 'UNLOADING' }[state] ?? String(state)
}

function fixtureFiles(directory) {
  const files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(mjs|js|yml|yaml|json)$/.test(entry.name)) {
        files.push({ path: rel(full), sha256: sha256(full) })
      }
    }
  }
  walk(directory)
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    timer.unref?.()
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// ---------------------------------------------------------------------------
// runtime resolution and provenance

function findPackage(dshDir, name, entryFile) {
  const aiDir = path.dirname(dshDir)
  const candidates = [
    path.join(aiDir, name),
    path.join(dshDir, 'node_modules', '@deepseek-ai', name),
  ]
  for (const candidate of candidates) {
    if (exists(path.join(candidate, 'package.json')) && exists(path.join(candidate, entryFile))) {
      return candidate
    }
  }
  throw new Error(`cannot find @deepseek-ai/${name}; tried ${candidates.join(', ')}`)
}

async function bootRuntime(options) {
  const dshDir = path.resolve(options.dsh ?? process.env.DSH_INSTALL_DIR ?? DEFAULT_DSH)
  if (!exists(path.join(dshDir, 'package.json'))) throw new Error(`DSH package not found: ${dshDir}`)
  const dirs = {
    dsh: dshDir,
    cordis: findPackage(dshDir, 'cordis', 'lib/index.js'),
    loader: findPackage(dshDir, 'cordis-plugin-loader', 'lib/index.js'),
    include: findPackage(dshDir, 'cordis-plugin-include', 'lib/index.js'),
    appBoot: findPackage(dshDir, 'dsh-app-boot', 'lib/index.js'),
  }
  const modules = {
    cordis: await import(pathToFileURL(path.join(dirs.cordis, 'lib/index.js')).href),
    loader: await import(pathToFileURL(path.join(dirs.loader, 'lib/index.js')).href),
    appBoot: await import(pathToFileURL(path.join(dirs.appBoot, 'lib/index.js')).href),
  }
  return {
    dirs,
    Context: modules.cordis.Context,
    FiberState: modules.cordis.FiberState,
    Loader: modules.loader.default,
    appBoot: modules.appBoot,
  }
}

function checkoutInfo(checkout) {
  const info = { path: checkout, commit: null, dirty: null, dirtyEntries: null, packageVersion: null }
  try {
    info.packageVersion = packageVersion(checkout)
    info.commit = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const status = execFileSync('git', ['-C', checkout, 'status', '--porcelain'], { encoding: 'utf8' }).trim()
    info.dirty = status.length > 0
    info.dirtyEntries = status.length ? status.split('\n').length : 0
    info.dirtyPaths = status.length ? status.split('\n').slice(0, 10) : []
  } catch (error) {
    info.error = error.message
  }
  return info
}

function collectEnvironment(runtime, options) {
  return {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    kernel: os.release(),
    cpus: os.cpus().length,
    workspace: WORKSPACE,
    dsh: {
      version: packageVersion(runtime.dirs.dsh),
      package: runtime.dirs.dsh,
      packageJsonSha256: sha256(path.join(runtime.dirs.dsh, 'package.json')),
    },
    cordis: {
      version: packageVersion(runtime.dirs.cordis),
      package: runtime.dirs.cordis,
      libSha256: sha256(path.join(runtime.dirs.cordis, 'lib/index.js')),
    },
    loader: {
      version: packageVersion(runtime.dirs.loader),
      package: runtime.dirs.loader,
      libSha256: sha256(path.join(runtime.dirs.loader, 'lib/index.js')),
    },
    include: {
      version: packageVersion(runtime.dirs.include),
      package: runtime.dirs.include,
      libSha256: sha256(path.join(runtime.dirs.include, 'lib/index.js')),
      used: false,
      note: 'not used by this harness; recorded because the install ships it',
    },
    appBoot: {
      version: packageVersion(runtime.dirs.appBoot),
      package: runtime.dirs.appBoot,
      libSha256: sha256(path.join(runtime.dirs.appBoot, 'lib/index.js')),
      used: ['LEV-8'],
    },
    checkout: checkoutInfo(options.checkout),
    note: 'installed npm packages have no gitHead; checkout commit is provenance for the source tree, not a byte-identity claim',
  }
}

// ---------------------------------------------------------------------------
// LEV-1 — reversible loader restarts: effects dispose and a raw timer leaks

async function runLev1Arm(runtime, options, arm) {
  const dir = path.join(FIXTURE_DIR, 'lev1')
  const ctx = new runtime.Context()
  ctx.baseUrl = pathToFileURL(dir).href + '/'
  await ctx.plugin(runtime.Loader)
  await ctx.loader.create({ id: 'lev1-probe', name: './probe.mjs' })
  await ctx.loader.await()
  const probe = ctx.lev1Probe
  if (!probe) throw new Error('lev1Probe service was not registered')
  const boot = probe.snapshot()

  const fixtureFile = arm === 'positive' ? './positive.mjs' : './negative.mjs'
  await ctx.loader.create({ id: 'lev1-fixture', name: fixtureFile, config: { mode: 'm0' } })
  await ctx.loader.await()
  const entry = ctx.loader.resolve('lev1-fixture')
  if (entry.fiber?.state !== 2) {
    throw new Error(`LEV-1 ${arm} fixture did not activate: state=${stateName(entry.fiber?.state)}`)
  }

  const afterFirstApply = probe.snapshot()
  const firstEffectsEvent = afterFirstApply.events.filter(event => event.type === 'effects').at(-1)
  const baselineEffects = firstEffectsEvent?.labels ?? []
  const firstOpenTimers = afterFirstApply.openTimers
  const rows = []

  for (let i = 1; i <= options.runs; i += 1) {
    const started = performance.now()
    await ctx.loader.update('lev1-fixture', { config: { mode: `m${i}` } })
    await ctx.loader.await()
    const reloadMs = performance.now() - started
    const snapshot = probe.snapshot()
    const labels = entry.fiber.getEffects().map(effect => effect.label)
    rows.push({
      i,
      mode: `m${i}`,
      state: entry.fiber.state,
      stateName: stateName(entry.fiber.state),
      reloadMs: Number(reloadMs.toFixed(3)),
      applies: snapshot.applies,
      timerDisposers: snapshot.timerDisposers,
      auxDisposers: snapshot.auxDisposers,
      disposerCalls: snapshot.disposerCalls,
      openTimers: snapshot.openTimers,
      effects: labels,
      effectsMatchBaseline: isDeepStrictEqual(labels, baselineEffects),
    })
  }

  ctx.emit('lev1/ping')
  const afterPing = probe.snapshot()
  const finalEffects = entry.fiber.getEffects().map(effect => effect.label)
  const finalActive = {
    state: entry.fiber.state,
    stateName: stateName(entry.fiber.state),
    effects: finalEffects,
    effectsMatchBaseline: isDeepStrictEqual(finalEffects, baselineEffects),
    applies: afterPing.applies,
    effectInstalls: afterPing.effectInstalls,
    timerDisposers: afterPing.timerDisposers,
    auxDisposers: afterPing.auxDisposers,
    disposerCalls: afterPing.disposerCalls,
    pings: afterPing.pings,
    openTimers: afterPing.openTimers,
  }
  await withTimeout(ctx.fiber.dispose(), 10_000, `LEV-1 ${arm} dispose`)
  const afterDispose = probe.snapshot()
  const drained = probe.drainTimers()

  return {
    arm,
    fixture: fixtureFile,
    runs: options.runs,
    bootOpenTimers: boot.openTimers,
    firstOpenTimers,
    baselineEffects,
    firstEffectsEvent,
    rows,
    final: finalActive,
    disposed: {
      state: entry.fiber.state,
      stateName: stateName(entry.fiber.state),
      effects: entry.fiber.getEffects().map(effect => effect.label),
      openTimers: afterDispose.openTimers,
      leakedTimersDrained: drained,
    },
    latencyMs: stats(rows.map(row => row.reloadMs)),
  }
}

async function runLev1(runtime, environment, options) {
  const positive = await runLev1Arm(runtime, options, 'positive')
  const negative = await runLev1Arm(runtime, options, 'negative')
  const runs = options.runs
  const checks = {
    fixturesActive: positive.final.state === 2 && negative.final.state === 2,
    positiveTimerDisposedPerRestart: positive.final.timerDisposers === runs,
    positiveNoOpenTimerDelta: positive.final.openTimers === positive.firstOpenTimers,
    positiveEffectsMatchBaseline: positive.rows.every(row => row.effectsMatchBaseline) && positive.final.effectsMatchBaseline,
    negativeTimerNeverDisposed: negative.final.timerDisposers === 0,
    negativeLeakDetected: negative.final.openTimers - negative.firstOpenTimers === runs,
    negativeEffectsMatchItsOwnBaseline: negative.rows.every(row => row.effectsMatchBaseline) && negative.final.effectsMatchBaseline,
    probeDistinguishes: (positive.final.openTimers - positive.firstOpenTimers) !== (negative.final.openTimers - negative.firstOpenTimers),
  }
  const supported = Object.values(checks).every(Boolean)
  return {
    practice: 'LEV-1',
    title: '可逆 / reversible effects across loader restarts',
    level: 'loader-level',
    status: 'measured',
    hypothesis: 'A fixture that registers a timer, a listener, and an auxiliary effect through ctx.effect returns to its effect baseline after N loader restarts and its timer disposer runs N times; a raw setInterval without ctx.effect leaks one handle per restart.',
    environment,
    input: {
      fixtureFiles: fixtureFiles(path.join(FIXTURE_DIR, 'lev1')),
      composition: 'real Context + Loader; entries: lev1-probe (service), lev1-fixture (positive.mjs | negative.mjs)',
      restartTrigger: 'ctx.loader.update("lev1-fixture", { config: { mode } }) + ctx.loader.await()',
      arms: ['positive', 'negative'],
      runs,
      pingEvent: 'lev1/ping emitted once after the restarts',
      probe: 'lev1Probe service wraps globalThis.setInterval/clearInterval to count open interval handles; counts ctx.effect disposers and fiber.getEffects() labels',
    },
    command: `node examples/boost/lev12458-bench.mjs --only LEV-1 --runs ${runs}`,
    negativeControl: {
      fixture: 'lev1/negative.mjs',
      description: 'Same listener and auxiliary effect, but the interval is created with the raw global setInterval and has no ctx.effect disposer. The probe must see one leaked handle per restart, not merely trust the fixture.',
      expected: `open interval handles grow by ${runs}; timer disposers stay 0`,
      observed: {
        openTimersAfterFirstApply: negative.firstOpenTimers,
        openTimersAfterRestarts: negative.final.openTimers,
        openTimersDelta: negative.final.openTimers - negative.firstOpenTimers,
        timerDisposers: negative.final.timerDisposers,
        openTimersAfterDispose: negative.disposed.openTimers,
        leakedTimersDrained: negative.disposed.leakedTimersDrained,
      },
    },
    result: {
      runs,
      positive,
      negative,
      divergence: {
        timerDisposerDelta: positive.final.timerDisposers - negative.final.timerDisposers,
        openTimerDelta: (positive.final.openTimers - positive.firstOpenTimers) - (negative.final.openTimers - negative.firstOpenTimers),
        effectCountDelta: positive.baselineEffects.length - negative.baselineEffects.length,
        pingsAfterRestarts: { positive: positive.final.pings, negative: negative.final.pings },
      },
      checks,
      verdict: supported ? 'supported' : 'refuted',
    },
    limitations: [
      'loader-level: real Context + Loader with three fixture entries; no DSH profile, CLI, Include/YAML, or chokidar watcher.',
      'Restart trigger is ctx.loader.update()+loader.await(), the same entry-update path Include.refresh() drives after a YAML change; the file watcher is not measured.',
      'The interval probe wraps globalThis.setInterval/clearInterval in this process only; setTimeout, setImmediate, sockets, and native resources are not instrumented.',
      'The negative fixture is deliberately synthetic; it proves the probe detects this leak class, not that real plugins commonly leak.',
      `N=${runs}; latency is a warm single-process observation, not a production number.`,
      'getEffects() is Cordis fiber metadata; baseline comparison is over effect labels, not resource identity.',
    ],
  }
}

// ---------------------------------------------------------------------------
// LEV-2 — waiting: inject keeps the consumer PENDING, provider insertion activates it

async function runLev2(runtime, environment, options) {
  const dir = path.join(FIXTURE_DIR, 'lev2')
  const ctx = new runtime.Context()
  ctx.baseUrl = pathToFileURL(dir).href + '/'
  await ctx.plugin(runtime.Loader)
  await ctx.plugin(await import(pathToFileURL(path.join(dir, 'probe.mjs')).href))
  await ctx.loader.create({ id: 'lev2-b', name: './consumer.mjs' })
  await ctx.loader.await()
  const bEntry = ctx.loader.resolve('lev2-b')
  const before = {
    state: bEntry.fiber?.state ?? null,
    stateName: stateName(bEntry.fiber?.state),
    pendingTasks: ctx.loader.getTasks().length,
    probe: ctx.lev2Probe.snapshot(),
  }

  await ctx.loader.create({ id: 'lev2-direct-before', name: './direct.mjs' })
  await ctx.loader.await()
  await ctx.loader.create({ id: 'lev2-bad', name: './bad-consumer.mjs' })
  await ctx.loader.await()
  const badState = ctx.loader.resolve('lev2-bad').fiber?.state ?? null

  const started = performance.now()
  await ctx.loader.create({ id: 'lev2-a', name: './service-a.mjs', config: { value: 'A1' } })
  await ctx.loader.await()
  const activationMs = performance.now() - started
  const after = {
    state: bEntry.fiber?.state ?? null,
    stateName: stateName(bEntry.fiber?.state),
    pendingTasks: ctx.loader.getTasks().length,
    probe: ctx.lev2Probe.snapshot(),
  }

  await ctx.loader.create({ id: 'lev2-direct-after', name: './direct.mjs' })
  await ctx.loader.await()
  const finalProbe = ctx.lev2Probe.snapshot()
  const directEvents = finalProbe.events.filter(event => event.type === 'direct-access')
  const applyEvents = finalProbe.events.filter(event => event.type === 'apply')
  await withTimeout(ctx.fiber.dispose(), 10_000, 'LEV-2 dispose')

  const checks = {
    consumerPendingBeforeProvider: before.state === 0,
    noTypeErrorWhilePending: before.pendingTasks === 0 && before.probe.events.length === 0,
    consumerActiveAfterProvider: after.state === 2,
    activatedInOneLoaderEpoch: after.state === 2 && after.pendingTasks === 0,
    consumerApplyRecorded: applyEvents.length === 1 && applyEvents[0].value === 'A1',
    badConsumerFailedNotPending: badState === 3,
    directAccessThrowsBefore: directEvents.length >= 1 && directEvents[0].ok === false && /without inject/.test(directEvents[0].message),
    directAccessThrowsAfter: directEvents.length >= 2 && directEvents[1].ok === false && /without inject/.test(directEvents[1].message),
  }
  const supported = Object.values(checks).every(Boolean)
  return {
    practice: 'LEV-2',
    title: '等待 / waiting for an injected service instead of failing',
    level: 'loader-level',
    status: 'measured',
    hypothesis: 'A consumer that declares inject=[service] stays PENDING without a TypeError while the provider is absent; inserting the provider entry and awaiting the loader once makes the consumer ACTIVE. Direct ctx.service access without inject throws instead.',
    environment,
    input: {
      fixtureFiles: fixtureFiles(path.join(FIXTURE_DIR, 'lev2')),
      composition: 'real Context + Loader; lev2-probe root service; entries: lev2-b consumer, lev2-direct-before, lev2-bad, lev2-a provider, lev2-direct-after',
      providerInsertion: 'ctx.loader.create({ id: "lev2-a", name: "./service-a.mjs", config: { value: "A1" } })',
      activationWait: 'one ctx.loader.await() after provider insertion',
    },
    command: `node examples/boost/lev12458-bench.mjs --only LEV-2 --runs ${options.runs}`,
    negativeControl: {
      fixtures: ['lev2/direct.mjs', 'lev2/bad-consumer.mjs'],
      description: 'direct.mjs declares no inject and reads ctx.lev2Svc; it catches the error so the message can be recorded before and after the provider exists. bad-consumer.mjs does the same read uncaught, so its fiber must FAIL rather than wait.',
      expected: 'direct access throws "cannot get property ... without inject" both before and after; bad-consumer fiber state is FAILED (3)',
      observed: {
        directEvents,
        badConsumerState: badState,
        badConsumerStateName: stateName(badState),
      },
    },
    result: {
      before,
      after,
      activationMs: Number(activationMs.toFixed(3)),
      applies: applyEvents,
      directEvents,
      badConsumerState: badState,
      checks,
      verdict: supported ? 'supported' : 'refuted',
    },
    limitations: [
      'loader-level synthetic service; no real DSH service or plugin is involved.',
      '"one epoch" means one ctx.loader.await() after provider insertion, not a wall-clock guarantee.',
      'The direct-access negative control uses ctx.get("lev2Probe", false) only to report the caught error; the access under test is the undeclared ctx.lev2Svc read.',
      'Cordis 4 requires inject for service access; the throw is the documented strict model, not a defect.',
      'Single process, single machine; activationMs includes loader bookkeeping, not service construction cost.',
    ],
  }
}

// ---------------------------------------------------------------------------
// LEV-4 — waterfall next/veto and notification-listener failure modes

async function runLev4(runtime, environment, options) {
  const dir = path.join(FIXTURE_DIR, 'lev4')
  const waterfallModule = await import(pathToFileURL(path.join(dir, 'waterfall.mjs')).href)
  const notifyModule = await import(pathToFileURL(path.join(dir, 'notify.mjs')).href)

  const waterfall = []
  for (const shortCircuit of [false, true]) {
    const ctx = new runtime.Context()
    const calls = []
    await ctx.plugin(waterfallModule, { calls, shortCircuit })
    const value = ctx.waterfall('lev4/waterfall', 'payload', () => {
      calls.push('inner')
      return 'inner-result'
    })
    await withTimeout(ctx.fiber.dispose(), 10_000, 'LEV-4 waterfall dispose')
    const expectedCalls = shortCircuit ? ['L1'] : ['L1', 'L2', 'inner']
    const expectedResult = shortCircuit ? 'veto-L1' : 'inner-result'
    waterfall.push({
      case: shortCircuit ? 'waterfall-veto' : 'waterfall-next',
      calls,
      result: value,
      expectedCalls,
      expectedResult,
      pass: isDeepStrictEqual(calls, expectedCalls) && value === expectedResult,
      source: 'lev4/waterfall.mjs: listener 1 calls next() or returns "veto-L1"; listener 2 calls next()',
    })
  }

  const expectedByMode = {
    emit: { calls: ['L1', 'L2'], resolved: false, errorName: 'Error' },
    parallel: { calls: ['L1', 'L2', 'L3'], resolved: false, errorName: 'AggregateError' },
    serial: { calls: ['L1', 'L2'], resolved: false, errorName: 'Error' },
    bail: { calls: ['L1', 'L2'], resolved: false, errorName: 'Error' },
  }
  const notifications = []
  for (const mode of ['emit', 'parallel', 'serial', 'bail']) {
    const ctx = new runtime.Context()
    const calls = []
    await ctx.plugin(notifyModule, { calls, event: `lev4/${mode}` })
    let outcome
    try {
      const returned = ctx[mode](`lev4/${mode}`)
      if (returned && typeof returned.then === 'function') await returned
      outcome = { resolved: true }
    } catch (error) {
      outcome = {
        resolved: false,
        errorName: error.name,
        errorMessage: error.message.split('\n')[0],
        aggregateErrors: Array.isArray(error.errors) ? error.errors.length : null,
      }
    }
    await withTimeout(ctx.fiber.dispose(), 10_000, `LEV-4 ${mode} dispose`)
    const expected = expectedByMode[mode]
    notifications.push({
      mode,
      calls,
      outcome,
      expected,
      pass: isDeepStrictEqual(calls, expected.calls)
        && outcome.resolved === expected.resolved
        && (outcome.resolved || outcome.errorName === expected.errorName),
      documentedBehavior: {
        emit: 'synchronous listeners; a throw propagates and the remaining listeners do not run',
        parallel: 'all listeners run concurrently; rejections are collected into an AggregateError after they settle',
        serial: 'listeners are awaited in order until a bail value; a throw rejects and the remaining listeners do not run',
        bail: 'listeners run synchronously until a bail value; a throw propagates and the remaining listeners do not run',
      }[mode],
    })
  }

  const checks = {
    waterfallNextPreservesNextListener: waterfall[0].pass,
    waterfallVetoShortCircuits: waterfall[1].pass,
    emitThrowStopsRemaining: notifications.find(item => item.mode === 'emit')?.pass === true,
    parallelRunsAllDespiteThrow: notifications.find(item => item.mode === 'parallel')?.pass === true,
    serialThrowStopsRemaining: notifications.find(item => item.mode === 'serial')?.pass === true,
    bailThrowStopsRemaining: notifications.find(item => item.mode === 'bail')?.pass === true,
    modesDistinguishable: new Set(notifications.map(item => JSON.stringify(item.calls))).size >= 2,
  }
  const supported = Object.values(checks).every(Boolean)
  return {
    practice: 'LEV-4',
    title: '事件 / waterfall next-vs-veto and listener failure modes',
    level: 'context-level',
    status: 'measured',
    hypothesis: 'A waterfall listener that calls next() preserves the next listener and the inner callback; one that returns a veto value short-circuits both. A throwing notification listener is contained only in parallel mode (all listeners run, AggregateError); emit/serial/bail stop at the throwing listener, which is the documented dispatch behavior.',
    environment,
    input: {
      fixtureFiles: fixtureFiles(path.join(FIXTURE_DIR, 'lev4')),
      composition: 'real Cordis Context + ctx.plugin() fibers; no Loader/Include',
      events: ['lev4/waterfall', 'lev4/emit', 'lev4/parallel', 'lev4/serial', 'lev4/bail'],
      listeners: 'L1 records, L2 records then throws Error("L2-boom"), L3 records; listeners return undefined so bail is not triggered by a return value',
      implementation: 'Cordis 4.0.6-alpha.1 EventsService.waterfall/emit/parallel/serial/bail',
    },
    command: `node examples/boost/lev12458-bench.mjs --only LEV-4 --runs ${options.runs}`,
    negativeControl: {
      description: 'The veto waterfall case is the negative of the next() case: the same two listeners, but L1 does not call next(). The probe must see L2 and the inner callback skipped; if both cases produced the same calls, the probe would be blind to short-circuiting.',
      expected: 'next: [L1,L2,inner] + inner-result; veto: [L1] + veto-L1',
      observed: {
        next: waterfall[0],
        veto: waterfall[1],
      },
    },
    result: {
      waterfall,
      notifications,
      checks,
      verdict: supported ? 'supported' : 'refuted',
    },
    limitations: [
      'context-level: real Context + real plugin fibers, but no Loader/Include entry and no DSH-specific event contract.',
      'Synthetic event names and listeners; the result describes Cordis EventsService dispatch, not every DSH event.',
      'The throwing listener is identical in all four modes; only the dispatch mode changes, so the comparison is controlled.',
      'No latency numbers: this is a behavior probe, not a benchmark.',
    ],
  }
}

// ---------------------------------------------------------------------------
// LEV-5 — two loader isolate realms, provider swap, no cross-realm bleed

async function runLev5(runtime, environment, options) {
  const dir = path.join(FIXTURE_DIR, 'lev5')
  const consumerFile = path.join(dir, 'consumer.mjs')
  const consumerHashBefore = sha256(consumerFile)
  const ctx = new runtime.Context()
  ctx.baseUrl = pathToFileURL(dir).href + '/'
  await ctx.plugin(runtime.Loader)
  await ctx.plugin(await import(pathToFileURL(path.join(dir, 'probe.mjs')).href))

  await ctx.loader.create({
    id: 'lev5-provider-a',
    name: './provider.mjs',
    config: { version: 'a1', realm: 'a' },
    isolate: { lev5Svc: 'realm-a' },
  })
  await ctx.loader.create({
    id: 'lev5-provider-b',
    name: './provider.mjs',
    config: { version: 'b1', realm: 'b' },
    isolate: { lev5Svc: 'realm-b' },
  })
  await ctx.loader.await()
  await ctx.loader.create({
    id: 'lev5-consumer-a',
    name: './consumer.mjs',
    config: { consumer: 'a' },
    isolate: { lev5Svc: 'realm-a' },
  })
  await ctx.loader.create({
    id: 'lev5-consumer-b',
    name: './consumer.mjs',
    config: { consumer: 'b' },
    isolate: { lev5Svc: 'realm-b' },
  })
  await ctx.loader.create({
    id: 'lev5-consumer-root',
    name: './consumer.mjs',
    config: { consumer: 'root' },
  })
  await ctx.loader.await()

  const entries = {
    providerA: ctx.loader.resolve('lev5-provider-a'),
    providerB: ctx.loader.resolve('lev5-provider-b'),
    consumerA: ctx.loader.resolve('lev5-consumer-a'),
    consumerB: ctx.loader.resolve('lev5-consumer-b'),
    consumerRoot: ctx.loader.resolve('lev5-consumer-root'),
  }
  const before = {
    states: Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, { state: entry.fiber?.state ?? null, stateName: stateName(entry.fiber?.state), uid: entry.fiber?.uid ?? null }])),
    probe: ctx.lev5Probe.snapshot(),
    rootServiceVisible: ctx.get('lev5Svc', false) !== undefined,
  }

  const started = performance.now()
  await ctx.loader.update('lev5-provider-a', { config: { version: 'a2', realm: 'a' } })
  await ctx.loader.await()
  const swapMs = performance.now() - started
  const after = {
    states: Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, { state: entry.fiber?.state ?? null, stateName: stateName(entry.fiber?.state), uid: entry.fiber?.uid ?? null }])),
    probe: ctx.lev5Probe.snapshot(),
    rootServiceVisible: ctx.get('lev5Svc', false) !== undefined,
  }

  const impls = Reflect.ownKeys(ctx.reflect.store)
    .map(key => ctx.reflect.store[key])
    .filter(impl => impl?.name === 'lev5Svc')
    .map(impl => ({ version: impl.value?.version ?? null, realm: impl.value?.realm ?? null, providerUid: impl.fiber?.uid ?? null }))
  const consumerHashAfter = sha256(consumerFile)
  await withTimeout(ctx.fiber.dispose(), 10_000, 'LEV-5 dispose')

  // Snapshot events accumulate: after.probe.events already contains before.probe.events.
  const allEvents = after.probe.events
  const applies = allEvents.filter(event => event.type === 'apply')
  const disposes = allEvents.filter(event => event.type === 'dispose')
  const appliesFor = consumer => applies.filter(event => event.consumer === consumer).map(event => event.version)
  const crossRealmApplies = applies.filter(event => {
    if (event.consumer === 'a') return event.realm !== 'a'
    if (event.consumer === 'b') return event.realm !== 'b'
    return true
  }).length

  const checks = {
    twoRealmProvidersActive: before.states.providerA.state === 2 && before.states.providerB.state === 2,
    twoConsumersActive: before.states.consumerA.state === 2 && before.states.consumerB.state === 2,
    consumerAOwnsRealmA: isDeepStrictEqual(appliesFor('a'), ['a1', 'a2']),
    consumerBOwnsRealmB: isDeepStrictEqual(appliesFor('b'), ['b1']),
    consumerBUnaffectedByProviderASwap: appliesFor('b').length === 1 && disposes.filter(event => event.consumer === 'b').length === 0,
    consumerAReactedToSwap: appliesFor('a').length === 2 && disposes.some(event => event.consumer === 'a' && event.version === 'a1'),
    rootConsumerStaysPending: after.states.consumerRoot.state === 0,
    rootScopeHasNoService: after.rootServiceVisible === false,
    crossRealmBleedZero: crossRealmApplies === 0,
    distinctProviderInstances: impls.length === 2 && new Set(impls.map(impl => `${impl.realm}:${impl.version}`)).size === 2,
    consumerSourceUnchanged: consumerHashBefore === consumerHashAfter,
    providerSwapWasOneLoaderAwait: swapMs >= 0,
  }
  const supported = Object.values(checks).every(Boolean)
  return {
    practice: 'LEV-5',
    title: 'seam / 隔离: two loader isolate realms, provider swap without consumer edits',
    level: 'loader-level',
    status: 'measured',
    hypothesis: 'Two named loader isolate labels give two consumers separate lev5Svc instances; restarting provider A changes consumer A to the new implementation with no consumer edit while consumer B keeps b1; a root-scope consumer stays PENDING (no cross-realm bleed).',
    environment,
    input: {
      fixtureFiles: fixtureFiles(path.join(FIXTURE_DIR, 'lev5')),
      composition: 'real Context + Loader; providers and consumers carry isolate: { lev5Svc: "realm-a" | "realm-b" }; root consumer carries no isolate',
      entries: [
        { id: 'lev5-provider-a', isolate: { lev5Svc: 'realm-a' }, config: { version: 'a1', realm: 'a' } },
        { id: 'lev5-provider-b', isolate: { lev5Svc: 'realm-b' }, config: { version: 'b1', realm: 'b' } },
        { id: 'lev5-consumer-a', isolate: { lev5Svc: 'realm-a' }, config: { consumer: 'a' } },
        { id: 'lev5-consumer-b', isolate: { lev5Svc: 'realm-b' }, config: { consumer: 'b' } },
        { id: 'lev5-consumer-root', config: { consumer: 'root' } },
      ],
      providerSwap: 'ctx.loader.update("lev5-provider-a", { config: { version: "a2", realm: "a" } }) + one loader.await()',
      consumerHashBefore,
    },
    command: `node examples/boost/lev12458-bench.mjs --only LEV-5 --runs ${options.runs}`,
    negativeControl: {
      fixture: 'lev5/consumer.mjs without an isolate label (entry lev5-consumer-root)',
      description: 'A consumer outside both realms injects the same service name. If isolate leaked, it would activate with one of the two providers. It must stay PENDING and the root scope must not expose lev5Svc.',
      expected: 'root consumer state PENDING (0), ctx.get("lev5Svc", false) === undefined, zero foreign-realm apply events',
      observed: {
        rootConsumerState: after.states.consumerRoot.state,
        rootConsumerStateName: after.states.consumerRoot.stateName,
        rootServiceVisible: after.rootServiceVisible,
        crossRealmApplies,
      },
    },
    result: {
      before,
      after,
      swapMs: Number(swapMs.toFixed(3)),
      applies,
      disposes,
      appliesFor: { a: appliesFor('a'), b: appliesFor('b') },
      impls,
      consumerHashBefore,
      consumerHashAfter,
      consumerSourceUnchanged: consumerHashBefore === consumerHashAfter,
      leakedServices: after.rootServiceVisible ? ['root-scope lev5Svc visible'] : [],
      crossRealmApplies,
      checks,
      verdict: supported ? 'supported' : 'refuted',
    },
    limitations: [
      'loader-level isolate, not OS/process isolation and not a security boundary.',
      'leakedServices() is not an exported Cordis/DSH API in these versions; the array is computed from root-scope visibility plus foreign-realm apply events and is labelled as a probe.',
      'Same process: the two realms share the Node runtime, module cache, and event bus.',
      'Provider replacement restarts the provider entry; it does not hot-swap a value inside a running provider object.',
      'Isolate is configuration-sensitive: a missing or mismatched label makes a consumer PENDING rather than falling back to the root scope (this is what the negative control observes).',
    ],
  }
}

// ---------------------------------------------------------------------------
// LEV-8 — bundle patch composition: base + sample, toggle one inserted row

function bundleLayer(appBoot, packageDir) {
  const manifest = readJson(path.join(packageDir, 'package.json'))
  const declared = appBoot.bundlePatchFiles(manifest.dsh?.bundle)
  const paths = appBoot.bundlePatchPaths(packageDir, manifest.dsh?.bundle)
  const patches = paths.flatMap(file => appBoot.loadOverlayPatches('dsh', file))
  return { packageDir, manifest: { name: manifest.name, version: manifest.version, bundle: manifest.dsh?.bundle }, declared, paths, patches }
}

function rowsById(rows) {
  return new Map(rows.filter(row => row.id).map(row => [row.id, row]))
}

function diffRows(before, after) {
  const left = rowsById(before)
  const right = rowsById(after)
  const added = [...right.keys()].filter(id => !left.has(id))
  const removed = [...left.keys()].filter(id => !right.has(id))
  const changed = []
  for (const id of [...right.keys()].filter(key => left.has(key))) {
    const beforeRow = left.get(id)
    const afterRow = right.get(id)
    if (isDeepStrictEqual(beforeRow, afterRow)) continue
    const keys = [...new Set([...Object.keys(beforeRow), ...Object.keys(afterRow)])]
      .filter(key => !isDeepStrictEqual(beforeRow[key], afterRow[key]))
    changed.push({
      id,
      keys,
      before: Object.fromEntries(keys.map(key => [key, beforeRow[key] ?? null])),
      after: Object.fromEntries(keys.map(key => [key, afterRow[key] ?? null])),
    })
  }
  return { added, removed, changed }
}

const ROW_KEYS = new Set(['id', 'name', 'config', 'group', 'disabled', 'inject', 'isolate', 'intercept'])

function checkComposedRows(label, rows) {
  const issues = []
  const ids = new Set()
  for (const row of rows) {
    if (typeof row.id !== 'string' || row.id.length === 0) issues.push(`${label}: row without a string id: ${JSON.stringify(row)}`)
    else if (ids.has(row.id)) issues.push(`${label}: duplicate id ${row.id}`)
    else ids.add(row.id)
    if (row.name !== undefined && typeof row.name !== 'string') issues.push(`${label}: ${row.id} name is not a string`)
    if (row.config !== undefined && (row.config === null || typeof row.config !== 'object')) issues.push(`${label}: ${row.id} config is not an object`)
    if (row.disabled !== undefined && typeof row.disabled !== 'boolean') issues.push(`${label}: ${row.id} disabled is not a boolean`)
    for (const key of Object.keys(row)) {
      if (!ROW_KEYS.has(key)) issues.push(`${label}: ${row.id} has unknown row key ${key}`)
    }
  }
  return { label, ok: issues.length === 0, issues, rows: rows.length, ids: [...ids] }
}

async function runLev8(runtime, environment, options) {
  const appBoot = runtime.appBoot
  const dir = path.join(FIXTURE_DIR, 'lev8')
  const base = bundleLayer(appBoot, path.join(dir, 'bundles', 'base'))
  const sample = bundleLayer(appBoot, path.join(dir, 'bundles', 'sample'))
  const togglePath = path.join(dir, 'toggle.patch.yml')
  const togglePatches = appBoot.loadOverlayPatches('dsh', togglePath)

  const compose = (name, layers) => {
    const warnings = []
    const rows = appBoot.composeEntries(layers, message => warnings.push(message))
    return { name, rows, warnings }
  }
  const baseOnly = compose('base-only', [base.patches])
  const enabled = compose('base+sample', [base.patches, sample.patches])
  const disabled = compose('base+sample+toggle', [base.patches, sample.patches, togglePatches])
  const missingTarget = compose('base+toggle-without-sample', [base.patches, togglePatches])

  let invalidPatch
  try {
    appBoot.loadOverlayPatches('dsh', path.join(dir, 'invalid.patch.yml'))
    invalidPatch = { threw: false, message: null }
  } catch (error) {
    invalidPatch = { threw: true, message: error.message }
  }

  const toggleDiff = diffRows(enabled.rows, disabled.rows)
  const baseRowIds = baseOnly.rows.filter(row => row.id).map(row => row.id)
  const baseStable = [baseOnly, enabled, disabled].every(composition => {
    const map = rowsById(composition.rows)
    return baseRowIds.every(id => isDeepStrictEqual(map.get(id), rowsById(baseOnly.rows).get(id)))
  })
  const sampleRow = rowsById(disabled.rows).get('lev8-sample')
  const missingTargetWarned = missingTarget.warnings.some(message => /lev8-sample/.test(message) && /not found/.test(message))

  const schemaChecks = [baseOnly, enabled, disabled].map(composition => checkComposedRows(composition.name, composition.rows))
  const checks = {
    twoBundleLayersLoaded: base.patches.length > 0 && sample.patches.length > 0 && base.paths.length === 1 && sample.paths.length === 1,
    baseRowsStableAcrossCompositions: baseStable,
    sampleInsertedOnce: enabled.rows.filter(row => row.id === 'lev8-sample').length === 1,
    toggleOnlyChangesSampleDisabled: toggleDiff.added.length === 0
      && toggleDiff.removed.length === 0
      && toggleDiff.changed.length === 1
      && toggleDiff.changed[0].id === 'lev8-sample'
      && isDeepStrictEqual(toggleDiff.changed[0].keys, ['disabled'])
      && sampleRow?.disabled === true,
    validCompositionsHaveNoWarnings: baseOnly.warnings.length === 0 && enabled.warnings.length === 0 && disabled.warnings.length === 0,
    missingTargetIsWarnedAndInert: missingTargetWarned
      && missingTarget.rows.length === baseOnly.rows.length
      && !missingTarget.rows.some(row => row.id === 'lev8-sample'),
    malformedPatchRejected: invalidPatch.threw === true,
    composedRowsPassLocalSchema: schemaChecks.every(check => check.ok),
  }
  const supported = Object.values(checks).every(Boolean)
  return {
    practice: 'LEV-8',
    title: '组合 / bundle patch composition with one toggled insert',
    level: 'loader-level',
    status: 'measured',
    hypothesis: 'Two bundle patch layers (base + sample) compose into the base rows plus exactly one sample row; disabling that sample row with a later profile overlay changes only its disabled flag, leaving both base rows byte-identical. A toggle whose target is absent warns and changes nothing; a malformed insert is rejected by the real parser.',
    environment,
    input: {
      fixtureFiles: fixtureFiles(path.join(FIXTURE_DIR, 'lev8')),
      bundles: [
        { name: base.manifest.name, dir: rel(base.packageDir), patch: base.declared, resolved: base.paths.map(rel) },
        { name: sample.manifest.name, dir: rel(sample.packageDir), patch: sample.declared, resolved: sample.paths.map(rel) },
      ],
      overlay: { file: rel(togglePath), patches: togglePatches },
      composeCalls: ['composeEntries([base])', 'composeEntries([base, sample])', 'composeEntries([base, sample, toggle])', 'composeEntries([base, toggle])'],
      parser: 'dsh-app-boot loadOverlayPatches + composeEntries + bundlePatchPaths + bundlePatchFiles',
    },
    command: `node examples/boost/lev12458-bench.mjs --only LEV-8 --runs ${options.runs}`,
    negativeControl: {
      description: 'The toggle overlay is applied without the sample layer. A sound composer must warn that lev8-sample is not found and leave the base rows untouched; it must not invent or disable anything. Separately, invalid.patch.yml has a non-list insert and must be rejected by the real parser.',
      expected: 'warning mentions lev8-sample not found; rows equal base-only; malformed patch throws',
      observed: {
        missingTargetWarnings: missingTarget.warnings,
        missingTargetRowIds: missingTarget.rows.map(row => row.id),
        malformedPatch: invalidPatch,
      },
    },
    result: {
      compositions: { baseOnly, enabled, disabled, missingTarget },
      diffs: {
        baseToEnabled: diffRows(baseOnly.rows, enabled.rows),
        enabledToDisabled: toggleDiff,
      },
      schemaChecks,
      checks,
      verdict: supported ? 'supported' : 'refuted',
    },
    limitations: [
      'Composition-only: no boot, no plugin import, no runtime activation. The evidence is about patch composition, not a full profile.',
      'The two bundle manifests are synthetic fixture packages; real bundles can have more layers, patches, and configs.',
      'composeEntries() starts from an empty root; this is not a full profile composition (which also has profile and user layers).',
      'The row schema check is a local whitelist of EntryOptions keys, not a published JSON Schema. The real parser was observed to accept unknown row keys; the malformed-insert case is rejected.',
      'The evidence-card check below validates this file\'s rows, not external or production evidence.',
    ],
  }
}

// ---------------------------------------------------------------------------
// evidence-card validation and main

function validateEvidenceCard(rows) {
  const required = ['practice', 'level', 'environment', 'input', 'command', 'negativeControl', 'result', 'limitations']
  const allowedLevels = new Set(['loader-level', 'context-level'])
  const problems = []
  const checked = []
  for (const row of rows) {
    checked.push(row.practice)
    for (const key of required) {
      if (!(key in row)) problems.push(`${row.practice}: missing ${key}`)
    }
    if (!allowedLevels.has(row.level)) problems.push(`${row.practice}: level ${row.level} is not loader-level|context-level`)
    if (typeof row.command !== 'string' || !row.command.includes('lev12458-bench.mjs')) problems.push(`${row.practice}: command does not name the harness`)
    if (!row.negativeControl || typeof row.negativeControl !== 'object' || !row.negativeControl.description) problems.push(`${row.practice}: negativeControl lacks a description`)
    if (!Array.isArray(row.limitations) || row.limitations.length === 0) problems.push(`${row.practice}: limitations is empty`)
    if (!row.result || typeof row.result !== 'object') problems.push(`${row.practice}: result is missing`)
    else if (!['supported', 'refuted'].includes(row.result.verdict)) problems.push(`${row.practice}: result.verdict is ${row.result.verdict}`)
  }
  return { ok: problems.length === 0, checkedPractices: checked, problems }
}

function errorRow(practice, environment, options, error) {
  return {
    practice,
    title: `${practice} harness failure`,
    level: practice === 'LEV-4' ? 'context-level' : 'loader-level',
    status: 'not-measured',
    hypothesis: null,
    environment,
    input: { fixtureFiles: fixtureFiles(FIXTURE_DIR).length ? fixtureFiles(FIXTURE_DIR) : [] },
    command: `node examples/boost/lev12458-bench.mjs --only ${practice} --runs ${options.runs}`,
    negativeControl: { description: 'not run: the harness failed before the negative control could be observed', observed: null },
    result: { error: `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`, stack: error?.stack ?? null, verdict: null },
    limitations: ['Harness error; this practice is not measured and must not be reported as measured.'],
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const runtime = await bootRuntime(options)
  const environment = collectEnvironment(runtime, options)
  const rows = []
  for (const practice of PRACTICES) {
    if (!options.only.includes(practice)) continue
    try {
      let row
      if (practice === 'LEV-1') row = await runLev1(runtime, environment, options)
      else if (practice === 'LEV-2') row = await runLev2(runtime, environment, options)
      else if (practice === 'LEV-4') row = await runLev4(runtime, environment, options)
      else if (practice === 'LEV-5') row = await runLev5(runtime, environment, options)
      else if (practice === 'LEV-8') row = await runLev8(runtime, environment, options)
      rows.push(row)
    } catch (error) {
      rows.push(errorRow(practice, environment, options, error))
    }
  }

  const evidenceCard = validateEvidenceCard(rows)
  const lev8 = rows.find(row => row.practice === 'LEV-8')
  if (lev8) {
    lev8.result.evidenceCardCheck = {
      ...evidenceCard,
      partial: options.only.length !== PRACTICES.length,
      note: 'validates every measurement row present in this JSON; partial when --only selected a subset',
    }
    lev8.result.checks.evidenceCardValid = evidenceCard.ok
    if (!evidenceCard.ok) lev8.result.verdict = 'refuted'
  }

  const measured = rows.filter(row => row.status === 'measured').map(row => row.practice)
  const notMeasured = rows.filter(row => row.status !== 'measured').map(row => row.practice)
  const result = {
    schema: 'dsh-boost-lev12458/1',
    generatedAt: new Date().toISOString(),
    command: ['node', 'examples/boost/lev12458-bench.mjs', ...process.argv.slice(2)],
    environment,
    summary: {
      status: notMeasured.length ? 'partial' : 'measured',
      measured,
      notMeasured,
      verdicts: Object.fromEntries(rows.map(row => [row.practice, row.result?.verdict ?? null])),
      evidenceCard,
    },
    measurements: rows,
    fixture: { directory: rel(FIXTURE_DIR), files: fixtureFiles(FIXTURE_DIR) },
    limitations: LIMITATIONS,
  }

  fs.mkdirSync(path.dirname(options.out), { recursive: true })
  fs.writeFileSync(options.out, JSON.stringify(result, null, 2) + '\n')
  const printable = {
    schema: result.schema,
    generatedAt: result.generatedAt,
    environment: {
      node: environment.node,
      dsh: environment.dsh.version,
      cordis: environment.cordis.version,
      loader: environment.loader.version,
      checkoutCommit: environment.checkout.commit,
    },
    summary: result.summary,
    output: rel(options.out),
    measurements: rows.map(row => ({
      practice: row.practice,
      level: row.level,
      status: row.status,
      verdict: row.result?.verdict ?? null,
      negativeControl: Boolean(row.negativeControl?.description),
      error: row.result?.error ?? null,
    })),
    limitations: LIMITATIONS,
  }
  console.log(JSON.stringify(printable, null, 2))
  process.exit(notMeasured.length ? 2 : 0)
}

try {
  await main()
} catch (error) {
  console.error(`lev12458-bench: ${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`)
  console.error(error?.stack ?? '')
  process.exit(3)
}

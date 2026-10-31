import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { check, detail, worst } from './result.mjs'
import { regexHits } from './util.mjs'

const ACTIVE = 2

function classifyImportError(message) {
  const missing = /Cannot find (?:module|package) ['"]([^'"]+)['"]/.exec(message)
  if (missing) {
    const specifier = missing[1]
    // A missing relative file is a packaging bug; a missing bare package is
    // an environment/host-farm gap (the checker cannot tell whether the
    // package manager would have installed it).
    return specifier.startsWith('.') || specifier.startsWith('/') ? 'fail' : 'blocked'
  }
  if (/timed out/.test(message)) return 'blocked'
  return 'fail'
}

function makeStub() {
  const fn = function stub() {}
  return new Proxy(fn, {
    get(_target, property) {
      if (property === 'then') return undefined
      if (property === 'toJSON') return () => ({})
      if (property === Symbol.toPrimitive) return () => ''
      if (property === Symbol.iterator) return function* empty() {}
      return makeStub()
    },
    apply() { return makeStub() },
    construct() { return makeStub() },
  })
}

function withTimeout(promise, timeoutMs, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function declaredInject(module) {
  const value = module?.inject ?? module?.default?.inject
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string')
  if (value && typeof value === 'object') return Object.keys(value)
  return []
}

function declaredProvide(module) {
  const value = module?.provide ?? module?.default?.provide
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string')
  return []
}

function pluginOf(module) {
  if (typeof module?.default === 'function') return module.default
  if (typeof module?.apply === 'function') return module
  if (typeof module === 'function') return module
  return null
}

function implFiber(impl) {
  return impl?.ctx?.fiber ?? impl?.fiber ?? null
}

function storeEntries(ctx) {
  const store = ctx.reflect.store ?? {}
  return Reflect.ownKeys(store).map(key => store[key]).filter(Boolean)
}

function ownedService(ctx, fiber, name) {
  return storeEntries(ctx).find(impl => impl?.name === name && implFiber(impl) === fiber) ?? null
}

function serviceNames(ctx, fiber) {
  return new Set(storeEntries(ctx).filter(impl => implFiber(impl) === fiber).map(impl => impl.name))
}

function makeNa(reason) {
  return [
    check({ id: 'DSC-04', clause: 'C-4', layer: 'L1', result: 'NA', reason }),
    check({ id: 'DSC-05', clause: 'C-5', layer: 'L1', result: 'NA', reason }),
    check({ id: 'DSC-06', clause: 'C-6', layer: 'L1+L2', result: 'NA', reason }),
    check({ id: 'DSC-07', clause: 'C-7', layer: 'L2', result: 'NA', reason }),
    check({ id: 'DSC-08', clause: 'C-8', layer: 'L3', result: 'NA', reason }),
    check({ id: 'DSC-09', clause: 'C-9', layer: 'L1', result: 'NA', reason }),
  ]
}

function makeNotRun(reason, skip = []) {
  return ['DSC-04', 'DSC-05', 'DSC-06', 'DSC-07', 'DSC-08', 'DSC-09'].filter(id => !skip.includes(id)).map(id => {
    const clause = { 'DSC-04': 'C-4', 'DSC-05': 'C-5', 'DSC-06': 'C-6', 'DSC-07': 'C-7', 'DSC-08': 'C-8', 'DSC-09': 'C-9' }[id]
    const layer = { 'DSC-04': 'L1', 'DSC-05': 'L1', 'DSC-06': 'L1+L2', 'DSC-07': 'L2', 'DSC-08': 'L3', 'DSC-09': 'L1' }[id]
    return check({ id, clause, layer, result: 'ERROR', coverage: 'not-run', reason })
  })
}

/**
 * Run L1-L3 in a child-free context. This is a best-effort harness: any
 * failure that cannot be attributed to the plugin (missing host packages,
 * incomplete stubs) is reported as ERROR/blocked, never FAIL.
 *
 * @param {object} input
 * @param {string} input.dir
 * @param {object} input.manifest
 * @param {string} input.kind
 * @param {object|null} input.entry
 * @param {string} input.runtimePath
 * @param {number} [input.timeoutMs]
 * @param {object[]} [input.sources]
 */
export async function runRuntimeChecks(input) {
  const { dir, manifest, kind, entry, runtimePath, timeoutMs = 10_000, sources = [] } = input
  if (kind !== 'plugin') return makeNa(`kind=${kind}; L1-L3 apply to plugin entries only`)
  if (!runtimePath) return makeNotRun('no --runtime supplied; L1-L3 not run')
  if (!entry?.exists) return makeNotRun('no resolvable runtime entry; L1-L3 not run')

  let Context
  try {
    const runtime = await import(pathToFileURL(path.resolve(runtimePath)).href)
    Context = runtime.Context ?? runtime.default?.Context
    if (typeof Context !== 'function') throw new Error('runtime module does not export Context')
  } catch (error) {
    return makeNotRun(`runtime import failed: ${error.message}`)
  }

  let module
  try {
    module = await import(pathToFileURL(entry.absolute).href)
  } catch (error) {
    const message = error?.message ?? String(error)
    if (classifyImportError(message) === 'blocked') {
      return makeNotRun(`plugin import blocked by missing host dependency: ${message.split('\n')[0]}`)
    }
    return [
      check({ id: 'DSC-04', clause: 'C-4', layer: 'L1', result: 'FAIL', reason: `entry import failed: ${message}`, evidence: [entry.relative] }),
      ...makeNotRun('C-4 failed; L1-L3 short-circuited', ['DSC-04']),
    ]
  }

  const plugin = pluginOf(module)
  if (!plugin) return makeNa('entry does not export a function, { apply }, or default class')

  let ctx
  let fiber
  let beforeStore = null
  let beforeRegistry = 0
  try {
    ctx = new Context()
    for (const name of declaredInject(module)) {
      if (ctx.get(name, false) === undefined) {
        try { ctx.provide(name, makeStub()) } catch { /* already provided by the root */ }
      }
    }
    beforeStore = new Set(Reflect.ownKeys(ctx.reflect.store ?? {}))
    beforeRegistry = ctx.registry.size
    fiber = ctx.plugin(plugin)
    await withTimeout(Promise.resolve(fiber), timeoutMs, 'plugin load')
  } catch (error) {
    const message = error?.message ?? String(error)
    const stubGap = /is not a function|Cannot read propert(?:y|ies) of (?:undefined|null)/.test(message)
    const blocked = classifyImportError(message) === 'blocked' || stubGap
    return [
      check({ id: 'DSC-04', clause: 'C-4', layer: 'L1', result: blocked ? 'ERROR' : 'FAIL', coverage: blocked ? 'not-run' : 'full', reason: `load failed: ${message}`, evidence: [entry.relative] }),
      ...makeNotRun('C-4 did not reach ACTIVE', ['DSC-04']),
    ]
  }

  const active = fiber.state === ACTIVE
  const loadCheck = check({
    id: 'DSC-04', clause: 'C-4', layer: 'L1',
    result: active ? 'PASS' : 'FAIL',
    reason: active ? '' : `fiber state ${fiber.state} is not ACTIVE (2)`,
    evidence: [entry.relative],
  })
  if (!active) return [loadCheck, ...makeNotRun('C-4 did not reach ACTIVE', ['DSC-04'])]

  const realFiber = fiber.ctx?.fiber ?? Object.getPrototypeOf(fiber) ?? fiber
  const declared = declaredProvide(module)
  const measured = serviceNames(ctx, realFiber)
  const provideDetails = []
  for (const name of declared) {
    const impl = ownedService(ctx, realFiber, name)
    if (impl) provideDetails.push(detail('C-5.2', 'PASS', `service ${name} is owned by the plugin fiber`))
    else if (storeEntries(ctx).some(entry => entry?.name === name)) provideDetails.push(detail('C-5.2', 'FAIL', `service ${name} is owned by another fiber`))
    else provideDetails.push(detail('C-5.2', 'FAIL', `declared provide ${name} was not registered`))
  }
  if (declared.length === 0) provideDetails.push(detail('C-5.1', 'NA', 'no provide declaration'))
  const provideResult = declared.length === 0 ? 'NA' : worst(provideDetails.map(item => item.result))
  const provideCheck = check({
    id: 'DSC-05', clause: 'C-5', layer: 'L1', result: provideResult,
    reason: provideDetails.filter(item => item.result !== 'PASS' && item.result !== 'NA').map(item => `${item.item}: ${item.reason}`).join(' | '),
    details: provideDetails,
  })

  const effects = fiber.getEffects()
  const labels = effects.map(effect => effect?.label ?? 'anonymous')
  const privateHits = regexHits(sources, /(?:ctx\.events\._hooks|ctx\.reflect\.store|ctx\.registry\._internal|fiber\._disposables)\s*(?:\.|\[)[^\n]{0,40}=/g)
  const effectDetails = []
  if (effects.length === 0 && (declared.length > 0 || labels.length === 0)) effectDetails.push(detail('C-6.2', 'WARN', 'no registered effects observed'))
  else effectDetails.push(detail('C-6.2', 'PASS', `${effects.length} registered effect(s)`))
  if (labels.length > 0 && labels.every(label => label === 'anonymous')) effectDetails.push(detail('C-6.2', 'WARN', 'all effects are anonymous'))
  if (privateHits.length > 0) effectDetails.push(detail('C-6.1', 'FAIL', 'direct write to a Cordis private registration surface', privateHits.slice(0, 3).map(hit => `${hit.file}:${hit.line}`)))
  const effectResult = worst(effectDetails.map(item => item.result))
  const effectCheck = check({
    id: 'DSC-06', clause: 'C-6', layer: 'L1+L2', result: effectResult,
    reason: effectDetails.filter(item => item.result !== 'PASS').map(item => `${item.item}: ${item.reason}`).join(' | '),
    details: effectDetails,
  })

  let unloadDetails = []
  let unloadResult = 'PASS'
  try {
    await withTimeout(Promise.resolve(fiber.dispose()), timeoutMs, 'fiber dispose')
    const afterEffects = fiber.getEffects().length
    const afterStore = new Set(Reflect.ownKeys(ctx.reflect.store ?? {}))
    const afterRegistry = ctx.registry.size
    unloadDetails = [
      detail('C-7.1', afterEffects === 0 ? 'PASS' : 'FAIL', `getEffects().length=${afterEffects}`),
      detail('C-7.2', [...beforeStore].every(key => afterStore.has(key)) ? 'PASS' : 'FAIL', 'service store returned to baseline'),
      detail('C-7.3', beforeRegistry === afterRegistry ? 'PASS' : 'FAIL', `registry.size ${beforeRegistry} -> ${afterRegistry}`),
    ]
    unloadResult = worst(unloadDetails.map(item => item.result))
  } catch (error) {
    unloadDetails = [detail('C-7.5', 'FAIL', `dispose failed: ${error.message}`)]
    unloadResult = 'FAIL'
  }
  const unloadCheck = check({
    id: 'DSC-07', clause: 'C-7', layer: 'L2', result: unloadResult,
    reason: unloadDetails.filter(item => item.result !== 'PASS').map(item => `${item.item}: ${item.reason}`).join(' | '),
    details: unloadDetails,
  })

  let restartResult = 'PASS'
  let restartDetails = []
  try {
    const ctxR = new Context()
    for (const name of declaredInject(module)) {
      if (ctxR.get(name, false) === undefined) {
        try { ctxR.provide(name, makeStub()) } catch { /* ignore */ }
      }
    }
    const fiberR = ctxR.plugin(plugin)
    await withTimeout(Promise.resolve(fiberR), timeoutMs, 'restart fixture load')
    const beforeRestart = fiberR.getEffects().length
    const revisionBefore = typeof fiberR._revision === 'number' ? fiberR._revision : null
    const epochBefore = fiberR._runner?.epoch
    await withTimeout(Promise.resolve(fiberR.restart()), timeoutMs, 'fiber restart')
    const revisionAfter = typeof fiberR._revision === 'number' ? fiberR._revision : null
    const epochAfter = fiberR._runner?.epoch
    const afterRestart = fiberR.getEffects()
    restartDetails.push(detail('C-8.1', fiberR.state === ACTIVE ? 'PASS' : 'FAIL', `state after restart=${fiberR.state}`))
    restartDetails.push(detail('C-8.1', afterRestart.length === beforeRestart ? 'PASS' : 'WARN', `effect count ${beforeRestart} -> ${afterRestart.length}`))
    const advanced = (revisionBefore !== null && revisionAfter !== null && revisionAfter > revisionBefore) || (epochBefore !== undefined && epochAfter !== undefined && epochAfter !== epochBefore)
    restartDetails.push(detail('C-8.2', advanced ? 'PASS' : 'WARN', `revision ${revisionBefore} -> ${revisionAfter}; epoch ${String(epochBefore)} -> ${String(epochAfter)}`))
    const ctx2 = new Context()
    for (const name of declaredInject(module)) {
      if (ctx2.get(name, false) === undefined) {
        try { ctx2.provide(name, makeStub()) } catch { /* ignore */ }
      }
    }
    const fiber2 = ctx2.plugin(plugin)
    await withTimeout(Promise.resolve(fiber2), timeoutMs, 'cold remount')
    restartDetails.push(detail('C-8.3', fiber2.state === ACTIVE ? 'PASS' : 'FAIL', `cold remount state=${fiber2.state}`))
  } catch (error) {
    restartDetails.push(detail('C-8.1', 'FAIL', `restart/remount failed: ${error.message}`))
  }
  restartResult = worst(restartDetails.map(item => item.result))
  const restartCheck = check({
    id: 'DSC-08', clause: 'C-8', layer: 'L3', result: restartResult,
    reason: restartDetails.filter(item => item.result !== 'PASS').map(item => `${item.item}: ${item.reason}`).join(' | '),
    details: restartDetails,
  })

  const crossDetails = []
  for (const name of declared) {
    if (!measured.has(name)) crossDetails.push(detail('C-9.1', 'FAIL', `declared provide ${name} is missing from measured services`))
  }
  for (const name of measured) {
    if (!declared.includes(name)) crossDetails.push(detail('C-9.2', 'WARN', `measured service ${name} is not declared`))
  }
  const inject = declaredInject(module)
  for (const name of inject) {
    const hits = regexHits(sources, new RegExp(`ctx\\.${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'))
    if (hits.length === 0) crossDetails.push(detail('C-9.3', 'WARN', `inject declares ${name} but no static ctx.${name} read was found`))
  }
  const crossResult = crossDetails.length === 0 ? 'PASS' : worst(crossDetails.map(item => item.result))
  const crossCheck = check({
    id: 'DSC-09', clause: 'C-9', layer: 'L1', result: crossResult,
    reason: crossDetails.filter(item => item.result !== 'PASS').map(item => `${item.item}: ${item.reason}`).join(' | '),
    details: crossDetails,
  })

  return [loadCheck, provideCheck, effectCheck, unloadCheck, restartCheck, crossCheck]
}

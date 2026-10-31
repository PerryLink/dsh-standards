#!/usr/bin/env node
/**
 * Minimal host-backed bundle smoke: G0 patch parse, G1 compose/row ids,
 * G3 real boot target rows. G2 compatibility is reported from the host API.
 *
 * The checker stays zero-dependency: this script is only used when --host
 * points at a built @deepseek-ai/dsh-app-boot/lib/index.js.
 *
 * Usage:
 *   node scripts/bundle-smoke.mjs --package <dir> --host <app-boot/lib/index.js> \
 *     [--base <base/cordis.patch.yml>] [--json] [--timeout 30000]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function parse(argv) {
  const options = { package: null, host: null, base: null, web: null, bare: null, json: false, timeout: 30_000 }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--package') options.package = argv[++i]
    else if (arg === '--host') options.host = argv[++i]
    else if (arg === '--base') options.base = argv[++i]
    else if (arg === '--web') options.web = argv[++i]
    else if (arg === '--bare') options.bare = argv[++i]
    else if (arg === '--json') options.json = true
    else if (arg === '--timeout') options.timeout = Number(argv[++i])
    else if (arg === '--help' || arg === '-h') { console.log('usage: node scripts/bundle-smoke.mjs --package <dir> --host <app-boot/lib/index.js> [--base <patch>] [--json]'); process.exit(0) }
    else throw new Error(`unknown option: ${arg}`)
  }
  if (!options.package) throw new Error('--package is required')
  if (!options.host) throw new Error('--host is required')
  if (!Number.isFinite(options.timeout) || options.timeout < 1000) throw new Error('--timeout must be >= 1000')
  return options
}

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms); timer.unref?.() })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function main() {
  const options = parse(process.argv.slice(2))
  const pkg = path.resolve(options.package)
  const manifest = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'))
  const host = await import(pathToFileURL(path.resolve(options.host)).href)
  const { loadOverlayPatches, composeEntries, boot, getDshRuntimeVersion, evaluatePluginCompatibility } = host
  if (typeof loadOverlayPatches !== 'function' || typeof composeEntries !== 'function' || typeof boot !== 'function') throw new Error('host does not export loadOverlayPatches/composeEntries/boot')
  const bundle = manifest.dsh?.bundle
  if (!bundle?.patch) throw new Error('manifest has no dsh.bundle.patch')
  const files = Array.isArray(bundle.patch) ? bundle.patch : [bundle.patch]
  const patchPaths = files.map(file => path.resolve(pkg, file))
  const targetPatches = patchPaths.flatMap(file => loadOverlayPatches('dsh', file))
  const basePatches = options.base ? loadOverlayPatches('dsh', path.resolve(options.base)) : []
  const webPatches = options.web ? loadOverlayPatches('dsh', path.resolve(options.web)) : []
  const layers = [basePatches, webPatches, targetPatches].filter(layer => layer.length > 0)
  const composed = composeEntries(layers, message => { warnings.push(message) })
  const baseIds = new Set(composeEntries([basePatches, webPatches].filter(layer => layer.length > 0)).filter(row => row.id).map(row => row.id))
  const targetIds = new Set(composed.filter(row => row.id && !baseIds.has(row.id)).map(row => row.id))
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-bundle-smoke-'))
  const config = path.join(root, 'cordis.yml')
  fs.writeFileSync(config, '[]\n')
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = path.join(root, 'home')
  fs.mkdirSync(process.env.DSH_HOME, { recursive: true })
  let ctx
  let rows = []
  let state = 'failed'
  try {
    const bare = options.bare ? pathToFileURL(path.resolve(options.bare)).href + '/' : pathToFileURL(path.join(root)).href + '/'
    ctx = await withTimeout(boot('bundle-smoke', config, layers.flat(), undefined, bare), options.timeout, 'bundle boot')
    const entries = [...ctx.loader.entries()]
    // A bundle insert is composed under an `include:` group, so the group's
    // fiber can stay null while the inserted plugin row activates. Match the
    // inserted row's package name as well as its id, never only the wrapper.
    const targetNames = new Set(composed
      .filter(row => row.id && !baseIds.has(row.id) && typeof row.name === 'string')
      .map(row => row.name))
    rows = entries.filter(entry => [...targetIds].some(id => entry.id === id || String(entry.id).endsWith(`:${id}`))
      || targetNames.has(entry.name)).map(entry => ({ id: entry.id, name: entry.name, state: entry.fiber?.state ?? null, disabled: entry.disabled === true }))
    const active = rows.filter(row => row.state === 2 || row.disabled).length
    state = rows.length > 0 && active === rows.length ? 'verified' : rows.length > 0 ? 'partial' : 'failed'
  } finally {
    try { await ctx?.dispose?.() } catch { /* ignore */ }
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    fs.rmSync(root, { recursive: true, force: true })
  }
  const compatibility = typeof evaluatePluginCompatibility === 'function' && typeof getDshRuntimeVersion === 'function'
    ? (() => { try { return evaluatePluginCompatibility(manifest, {}, getDshRuntimeVersion()) === undefined ? 'admit' : 'reject' } catch { return 'error' } })()
    : 'unknown'
  const hasClient = Boolean(manifest.dsh?.client)
  const clientEntry = manifest.exports?.['./client']
  const clientExport = typeof clientEntry === 'string'
    || (typeof clientEntry === 'object' && clientEntry !== null && typeof clientEntry.default === 'string')
  // G4 is a composition property: the package's own root row must exist in
  // the composed layer. Runtime `entries` names an `include:` wrapper instead,
  // so reading only activated entries produced false negatives for bundles
  // whose insert is wrapped in an include group.
  const rootRows = composed.filter(row => row.name === manifest.name || row.name === '.' || row.name === './')
  const result = {
    schema: 'dsh-bundle-smoke/1',
    package: manifest.name,
    version: manifest.version,
    g0: { patchFiles: patchPaths.length, parsed: true },
    g1: { rows: composed.length, targetRows: targetIds.size, warnings },
    g2: { compatibility },
    g3: { state, rows, active: rows.filter(row => row.state === 2 || row.disabled).length },
    g4: { hasClient, clientExport, rootRows, ok: !hasClient || (clientExport && rootRows.length > 0) },
  }
  const output = JSON.stringify(result, null, 2)
  const exitCode = state === 'verified' ? 0 : state === 'partial' ? 2 : 1
  // A real boot can leave host-owned timers, sockets, or workers referenced
  // after dispose. This smoke owns the whole process, so terminate once the
  // result is flushed instead of making the caller wait for a handle it cannot
  // see. Without this, a completed boot looks like a timeout to CI.
  process.stdout.write(`${output}\n`, () => process.exit(exitCode))
}

const warnings = []
try { await main() } catch (error) {
  console.error(`bundle-smoke: ${error.message}`)
  process.exit(3)
}

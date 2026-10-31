#!/usr/bin/env node
/**
 * Apply a JSON overlay (deep merge, arrays replace) to a copy of a package's
 * package.json. Never edits the source package: `--out` is required and must
 * not exist (use --force to replace a temp copy).
 *
 * Usage:
 *   node scripts/apply-overlay.mjs \
 *     --package /tmp/dsh-verify-samples/mmparko__dsh-purge \
 *     --overlay ../../70-cases/overlays/mmparko__dsh-purge.json \
 *     --out /tmp/dsh-patched/mmparko__dsh-purge
 */
import fs from 'node:fs'
import path from 'node:path'

function parse(argv) {
  const options = { package: null, overlay: null, out: null, force: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--package') options.package = argv[++i]
    else if (arg === '--overlay') options.overlay = argv[++i]
    else if (arg === '--out') options.out = argv[++i]
    else if (arg === '--force') options.force = true
    else if (arg === '--help' || arg === '-h') { console.log('usage: node scripts/apply-overlay.mjs --package <dir> --overlay <json> --out <dir> [--force]'); process.exit(0) }
    else throw new Error(`unknown option: ${arg}`)
  }
  if (!options.package) throw new Error('--package is required')
  if (!options.overlay) throw new Error('--overlay is required')
  if (!options.out) throw new Error('--out is required (never edit the source in place)')
  return options
}

function merge(base, overlay) {
  if (Array.isArray(overlay)) return overlay
  if (overlay === null || typeof overlay !== 'object') return overlay
  const result = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) }
  for (const [key, value] of Object.entries(overlay)) result[key] = merge(result[key], value)
  return result
}

function main() {
  const options = parse(process.argv.slice(2))
  const source = path.resolve(options.package)
  const out = path.resolve(options.out)
  if (!fs.existsSync(path.join(source, 'package.json'))) throw new Error(`not a package: ${source}`)
  if (fs.existsSync(out)) {
    if (!options.force) throw new Error(`--out exists: ${out} (use --force only for a temp copy)`)
    fs.rmSync(out, { recursive: true, force: true })
  }
  const overlay = JSON.parse(fs.readFileSync(path.resolve(options.overlay), 'utf8'))
  fs.cpSync(source, out, { recursive: true, dereference: false })
  const manifestPath = path.join(out, 'package.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const merged = merge(manifest, overlay)
  fs.writeFileSync(manifestPath, `${JSON.stringify(merged, null, 2)}\n`)
  console.log(JSON.stringify({ source, overlay: path.resolve(options.overlay), out, keys: Object.keys(overlay) }, null, 2))
}

try { main() } catch (error) { console.error(`apply-overlay: ${error.message}`); process.exitCode = 3 }

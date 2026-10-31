#!/usr/bin/env node
/**
 * Generate a levels.json sidecar for a format-1 market index.
 *
 * Tier A (index-only): every entry gets index-field validation
 *   (exact SemVer, npm/git source pinned, engines.dsh presence).
 *   No package is downloaded or executed; level is null.
 * Tier B (static-only): optional pilot JSON files from
 *   `dsh-plugin-verify --static-only` are merged in by name@version.
 *
 * Usage:
 *   node scripts/m1-sidecar.mjs \
 *     --index /tmp/dsh-catalog/index.json \
 *     --pilot results/m1 \
 *     --out results/m1/levels.json
 */
import fs from 'node:fs'
import path from 'node:path'

const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const COMMIT = /^[0-9a-f]{40}$/

function parseArgs(argv) {
  const options = { index: null, out: null, pilot: null, indexUrl: 'https://awesome-dsh-plugin.com/index.json' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--index') options.index = argv[++i]
    else if (arg === '--out') options.out = argv[++i]
    else if (arg === '--pilot') options.pilot = argv[++i]
    else if (arg === '--index-url') options.indexUrl = argv[++i]
    else if (arg === '--help' || arg === '-h') { console.log('usage: node scripts/m1-sidecar.mjs --index <format-1.json> [--pilot <dir>] --out <levels.json>'); process.exit(0) }
    else throw new Error(`unknown option: ${arg}`)
  }
  if (!options.index) throw new Error('--index is required')
  if (!options.out) throw new Error('--out is required')
  return options
}

function readPilots(directory) {
  const map = new Map()
  if (!directory || !fs.existsSync(directory)) return map
  for (const entry of fs.readdirSync(directory)) {
    if (!entry.endsWith('.json')) continue
    const file = path.join(directory, entry)
    let report
    try { report = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { continue }
    if (report?.schema !== 'dsh-conformance/1' || !report.subject?.name || !report.subject?.version) continue
    map.set(`${report.subject.name}@${report.subject.version}`, { file, report })
  }
  return map
}

function pilotLevel(report, file) {
  const status = { pass: 'static-only', warn: 'static-only-warn', fail: 'failed', incomplete: 'inconclusive' }[report.conclusion?.status] ?? 'inconclusive'
  return {
    standard: 'DS-C',
    standardVersion: report.standard?.version ?? '1.0.0',
    profile: 'listing',
    status,
    coverage: report.coverage,
    anchor: report.anchor,
    checkedAt: new Date().toISOString().slice(0, 10),
    expiresAt: new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10),
    evidenceUrl: `file://${path.resolve(file)}`,
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const index = JSON.parse(fs.readFileSync(options.index, 'utf8'))
  if (index.format !== 1 || !Array.isArray(index.plugins)) throw new Error('not a format-1 index')
  const pilots = readPilots(options.pilot)
  const levels = {}
  const summary = { total: 0, indexOnly: 0, staticOnly: 0, staticOnlyWarn: 0, failed: 0, inconclusive: 0, withEnginesDsh: 0, npm: 0, git: 0 }
  for (const plugin of [...index.plugins].sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    const versions = Array.isArray(plugin.versions) ? [...plugin.versions].sort((a, b) => String(a.version).localeCompare(String(b.version))) : []
    for (const version of versions) {
      summary.total += 1
      const source = version.source ?? {}
      const sourcePinned = source.type === 'npm' || (source.type === 'git' && COMMIT.test(source.commit ?? ''))
      const enginesDsh = typeof version.engines?.dsh === 'string' && version.engines.dsh !== ''
      if (enginesDsh) summary.withEnginesDsh += 1
      if (source.type === 'npm') summary.npm += 1
      if (source.type === 'git') summary.git += 1
      const key = `${plugin.name}@${version.version}`
      const pilot = pilots.get(key)
      const base = {
        plugin: plugin.name,
        version: version.version,
        status: 'index-only',
        index: {
          versionExact: EXACT.test(version.version ?? ''),
          sourceType: source.type ?? null,
          sourcePinned,
          enginesDsh,
          hasUpstream: plugin.upstream !== undefined,
        },
        reason: 'package tarball not fetched; only index fields were checked',
        anchor: { indexUrl: options.indexUrl, parser: 'm1-sidecar/1', checkedAt: new Date().toISOString().slice(0, 10) },
      }
      if (pilot) {
        const level = pilotLevel(pilot.report, pilot.file)
        levels[key] = { ...base, status: level.status, reason: '', level }
        if (level.status === 'static-only-warn') summary.staticOnlyWarn += 1
        else if (level.status === 'failed') summary.failed += 1
        else if (level.status === 'inconclusive') summary.inconclusive += 1
        else summary.staticOnly += 1
      } else {
        levels[key] = base
        summary.indexOnly += 1
      }
    }
  }
  const output = {
    schema: 'dsh-levels/1',
    indexUrl: options.indexUrl,
    generatedAt: new Date().toISOString(),
    summary,
    levels,
  }
  fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true })
  fs.writeFileSync(options.out, JSON.stringify(output, null, 2))
  console.log(JSON.stringify({ out: path.resolve(options.out), summary }, null, 2))
}

try { main() } catch (error) { console.error(`m1-sidecar: ${error.message}`); process.exitCode = 3 }

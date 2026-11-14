#!/usr/bin/env node
/**
 * land-runtime-artifacts.mjs — turn uploaded GitHub Actions artifacts from the
 * rc3 runtime runs into committed evidence, without rewriting history.
 *
 * The 2026-11-14 rc3 runs uploaded their per-row artifacts to GitHub Actions
 * (`entry18-runtime` run and `web-runtime` run). Artifacts expire; the repo's
 * committed evidence is the durable copy. This script downloads the artifacts
 * and writes them into a NEW asOf directory (e.g.
 * `40-checker/results/entry/18/fullbase-rc3-20261114/`), never into the
 * historical `fullbase/` / `webruntime/` directories.
 *
 * It only lands raw evidence; the REPORT.md / RUNTIME.md / SUPPORTED.md prose
 * stays a human edit (the numbers must match the landed files).
 *
 * Credentials: imports DSH_KEY (default the deepseek-community-hub _key.mjs),
 * whose side effect sets GH_TOKEN. Tokens are never printed.
 *
 * Usage:
 *   node 40-checker/scripts/land-runtime-artifacts.mjs \
 *     --kind entry18 --run 43560480242 --out 40-checker/results/entry/18/fullbase-rc3-20261114
 *   node 40-checker/scripts/land-runtime-artifacts.mjs \
 *     --kind web-runtime --run 43560484422 --out 40-checker/results/webruntime-rc3-20261114
 *
 * Options: --repo (default PerryLink/dsh-standards), --dry-run, --keep (comma list
 * of extra artifact files to keep for web rows).
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const KEY = process.env.DSH_KEY || '/mnt/d/Projects/dsh/deepseek-community-hub/00-live/_key.mjs'
if (fs.existsSync(KEY)) await import(KEY)

const API = 'https://api.github.com'
const WEB_ROW_FILES = ['client-export.json', 'installed-package.json', 'probe.json', 'shot.png', 'summary.md']

function usage(message) {
  if (message) console.error(`error: ${message}`)
  console.error('usage: land-runtime-artifacts.mjs --kind entry18|web-runtime --run <id> --out <dir> [--repo owner/name] [--dry-run]')
  process.exit(2)
}

function parseArgs(argv) {
  const options = { repo: 'PerryLink/dsh-standards', kind: '', run: '', out: '', dryRun: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--kind') options.kind = argv[++index]
    else if (arg === '--run') options.run = argv[++index]
    else if (arg === '--out') options.out = argv[++index]
    else if (arg === '--repo') options.repo = argv[++index]
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--help' || arg === '-h') usage()
    else usage(`unknown argument: ${arg}`)
  }
  if (!['entry18', 'web-runtime'].includes(options.kind)) usage('--kind must be entry18 or web-runtime')
  if (!/^\d+$/.test(options.run)) usage('--run must be a workflow run id')
  if (!options.out) usage('--out is required')
  if (!process.env.GH_TOKEN) usage('GH_TOKEN is not set (check DSH_KEY)')
  return options
}

async function github(pathname) {
  const response = await fetch(API + pathname, {
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'dsh-standards-land-artifacts',
    },
  })
  if (!response.ok) throw new Error(`GitHub ${pathname} → ${response.status}: ${(await response.text()).slice(0, 200)}`)
  return response
}

/** Minimal ZIP reader (deflate/store) — enough for Actions artifact zips. */
export function unzip(buffer) {
  const eocdSignature = 0x06054b50
  let eocd = -1
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 66000); index -= 1) {
    if (buffer.readUInt32LE(index) === eocdSignature) { eocd = index; break }
  }
  if (eocd < 0) throw new Error('not a zip: EOCD not found')
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const files = new Map()
  for (let entry = 0; entry < count; entry += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('bad central directory header')
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('bad local file header')
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
    const data = method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed)
    files.set(name, data)
    offset += 46 + nameLength + extraLength + commentLength
  }
  return files
}

function rowIdFromArtifact(name, kind) {
  if (kind === 'entry18') {
    const prefix = 'entry18-fullbase-'
    if (!name.startsWith(prefix) || name === 'entry18-fullbase-summary') return null
    return name.slice(prefix.length)
  }
  const prefix = 'web-runtime-'
  if (!name.startsWith(prefix)) return null
  return name.slice(prefix.length)
}

export async function land({ repo, kind, run, out, dryRun = false }) {
  const root = path.resolve(out)
  const artifacts = []
  for (let page = 1; ; page += 1) {
    const response = await github(`/repos/${repo}/actions/runs/${run}/artifacts?per_page=100&page=${page}`)
    const payload = await response.json()
    artifacts.push(...(payload.artifacts || []))
    if (!payload.artifacts || payload.artifacts.length < 100) break
  }
  const landed = []
  const skipped = []
  for (const artifact of artifacts.sort((a, b) => a.name.localeCompare(b.name))) {
    const id = rowIdFromArtifact(artifact.name, kind)
    if (id === null) { skipped.push(artifact.name); continue }
    const response = await github(`/repos/${repo}/actions/artifacts/${artifact.id}/zip`)
    const files = unzip(Buffer.from(await response.arrayBuffer()))
    if (kind === 'entry18') {
      const jsonName = `${id}.json`
      const row = files.get(jsonName)
      if (!row) throw new Error(`${artifact.name}: missing ${jsonName}`)
      const target = path.join(root, jsonName)
      if (!dryRun) { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(target, row) }
      landed.push({ artifact: artifact.name, file: path.relative(process.cwd(), target), bytes: row.length })
    } else {
      const targetDir = path.join(root, id)
      if (!dryRun) fs.mkdirSync(targetDir, { recursive: true })
      const kept = []
      for (const name of WEB_ROW_FILES) {
        const data = files.get(name)
        if (!data) continue
        if (!dryRun) fs.writeFileSync(path.join(targetDir, name), data)
        kept.push(name)
      }
      // Rows that are not client-bearing (shell-only / gate-rejected) carry only
      // probe.json + summary.md in the historical layout; keep the subset.
      const required = ['probe.json', 'summary.md']
      const missing = required.filter(name => !kept.includes(name))
      if (missing.length > 0) throw new Error(`${artifact.name}: missing required files (${missing.join(',')})`)
      landed.push({ artifact: artifact.name, dir: path.relative(process.cwd(), targetDir), files: kept })
    }
  }
  // entry18 also carries the aggregate summary artifact.
  if (kind === 'entry18') {
    const summaryArtifact = artifacts.find(artifact => artifact.name === 'entry18-fullbase-summary')
    if (!summaryArtifact) throw new Error('summary artifact not found')
    const response = await github(`/repos/${repo}/actions/artifacts/${summaryArtifact.id}/zip`)
    const files = unzip(Buffer.from(await response.arrayBuffer()))
    const summary = files.get('summary.json')
    if (!summary) throw new Error('summary.json not found inside the summary artifact')
    const target = path.join(root, 'summary.json')
    if (!dryRun) { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(target, summary) }
    landed.push({ artifact: summaryArtifact.name, file: path.relative(process.cwd(), target), bytes: summary.length })
  }
  return { repo, run, kind, out: root, landed, skipped }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  land({ repo: options.repo, kind: options.kind, run: options.run, out: options.out, dryRun: options.dryRun })
    .then(result => {
      console.log(JSON.stringify(result, null, 2))
      if (options.dryRun) console.log('\n(dry run: nothing written)')
    })
    .catch(error => { console.error(error.stack || error.message); process.exit(1) })
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) main()

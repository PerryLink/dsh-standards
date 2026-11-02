#!/usr/bin/env node
/**
 * entry-scan.mjs — read-only C1-C8 scan of public GitHub plugins.
 *
 * It fetches package.json and checks that the referenced patch/client/entry
 * files exist via the GitHub contents API. It stores only package.json and
 * placeholder files; it never executes plugin code. C3 is left not-run because
 * a real install line was not tested on a host.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')
const VALIDATOR = path.join(STD, '40-checker', 'scripts', 'entry-validate.mjs')
const TOKEN = process.env.GH_TOKEN
if (!TOKEN) throw new Error('GH_TOKEN is required')

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'dsh-entry-scan',
  'X-GitHub-Api-Version': '2022-11-28',
}

function usage() {
  console.log(`entry-scan — static C1-C8 scan of public DSH plugins

Usage:
  node 40-checker/scripts/entry-scan.mjs [--limit 10] [--out report.json] [--repos owner/repo,...]

Without --repos, searches GitHub topic:dsh-plugin sorted by stars.
It writes only package.json and placeholder files in a temp directory; no plugin code is executed.
C3 is not-run because no real install line is tested.
Exit: 0 scan completed, 3 input/API error.`)
}

function parseArgs(argv) {
  const options = { limit: 10, out: null, repos: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      i += 1
      return value
    }
    if (arg === '--limit') options.limit = Number(next())
    else if (arg === '--out') options.out = path.resolve(next())
    else if (arg === '--repos') options.repos = next().split(',').map(s => s.trim()).filter(Boolean)
    else if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 30) throw new Error('--limit must be 1..30')
  return options
}

async function api(pathname) {
  const r = await fetch(`https://api.github.com${pathname}`, { headers })
  if (r.status === 404) return { ok: false, status: 404, json: null }
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  if (!r.ok) throw new Error(`${pathname} -> ${r.status}: ${text.slice(0, 300)}`)
  return { ok: true, status: r.status, json }
}

async function fileExists(repo, ref, file) {
  if (typeof file !== 'string' || file.length === 0) return false
  const clean = file.replace(/^\.\//, '')
  const encoded = clean.split('/').map(encodeURIComponent).join('/')
  const r = await api(`/repos/${repo}/contents/${encoded}?ref=${encodeURIComponent(ref)}`)
  return r.ok
}

function writePlaceholder(dir, file) {
  const clean = file.replace(/^\.\//, '')
  const full = path.resolve(dir, clean)
  if (!full.startsWith(`${dir}${path.sep}`)) return
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, '// existence verified via GitHub contents API; content not stored\n')
}

async function scanRepo(repo, meta) {
  const pkgRes = await api(`/repos/${repo}/contents/package.json?ref=${encodeURIComponent(meta.default_branch)}`)
  if (!pkgRes.ok) return null
  const pkg = JSON.parse(Buffer.from(pkgRes.json.content, 'base64').toString('utf8'))
  if (!pkg.dsh || typeof pkg.dsh !== 'object') return null
  if (!pkg.dsh.bundle && !pkg.dsh.client) return null
  const commitRes = await api(`/repos/${repo}/commits?per_page=1`)
  const commit = commitRes.json?.[0]?.sha ?? null
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-entry-scan-'))
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
    const files = []
    if (typeof pkg.dsh.bundle?.patch === 'string') files.push(pkg.dsh.bundle.patch)
    else if (Array.isArray(pkg.dsh.bundle?.patch)) files.push(...pkg.dsh.bundle.patch.filter(item => typeof item === 'string'))
    if (pkg.dsh.client) {
      const client = typeof pkg.exports?.['./client'] === 'string'
        ? pkg.exports['./client']
        : pkg.exports?.['./client']?.import ?? pkg.exports?.['./client']?.default
      if (typeof client === 'string') files.push(client)
    }
    const main = typeof pkg.main === 'string' ? pkg.main : typeof pkg.exports?.['.'] === 'string' ? pkg.exports['.'] : pkg.exports?.['.']?.import
    if (typeof main === 'string') files.push(main)
    const paths = new Set()
    const treeRes = await api(`/repos/${repo}/git/trees/${encodeURIComponent(meta.default_branch)}?recursive=1`)
    if (treeRes.ok && Array.isArray(treeRes.json.tree)) {
      for (const item of treeRes.json.tree) paths.add(item.path)
    }
    for (const file of [...new Set(files)]) {
      const clean = file.replace(/^\.\//, '')
      if (paths.has(clean) || (!treeRes.ok && await fileExists(repo, meta.default_branch, file))) {
        writePlaceholder(dir, file)
      }
    }
    const metaFile = path.join(dir, 'meta.json')
    fs.writeFileSync(metaFile, JSON.stringify({
      repo,
      topics: meta.topics ?? [],
      archived: meta.archived === true,
      commit,
      pushedAt: String(meta.pushed_at ?? '').slice(0, 10),
      claimLevel: 'reference',
    }, null, 2))
    const run = spawnSync(process.execPath, [VALIDATOR, dir, '--meta', metaFile, '--json'], { encoding: 'utf8', timeout: 30_000 })
    const result = JSON.parse(run.stdout)
    return {
      repo,
      stars: meta.stargazers_count,
      package: pkg.name ?? null,
      version: pkg.version ?? null,
      filesChecked: [...new Set(files)],
      conclusion: result.conclusion,
      checks: result.checks,
      exit: run.status,
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  let repos = options.repos
  if (!repos) {
    const search = await api(`/search/repositories?q=${encodeURIComponent('topic:dsh-plugin')}&sort=stars&order=desc&per_page=30`)
    repos = (search.json.items ?? []).map(item => item.full_name)
  }
  const scanned = []
  for (const repo of repos) {
    if (scanned.length >= options.limit) break
    const r = await api(`/repos/${repo}`)
    if (!r.ok) continue
    const row = await scanRepo(repo, r.json)
    if (row) {
      scanned.push(row)
      console.log(`${repo}: ${row.conclusion.status}; ${row.conclusion.failed.join(',') || 'no fail'}${row.conclusion.notRun.length ? `; not-run ${row.conclusion.notRun.join(',')}` : ''}`)
    }
  }
  const report = {
    schema: 'dsh-entry-scan/1',
    generatedAt: new Date().toISOString(),
    method: 'static GitHub contents API; C3 not-run; no plugin code executed; file existence only for patch/client/main',
    disclaimer: '非官方 · 非认证 · 非安全审计 · 非背书 · 无担保',
    notClaimed: ['official standard', 'certification', 'security audit', 'ranking', 'market acceptance', 'external adoption'],
    total: scanned.length,
    summary: {
      pass: scanned.filter(r => r.conclusion.status === 'pass').length,
      passWithWarnings: scanned.filter(r => r.conclusion.status === 'pass-with-warnings').length,
      incomplete: scanned.filter(r => r.conclusion.status === 'incomplete').length,
      fail: scanned.filter(r => r.conclusion.status === 'fail').length,
    },
    repos: scanned,
  }
  const output = `${JSON.stringify(report, null, 2)}\n`
  if (options.out) {
    fs.mkdirSync(path.dirname(options.out), { recursive: true })
    fs.writeFileSync(options.out, output)
    console.log(`wrote ${options.out}`)
  } else process.stdout.write(output)
}

main().catch(error => {
  console.error(`entry-scan: ${error.message}`)
  process.exit(3)
})

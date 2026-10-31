#!/usr/bin/env node
/**
 * Build a reproducible sampling frame from the official dsh-plugin topic.
 * This is a frame, not a pass/fail result: sampled repos may not be installable.
 *
 * Usage: node scripts/sample-frame.mjs [--out samples/frame.json] [--seed 20261031]
 */
import fs from 'node:fs'
import path from 'node:path'

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const out = path.resolve(arg('--out', 'samples/frame.json'))
const seed = Number(arg('--seed', '20261031'))
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-plugin-conformance' }
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

async function search(q, sort, order, page = 1, perPage = 100) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=${sort}&order=${order}&per_page=${perPage}&page=${page}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

function hash(text) {
  let h = 2166136261
  for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) }
  return h >>> 0
}

async function main() {
  const high = []
  for (let page = 1; page <= 3; page += 1) {
    const data = await search('topic:dsh-plugin stars:>50 size:<50000', 'stars', 'desc', page)
    high.push(...data.items)
  }
  const low = []
  for (let page = 1; page <= 2; page += 1) {
    const data = await search('topic:dsh-plugin stars:1..50 size:<50000', 'stars', 'asc', page)
    low.push(...data.items)
  }
  const pool = [...new Map([...high, ...low].map(repo => [repo.full_name, repo])).values()]
  const pick = (items, n) => items.slice().sort((a, b) => hash(`${seed}:${a.full_name}`) - hash(`${seed}:${b.full_name}`)).slice(0, n)
  const sample = pick(pool, 60)
  const lowSample = pick(low, 20)
  const result = {
    schema: 'dsh-plugin-sample/1',
    generatedAt: new Date().toISOString(),
    source: 'GitHub search: topic:dsh-plugin',
    query: { high: 'topic:dsh-plugin stars:>50 size:<50000', low: 'topic:dsh-plugin stars:1..50 size:<50000' },
    seed,
    frameSize: pool.length,
    sampleSize: sample.length,
    lowStarSize: lowSample.length,
    sample: sample.map(repo => ({ fullName: repo.full_name, url: repo.html_url, stars: repo.stargazers_count, updatedAt: repo.updated_at })),
    lowStar: lowSample.map(repo => ({ fullName: repo.full_name, url: repo.html_url, stars: repo.stargazers_count })),
    negativeControls: [
      'fixtures/negative/no-entry',
      'fixtures/negative/no-patch',
      'fixtures/negative/workspace-version',
      'fixtures/negative/official-label',
      'fixtures/negative/stale-result',
    ],
    caveat: 'Frame only. A sampled repo may be a listing/monorepo/no-plugin; not a pass/fail result.',
  }
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`)
  console.log(`frame=${result.frameSize} sample=${result.sampleSize} low=${result.lowStarSize} -> ${out}`)
}
main().catch(error => { console.error(`sample-frame: ${error.message}`); process.exitCode = 3 })

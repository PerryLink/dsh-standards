#!/usr/bin/env node
/** LEV-7 micro-benchmark: sequential vs bounded. Synthetic tasks only. */
import fs from 'node:fs'
import path from 'node:path'
import { runWithLimit } from './lev7-bounded-batch.mjs'

const N = Number(process.argv[2] || 64)
const D = Number(process.argv[3] || 20)
const tasks = Array.from({ length: N }, () => async () => { await new Promise(r => setTimeout(r, D)); return 1 })
async function time(limit) {
  const t = process.hrtime.bigint()
  await runWithLimit(tasks, limit)
  return Number(process.hrtime.bigint() - t) / 1e6
}
const rows = []
for (const limit of [1, 4, 8]) {
  const samples = []
  for (let i = 0; i < 5; i += 1) samples.push(await time(limit))
  rows.push({ limit, samples, median: samples.slice().sort((a,b)=>a-b)[2] })
}
const baseline = rows.find(r => r.limit === 1).median
const result = { schema: 'dsh-boost-bench/1', practice: 'LEV-7', generatedAt: new Date().toISOString(), n: N, delayMs: D, runs: 5, rows: rows.map(r => ({ ...r, speedup: baseline / r.median })), caveat: 'Synthetic timers, single machine, not a production baseline.' }
const out = path.resolve('examples/boost/results/lev7.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))

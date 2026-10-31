#!/usr/bin/env node
/** CI runner: clone 60 frame repos and run ENTRY static. */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
const STD = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const frame = JSON.parse(fs.readFileSync(path.join(STD, '40-checker/samples/frame.json'), 'utf8'))
const out = path.join(STD, 'results/sample60-ci')
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true })
const rows = []
for (const repo of frame.sample) {
  const id = repo.fullName.replace(/[\\/]/g, '__')
  const dir = path.join('/tmp/dsh-sample60-ci', id)
  const clone = spawnSync('git', ['clone', '--depth', '1', `https://github.com/${repo.fullName}.git`, dir], { encoding: 'utf8', timeout: 120000 })
  if (clone.status !== 0) { rows.push({ id, fullName: repo.fullName, clone: 'fail', error: (clone.stderr || '').slice(-200) }); continue }
  const json = path.join(out, `${id}.json`)
  const run = spawnSync('node', [path.join(STD, '40-checker/bin/dsh-plugin-verify.mjs'), dir, '--scope', 'entry', '--entry-claim', 'static', '--format', 'json', '--out', json], { encoding: 'utf8', timeout: 30000 })
  let status = 'error', level = null
  try { const r = JSON.parse(fs.readFileSync(json, 'utf8')); status = r.conclusion.status; level = r.conclusion.level } catch {}
  rows.push({ id, fullName: repo.fullName, stars: repo.stars, clone: 'ok', status, level, exit: run.status })
  fs.rmSync(dir, { recursive: true, force: true })
}
const summary = { schema: 'dsh-sample60-ci/1', generatedAt: new Date().toISOString(), frame: frame.sampleSize, rows, status: { pass: rows.filter(r => r.status === 'pass').length, warn: rows.filter(r => r.status === 'warn').length, fail: rows.filter(r => r.status === 'fail').length, incomplete: rows.filter(r => r.status === 'incomplete').length, cloneFail: rows.filter(r => r.clone !== 'ok').length, error: rows.filter(r => r.status === 'error').length } }
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary.status))

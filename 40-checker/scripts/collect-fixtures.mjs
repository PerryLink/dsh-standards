#!/usr/bin/env node
/**
 * Collect the known-answer fixture statuses for one runner (OS/Node).
 * Output is the input format of round-robin.mjs.
 *
 * Usage: node 40-checker/scripts/collect-fixtures.mjs --out runner.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const CHECKER = path.join(ROOT, '40-checker', 'bin', 'dsh-plugin-verify.mjs')

function run(dir) {
  const r = spawnSync(process.execPath, [CHECKER, dir, '--scope', 'entry', '--entry-claim', 'static', '--format', 'json'], { encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 })
  try {
    const parsed = JSON.parse(r.stdout)
    return parsed.conclusion?.status ?? 'error'
  } catch {
    return 'error'
  }
}

function main() {
  let out = path.join(ROOT, 'runner.json')
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === '--out') out = path.resolve(process.argv[++i])
  }
  const result = {
    runner: `dsh-plugin-verify@0.1.0 (${process.platform}/${process.arch}, node ${process.version})`,
    anchor: { dsh: '0.2.2-alpha.2', cordis: '4.0.6-alpha.1' },
    results: {
      good: { status: run(path.join(ROOT, '40-checker/fixtures/good')), artifact: 'fixtures/good' },
      'bad-manifest': { status: run(path.join(ROOT, '40-checker/fixtures/bad-manifest')), artifact: 'fixtures/bad-manifest' },
      skipped: { status: 'not-run', artifact: null },
    },
  }
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result, null, 2))
}
main()

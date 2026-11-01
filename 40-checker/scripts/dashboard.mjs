#!/usr/bin/env node
/**
 * dashboard.mjs — build a small, honest status dashboard from existing results.
 * It never infers a PASS from a missing file.
 *
 * Usage: node 40-checker/scripts/dashboard.mjs [--out dashboard.json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const RESULTS = path.join(ROOT, '40-checker', 'results')

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

function countFiles(dir, suffix = '.json') {
  if (!fs.existsSync(dir)) return 0
  return fs.readdirSync(dir).filter((name) => name.endsWith(suffix)).length
}

export function buildDashboard(root = ROOT) {
  const results = path.join(root, '40-checker', 'results')
  const entryDir = path.join(results, 'entry', '18')
  const entryFiles = fs.existsSync(entryDir)
    ? fs.readdirSync(entryDir).filter((name) => name.endsWith('.json') && !name.endsWith('.runtime.json')).length
    : 0
  const flowIndex = readJson(path.join(results, 'flow', 'real', 'index.json'))
  const boost = readJson(path.join(results, 'boost', 'lev12458.json'))
  const attestations = readJson(path.join(root, 'publish', 'attestations', 'index.json'))
  const gov = readJson(path.join(root, 'governance', 'roles.json'))
  const chain = fs.existsSync(path.join(root, 'evidence', 'chain.jsonl'))
    ? fs.readFileSync(path.join(root, 'evidence', 'chain.jsonl'), 'utf8').split('\n').filter(Boolean).length
    : 0
  return {
    schema: 'dsh-dashboard/1',
    generatedAt: new Date().toISOString(),
    entry: {
      resultFiles: entryFiles,
      claim: '18/18 recognized static; 10 G3 verified, 8 partial (see results/entry/18/README.md)',
    },
    flow: {
      packages: flowIndex?.samples?.length ?? flowIndex?.results?.length ?? 0,
      summary: flowIndex?.totals ?? flowIndex?.summary ?? null,
      claim: 'J1/J2/J4/J6 runtime on a fixture and 10 real packages; J3/J5/J7/J8 not-run',
    },
    boost: {
      measured: boost?.summary?.measured ?? null,
      measuredCount: boost?.summary?.measured?.length ?? 0,
      claim: 'LEV-1-8 measured at synthetic/loader level; not a production baseline',
    },
    attestations: {
      count: attestations?.attestations?.length ?? 0,
      draft: (attestations?.attestations || []).filter((a) => a.status === 'draft').length,
      selfReported: (attestations?.attestations || []).filter((a) => a.claimLevel === 'self-reported').length,
    },
    governance: {
      schema: gov?.schema ?? null,
      stage: gov?.stage ?? null,
      status: gov?.status ?? null,
    },
    evidenceChainEntries: chain,
    notClaimed: ['official standard', 'certification', 'security audit', 'production readiness', 'ranking'],
  }
}

export function main(argv = process.argv.slice(2)) {
  let out = path.join(ROOT, 'dashboard.json')
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') out = path.resolve(argv[++i])
    else if (argv[i] === '--help' || argv[i] === '-h') { console.log('usage: dashboard.mjs [--out <file>]'); return 0 }
    else { console.error(`unknown argument: ${argv[i]}`); return 2 }
  }
  const dashboard = buildDashboard(ROOT)
  fs.writeFileSync(out, `${JSON.stringify(dashboard, null, 2)}\n`)
  console.log(JSON.stringify(dashboard, null, 2))
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}

#!/usr/bin/env node
/**
 * J5/J8 static preflight.
 *
 * J5: are capabilities/labels/commitments declared and does the README avoid
 *     forbidden claims? The final permissions judgement is still human.
 * J8: is the client/server shape declared (exports["./client"], server entry)?
 *     This is a shape preflight, not a browser render probe (see web-probe.mjs).
 *
 * Usage: node 40-checker/scripts/journey-disclosure-shape.mjs --package <dir> [--json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CHECKER = path.resolve(HERE, '..', 'bin', 'dsh-plugin-verify.mjs')
const FORBIDDEN = /\b(official|certified|secure|recommended)\b|官方认证|安全审计|推荐标准/i

function parse(argv) {
  const out = { package: null, json: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--package') out.package = argv[++i]
    else if (argv[i] === '--json') out.json = true
    else if (argv[i] === '--help' || argv[i] === '-h') { console.log('usage: journey-disclosure-shape.mjs --package <dir> [--json]'); process.exit(0) }
    else throw new Error(`unknown option: ${argv[i]}`)
  }
  if (!out.package) throw new Error('--package is required')
  return out
}

function main() {
  const options = parse(process.argv.slice(2))
  const dir = path.resolve(options.package)
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const readme = ['README.md', 'readme.md', 'Readme.md'].map((n) => path.join(dir, n)).find((p) => fs.existsSync(p))
  const text = readme ? fs.readFileSync(readme, 'utf8') : ''
  const declared = {
    capabilities: Array.isArray(manifest.dsh?.capabilities),
    labels: Array.isArray(manifest.dsh?.labels),
    commitments: Array.isArray(manifest.dsh?.commitments),
  }
  const forbidden = FORBIDDEN.test(text)
  const run = spawnSync(process.execPath, [CHECKER, dir, '--scope', 'entry', '--entry-claim', 'static', '--format', 'json'], { encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 })
  let checker = null
  try { checker = JSON.parse(run.stdout) } catch { /* leave null */ }
  const byId = new Map((checker?.checks ?? []).map((c) => [c.id, c]))
  const declaration = ['DSC-11', 'DSC-12', 'DSC-13'].map((id) => ({ id, result: byId.get(id)?.result ?? 'NOT-RUN' }))
  const j5 = forbidden ? 'FAIL' : declaration.some((d) => d.result === 'FAIL') ? 'FAIL' : declaration.some((d) => d.result === 'WARN') ? 'WARN' : 'PASS'
  const hasClient = manifest.dsh?.client !== undefined
  const clientExport = Boolean(manifest.exports?.['./client'])
  const serverEntry = Boolean(manifest.exports?.['.'] || manifest.main)
  const j8 = hasClient && !clientExport ? 'FAIL' : hasClient && clientExport && serverEntry ? 'PASS' : 'WARN'
  const result = {
    schema: 'dsh-flow-disclosure-shape/1',
    generatedAt: new Date().toISOString(),
    package: manifest.name,
    version: manifest.version,
    checks: {
      J5: {
        machine: j5,
        humanReview: 'required',
        declared,
        forbiddenWords: forbidden,
        declaration,
        reason: forbidden ? 'README contains a forbidden claim' : 'permissions/disclosure judgement is still human',
      },
      J8: {
        machine: j8,
        humanReview: 'required for UI/render',
        hasClient,
        clientExport,
        serverEntry,
        reason: hasClient ? 'client shape checked statically; render not tested' : 'no dsh.client declaration',
      },
    },
    limitations: ['J5 is a disclosure preflight, not a security review', 'J8 is a shape preflight, not a browser render probe'],
  }
  if (options.json || !process.stdout.isTTY) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exitCode = [j5, j8].includes('FAIL') ? 1 : 0
}
try { main() } catch (error) { console.error(`journey-disclosure-shape: ${error.message}`); process.exitCode = 3 }

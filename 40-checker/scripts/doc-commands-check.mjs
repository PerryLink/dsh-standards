#!/usr/bin/env node
/**
 * doc-commands-check.mjs — keep the developer path first-party and runnable.
 *
 * Two checks:
 *   1. Current developer docs must not send readers to `npx dsh-levels`,
 *      `npx dsh-plugin-kit`, or `npx dsh-plugin-verify`; those bare npm names
 *      belong to other projects, not this repository.
 *   2. The first-party template in `examples/plugin-template` must still audit
 *      to a non-`not-run` ENTRY state.
 *
 * This is a documentation/CLI guard, not a runtime or security claim.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STANDARDS = path.resolve(HERE, '..', '..')
const DOCS = [
  '45-三用途落地-官方市场开发者.md',
  ...fs.readdirSync(path.join(STANDARDS, 'adoption', 'developer'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join('adoption', 'developer', name)),
]
const FORBIDDEN = [
  { re: /\bnpx\s+dsh-levels\b/, name: 'npx dsh-levels' },
  { re: /\bnpx\s+dsh-plugin-kit\b/, name: 'npx dsh-plugin-kit' },
  { re: /\bnpx\s+dsh-plugin-verify\b/, name: 'npx dsh-plugin-verify' },
]

let errors = 0
for (const rel of DOCS) {
  const text = fs.readFileSync(path.join(STANDARDS, rel), 'utf8')
  const lines = text.split(/\r?\n/)
  let inFence = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (!inFence) continue
    for (const rule of FORBIDDEN) {
      if (rule.re.test(line)) {
        console.error(`FAIL ${rel}:${index + 1}: ${rule.name} resolves to a third-party npm package`)
        errors += 1
      }
    }
  }
}
if (errors === 0) console.log(`PASS docs: 0 third-party npx command(s) in ${DOCS.length} file(s)`)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doc-commands-'))
try {
  const out = path.join(tmp, 'audit.json')
  const run = spawnSync(process.execPath, [
    path.join(STANDARDS, '40-checker', 'bin', 'dsh-levels.mjs'),
    'audit',
    path.join(STANDARDS, 'examples', 'plugin-template'),
    '--format', 'json',
    '--out', out,
  ], { encoding: 'utf8' })

  if (run.status !== 0) {
    console.error(`FAIL template: dsh-levels audit exited ${run.status}`)
    if (run.stderr) console.error(run.stderr.trim())
    errors += 1
  } else {
    const report = JSON.parse(fs.readFileSync(out, 'utf8'))
    const state = report?.levels?.entry?.state
    if (!['recognized', 'static', 'runtime'].includes(state)) {
      console.error(`FAIL template: ENTRY state is ${JSON.stringify(state)}, expected recognized/static/runtime`)
      errors += 1
    } else {
      console.log(`PASS template: ENTRY state=${state}`)
    }
  }
} catch (error) {
  console.error(`FAIL template check: ${error.message}`)
  errors += 1
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

if (errors > 0) {
  console.error(`FAIL doc-commands: ${errors} error(s)`)
  process.exit(1)
}
console.log('PASS doc-commands: first-party developer path is runnable')

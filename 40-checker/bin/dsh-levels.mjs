#!/usr/bin/env node
/**
 * dsh-levels — one entry point for the three-level audit.
 * It forwards to level-audit.mjs so there is a single documented command.
 * `dsh-levels flow collect ...` forwards to the FLOW evidence collector.
 */
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AUDIT = path.resolve(HERE, '..', 'scripts', 'level-audit.mjs')
const FLOW_COLLECT = path.resolve(HERE, 'dsh-flow-collect.mjs')
const args = process.argv.slice(2)
let target = AUDIT
if (args[0] === 'flow' && args[1] === 'collect') {
  args.splice(0, 2)
  target = FLOW_COLLECT
} else if (args[0] === 'flow') {
  console.error('usage: dsh-levels flow collect --package <dir> [--out <file>] [--static] [--previous <dir>]')
  process.exit(2)
} else if (args[0] === 'audit') {
  args.shift()
}
const run = spawnSync(process.execPath, [target, ...args], { stdio: 'inherit' })
process.exitCode = run.status ?? 1

#!/usr/bin/env node
/**
 * dsh-levels — one entry point for the three-level audit.
 * It forwards to level-audit.mjs so there is a single documented command.
 */
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AUDIT = path.resolve(HERE, '..', 'scripts', 'level-audit.mjs')
const args = process.argv.slice(2)
if (args[0] === 'audit') args.shift()
const run = spawnSync(process.execPath, [AUDIT, ...args], { stdio: 'inherit' })
process.exitCode = run.status ?? 1

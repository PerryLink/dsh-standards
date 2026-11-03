#!/usr/bin/env node
// Runs L1-L3 in a disposable child process so a plugin cannot block or take over
// the checker. Input: JSON on stdin. Output: JSON { checks } on stdout.
import { runRuntimeChecks } from '../src/runtime.mjs'
import { readSources } from '../src/util.mjs'

const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
let sources = []
try { sources = readSources(input.dir) } catch { sources = [] }
const checks = await runRuntimeChecks({ ...input, sources })
process.stdout.write(JSON.stringify({ checks }))

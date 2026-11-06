#!/usr/bin/env node
// Runs L1-L3 in a disposable child process so a plugin cannot block or take over
// the checker. Input: JSON on stdin. Output: one marker line + JSON on fd 3.
//
// The child is *expected to be hostile*: a plugin may leave timers, sockets or
// workers referenced after `dispose()`. Waiting for the process to exit then
// looks like a hang even though every check finished, so the result is written
// first and the process is terminated in the write callback. The parent also
// resolves on the marker line, so a plugin that keeps the event loop alive
// cannot turn a completed run into "killed after timeout".
import fs from 'node:fs'
import { runRuntimeChecks } from './runtime.mjs'
import { readSources } from './util.mjs'
import { scrubProcessEnv } from './sandbox-env.mjs'

export const MARKER = '__DSH_RUNTIME_CHECKS__'

const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))

// This process imports the inspected package; keep only allowlisted env keys,
// then apply the caller-supplied disposable HOME/DSH_HOME/TMPDIR. DSH_HOME is
// deliberately not allowlisted: an inherited real profile must never reach a
// plugin, while an explicit temp directory from the checker is trusted.
scrubProcessEnv()
const overrides = {
  DSH_HOME: input.home,
  HOME: input.home,
  USERPROFILE: input.home,
  TMPDIR: input.tmp,
  TEMP: input.tmp,
  TMP: input.tmp,
  XDG_CONFIG_HOME: input.home ? `${input.home}/.config` : undefined,
  XDG_DATA_HOME: input.home ? `${input.home}/.local/share` : undefined,
  XDG_CACHE_HOME: input.home ? `${input.home}/.cache` : undefined,
}
for (const [key, value] of Object.entries(overrides)) {
  if (typeof value === 'string' && value !== '') process.env[key] = value
}

const started = process.hrtime.bigint()
let payload
try {
  let sources = []
  try { sources = readSources(input.dir) } catch { sources = [] }
  const checks = await runRuntimeChecks({ ...input, sources })
  payload = { checks, durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n), error: null }
} catch (error) {
  payload = {
    checks: [],
    durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
    error: String(error?.stack ?? error?.message ?? error).slice(0, 2000),
  }
}

const line = `${MARKER}${JSON.stringify(payload)}\n`
// The plugin shares stdout, so results go to a dedicated pipe (fd 3) that a
// plugin printing logs cannot interleave with or truncate.
const writeResult = (callback) => {
  try { fs.writeSync(3, line) } catch {
    // A direct `node src/runtime-child.mjs` has no fd 3: fall back to stdout.
    process.stdout.write(line, callback)
    return
  }
  callback()
}
writeResult(() => process.exit(0))

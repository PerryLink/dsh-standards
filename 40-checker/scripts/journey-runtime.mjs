#!/usr/bin/env node
/**
 * J1 runtime: install -> dump -> remove -> dump, in a temp DSH_HOME.
 * Never PASSes J2-J8; those are reported not-run until their harness exists.
 *
 * Usage: node scripts/journey-runtime.mjs --package <dir> [--json] [--timeout 120000]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function parse(argv) {
  const out = { package: null, json: false, timeout: 120_000 }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--package') out.package = argv[++i]
    else if (argv[i] === '--json') out.json = true
    else if (argv[i] === '--timeout') out.timeout = Number(argv[++i])
    else if (argv[i] === '--help' || argv[i] === '-h') { console.log('usage: node scripts/journey-runtime.mjs --package <dir> [--json]'); process.exit(0) }
    else throw new Error(`unknown option: ${argv[i]}`)
  }
  if (!out.package) throw new Error('--package is required')
  return out
}

function sh(cmd, args, env, timeout) {
  return spawnSync(cmd, args, { encoding: 'utf8', timeout, env, maxBuffer: 8 * 1024 * 1024 })
}

function main() {
  const options = parse(process.argv.slice(2))
  const pkg = path.resolve(options.package)
  const manifest = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-journey-'))
  const profile = 'flow-journey'
  const env = { ...process.env, DSH_HOME: home }
  const dsh = process.platform === 'win32' ? 'dsh.cmd' : 'dsh'
  const checks = []
  const add = (id, result, reason, extra = {}) => checks.push({ id, result, reason, ...extra })
  try {
    const version = sh(dsh, ['--version'], env, 30_000)
    const dshVersion = (version.stdout || '').trim()
    const create = sh(dsh, ['--profile', profile, '--from-default-profile', 'headless', '--dump-config'], env, options.timeout)
    add('J1.profile', create.status === 0 ? 'PASS' : 'FAIL', `create profile exit=${create.status}`, { stderr: create.stderr.slice(0, 500) })
    let addResult = sh(dsh, ['plugin', '--profile', profile, 'add', pkg], env, options.timeout)
    if (addResult.status !== 0 && /installation rejected/.test(`${addResult.stdout}${addResult.stderr}`)) {
      const allow = sh(dsh, ['plugin', '--profile', profile, 'allow-version', `${manifest.name}@${manifest.version}`, '--dsh-version', dshVersion, '--accept-risk'], env, options.timeout)
      add('J1.exemption', allow.status === 0 ? 'WARN' : 'FAIL', `allow-version exit=${allow.status}`, { stderr: allow.stderr.slice(0, 500) })
      addResult = sh(dsh, ['plugin', '--profile', profile, 'add', pkg], env, options.timeout)
    }
    add('J1.install', addResult.status === 0 ? 'PASS' : 'FAIL', `add exit=${addResult.status}`, { stderr: (addResult.stderr || addResult.stdout).slice(0, 800) })
    const dump1 = sh(dsh, ['--profile', profile, '--dump-config'], env, options.timeout)
    add('J1.dump', dump1.status === 0 ? 'PASS' : 'FAIL', `dump exit=${dump1.status}`, { stderr: dump1.stderr.slice(0, 500) })
    const appears = dump1.stdout.includes(manifest.name) || /fixture-bundle-server/.test(dump1.stdout)
    add('J1.layer', appears ? 'PASS' : 'FAIL', appears ? 'layer/entry appears in dump' : 'plugin/bundle not visible in dump')
    const remove = sh(dsh, ['plugin', '--profile', profile, 'remove', manifest.name], env, options.timeout)
    add('J1.remove', remove.status === 0 ? 'PASS' : 'FAIL', `remove exit=${remove.status}`, { stderr: (remove.stderr || remove.stdout).slice(0, 800) })
    const dump2 = sh(dsh, ['--profile', profile, '--dump-config'], env, options.timeout)
    const gone = !dump2.stdout.includes(manifest.name)
    add('J1.clean', remove.status === 0 && gone ? 'PASS' : 'FAIL', gone ? 'layer/dependency gone after remove' : 'still present after remove')
    for (const id of ['J2.toggle', 'J3.config', 'J4.first-run', 'J5.permissions', 'J6.upgrade', 'J7.observe', 'J8.client']) add(id, 'not-run', 'runtime harness not implemented yet')
  } finally {
    try { fs.rmSync(home, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  const result = {
    schema: 'dsh-flow-runtime/1',
    package: manifest.name,
    version: manifest.version,
    mode: 'j1-runtime',
    checks,
    summary: {
      pass: checks.filter(c => c.result === 'PASS').length,
      warn: checks.filter(c => c.result === 'WARN').length,
      fail: checks.filter(c => c.result === 'FAIL').length,
      notRun: checks.filter(c => c.result === 'not-run').length,
    },
    conclusion: checks.some(c => c.result === 'FAIL') ? 'flow-fail' : 'flow-warn',
  }
  if (options.json || !process.stdout.isTTY) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exitCode = result.conclusion === 'flow-fail' ? 1 : 0
}
try { main() } catch (error) { console.error(`journey-runtime: ${error.message}`); process.exitCode = 3 }

#!/usr/bin/env node
/**
 * FLOW runtime probe: J1 install/remove, J2 enable/disable, J4 keyless tree-load,
 * and J6 upgrade/rollback when `--previous` is supplied.
 *
 * J3 (config validation), J5 (permissions), J7 (observability) and J8 (client
 * shapes) are reported `not-run`: this probe does not pretend to cover them.
 *
 * Usage:
 *   node scripts/journey-runtime.mjs --package <dir> [--dsh <bin>] [--previous <dir>] [--json]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function parse(argv) {
  const out = { package: null, previous: null, dsh: process.env.DSH_BIN || null, allowExemption: false, json: false, timeout: 120_000 }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--package') out.package = argv[++i]
    else if (argv[i] === '--previous') out.previous = argv[++i]
    else if (argv[i] === '--dsh') out.dsh = argv[++i]
    else if (argv[i] === '--allow-exemption') out.allowExemption = true
    else if (argv[i] === '--json') out.json = true
    else if (argv[i] === '--timeout') out.timeout = Number(argv[++i])
    else if (argv[i] === '--help' || argv[i] === '-h') { console.log('usage: node scripts/journey-runtime.mjs --package <dir> [--previous <dir>] [--dsh <bin>] [--allow-exemption] [--json]'); process.exit(0) }
    else throw new Error(`unknown option: ${argv[i]}`)
  }
  if (!out.package) throw new Error('--package is required')
  return out
}

function sh(cmd, args, env, timeout) {
  return spawnSync(cmd, args, { encoding: 'utf8', timeout, env, maxBuffer: 8 * 1024 * 1024 })
}

/** Find the row id whose `name:` is the package name or a relative server entry. */
function rowIdFromDump(dump, pkgName) {
  for (const block of dump.split(/\n(?=- )/)) {
    const id = /^\s*-\s*id:\s*(\S+)/m.exec(block)
    if (!id) continue
    // `name` is either inline or a `>-` block whose first indented line holds
    // the value (a file: URL for a local bundle).
    const inline = /\n\s*name:\s*['"]?([^'"\n]+)['"]?/.exec(block)
    const blockValue = /\n\s*name:\s*>-\s*\n\s*([^\n]+)/.exec(block)
    const name = (blockValue ? blockValue[1] : inline ? inline[1] : '').trim()
    if (name === pkgName || name.startsWith('./') || name.includes(pkgName)) return id[1]
  }
  return null
}

function installedVersion(home, profile, pkgName) {
  const file = path.join(home, 'profiles', profile, 'node_modules', ...pkgName.split('/'), 'package.json')
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).version ?? null } catch { return null }
}

function main() {
  const options = parse(process.argv.slice(2))
  const pkg = path.resolve(options.package)
  const manifest = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'))
  const previous = options.previous ? path.resolve(options.previous) : null
  const previousManifest = previous ? JSON.parse(fs.readFileSync(path.join(previous, 'package.json'), 'utf8')) : null
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-journey-'))
  const profile = 'flow-journey'
  const env = { ...process.env, DSH_HOME: home }
  delete env.DEEPSEEK_API_KEY
  delete env.OPENAI_API_KEY
  const dsh = options.dsh || (process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
  const checks = []
  let dshVersion = null
  const add = (id, result, reason, extra = {}) => checks.push({ id, result, reason, ...extra })
  try {
    const version = sh(dsh, ['--version'], env, 30_000)
    dshVersion = (version.stdout || '').trim()
    const create = sh(dsh, ['--profile', profile, '--from-default-profile', 'headless', '--dump-config'], env, options.timeout)
    add('J1.profile', create.status === 0 ? 'PASS' : 'FAIL', `create profile exit=${create.status}`, { stderr: create.stderr.slice(0, 500) })
    let addResult = sh(dsh, ['plugin', '--profile', profile, 'add', pkg], env, options.timeout)
    let addText = `${addResult.stdout}${addResult.stderr}`
    const rejected = addResult.status !== 0 && /installation rejected/.test(addText)
    // Never grant an exact-version exemption by default: a gate rejection is a
    // measured BLOCKED result, not something the harness may silently accept.
    if (rejected && (options.allowExemption || process.env.DSH_JOURNEY_ALLOW_EXEMPTION === '1')) {
      const allow = sh(dsh, ['plugin', '--profile', profile, 'allow-version', `${manifest.name}@${manifest.version}`, '--dsh-version', dshVersion, '--accept-risk'], env, options.timeout)
      add('J1.exemption', allow.status === 0 ? 'WARN' : 'FAIL', `allow-version exit=${allow.status}`, { stderr: allow.stderr.slice(0, 500) })
      addResult = sh(dsh, ['plugin', '--profile', profile, 'add', pkg], env, options.timeout)
      addText = `${addResult.stdout}${addResult.stderr}`
    }
    add('J1.install', rejected && !options.allowExemption && process.env.DSH_JOURNEY_ALLOW_EXEMPTION !== '1' ? 'BLOCKED' : addResult.status === 0 ? 'PASS' : 'FAIL', rejected ? 'host compatibility gate rejected the install (no exemption granted)' : `add exit=${addResult.status}`, { stderr: addText.slice(0, 800) })
    const dump1 = sh(dsh, ['--profile', profile, '--dump-config'], env, options.timeout)
    add('J1.dump', dump1.status === 0 ? 'PASS' : 'FAIL', `dump exit=${dump1.status}`, { stderr: dump1.stderr.slice(0, 500) })
    const appears = dump1.stdout.includes(manifest.name) || /fixture-bundle-server/.test(dump1.stdout)
    add('J1.layer', appears ? 'PASS' : 'FAIL', appears ? 'layer/entry appears in dump' : 'plugin/bundle not visible in dump')

    // J2: disable/enable through a profile overlay. A missing row id is a real
    // failure of the probe (not a pass): report it and skip the toggle checks.
    const rowId = rowIdFromDump(dump1.stdout, manifest.name)
    if (!rowId) {
      add('J2.toggle', 'not-run', 'could not locate the inserted row id in dump-config')
    } else {
      const overlay = path.join(home, 'j2-overlay.yml')
      fs.writeFileSync(overlay, `- id: ${rowId}\n  disabled: true\n`)
      const disabled = sh(dsh, ['--profile', profile, '--patch', overlay, '--dump-config'], env, options.timeout)
      const disabledOK = disabled.status === 0 && /disabled:\s*true/.test(disabled.stdout)
      add('J2.disable', disabledOK ? 'PASS' : 'FAIL', disabledOK ? `row ${rowId} disabled` : `disable exit=${disabled.status}`, { stderr: disabled.stderr.slice(0, 500) })
      fs.writeFileSync(overlay, `- id: ${rowId}\n  disabled: false\n`)
      const enabled = sh(dsh, ['--profile', profile, '--patch', overlay, '--dump-config'], env, options.timeout)
      const enabledOK = enabled.status === 0 && !new RegExp(`id:\\s*${rowId}[\\s\\S]{0,80}disabled:\\s*true`).test(enabled.stdout)
      add('J2.enable', enabledOK ? 'PASS' : 'FAIL', enabledOK ? `row ${rowId} enabled again` : `enable exit=${enabled.status}`, { stderr: enabled.stderr.slice(0, 500) })
    }

    const remove = sh(dsh, ['plugin', '--profile', profile, 'remove', manifest.name], env, options.timeout)
    add('J1.remove', remove.status === 0 ? 'PASS' : 'FAIL', `remove exit=${remove.status}`, { stderr: (remove.stderr || remove.stdout).slice(0, 800) })
    const dump2 = sh(dsh, ['--profile', profile, '--dump-config'], env, options.timeout)
    const gone = !dump2.stdout.includes(manifest.name)
    add('J1.clean', remove.status === 0 && gone ? 'PASS' : 'FAIL', gone ? 'layer/dependency gone after remove' : 'still present after remove')

    // J4: with no API key, the tree must load far enough to reach the model
    // boundary. This is a tree-load proof, not a successful first task.
    if (process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY) {
      add('J4.tree-load', 'not-run', 'an API key is present in the launching environment')
    } else {
      const boot = sh(dsh, ['plugin', '--profile', profile, 'add', pkg], env, options.timeout)
      if (boot.status !== 0) add('J4.tree-load', 'FAIL', `reinstall exit=${boot.status}`, { stderr: boot.stderr.slice(0, 500) })
      else {
        const run = sh(dsh, ['--profile', profile, 'Reply with one short sentence.'], env, 60_000)
        const text = `${run.stdout}${run.stderr}`
        const reached = run.status !== 0 && /MISSING_CREDENTIAL|no API key|AUTH|credential/i.test(text)
        add('J4.tree-load', reached ? 'PASS' : 'FAIL', reached ? 'keyless boot reached the credential boundary' : `boot exit=${run.status}; no credential-boundary message`, { stderr: text.slice(0, 500) })
      }
    }

    // J6: upgrade then rollback. Only meaningful when a previous package is
    // supplied; otherwise it is honestly not-run.
    if (!previous || !previousManifest) {
      add('J6.upgrade', 'not-run', 'no --previous package supplied')
      add('J6.rollback', 'not-run', 'no --previous package supplied')
    } else {
      const u1 = sh(dsh, ['plugin', '--profile', profile, 'add', previous], env, options.timeout)
      const v1 = installedVersion(home, profile, manifest.name)
      add('J6.upgrade', u1.status === 0 && v1 === previousManifest.version ? 'PASS' : 'FAIL', `upgrade ${previousManifest.version}->${manifest.version} exit=${u1.status}, installed=${v1}`, { stderr: (u1.stderr || u1.stdout).slice(0, 500) })
      const u2 = sh(dsh, ['plugin', '--profile', profile, 'add', pkg], env, options.timeout)
      const v2 = installedVersion(home, profile, manifest.name)
      add('J6.upgrade-current', u2.status === 0 && v2 === manifest.version ? 'PASS' : 'FAIL', `current install exit=${u2.status}, installed=${v2}`, { stderr: (u2.stderr || u2.stdout).slice(0, 500) })
      const u3 = sh(dsh, ['plugin', '--profile', profile, 'add', previous], env, options.timeout)
      const v3 = installedVersion(home, profile, manifest.name)
      add('J6.rollback', u3.status === 0 && v3 === previousManifest.version ? 'PASS' : 'FAIL', `rollback exit=${u3.status}, installed=${v3}`, { stderr: (u3.stderr || u3.stdout).slice(0, 500) })
    }

    for (const [id, reason] of [
      ['J3.config', 'invalid-config harness not implemented; do not claim J3'],
      ['J5.permissions', 'permissions/disclosure review is manual'],
      ['J7.observe', 'observability probe not implemented'],
      ['J8.client', 'client-shape probe not implemented'],
    ]) add(id, 'not-run', reason)
  } finally {
    try { fs.rmSync(home, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  const result = {
    schema: 'dsh-flow-runtime/1',
    environment: { dsh: dshVersion, node: process.version, platform: process.platform },
    package: manifest.name,
    version: manifest.version,
    previous: previousManifest ? previousManifest.version : null,
    mode: 'j1-j2-j4-j6-runtime',
    checks,
    summary: {
      pass: checks.filter(c => c.result === 'PASS').length,
      warn: checks.filter(c => c.result === 'WARN').length,
      fail: checks.filter(c => c.result === 'FAIL').length,
      blocked: checks.filter(c => c.result === 'BLOCKED').length,
      notRun: checks.filter(c => c.result === 'not-run').length,
    },
    conclusion: checks.some(c => c.result === 'FAIL') ? 'flow-fail' : checks.some(c => c.result === 'BLOCKED') ? 'flow-blocked' : 'flow-warn',
  }
  if (options.json || !process.stdout.isTTY) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exitCode = result.conclusion === 'flow-fail' ? 1 : 0
}
try { main() } catch (error) { console.error(`journey-runtime: ${error.message}`); process.exitCode = 3 }

#!/usr/bin/env node
/**
 * FLOW runtime probe: J1 install/remove, J2 enable/disable, J4 keyless tree-load,
 * and J6 upgrade/rollback when `--previous` is supplied.
 *
 * J3 (config validation), J5 (permissions), J7 (observability) and J8 (client
 * shapes) are reported `not-run`: this probe does not pretend to cover them.
 *
 * Evidence mode (`--log-dir`): every command records its argv, exit code,
 * ISO start/end time, and stdout/stderr log path + sha256. `flow-collect.mjs`
 * wraps those checks into `dsh-flow-evidence/2`. Without `--log-dir` the older
 * summary shape is preserved for existing consumers.
 *
 * Safety: the child environment is built from an allowlist (no tokens, keys,
 * credentials), HOME/DSH_HOME/TMPDIR point at a fresh temp tree, and the probe
 * never grants an exact-version exemption unless the caller explicitly asks.
 *
 * Usage:
 *   node scripts/journey-runtime.mjs --package <dir> [--dsh <bin>] [--previous <dir>]
 *     [--log-dir <dir>] [--allow-exemption] [--json]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { sanitizedEnv, envPolicy } from '../src/sandbox-env.mjs'
import { sha256Value } from '../src/flow-evidence.mjs'

function parse(argv) {
  const out = {
    package: null, previous: null, dsh: process.env.DSH_BIN || null, allowExemption: false,
    json: false, timeout: 120_000, logDir: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--package') out.package = argv[++i]
    else if (argv[i] === '--previous') out.previous = argv[++i]
    else if (argv[i] === '--dsh') out.dsh = argv[++i]
    else if (argv[i] === '--log-dir') out.logDir = argv[++i]
    else if (argv[i] === '--allow-exemption') out.allowExemption = true
    else if (argv[i] === '--json') out.json = true
    else if (argv[i] === '--timeout') out.timeout = Number(argv[++i])
    else if (argv[i] === '--help' || argv[i] === '-h') { console.log('usage: node scripts/journey-runtime.mjs --package <dir> [--previous <dir>] [--dsh <bin>] [--log-dir <dir>] [--allow-exemption] [--json]'); process.exit(0) }
    else throw new Error(`unknown option: ${argv[i]}`)
  }
  if (!out.package) throw new Error('--package is required')
  return out
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-journey-'))
  const home = path.join(root, 'home')
  const tmp = path.join(root, 'tmp')
  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(tmp, { recursive: true })
  const logDir = options.logDir ? path.resolve(options.logDir) : null
  if (logDir) fs.mkdirSync(logDir, { recursive: true })
  const profile = 'flow-journey'
  const env = sanitizedEnv({
    DSH_HOME: home,
    HOME: home,
    USERPROFILE: home,
    TMPDIR: tmp,
    TEMP: tmp,
    TMP: tmp,
    NPM_CONFIG_USERCONFIG: path.join(home, '.npmrc'),
  })
  const dsh = options.dsh || (process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
  const checks = []
  const blockers = []
  let dshVersion = null

  const writeLog = (name, text) => {
    if (!logDir) return null
    const file = path.join(logDir, name)
    fs.writeFileSync(file, text ?? '')
    return { path: name.split(path.sep).join('/'), sha256: sha256Value(text ?? '') }
  }

  /** Run one command and record argv/exit/times/logs (never process.env). */
  const exec = (label, cmd, args, timeout) => {
    const startedAt = new Date().toISOString()
    const t0 = Date.now()
    const result = spawnSync(cmd, args, {
      encoding: 'utf8', timeout, env, maxBuffer: 8 * 1024 * 1024, killSignal: 'SIGKILL',
    })
    const endedAt = new Date().toISOString()
    const stdoutText = result.stdout ?? ''
    const stderrText = result.stderr ?? ''
    const timedOut = result.error?.code === 'ETIMEDOUT'
    return {
      command: [cmd, ...args],
      exitCode: Number.isInteger(result.status) ? result.status : timedOut ? 124 : 127,
      startedAt,
      endedAt,
      durationMs: Date.now() - t0,
      stdoutText,
      stderrText,
      stdout: writeLog(`${label}.out.log`, stdoutText),
      stderrLog: writeLog(`${label}.err.log`, stderrText),
      timedOut,
      error: result.error ? result.error.message : null,
    }
  }

  const add = (id, result, reason, record = null, assertions = []) => {
    checks.push({
      id,
      result,
      reason,
      command: record ? record.command : null,
      exitCode: record ? record.exitCode : null,
      startedAt: record ? record.startedAt : null,
      endedAt: record ? record.endedAt : null,
      durationMs: record ? record.durationMs : null,
      stdout: record ? record.stdout : null,
      stderrLog: record ? record.stderrLog : null,
      stderr: record ? String(record.stderrText).slice(0, 800) : null,
      assertions,
    })
  }
  const claim = (text, observed) => ({ claim: text, observed })

  try {
    const version = exec('J1.version', dsh, ['--version'], 30_000)
    dshVersion = (version.stdoutText || '').trim() || null
    if (version.exitCode !== 0) {
      blockers.push({ journey: 'J1', check: 'J1.version', reason: `dsh executable not usable: ${dsh} (exit ${version.exitCode})` })
      add('J1.version', 'BLOCKED', `dsh --version failed (exit ${version.exitCode})`, version, [claim('dsh --version succeeded', false)])
      add('J2.toggle', 'not-run', 'skipped: no usable dsh executable')
      add('J4.tree-load', 'not-run', 'skipped: no usable dsh executable')
      add('J6.upgrade', 'not-run', 'skipped: no usable dsh executable')
      add('J6.rollback', 'not-run', 'skipped: no usable dsh executable')
    } else {
      const create = exec('J1.profile', dsh, ['--profile', profile, '--from-default-profile', 'headless', '--dump-config'], options.timeout)
      add('J1.profile', create.exitCode === 0 ? 'PASS' : 'FAIL', `create profile exit=${create.exitCode}`, create,
        [claim('create profile from the shipped headless template', create.exitCode === 0)])

      if (create.exitCode !== 0) {
        blockers.push({ journey: 'J1', check: 'J1.profile', reason: `profile creation failed (exit ${create.exitCode})` })
        add('J2.toggle', 'not-run', 'skipped: profile could not be created')
        add('J4.tree-load', 'not-run', 'skipped: profile could not be created')
        add('J6.upgrade', 'not-run', 'skipped: profile could not be created')
        add('J6.rollback', 'not-run', 'skipped: profile could not be created')
      } else {
        runJourneys()
      }
    }

    function runJourneys() {
      const addResult = exec('J1.install', dsh, ['plugin', '--profile', profile, 'add', pkg], options.timeout)
      const addText = `${addResult.stdoutText}${addResult.stderrText}`
      const rejected = addResult.exitCode !== 0 && /installation rejected/.test(addText)
      const exempt = options.allowExemption || process.env.DSH_JOURNEY_ALLOW_EXEMPTION === '1'
      // Never grant an exact-version exemption by default: a gate rejection is a
      // measured BLOCKED result, not something the harness may silently accept.
      if (rejected && exempt) {
        const allow = exec('J1.exemption', dsh, ['plugin', '--profile', profile, 'allow-version', `${manifest.name}@${manifest.version}`, '--dsh-version', dshVersion, '--accept-risk'], options.timeout)
        add('J1.exemption', allow.exitCode === 0 ? 'WARN' : 'FAIL', `allow-version exit=${allow.exitCode}`, allow,
          [claim('exact-version exemption granted for this host only', allow.exitCode === 0)])
        const retry = exec('J1.install-retry', dsh, ['plugin', '--profile', profile, 'add', pkg], options.timeout)
        add('J1.install', retry.exitCode === 0 ? 'PASS' : 'FAIL', `install retry exit=${retry.exitCode}`, retry,
          [claim('plugin add succeeds after the explicit exemption', retry.exitCode === 0)])
      } else if (rejected) {
        blockers.push({ journey: 'J1', check: 'J1.install', reason: 'host compatibility gate rejected the install (no exemption granted)' })
        add('J1.install', 'BLOCKED', 'host compatibility gate rejected the install (no exemption granted)', addResult,
          [claim('host compatibility gate admits the plugin', false)])
        add('J2.toggle', 'not-run', 'skipped: install was rejected by the host compatibility gate')
        add('J4.tree-load', 'not-run', 'skipped: install was rejected by the host compatibility gate')
        add('J6.upgrade', 'not-run', 'skipped: install was rejected by the host compatibility gate')
        add('J6.rollback', 'not-run', 'skipped: install was rejected by the host compatibility gate')
        return
      } else {
        add('J1.install', addResult.exitCode === 0 ? 'PASS' : 'FAIL', `add exit=${addResult.exitCode}`, addResult,
          [claim('plugin add exits 0', addResult.exitCode === 0)])
      }

      const dump1 = exec('J1.dump', dsh, ['--profile', profile, '--dump-config'], options.timeout)
      const appears = dump1.stdoutText.includes(manifest.name) || /fixture-bundle-server/.test(dump1.stdoutText)
      add('J1.dump', dump1.exitCode === 0 ? 'PASS' : 'FAIL', `dump exit=${dump1.exitCode}`, dump1,
        [claim('dump-config exits 0', dump1.exitCode === 0), claim('plugin/bundle layer appears in dump', appears)])
      add('J1.layer', appears ? 'PASS' : 'FAIL', appears ? 'layer/entry appears in dump' : 'plugin/bundle not visible in dump', dump1,
        [claim('layer/entry appears in dump', appears)])

      // J2: disable/enable through a profile overlay. A missing row id is a real
      // non-result of the probe (not a pass): report it and skip the toggle checks.
      const rowId = rowIdFromDump(dump1.stdoutText, manifest.name)
      if (!rowId) {
        add('J2.toggle', 'not-run', 'could not locate the inserted row id in dump-config')
      } else {
        const overlay = path.join(root, 'j2-overlay.yml')
        fs.writeFileSync(overlay, `- id: ${rowId}\n  disabled: true\n`)
        const disabled = exec('J2.disable', dsh, ['--profile', profile, '--patch', overlay, '--dump-config'], options.timeout)
        const disabledOK = disabled.exitCode === 0 && /disabled:\s*true/.test(disabled.stdoutText)
        add('J2.disable', disabledOK ? 'PASS' : 'FAIL', disabledOK ? `row ${rowId} disabled` : `disable exit=${disabled.exitCode}`, disabled,
          [claim(`row ${rowId} shows disabled: true after the overlay`, disabledOK)])
        fs.writeFileSync(overlay, `- id: ${rowId}\n  disabled: false\n`)
        const enabled = exec('J2.enable', dsh, ['--profile', profile, '--patch', overlay, '--dump-config'], options.timeout)
        const enabledOK = enabled.exitCode === 0 && !new RegExp(`id:\\s*${rowId}[\\s\\S]{0,80}disabled:\\s*true`).test(enabled.stdoutText)
        add('J2.enable', enabledOK ? 'PASS' : 'FAIL', enabledOK ? `row ${rowId} enabled again` : `enable exit=${enabled.exitCode}`, enabled,
          [claim(`row ${rowId} is no longer disabled after the overlay`, enabledOK)])
      }

      const remove = exec('J1.remove', dsh, ['plugin', '--profile', profile, 'remove', manifest.name], options.timeout)
      add('J1.remove', remove.exitCode === 0 ? 'PASS' : 'FAIL', `remove exit=${remove.exitCode}`, remove,
        [claim('plugin remove exits 0', remove.exitCode === 0)])
      const dump2 = exec('J1.clean', dsh, ['--profile', profile, '--dump-config'], options.timeout)
      const gone = !dump2.stdoutText.includes(manifest.name)
      add('J1.clean', remove.exitCode === 0 && gone ? 'PASS' : 'FAIL', gone ? 'layer/dependency gone after remove' : 'still present after remove', dump2,
        [claim('plugin remove exits 0', remove.exitCode === 0), claim('layer/dependency gone after remove', gone)])

      // J4: with no API key in the child environment, the tree must load far
      // enough to reach the model boundary. This is a tree-load proof, not a
      // successful first task. The allowlisted env never carries a provider key.
      const boot = exec('J4.reinstall', dsh, ['plugin', '--profile', profile, 'add', pkg], options.timeout)
      if (boot.exitCode !== 0) {
        add('J4.tree-load', 'FAIL', `reinstall exit=${boot.exitCode}`, boot, [claim('clean reinstall exits 0', false)])
      } else {
        const run = exec('J4.tree-load', dsh, ['--profile', profile, 'Reply with one short sentence.'], 60_000)
        const text = `${run.stdoutText}${run.stderrText}`
        const reached = run.exitCode !== 0 && /MISSING_CREDENTIAL|no API key|AUTH|credential/i.test(text)
        add('J4.tree-load', reached ? 'PASS' : 'FAIL', reached ? 'keyless boot reached the credential boundary' : `boot exit=${run.exitCode}; no credential-boundary message`, run,
          [claim('keyless boot reaches the credential boundary', reached)])
      }

      // J6: upgrade then rollback. Only meaningful when a previous package is
      // supplied; otherwise it is honestly not-run.
      if (!previous || !previousManifest) {
        add('J6.upgrade', 'not-run', 'no --previous package supplied')
        add('J6.rollback', 'not-run', 'no --previous package supplied')
      } else {
        const u1 = exec('J6.upgrade', dsh, ['plugin', '--profile', profile, 'add', previous], options.timeout)
        const v1 = installedVersion(home, profile, manifest.name)
        add('J6.upgrade', u1.exitCode === 0 && v1 === previousManifest.version ? 'PASS' : 'FAIL', `upgrade ${previousManifest.version}->${manifest.version} exit=${u1.exitCode}, installed=${v1}`, u1,
          [claim(`installed version equals previous ${previousManifest.version}`, u1.exitCode === 0 && v1 === previousManifest.version)])
        const u2 = exec('J6.upgrade-current', dsh, ['plugin', '--profile', profile, 'add', pkg], options.timeout)
        const v2 = installedVersion(home, profile, manifest.name)
        add('J6.upgrade-current', u2.exitCode === 0 && v2 === manifest.version ? 'PASS' : 'FAIL', `current install exit=${u2.exitCode}, installed=${v2}`, u2,
          [claim(`installed version equals current ${manifest.version}`, u2.exitCode === 0 && v2 === manifest.version)])
        const u3 = exec('J6.rollback', dsh, ['plugin', '--profile', profile, 'add', previous], options.timeout)
        const v3 = installedVersion(home, profile, manifest.name)
        add('J6.rollback', u3.exitCode === 0 && v3 === previousManifest.version ? 'PASS' : 'FAIL', `rollback exit=${u3.exitCode}, installed=${v3}`, u3,
          [claim(`rollback installs ${previousManifest.version} again`, u3.exitCode === 0 && v3 === previousManifest.version)])
      }
    }

    for (const [id, reason] of [
      ['J3.config', 'invalid-config harness not implemented; do not claim J3'],
      ['J5.permissions', 'permissions/disclosure review is manual'],
      ['J7.observe', 'observability probe not implemented'],
      ['J8.client', 'client-shape probe not implemented'],
    ]) add(id, 'not-run', reason)
  } finally {
    try { fs.rmSync(root, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  const result = {
    schema: 'dsh-flow-runtime/1',
    environment: { dsh: dshVersion, node: process.version, platform: `${process.platform}-${process.arch}` },
    package: manifest.name,
    version: manifest.version,
    previous: previousManifest ? previousManifest.version : null,
    mode: 'j1-j2-j4-j6-runtime',
    evidenceMode: logDir !== null,
    environmentPolicy: envPolicy(),
    checks,
    blockers,
    summary: {
      pass: checks.filter(c => c.result === 'PASS').length,
      warn: checks.filter(c => c.result === 'WARN').length,
      fail: checks.filter(c => c.result === 'FAIL').length,
      blocked: checks.filter(c => c.result === 'BLOCKED').length,
      notRun: checks.filter(c => c.result === 'not-run').length,
    },
    conclusion: checks.some(c => c.result === 'FAIL') ? 'flow-fail' : checks.some(c => c.result === 'BLOCKED') || blockers.length > 0 ? 'flow-blocked' : 'flow-warn',
  }
  if (options.json || !process.stdout.isTTY) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exitCode = result.conclusion === 'flow-fail' ? 1 : 0
}
try { main() } catch (error) { console.error(`journey-runtime: ${error.message}`); process.exitCode = 3 }

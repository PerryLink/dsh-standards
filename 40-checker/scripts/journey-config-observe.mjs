#!/usr/bin/env node
/**
 * J3 + J7 runtime probe on a fixture plugin.
 *
 * J3: an invalid config value must fail loudly with a field path; a valid value
 *     and the default must boot.
 * J7: the start line must name the package/version; a keyless boot must reach a
 *     diagnosable credential boundary.
 *
 * This is fixture-level evidence. It does not prove that every plugin validates
 * its config or logs a start line.
 *
 * Usage:
 *   node 40-checker/scripts/journey-config-observe.mjs \
 *     --package 40-checker/fixtures/flow-config \
 *     --dsh /tmp/dsh022/node_modules/@deepseek-ai/dsh/lib/bin.js --json
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function parse(argv) {
  const out = { package: null, dsh: process.env.DSH_BIN || 'dsh', json: false, timeout: 120_000 }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--package') out.package = argv[++i]
    else if (argv[i] === '--dsh') out.dsh = argv[++i]
    else if (argv[i] === '--json') out.json = true
    else if (argv[i] === '--timeout') out.timeout = Number(argv[++i])
    else if (argv[i] === '--help' || argv[i] === '-h') { console.log('usage: journey-config-observe.mjs --package <dir> [--dsh <bin>] [--json]'); process.exit(0) }
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
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-config-'))
  const profile = 'flow-config'
  const env = { ...process.env, DSH_HOME: home }
  delete env.DEEPSEEK_API_KEY
  delete env.OPENAI_API_KEY
  const checks = []
  let dshVersion = null
  const add = (id, result, reason) => checks.push({ id, result, reason })
  try {
    const version = sh(options.dsh, ['--version'], env, 20_000)
    dshVersion = (version.stdout || '').trim()
    const create = sh(options.dsh, ['--profile', profile, '--from-default-profile', 'headless', '--dump-config'], env, options.timeout)
    if (create.status !== 0) {
      add('setup.profile', 'BLOCKED', `profile create exit=${create.status}`)
    } else {
      const install = sh(options.dsh, ['plugin', '--profile', profile, 'add', pkg], env, options.timeout)
      add('setup.install', install.status === 0 ? 'PASS' : 'BLOCKED', `plain dependency install exit=${install.status}`)

      const overlay = path.join(home, 'flow-config.yml')
      const write = (config) => {
        const body = config === undefined
          ? `- insert:\n    - id: flow-config\n      name: '${manifest.name}'\n`
          : `- insert:\n    - id: flow-config\n      name: '${manifest.name}'\n      config:\n        port: ${JSON.stringify(config)}\n`
        fs.writeFileSync(overlay, body)
      }
      const boot = () => sh(options.dsh, ['--profile', profile, '--patch', overlay, 'reply with one short sentence'], env, 60_000)

      write('not-a-number')
      const invalid = boot()
      const invalidText = `${invalid.stdout}${invalid.stderr}`
      const fieldPath = /config\.port/.test(invalidText)
      add('J3.invalid-field-path', invalid.status !== 0 && fieldPath ? 'PASS' : 'FAIL', `invalid config exit=${invalid.status}; fieldPath=${fieldPath}`)

      write(8080)
      const valid = boot()
      const validText = `${valid.stdout}${valid.stderr}`
      add('J3.valid-config', valid.status !== 0 && /started \(port=8080\)/.test(validText) ? 'PASS' : 'FAIL', `valid config exit=${valid.status}`)
      add('J7.start-line', /flow-config@1\.0\.0 started/.test(validText) ? 'PASS' : 'FAIL', 'start line names package@version')
      add('J7.diagnosable', /MISSING_CREDENTIAL|no API key|AUTH|credential/i.test(validText) ? 'PASS' : 'FAIL', 'keyless failure reaches a diagnosable credential boundary')

      write(undefined)
      const defaults = boot()
      add('J3.defaults', /started \(port=default\)/.test(`${defaults.stdout}${defaults.stderr}`) ? 'PASS' : 'FAIL', 'missing config uses the default')
    }
  } finally {
    try { fs.rmSync(home, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  const result = {
    schema: 'dsh-flow-config-observe/1',
    generatedAt: new Date().toISOString(),
    package: manifest.name,
    version: manifest.version,
    environment: { dsh: dshVersion, node: process.version, platform: process.platform },
    checks,
    summary: {
      pass: checks.filter((c) => c.result === 'PASS').length,
      fail: checks.filter((c) => c.result === 'FAIL').length,
      blocked: checks.filter((c) => c.result === 'BLOCKED').length,
    },
    limitations: ['fixture-level only; not every plugin validates config or logs a start line'],
  }
  if (options.json || !process.stdout.isTTY) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exitCode = result.summary.fail > 0 ? 1 : 0
}
try { main() } catch (error) { console.error(`journey-config-observe: ${error.message}`); process.exitCode = 3 }

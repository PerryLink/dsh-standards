#!/usr/bin/env node
/**
 * DSH-FLOW static journey prep: J1-J8 as far as possible without a host.
 * Runtime install/boot journeys are reported not-run, never PASS.
 *
 * Usage: node scripts/journey.mjs --package <dir> [--json]
 */
import fs from 'node:fs'
import path from 'node:path'

function parse(argv) {
  const out = { package: null, json: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--package') out.package = argv[++i]
    else if (argv[i] === '--json') out.json = true
    else if (argv[i] === '--help' || argv[i] === '-h') { console.log('usage: node scripts/journey.mjs --package <dir> [--json]'); process.exit(0) }
    else throw new Error(`unknown option: ${argv[i]}`)
  }
  if (!out.package) throw new Error('--package is required')
  return out
}

const read = file => { try { return fs.readFileSync(file, 'utf8') } catch { return '' } }
const has = (text, re) => re.test(text)

function main() {
  const { package: pkg, json } = parse(process.argv.slice(2))
  const dir = path.resolve(pkg)
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const readme = read(path.join(dir, 'README.md'))
  const sources = ['index.js', 'lib/index.js', 'src/index.ts', 'src/index.js', 'dist/index.js']
    .map(file => read(path.join(dir, file))).join('\n')
  const patchFiles = manifest.dsh?.bundle?.patch
    ? (Array.isArray(manifest.dsh.bundle.patch) ? manifest.dsh.bundle.patch : [manifest.dsh.bundle.patch])
    : []
  const patch = patchFiles.map(file => read(path.join(dir, file))).join('\n')
  const hasClient = Boolean(manifest.dsh?.client)
  const hasWorkspace = JSON.stringify(manifest).includes('workspace:')
  const hasFiles = Array.isArray(manifest.files) && manifest.files.length > 0
  const hasEngines = Boolean(manifest.engines?.dsh)

  const checks = []
  const add = (id, result, reason) => checks.push({ id, result, reason })
  add('J1.install', !hasWorkspace && (manifest.main || manifest.exports) && hasFiles ? 'PASS' : hasWorkspace ? 'FAIL' : 'WARN', hasWorkspace ? 'workspace: in manifest' : hasFiles ? 'entry + files present' : 'files[] missing (prebuilt tarball may omit)')
  add('J2.toggle', patch.includes('disabled') || hasClient ? 'PASS' : 'WARN', patch.includes('disabled') ? 'patch has disabled' : 'no disabled/stable toggle evidence')
  add('J3.config', has(sources, /Config|Schema|schemastery/) ? 'PASS' : 'WARN', has(sources, /Config|Schema|schemastery/) ? 'schema found' : 'no schema/Config found in known entries')
  add('J4.first-run', has(readme, /quickstart|getting started|安装|快速开始/i) ? 'PASS' : 'WARN', has(readme, /quickstart|getting started|安装|快速开始/i) ? 'README quickstart' : 'README quickstart missing')
  add('J5.permissions', manifest.dsh?.capabilities || manifest.dsh?.labels || has(readme, /permission|权限/i) ? 'PASS' : 'WARN', 'permissions declaration/README')
  add('J6.upgrade', hasEngines && hasFiles ? 'PASS' : 'WARN', hasEngines ? 'engines + files' : 'engines.dsh missing')
  add('J7.observe', has(sources, /logger|ctx\.logger/) || has(readme, /troubleshoot|日志|log/i) ? 'PASS' : 'WARN', 'logger/README troubleshooting')
  add('J8.client', hasClient ? (typeof manifest.exports?.['./client'] === 'string' ? 'PASS' : 'FAIL') : 'NA', hasClient ? 'client export present' : 'no dsh.client')
  add('J1.runtime', 'not-run', 'requires temp DSH_HOME + real dsh plugin add/remove')
  add('J2.runtime', 'not-run', 'requires real profile boot')
  add('J4.runtime', 'not-run', 'requires real first-run')
  add('J6.runtime', 'not-run', 'requires real upgrade/rollback')
  add('J8.runtime', 'not-run', 'requires browser/host page')

  const result = {
    schema: 'dsh-flow-journey/1',
    package: manifest.name,
    version: manifest.version,
    mode: 'static-prep',
    checks,
    summary: {
      pass: checks.filter(c => c.result === 'PASS').length,
      warn: checks.filter(c => c.result === 'WARN').length,
      fail: checks.filter(c => c.result === 'FAIL').length,
      na: checks.filter(c => c.result === 'NA').length,
      notRun: checks.filter(c => c.result === 'not-run').length,
    },
    conclusion: 'flow-not-run',
  }
  if (json || !process.stdout.isTTY) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exitCode = result.summary.fail > 0 ? 1 : 0
}
try { main() } catch (error) { console.error(`journey: ${error.message}`); process.exitCode = 3 }

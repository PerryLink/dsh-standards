#!/usr/bin/env node
/**
 * Build a temporary host farm for L1-L3 runs.
 *
 * The checker itself stays zero-dependency. This script is a *test utility*:
 * it links a DSH checkout's installed dependencies plus every `@deepseek-ai/*`
 * workspace/vendor package into a temp `node_modules`, copies one plugin into
 * `farm/plugins/<name>`, and optionally runs `npm install` / `npm run build`.
 *
 * Linux/WSL is the supported environment (symlinks). Windows may need
 * Developer Mode or an elevated shell for directory junctions.
 *
 * Usage:
 *   node scripts/host-farm.mjs \
 *     --plugin /tmp/dsh-verify-samples/foo \
 *     --farm /tmp/dsh-farm \
 *     --host <dsh-checkout> \
 *     --install --build
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function parse(argv) {
  const options = { plugin: null, farm: null, host: '<dsh-checkout>', install: false, build: false, link: false, quiet: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--plugin') options.plugin = argv[++i]
    else if (arg === '--farm') options.farm = argv[++i]
    else if (arg === '--host') options.host = argv[++i]
    else if (arg === '--install') options.install = true
    else if (arg === '--build') options.build = true
    else if (arg === '--link') options.link = true
    else if (arg === '--quiet') options.quiet = true
    else if (arg === '--help' || arg === '-h') { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 20).join('\n')); process.exit(0) }
    else throw new Error(`unknown option: ${arg}`)
  }
  if (!options.plugin) throw new Error('--plugin is required')
  if (!options.farm) throw new Error('--farm is required')
  return options
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function link(source, dest) {
  try {
    if (fs.existsSync(dest) || fs.lstatSync(dest, { throwIfNoEntry: false })) return false
  } catch { /* lstat can throw for broken links; fall through */ }
  try {
    fs.symlinkSync(source, dest, process.platform === 'win32' ? 'junction' : 'dir')
    return true
  } catch {
    return false
  }
}

function linkNodeModules(host, farm) {
  const sourceModules = path.join(host, 'node_modules')
  const destModules = path.join(farm, 'node_modules')
  ensureDir(destModules)
  let linked = 0
  if (fs.existsSync(sourceModules)) {
    for (const entry of fs.readdirSync(sourceModules, { withFileTypes: true })) {
      if (entry.name === '@deepseek-ai') continue
      const source = path.join(sourceModules, entry.name)
      const dest = path.join(destModules, entry.name)
      if (entry.name.startsWith('@') && entry.isDirectory()) {
        ensureDir(dest)
        for (const child of fs.readdirSync(source, { withFileTypes: true })) {
          if (link(path.join(source, child.name), path.join(dest, child.name))) linked += 1
        }
      } else if (link(source, dest)) linked += 1
    }
  }
  return linked
}

function linkWorkspacePackages(host, farm) {
  const scope = path.join(farm, 'node_modules', '@deepseek-ai')
  ensureDir(scope)
  let linked = 0
  const seen = new Set()
  const walk = (directory) => {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const absolute = path.join(directory, entry.name)
      const manifestPath = path.join(absolute, 'package.json')
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
          if (typeof manifest.name === 'string' && manifest.name.startsWith('@deepseek-ai/')) {
            const short = manifest.name.slice('@deepseek-ai/'.length)
            if (!seen.has(short)) {
              seen.add(short)
              if (link(absolute, path.join(scope, short))) linked += 1
            }
          }
        } catch { /* ignore malformed package.json */ }
      }
      if (entry.name === 'packages' || entry.name === 'vendor') walk(absolute)
      else if (absolute.startsWith(path.join(host, 'packages')) || absolute.startsWith(path.join(host, 'vendor'))) walk(absolute)
    }
  }
  walk(path.join(host, 'packages'))
  walk(path.join(host, 'vendor'))
  return linked
}

function copyPlugin(plugin, farm, asLink) {
  const name = path.basename(path.resolve(plugin))
  const dest = path.join(farm, 'plugins', name)
  ensureDir(path.dirname(dest))
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
  if (asLink) {
    fs.symlinkSync(path.resolve(plugin), dest, process.platform === 'win32' ? 'junction' : 'dir')
  } else {
    fs.cpSync(plugin, dest, { recursive: true, dereference: false })
  }
  return { name, dest }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' } })
  if (result.error) return { ok: false, error: String(result.error) }
  return { ok: result.status === 0, status: result.status }
}

function main() {
  const options = parse(process.argv.slice(2))
  const farm = path.resolve(options.farm)
  const plugin = path.resolve(options.plugin)
  if (!fs.existsSync(path.join(plugin, 'package.json'))) throw new Error(`not a package directory: ${plugin}`)
  if (!fs.existsSync(options.host)) throw new Error(`host checkout not found: ${options.host}`)
  ensureDir(farm)
  const modules = linkNodeModules(options.host, farm)
  const workspace = linkWorkspacePackages(options.host, farm)
  const copied = copyPlugin(plugin, farm, options.link)
  let install = null
  let build = null
  if (options.install) {
    const manifest = JSON.parse(fs.readFileSync(path.join(copied.dest, 'package.json'), 'utf8'))
    if (manifest.dependencies && Object.keys(manifest.dependencies).length > 0) {
      install = run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], copied.dest)
    }
  }
  if (options.build) {
    const manifest = JSON.parse(fs.readFileSync(path.join(copied.dest, 'package.json'), 'utf8'))
    if (manifest.scripts?.build) build = run('npm', ['run', 'build'], copied.dest)
  }
  const summary = { farm, plugin: copied.dest, linkedModules: modules, linkedWorkspace: workspace, install, build }
  if (!options.quiet) console.log(JSON.stringify(summary, null, 2))
  return copied.dest
}

try {
  const plugin = main()
  console.log(plugin)
} catch (error) {
  console.error(`host-farm: ${error.message}`)
  process.exitCode = 3
}

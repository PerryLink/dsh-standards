/**
 * `dsh-standards check [dir]` — the author-facing entry point.
 *
 * It shells out to the existing checker in JSON mode and only changes how the
 * same report is presented: Markdown by default, `--json` for the raw
 * `dsh-conformance/1` document, `--html <file>` for a single self-contained
 * file. Exit codes are the checker's, never rewritten here.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { renderHtml, renderMarkdown } from './author-report.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CHECKER = path.resolve(HERE, '..', 'bin', 'dsh-plugin-verify.mjs')
const MAX_BUFFER = 64 * 1024 * 1024

/** Checker flags that take a value, so `check --scope entry` is not read as a directory. */
const VALUE_FLAGS = new Set([
  '--scope', '--profile', '--runtime', '--runtime-version', '--cordis-version', '--commit',
  '--install-spec', '--market-index', '--plugin-name', '--timeout', '--host', '--base',
  '--web', '--bare', '--entry-runtime', '--entry-claim',
])

export function checkUsage() {
  return `dsh-standards check — author-facing standards report

Usage:
  dsh-standards check [dir] [options]

  dir defaults to the current directory. Output defaults to Markdown.

Options:
  --json                 print the raw dsh-conformance/1 report
  --html <file>          write a single-file HTML report (inline CSS, no assets)
  --help                 show this help

Any other flag is forwarded to the checker, e.g.:
  --scope entry --entry-claim static --no-exec
  --runtime-version 0.2.2-rc.1
  --market-index index.json --plugin-name @scope/name

Exit codes (same as the checker):
  0  completed, no FAIL (PASS or WARN)
  1  completed, at least one FAIL
  2  incomplete: a mandatory check did not run
  3  usage error
`
}

export function parseCheckArgs(argv = []) {
  const options = { dir: null, json: false, html: null, help: false, passthrough: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') { options.help = true; continue }
    if (arg === '--json') { options.json = true; continue }
    if (arg === '--html' || arg.startsWith('--html=')) {
      const inline = arg.startsWith('--html=') ? arg.slice('--html='.length) : undefined
      if (inline !== undefined) {
        if (inline.trim() === '') throw new Error('--html needs a file path')
        options.html = inline
      } else {
        const next = argv[index + 1]
        if (next === undefined || next.startsWith('--')) throw new Error('--html needs a file path')
        options.html = next
        index += 1
      }
      continue
    }
    if (arg === '--format' || arg.startsWith('--format=')) throw new Error('`check` owns the output format; use --json or --html <file>')
    if (arg === '--out' || arg.startsWith('--out=')) throw new Error('`check` writes to stdout or --html <file>; --out is not forwarded')
    if (arg.startsWith('-')) {
      options.passthrough.push(arg)
      if (arg.includes('=')) continue
      if (VALUE_FLAGS.has(arg)) {
        const next = argv[index + 1]
        if (next === undefined) throw new Error(`${arg} needs a value`)
        options.passthrough.push(next)
        index += 1
      }
      continue
    }
    if (options.dir !== null) throw new Error(`unexpected positional argument: ${arg}`)
    options.dir = arg
  }
  if (options.json && options.html) throw new Error('--json and --html are mutually exclusive')
  if (options.dir === null) options.dir = '.'
  options.dir = path.resolve(options.dir)
  return options
}

function invokeChecker(options) {
  const args = [CHECKER, options.dir, '--format', 'json', ...options.passthrough]
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 600_000, maxBuffer: MAX_BUFFER })
  if (run.error) throw new Error(`could not run the checker: ${run.error.message}`)
  let report
  try {
    report = JSON.parse(run.stdout)
  } catch {
    throw new Error(`checker produced no JSON (exit ${run.status}): ${String(run.stderr ?? '').slice(0, 400)}`)
  }
  return { report, status: run.status }
}

export function runCheck(argv = process.argv.slice(2)) {
  let options
  try {
    options = parseCheckArgs(argv)
  } catch (error) {
    process.stderr.write(`dsh-standards check: ${error.message}\n`)
    process.stderr.write(checkUsage())
    return 3
  }
  if (options.help) {
    process.stdout.write(checkUsage())
    return 0
  }
  let result
  try {
    result = invokeChecker(options)
  } catch (error) {
    process.stderr.write(`dsh-standards check: ${error.message}\n`)
    return 3
  }
  const { report, status } = result
  const exitCode = Number.isInteger(report?.conclusion?.exitCode) ? report.conclusion.exitCode : (status ?? 3)
  if (options.html) {
    const out = path.resolve(options.html)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, renderHtml(report))
    process.stdout.write(`wrote ${out}\n`)
  } else if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    process.stdout.write(renderMarkdown(report))
  }
  return exitCode
}

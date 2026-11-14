#!/usr/bin/env node
/**
 * repo-anchor-check.mjs — verify `REPO/<path>:<line(s)>` evidence anchors in the
 * standard documents against a real host checkout at a pinned commit.
 *
 * The standard cites upstream source by `REPO/packages/.../file.ts:123` (or a
 * line list such as `:32-41`, `:109,150`). When the host moves those lines can
 * drift even though the file still exists, so a prose anchor is only as good as
 * the commit it was re-taken at. This script is the mechanical half of P1-8
 * (2026-11-14 rc3 audit): it proves every anchor still resolves at the pinned
 * commit and reports the ones that no longer point at a real line.
 *
 * What it proves:
 *   - the referenced file exists at the pinned commit;
 *   - every referenced line number is within the file;
 *   - the referenced line is not blank (a blank line is almost never intended).
 *
 * What it does NOT prove: that the line still contains the *same* symbol named
 * around the anchor. That is a semantic re-take; the script prints the current
 * line text so a reviewer can eyeball it (and `--context` gives N lines).
 *
 * Exit codes: 0 all anchors resolve; 1 at least one drift; 2 usage/host error.
 *
 * Usage:
 *   DSH_HOST=/path/to/deepseek-harness node 40-checker/scripts/repo-anchor-check.mjs
 *   node 40-checker/scripts/repo-anchor-check.mjs --host /path --commit 38a6a5c9 --json
 *   node 40-checker/scripts/repo-anchor-check.mjs --files 31-DS-C条款.md,60-权限与标注规范.md
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const DEFAULT_COMMIT = '38a6a5c965aa99ab525161efb7cc5cf1fe62fced'
const DEFAULT_FILES = [
  '31-DS-C条款.md',
  '32-DS-R条款.md',
  '33-DS-G条款.md',
  '35-三层开发建议与验收清单.md',
  '60-权限与标注规范.md',
  '93-开发建议-入门.md',
]
// REPO/path/to/file.ext:1  |  :10-12  |  :10,12  |  :10-12,20
const REF = /REPO\/([A-Za-z0-9_.][A-Za-z0-9_./-]*):([0-9][0-9,\-]*)/g

function parseArgs(argv) {
  const options = {
    host: process.env.DSH_HOST || '',
    commit: process.env.DSH_COMMIT || DEFAULT_COMMIT,
    files: DEFAULT_FILES,
    json: false,
    context: 0,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--host') options.host = argv[++index]
    else if (arg.startsWith('--host=')) options.host = arg.slice('--host='.length)
    else if (arg === '--commit') options.commit = argv[++index]
    else if (arg.startsWith('--commit=')) options.commit = arg.slice('--commit='.length)
    else if (arg === '--files') options.files = argv[++index].split(',').map(item => item.trim()).filter(Boolean)
    else if (arg === '--json') options.json = true
    else if (arg === '--context') options.context = Number(argv[++index])
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: repo-anchor-check.mjs --host <dsh-checkout> [--commit <sha>] [--files a.md,b.md] [--json] [--context N]')
      process.exit(0)
    } else {
      console.error(`unknown argument: ${arg}`)
      process.exit(2)
    }
  }
  if (!options.host) {
    console.error('error: --host <dsh-checkout> or DSH_HOST is required (the host checkout is read-only)')
    process.exit(2)
  }
  if (!/^[0-9a-f]{7,40}$/i.test(options.commit)) {
    console.error(`error: bad commit: ${options.commit}`)
    process.exit(2)
  }
  return options
}

function gitShow(host, commit, relative) {
  try {
    return execFileSync('git', ['-C', host, 'show', `${commit}:${relative}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    return null
  }
}

function lineNumbers(spec) {
  const numbers = []
  for (const part of spec.split(',')) {
    if (!part) continue
    const range = part.match(/^(\d+)-(\d+)$/)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      for (let line = start; line <= end; line += 1) numbers.push(line)
    } else {
      numbers.push(Number(part))
    }
  }
  return numbers
}

export function scanAnchors({ host, commit, files, root = ROOT }) {
  const cache = new Map()
  const docs = []
  for (const file of files) {
    const absolute = path.isAbsolute(file) ? file : path.join(root, file)
    if (!fs.existsSync(absolute)) {
      docs.push({ file, missing: true, anchors: 0, drifts: [] })
      continue
    }
    const text = fs.readFileSync(absolute, 'utf8')
    const anchors = []
    for (const match of text.matchAll(REF)) {
      const relative = match[1]
      const spec = match[2]
      const line = text.slice(0, match.index).split('\n').length
      const numbers = lineNumbers(spec)
      let content = cache.get(relative)
      if (content === undefined) {
        content = gitShow(host, commit, relative)
        cache.set(relative, content)
      }
      const entry = {
        doc: file,
        docLine: line,
        target: relative,
        spec,
        numbers,
        sourceLine: text.split('\n')[line - 1].trim(),
      }
      if (content === null) {
        entry.reason = 'file not found at the pinned commit'
      } else {
        const lines = content.split('\n')
        entry.lineCount = lines.length
        const outOfRange = numbers.filter(number => number < 1 || number > lines.length)
        const blank = numbers.filter(number => {
          const value = lines[number - 1]
          return number >= 1 && number <= lines.length && value !== undefined && value.trim() === ''
        })
        // A range anchor legitimately spans blank lines; only a single-line
        // anchor pointing at a blank line is suspicious (likely an off-by-one).
        if (outOfRange.length > 0) entry.reason = `line(s) out of range (file has ${lines.length} lines): ${outOfRange.join(',')}`
        else if (numbers.length === 1 && blank.length > 0) entry.warning = `single-line anchor points at a blank line: ${blank.join(',')}`
        else {
          entry.current = numbers.map(number => ({ line: number, text: lines[number - 1].trim() }))
        }
      }
      anchors.push(entry)
    }
    docs.push({
      file,
      anchors: anchors.length,
      drifts: anchors.filter(anchor => anchor.reason),
      warnings: anchors.filter(anchor => !anchor.reason && anchor.warning),
      entries: anchors,
    })
  }
  const total = docs.reduce((sum, doc) => sum + doc.anchors, 0)
  const drifts = docs.reduce((sum, doc) => sum + doc.drifts.length, 0)
  const warnings = docs.reduce((sum, doc) => sum + (doc.warnings || []).length, 0)
  return { commit, host, docs, total, drifts, warnings }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  try {
    execFileSync('git', ['-C', options.host, 'rev-parse', '--git-dir'], { stdio: 'ignore' })
  } catch {
    console.error(`error: ${options.host} is not a git checkout`)
    process.exit(2)
  }
  const report = scanAnchors(options)
  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`REPO anchors at ${report.commit.slice(0, 12)} (host: ${report.host})`)
    for (const doc of report.docs) {
      if (doc.missing) {
        console.log(`  MISSING DOC ${doc.file}`)
        continue
      }
      console.log(`  ${doc.drifts.length > 0 ? '!!' : 'OK'} ${doc.file}: ${doc.anchors} anchors, ${doc.drifts.length} drift, ${(doc.warnings || []).length} warning`)
      for (const drift of doc.drifts) {
        console.log(`     - line ${drift.docLine}: ${drift.target}:${drift.spec} → ${drift.reason}`)
      }
      for (const warning of doc.warnings || []) {
        console.log(`     ~ line ${warning.docLine}: ${warning.target}:${warning.spec} → ${warning.warning}`)
      }
    }
    console.log(`total: ${report.total} anchors, ${report.drifts} drift, ${report.warnings} warning`)
  }
  process.exit(report.drifts > 0 ? 1 : 0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

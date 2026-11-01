#!/usr/bin/env node
/**
 * claim-check.mjs — conservative scan for mark misuse in public artifacts.
 *
 * It only scans market-facing directories by default (publish/, adoption/) plus
 * README.md. Documentation that *quotes* forbidden words (governance, research
 * notes) is intentionally out of scope.
 *
 * A line fails when it contains a forbidden claim word and no negation, e.g.
 * "DSH-ENTRY official certification" fails, while "not official" passes.
 *
 * Usage:
 *   node 40-checker/scripts/claim-check.mjs [--root <dir>] [--json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = path.resolve(HERE, '..', '..')
const MARKS = /\bDSH-(?:ENTRY|FLOW|BOOST)\b/i
const FORBIDDEN = [
  /\bofficial\b/i,
  /\bnational standard\b/i,
  /\bCNAS\b/i,
  /\baccredited\b/i,
  /\bcertified\b/i,
  /\bsecurity audit\b/i,
  /\brecommended\b/i,
  /\branking\b/i,
  /\bguaranteed\b/i,
  /\bapproved by deepseek\b/i,
  /国家标准/,
  /官方认证/,
  /国家认可/,
  /安全审计/,
  /推荐标准/,
  /排名/,
]
const NEGATION = /\bnot\b|\bno\b|\bnever\b|\bnon-|\bforbidden\b|\bprohibit|\bdoes not\b|\bcannot\b|非官方|非认证|不是|不得|禁止|不应|不能|不卖|不做|不把|不称|不提供|不收费|不推荐/i
const SKIP_JSON_KEYS = new Set(['forbiddenWords', 'notClaimed', 'excluded', 'forbidden', 'limitations', 'mustNot', 'cannot'])
// "official team" is an audience, not a claim about the mark. Strip it before scanning.
const ALLOWED_CONTEXT = /\bofficial (?:team|adoption|kit|directory|channel)\b|\bofficial\//gi
const STRONG_CLAIM = /official (?:certification|standard|endorsement)|officially certified|官方认证|国家标准|国家认可/i

function walk(dir, out) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(md|json|txt)$/.test(entry.name)) out.push(full)
  }
}

export function scanText(text, file) {
  const errors = []
  const warnings = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const hasMark = MARKS.test(line)
    // Without a mark, only a strong claim ("official certification") fails;
    // a bare "official team" or a path like adoption/official/ is not a claim.
    if (!hasMark && !STRONG_CLAIM.test(line)) continue
    const probe = line.replace(ALLOWED_CONTEXT, ' ')
    if (!hasMark && !FORBIDDEN.some((re) => re.test(probe))) continue
    const context = lines.slice(Math.max(0, i - 2), i + 2).join(' ')
    if (NEGATION.test(probe) || NEGATION.test(context)) continue
    for (const re of FORBIDDEN) {
      if (re.test(probe)) {
        errors.push(`${file}:${i + 1}: forbidden claim "${line.trim().slice(0, 120)}"`)
        break
      }
    }
  }
  if (MARKS.test(text) && !/非官方|not official|非认证|not a certification/i.test(text)) {
    warnings.push(`${file}: mark used without a same-page disclaimer`)
  }
  return { errors, warnings }
}

function collectClaimStrings(value, key, out) {
  if (typeof value === 'string') {
    if (!SKIP_JSON_KEYS.has(key)) out.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectClaimStrings(item, key, out)
    return
  }
  if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) collectClaimStrings(child, childKey, out)
  }
}

export function main(argv = process.argv.slice(2)) {
  let root = DEFAULT_ROOT
  let json = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--root') root = path.resolve(argv[++i])
    else if (arg === '--json') json = true
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: claim-check.mjs [--root <dir>] [--json]')
      return 0
    } else {
      console.error(`unknown argument: ${arg}`)
      return 2
    }
  }
  const files = [path.join(root, 'README.md')]
  walk(path.join(root, 'publish'), files)
  walk(path.join(root, 'adoption'), files)
  const results = []
  for (const file of files) {
    if (!fs.existsSync(file)) continue
    if (/mark-policy\.(md|json)$/.test(file)) continue
    let text = fs.readFileSync(file, 'utf8')
    if (file.endsWith('.json')) {
      try {
        const strings = []
        collectClaimStrings(JSON.parse(text), '', strings)
        text = strings.join('\n')
      } catch (error) {
        results.push({ errors: [`${path.relative(root, file)}: parse error: ${error.message}`], warnings: [] })
        continue
      }
    }
    const result = scanText(text, path.relative(root, file))
    if (result.errors.length || result.warnings.length) results.push(result)
  }
  const errors = results.flatMap((r) => r.errors)
  const warnings = results.flatMap((r) => r.warnings)
  if (json) console.log(JSON.stringify({ ok: errors.length === 0, errors, warnings }, null, 2))
  else {
    for (const warning of warnings) console.log(`WARN ${warning}`)
    for (const error of errors) console.log(`FAIL ${error}`)
    console.log(`${errors.length === 0 ? 'PASS' : 'FAIL'} claims: ${errors.length} error(s), ${warnings.length} warning(s)`)
  }
  return errors.length === 0 ? 0 : 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}

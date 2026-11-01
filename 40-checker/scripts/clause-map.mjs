#!/usr/bin/env node
/**
 * clause-map.mjs — validate the stable clause IDs against spec/levels.json.
 *
 * It checks:
 *   - every gate in levels.json is covered by at least one clause;
 *   - every clause points to an existing source file;
 *   - clause IDs are unique;
 *   - no clause maps to a gate that does not exist;
 *   - every clause has a level that exists.
 *
 * It does not parse the prose; a human still owns the semantics.
 *
 * Usage: node 40-checker/scripts/clause-map.mjs [--check] [--json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const LEVELS = path.join(ROOT, 'spec', 'levels.json')
const CLAUSES = path.join(ROOT, 'spec', 'clauses.json')

export function validateClauseMap({ levels, clauses, root = ROOT }) {
  const errors = []
  const warnings = []
  const ids = new Set()
  const knownGates = new Map()
  for (const level of levels.levels || []) {
    knownGates.set(level.id, new Set((level.gates || []).map((gate) => gate.id)))
  }
  const covered = new Map([...knownGates.keys()].map((id) => [id, new Set()]))
  for (const clause of clauses.clauses || []) {
    if (!clause.id) { errors.push('clause without id'); continue }
    if (ids.has(clause.id)) errors.push(`duplicate clause id: ${clause.id}`)
    ids.add(clause.id)
    if (!knownGates.has(clause.level)) {
      errors.push(`${clause.id}: unknown level ${clause.level}`)
      continue
    }
    if (!Array.isArray(clause.gates) || clause.gates.length === 0) {
      errors.push(`${clause.id}: no gates`)
      continue
    }
    for (const gate of clause.gates) {
      if (!knownGates.get(clause.level).has(gate)) {
        errors.push(`${clause.id}: gate ${gate} does not exist in level ${clause.level}`)
      } else {
        covered.get(clause.level).add(gate)
      }
    }
    const source = String(clause.source || '').split('#')[0]
    if (!source || !fs.existsSync(path.join(root, source))) {
      errors.push(`${clause.id}: source file not found: ${source}`)
    }
  }
  for (const [level, gates] of knownGates) {
    for (const gate of gates) {
      if (!covered.get(level).has(gate)) errors.push(`${level}.${gate}: no clause maps to this gate`)
    }
  }
  if (!clauses.normativeCount) warnings.push('clauses.json has no normativeCount; not required')
  return { errors, warnings, covered: Object.fromEntries([...covered].map(([k, v]) => [k, [...v].sort()])) }
}

export function main(argv = process.argv.slice(2)) {
  let json = false
  for (const arg of argv) {
    if (arg === '--json') json = true
    else if (arg === '--check') { /* default behaviour */ }
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: clause-map.mjs [--check] [--json]')
      return 0
    } else {
      console.error(`unknown argument: ${arg}`)
      return 2
    }
  }
  const levels = JSON.parse(fs.readFileSync(LEVELS, 'utf8'))
  const clauses = JSON.parse(fs.readFileSync(CLAUSES, 'utf8'))
  const result = validateClauseMap({ levels, clauses })
  if (json) console.log(JSON.stringify(result, null, 2))
  else {
    for (const warning of result.warnings) console.log(`WARN ${warning}`)
    for (const error of result.errors) console.log(`FAIL ${error}`)
    console.log(`${result.errors.length === 0 ? 'PASS' : 'FAIL'} clause map: ${Object.keys(result.covered).map((k) => `${k}=${result.covered[k].length}`).join(' ')}`)
  }
  return result.errors.length === 0 ? 0 : 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}

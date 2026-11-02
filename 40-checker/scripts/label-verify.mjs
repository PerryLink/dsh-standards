#!/usr/bin/env node
/** label-verify — look up one immutable label by recordHash or id; no grade, no ranking. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { effectiveStatus, labelId, validateLabel } from '../src/label.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STD = path.resolve(HERE, '..', '..')

function usage() {
  console.log(`label-verify — look up one label without grades or rankings

Usage:
  node 40-checker/scripts/label-verify.mjs --index <index.json> (--hash sha256:... | --id <id>) [--json]

Exit: 0 found and valid, 2 not found/invalid, 3 input error.`)
}

function parseArgs(argv) {
  const options = { index: path.join(STD, 'publish', 'labels', 'index.json'), hash: null, id: null, json: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      i += 1
      return value
    }
    if (arg === '--index') options.index = path.resolve(next())
    else if (arg === '--hash') options.hash = next()
    else if (arg === '--id') options.id = next()
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (!options.hash && !options.id) throw new Error('--hash or --id is required')
  return options
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const index = JSON.parse(fs.readFileSync(options.index, 'utf8'))
  const records = Array.isArray(index.records) ? index.records : []
  const record = options.hash
    ? records.find(row => row.recordHash === options.hash)
    : records.find(row => labelId(row) === options.id)
  if (!record) {
    console.error(`label-verify: not found (${options.hash ?? options.id})`)
    process.exit(2)
  }
  const validation = validateLabel(record)
  if (!validation.valid) {
    console.error(`label-verify: invalid record: ${validation.errors.join('; ')}`)
    process.exit(2)
  }
  const summary = {
    schema: 'dsh-label-verify/1',
    ok: true,
    id: labelId(record),
    recordHash: record.recordHash,
    subject: record.subject,
    level: record.level,
    status: record.status,
    effectiveStatus: effectiveStatus(record),
    claimLevel: record.claimLevel,
    scope: record.scope,
    validity: record.validity,
    evidence: record.evidence,
    disclaimer: record.disclaimer,
    issuer: record.issuer,
    verifyUrl: record.verifyUrl,
    notClaimed: ['official standard', 'certification', 'security audit', 'ranking', 'market acceptance'],
  }
  if (options.json) console.log(JSON.stringify(summary, null, 2))
  else {
    console.log(`${summary.id}  ${summary.level}/${summary.effectiveStatus}`)
    console.log(`subject: ${summary.subject.repo}@${summary.subject.version} (${summary.subject.commit.slice(0, 12)})`)
    console.log(`claimLevel: ${summary.claimLevel}; issuer: ${summary.issuer}`)
    console.log(`validity: ${summary.validity.generatedAt} -> ${summary.validity.expiresAt}`)
    console.log(`evidence: ${summary.evidence[0]?.url ?? 'none'}`)
    console.log(`disclaimer: ${summary.disclaimer}`)
  }
  process.exit(0)
}

try { main() } catch (error) {
  console.error(`label-verify: ${error.message}`)
  process.exit(3)
}

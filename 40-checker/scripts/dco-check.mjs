#!/usr/bin/env node
/**
 * dco-check.mjs — enforce DCO 1.1 sign-off and the DSH contribution terms.
 *
 * Rules:
 *   1. every commit has at least one `Signed-off-by: Name <email>`;
 *   2. the author email matches one of the sign-off emails;
 *   3. `AI-Assisted: yes` requires `AI-Tool:` and a human sign-off;
 *   4. with --require-terms, at least one commit carries `DSH-Contribution: dsh-ct/1`
 *      or the PR body contains the terms checkbox.
 *
 * This checks attestations, not identity. It cannot verify legal capacity,
 * employment, or patent status.
 *
 * Usage:
 *   node 40-checker/scripts/dco-check.mjs --range origin/main..HEAD --require-terms --pr-body-env PR_BODY
 *   node 40-checker/scripts/dco-check.mjs --range HEAD~1..HEAD --json
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = path.resolve(HERE, '..', '..')
const TERMS = 'dsh-ct/1'

export function parseLog(text) {
  return text
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, authorName, authorEmail, ...rest] = record.split('\x1f')
      return { sha: (sha || '').trim(), authorName: authorName || '', authorEmail: authorEmail || '', body: rest.join('\x1f') }
    })
}

export function checkCommit(commit) {
  const errors = []
  const warnings = []
  const body = commit.body || ''
  const signoffs = [...body.matchAll(/^Signed-off-by:\s*(.+?)\s*<([^>]+)>\s*$/gim)]
    .map((m) => ({ name: m[1].trim(), email: m[2].trim().toLowerCase() }))
  if (signoffs.length === 0) {
    errors.push(`${commit.sha.slice(0, 8)}: missing Signed-off-by`)
  } else {
    const emails = new Set(signoffs.map((s) => s.email))
    if (commit.authorEmail && !emails.has(commit.authorEmail.toLowerCase())) {
      errors.push(`${commit.sha.slice(0, 8)}: author email ${commit.authorEmail} is not among the sign-offs`)
    }
  }
  const aiAssisted = /^AI-Assisted:\s*yes\s*$/im.test(body) || /^AI-Generated:\s*yes\s*$/im.test(body)
  if (aiAssisted) {
    if (!/^AI-Tool:\s*\S+/im.test(body)) errors.push(`${commit.sha.slice(0, 8)}: AI-Assisted without AI-Tool`)
    const human = signoffs.some((s) => !/\bbot\b|\[bot\]/i.test(s.name))
    if (!human) errors.push(`${commit.sha.slice(0, 8)}: AI-Assisted needs a human sign-off`)
  }
  const terms = /^(?:DSH-Contribution|Contribution-Agreement):\s*dsh-ct\/1\s*$/im.test(body)
  const entity = /^Entity-CLA:\s*(\S+)\s*$/im.exec(body)
  const onBehalf = /^On-Behalf-Of:\s*(.+?)\s*$/im.exec(body)
  const agent = /^AI-Agent:\s*(\S+)\s*$/im.exec(body)
  if (onBehalf && !entity) warnings.push(`${commit.sha.slice(0, 8)}: On-Behalf-Of present; verify the Entity CLA manually`)
  return {
    sha: commit.sha,
    errors,
    warnings,
    terms,
    entityCla: entity ? entity[1] : null,
    onBehalfOf: onBehalf ? onBehalf[1] : null,
    aiAgent: agent ? agent[1] : null,
  }
}

export function checkTerms({ commits, prBody, requireTerms }) {
  if (!requireTerms) return { errors: [], warnings: [] }
  const fromCommit = commits.some((c) => /^(?:DSH-Contribution|Contribution-Agreement):\s*dsh-ct\/1\s*$/im.test(c.body || ''))
  const fromPr = /\[[xX]\]\s*I agree to the DSH Contribution Terms v1/i.test(prBody || '')
    || /dsh-ct\/1/i.test(prBody || '')
  if (!fromCommit && !fromPr) {
    return { errors: ['no DSH Contribution Terms acceptance: add the PR checkbox or DSH-Contribution: dsh-ct/1'], warnings: [] }
  }
  return { errors: [], warnings: [] }
}

export function run({ root = DEFAULT_ROOT, range = 'HEAD~1..HEAD', prBody = '', requireTerms = false } = {}) {
  const result = spawnSync('git', ['-C', root, 'log', '--format=%H%x1f%an%x1f%ae%x1f%B%x1e', range], { encoding: 'utf8' })
  if (result.status !== 0) {
    return { ok: false, errors: [`git log failed: ${(result.stderr || '').trim()}`], warnings: [], commits: [] }
  }
  const commits = parseLog(result.stdout)
  if (commits.length === 0) {
    return { ok: false, errors: [`no commits in range ${range}`], warnings: [], commits: [] }
  }
  const errors = []
  const warnings = []
  const checked = commits.map((commit) => {
    const r = checkCommit(commit)
    errors.push(...r.errors)
    warnings.push(...r.warnings)
    return { sha: commit.sha, terms: r.terms, entityCla: r.entityCla, aiAgent: r.aiAgent }
  })
  const terms = checkTerms({ commits, prBody, requireTerms })
  errors.push(...terms.errors)
  warnings.push(...terms.warnings)
  if (checked.some((c) => c.entityCla)) warnings.push('Entity-CLA trailer present; verify the archived document manually')
  return { ok: errors.length === 0, errors, warnings, commits: checked }
}

export function main(argv = process.argv.slice(2)) {
  let root = DEFAULT_ROOT
  let range = 'HEAD~1..HEAD'
  let prBody = ''
  let prBodyEnv = null
  let requireTerms = false
  let json = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--root') root = path.resolve(argv[++i])
    else if (arg === '--range') range = argv[++i]
    else if (arg === '--pr-body') prBody = fs.readFileSync(argv[++i], 'utf8')
    else if (arg === '--pr-body-env') prBodyEnv = argv[++i]
    else if (arg === '--require-terms') requireTerms = true
    else if (arg === '--json') json = true
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: dco-check.mjs [--root <dir>] [--range <git-range>] [--pr-body <file>] [--pr-body-env <ENV>] [--require-terms] [--json]')
      return 0
    } else {
      console.error(`unknown argument: ${arg}`)
      return 2
    }
  }
  if (prBodyEnv) prBody = process.env[prBodyEnv] || ''
  const result = run({ root, range, prBody, requireTerms })
  if (json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    for (const warning of result.warnings) console.log(`WARN ${warning}`)
    for (const error of result.errors) console.log(`FAIL ${error}`)
    console.log(`${result.ok ? 'PASS' : 'FAIL'} dco: ${result.commits.length} commit(s), ${result.errors.length} error(s), ${result.warnings.length} warning(s)`)
  }
  return result.ok ? 0 : 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}

#!/usr/bin/env node
/**
 * governance-check.mjs — validate the machine-readable governance files.
 *
 * It checks the rules that must not rot:
 *   - exactly one human organizer;
 *   - every AI role is a bot and never holds a forbidden permission;
 *   - Class A decisions are human-only; Class B can be drafted by AI but not decided;
 *   - AI merge allowlist/denylist still protect spec/governance/checker;
 *   - contributors and reviewers reference an existing role and a known terms version.
 *
 * Exit codes: 0 all checks pass; 2 at least one error.
 *
 * Usage:
 *   node 40-checker/scripts/governance-check.mjs [--root <dir>] [--format text|json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = path.resolve(HERE, '..', '..')
const TERMS_VERSION = 'dsh-ct/1'
const VALUES = new Set(['allow', 'allow-with-allowlist', 'propose', 'review', 'deny'])
const LEVELS = new Set(['signed', 'verified', 'trusted', 'entity-covered'])
const REVIEW_STATUS = new Set(['provisional', 'active', 'dormant', 'revoked'])

function readJson(root, rel) {
  const file = path.join(root, rel)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function validateGovernance({ roles, contributors, reviewers, coi }) {
  const errors = []
  const warnings = []
  const err = (m) => errors.push(m)
  const warn = (m) => warnings.push(m)

  if (!roles || roles.schema !== 'dsh-governance/1') err('roles.schema must be dsh-governance/1')
  if (!contributors || contributors.schema !== 'dsh-contributors/1') err('contributors.schema must be dsh-contributors/1')
  if (!reviewers || reviewers.schema !== 'dsh-reviewers/1') err('reviewers.schema must be dsh-reviewers/1')
  if (!coi || coi.schema !== 'dsh-coi/1') err('coi.schema must be dsh-coi/1')
  if (!roles || !roles.roles || !roles.matrix) {
    return { errors: errors.concat('roles.json must contain roles and matrix'), warnings }
  }

  // 1. Roles and matrix.
  const roleIds = Object.keys(roles.roles)
  const humanRoles = roleIds.filter((id) => roles.roles[id].humanOnly === true)
  const organizers = roleIds.filter((id) => id === 'organizer' || roles.roles[id].appointment === 'creator')
  if (organizers.length !== 1) err(`exactly one organizer is required, found ${organizers.length}`)
  if (!humanRoles.includes('organizer')) err('organizer must be humanOnly')
  if (roles.roles.organizer && roles.roles.organizer.maxHolders !== 1) err('organizer.maxHolders must be 1')
  if (!humanRoles.includes('maintainer')) err('maintainer must be humanOnly')
  if (!humanRoles.includes('reviewer')) err('reviewer must be humanOnly')

  const permissions = roles.permissions
  if (!Array.isArray(permissions) || permissions.length < 10) err('roles.permissions must list the permission keys')
  for (const id of roleIds) {
    const role = roles.roles[id]
    if (typeof role.label !== 'string' || !role.label) err(`${id}.label is required`)
    if (role.bot === true && role.humanOnly === true) err(`${id} cannot be both bot and humanOnly`)
    if (typeof role.bot !== 'boolean') err(`${id}.bot must be boolean`)
    if (typeof role.humanOnly !== 'boolean') err(`${id}.humanOnly must be boolean`)
    const row = roles.matrix[id]
    if (!row) { err(`matrix.${id} is missing`); continue }
    for (const permission of permissions) {
      if (!(permission in row)) err(`matrix.${id}.${permission} is missing`)
      else if (!VALUES.has(row[permission])) err(`matrix.${id}.${permission} has invalid value ${row[permission]}`)
    }
    for (const key of Object.keys(row)) {
      if (!permissions.includes(key)) err(`matrix.${id}.${key} is not a declared permission`)
    }
  }

  // 2. AI boundaries.
  const ai = roles.ai || {}
  const forbidden = new Set(ai.forbiddenPermissions || [])
  for (const id of roleIds.filter((rid) => roles.roles[rid].bot === true)) {
    for (const permission of forbidden) {
      const value = roles.matrix[id]?.[permission]
      if (value && value !== 'deny' && value !== 'propose') {
        err(`AI role ${id} must not hold ${permission} (got ${value})`)
      }
    }
    if (roles.matrix[id]?.['appeal.decide'] !== 'deny') err(`AI role ${id} must not decide appeals`)
    if (roles.matrix[id]?.['repo.merge.main'] === 'allow') err(`AI role ${id} needs allow-with-allowlist, not allow`)
  }
  if (!Array.isArray(ai.mergeAllowlist) || ai.mergeAllowlist.length === 0) err('ai.mergeAllowlist must not be empty')
  if (!Array.isArray(ai.mergeDenylist)) err('ai.mergeDenylist must be an array')
  for (const required of ['spec/', 'governance/', '40-checker/']) {
    if (!(ai.mergeDenylist || []).includes(required)) err(`ai.mergeDenylist must include ${required}`)
  }
  if (!Array.isArray(ai.mustNot) || ai.mustNot.length < 3) warn('ai.mustNot should list the hard prohibitions')

  // 3. Decision classes.
  for (const [cls, rule] of Object.entries(roles.decisions || {})) {
    const approvers = rule.approver || []
    if (approvers.length === 0) err(`decision ${cls} has no approver`)
    for (const approver of approvers) {
      if (!roles.roles[approver]) err(`decision ${cls} references unknown role ${approver}`)
    }
    if (cls === 'A') {
      if (rule.aiAllowed !== false) err('decision A must set aiAllowed=false')
      for (const approver of approvers) {
        if (roles.roles[approver]?.humanOnly !== true) err(`decision A approver ${approver} must be human`)
      }
    }
    if (cls === 'B') {
      if (rule.aiAllowed !== true) err('decision B should allow AI drafting')
      if (rule.aiRole !== 'draft-only') err('decision B aiRole must be draft-only')
    }
    if (cls === 'D') {
      for (const approver of approvers) {
        if (roles.roles[approver]?.bot !== true) err(`decision D approver ${approver} must be an AI role`)
      }
    }
  }

  // 4. Quorum must never give AI a vote.
  for (const [stage, rule] of Object.entries(roles.quorum || {})) {
    if (typeof rule.claim !== 'string' || !/official|provisional|reviewed|consensus/i.test(rule.claim)) {
      warn(`quorum.${stage}.claim should state the claim limit`)
    }
  }

  // 5. Contributors.
  const contributorHandles = new Set()
  for (const entry of contributors.contributors || []) {
    if (!entry.handle) { err('contributor entry without handle'); continue }
    if (contributorHandles.has(entry.handle)) err(`duplicate contributor ${entry.handle}`)
    contributorHandles.add(entry.handle)
    if (!LEVELS.has(entry.level)) err(`contributor ${entry.handle} has invalid level ${entry.level}`)
    if (entry.signedOff !== true) err(`contributor ${entry.handle} has no DCO sign-off`)
    if (entry.terms !== contributors.terms) err(`contributor ${entry.handle} terms mismatch`)
    if (entry.terms !== TERMS_VERSION) err(`contributor ${entry.handle} must use ${TERMS_VERSION}`)
    if (entry.entityCla !== null && !/^[0-9a-f]{64}$/.test(entry.entityCla || '')) {
      err(`contributor ${entry.handle} entityCla must be null or a sha256`)
    }
    if (!Array.isArray(entry.coi)) err(`contributor ${entry.handle} must declare coi[]`)
  }

  // 6. Reviewers.
  for (const entry of reviewers.reviewers || []) {
    if (!entry.handle) { err('reviewer entry without handle'); continue }
    if (!REVIEW_STATUS.has(entry.status)) err(`reviewer ${entry.handle} has invalid status ${entry.status}`)
    if (!Array.isArray(entry.scopes) || entry.scopes.length === 0) err(`reviewer ${entry.handle} needs scopes[]`)
    if (!entry.expiresAt || Number.isNaN(Date.parse(entry.expiresAt))) err(`reviewer ${entry.handle} needs expiresAt`)
    if (!Array.isArray(entry.coi)) err(`reviewer ${entry.handle} needs coi[]`)
    if (roles.roles[entry.role]?.humanOnly !== true) err(`reviewer ${entry.handle} must reference a human role`)
  }

  // 7. COI declarations.
  for (const entry of coi.declarations || []) {
    if (!entry.handle) { err('coi entry without handle'); continue }
    for (const field of roles.coi?.requiredFields || []) {
      if (!(field in entry)) err(`coi ${entry.handle} is missing ${field}`)
    }
    if (entry.reviewDue && Number.isNaN(Date.parse(entry.reviewDue))) err(`coi ${entry.handle} reviewDue is invalid`)
    if (entry.reviewDue && Date.parse(entry.reviewDue) < Date.now()) warn(`coi ${entry.handle} review is overdue`)
  }

  // 8. Basic consistency between registries.
  for (const entry of reviewers.reviewers || []) {
    if (entry.handle && !contributorHandles.has(entry.handle)) warn(`reviewer ${entry.handle} is not in contributors.json`)
  }

  return { errors, warnings }
}

export function main(argv = process.argv.slice(2)) {
  let root = DEFAULT_ROOT
  let format = 'text'
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') root = path.resolve(argv[++i])
    else if (argv[i] === '--format') format = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('usage: governance-check.mjs [--root <dir>] [--format text|json]')
      return 0
    } else {
      console.error(`unknown argument: ${argv[i]}`)
      return 2
    }
  }
  let data
  try {
    data = {
      roles: readJson(root, 'governance/roles.json'),
      contributors: readJson(root, 'governance/contributors.json'),
      reviewers: readJson(root, 'governance/reviewers.json'),
      coi: readJson(root, 'governance/coi.json'),
    }
  } catch (error) {
    console.error(`governance-check: cannot read input: ${error.message}`)
    return 2
  }
  const result = validateGovernance(data)
  if (format === 'json') {
    console.log(JSON.stringify({ ok: result.errors.length === 0, ...result }, null, 2))
  } else {
    for (const warning of result.warnings) console.log(`WARN ${warning}`)
    for (const error of result.errors) console.log(`FAIL ${error}`)
    console.log(`${result.errors.length === 0 ? 'PASS' : 'FAIL'} governance: ${result.errors.length} error(s), ${result.warnings.length} warning(s)`)
  }
  return result.errors.length === 0 ? 0 : 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const SCHEMA = 'dsh-market-sidecar/1'
export const NOT_CLAIMED = ['official', 'certification', 'security-audit', 'endorsement', 'ordering', 'comparison', 'warranty']
export const FORBIDDEN = ['advice', 'issuer', 'recordHash', 'verifyUrl', 'score', 'rank']
export const CHECKER_SHA = 'a'.repeat(40)
export const EVIDENCE_SHA = 'b'.repeat(64)
export const TARBALL_SHA = 'c'.repeat(64)
export const CHECKER = 'dsh-standards@1.3.0 (dsh-plugin-verify@0.1.0)'
export const COMMAND = 'dsh-levels <package-dir> --no-runtime --format json'

export function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
  return file
}

export function assertNoForbidden(value, trail = 'sidecar', banned = FORBIDDEN) {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (banned.includes(key)) throw new Error(`${trail}.${key} must not appear in the sidecar`)
    assertNoForbidden(child, `${trail}.${key}`, banned)
  }
}

export function assertNoKey(value, forbidden, trail = 'sidecar') {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (key === forbidden) throw new Error(`${trail}.${key} must not appear in the sidecar`)
    assertNoKey(child, forbidden, `${trail}.${key}`)
  }
}

export function sidecarDocument(entries, generatedAt = '2026-01-01T00:00:00.000Z') {
  return {
    schema: SCHEMA,
    generatedAt,
    index: { url: 'https://example.test/index.json', format: 1 },
    checker: { name: 'dsh-standards', version: '1.3.0', sha: CHECKER_SHA },
    notClaimed: NOT_CLAIMED,
    entries,
  }
}

export function levelsFixture() {
  return {
    entry: { state: 'recognized', claim: 'static' },
    flow: { state: 'not-run' },
    boost: { state: 'not-measured' },
  }
}

// The original 1.x entry: no title/repo/license/scope/checks/checkedBy/notChecked.
// It must still survive a lifecycle refresh byte for byte.
export function legacyEntry(name, version, expiresAt, lifecycle = 'active') {
  return {
    subject: { name, version, tarballSha256: TARBALL_SHA },
    levels: levelsFixture(),
    evidence: {},
    validity: { checkedAt: '2026-01-01', expiresAt, policy: '90d' },
    lifecycle,
    selfAssessed: true,
  }
}

export function richEntry(name, version, expiresAt, lifecycle = 'active', overrides = {}) {
  return {
    subject: { name, version, tarballSha256: TARBALL_SHA },
    title: `${name} title`,
    repo: 'https://example.test/acme/plugin',
    license: 'MIT',
    scope: { dsh: '>=0.2.0', cordis: '^4.0.0', platform: 'web' },
    levels: levelsFixture(),
    checks: [
      { id: 'DSC-01', result: 'PASS', coverage: 'full' },
      { id: 'DSC-02', result: 'WARN', coverage: 'full' },
      { id: 'DSC-03', result: 'NA', coverage: 'not-run' },
    ],
    security: {
      state: 'partial',
      checks: [
        { id: 'DSC-15', result: 'PASS', coverage: 'full' },
        { id: 'DSC-16', result: 'NA', coverage: 'not-run' },
      ],
      summary: { total: 2, checked: 1, blocking: 0, warn: 0, na: 1, notRun: 1 },
      command: 'dsh-standards check <package-dir> --scope security --json',
    },
    evidence: {},
    checkedBy: { checker: CHECKER, command: COMMAND },
    notChecked: ['ENTRY:runtime (claim=static; not exercised)'],
    validity: { checkedAt: '2026-01-01', expiresAt, policy: '90d' },
    lifecycle,
    selfAssessed: true,
    ...overrides,
  }
}

export function readPublishSidecar(repo) {
  return JSON.parse(fs.readFileSync(path.join(repo, 'publish', 'sidecar.json'), 'utf8'))
}

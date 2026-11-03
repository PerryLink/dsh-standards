/**
 * Minimal SemVer range matcher for the checker.
 *
 * It is intentionally small: the host evaluates plugin requirements with
 * `semver.satisfies(runtime, range, { includePrerelease: true })`
 * (deepseek-harness/packages/boot/app-boot/src/plugin-compatibility.ts:52).
 * This module implements the subset that appears in package manifests:
 * exact versions, `>= > <= <`, `^`, `~`, `*`/`x`, space-separated AND,
 * and `||` alternatives. It does NOT implement hyphen ranges, `!=`,
 * or npm's "prerelease only matches same tuple" exclusion; the host uses
 * includePrerelease, so we include prereleases everywhere.
 */

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

export function parseVersion(value) {
  if (typeof value !== 'string') return null
  const match = VERSION_RE.exec(value.trim())
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

function compareIdentifier(left, right) {
  const leftNumeric = /^\d+$/.test(left)
  const rightNumeric = /^\d+$/.test(right)
  if (leftNumeric && rightNumeric) return Number(left) - Number(right)
  if (leftNumeric) return -1
  if (rightNumeric) return 1
  return left < right ? -1 : left > right ? 1 : 0
}

export function compareVersions(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] - right[key]
  }
  const a = left.prerelease
  const b = right.prerelease
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    if (a[index] === undefined) return -1
    if (b[index] === undefined) return 1
    const result = compareIdentifier(a[index], b[index])
    if (result !== 0) return result
  }
  return 0
}

function upperForCaret(version) {
  if (version.major > 0) return { ...version, major: version.major + 1, minor: 0, patch: 0, prerelease: [] }
  if (version.minor > 0) return { ...version, minor: version.minor + 1, patch: 0, prerelease: [] }
  return { ...version, patch: version.patch + 1, prerelease: [] }
}

function upperForTilde(version) {
  return { ...version, minor: version.minor + 1, patch: 0, prerelease: [] }
}

function parsePartial(text) {
  const match = /^v?(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?$/.exec(text.trim())
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: match[2] === undefined || /[xX*]/.test(match[2]) ? null : Number(match[2]),
    patch: match[3] === undefined || /[xX*]/.test(match[3]) ? null : Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

function fullVersion(partial) {
  return { major: partial.major, minor: partial.minor ?? 0, patch: partial.patch ?? 0, prerelease: partial.prerelease }
}
function nextMinor(partial) { return { major: partial.major, minor: (partial.minor ?? 0) + 1, patch: 0, prerelease: [] } }
function nextMajor(partial) { return { major: partial.major + 1, minor: 0, patch: 0, prerelease: [] } }
function fmt(version) {
  const base = `${version.major}.${version.minor}.${version.patch}`
  return version.prerelease && version.prerelease.length ? `${base}-${version.prerelease.join('.')}` : base
}

function expandToken(raw) {
  if (raw === '*' || raw === 'x' || raw === 'X') return '*'
  const match = /^(>=|<=|>|<|=|\^|~)?\s*v?(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?$/.exec(raw)
  if (!match) return null
  const op = match[1] ?? '='
  const partial = {
    major: Number(match[2]),
    minor: match[3] === undefined || /[xX*]/.test(match[3]) ? null : Number(match[3]),
    patch: match[4] === undefined || /[xX*]/.test(match[4]) ? null : Number(match[4]),
    prerelease: match[5] ? match[5].split('.') : [],
  }
  const low = fullVersion(partial)
  const noMinor = partial.minor === null
  const noPatch = partial.patch === null
  if (!noMinor && !noPatch) return `${op}${fmt(low)}`
  switch (op) {
    case '^':
    case '~':
    case '=':
      return noMinor ? `>=${fmt(low)} <${fmt(nextMajor(partial))}` : `>=${fmt(low)} <${fmt(nextMinor(partial))}`
    case '>=': return `>=${fmt(low)}`
    case '>': return noMinor ? `>=${fmt(nextMajor(partial))}` : `>=${fmt(nextMinor(partial))}`
    case '<': return `<${fmt(low)}`
    case '<=': return noMinor ? `<${fmt(nextMajor(partial))}` : `<${fmt(nextMinor(partial))}`
    default: return null
  }
}

/** Hyphen ranges and x-ranges are normalized before tokenizing. */
function expandAlternative(alternative) {
  const text = alternative.trim()
  if (text === '' || text === '*' || text === 'x' || text === 'X') return '*'
  const hyphen = /^(.+?)\s+-\s+(.+)$/.exec(text)
  if (hyphen) {
    const left = parsePartial(hyphen[1])
    const right = parsePartial(hyphen[2])
    if (!left || !right) return null
    const low = `>=${fmt(fullVersion(left))}`
    if (right.minor === null) return `${low} <${fmt(nextMajor(right))}`
    if (right.patch === null) return `${low} <${fmt(nextMinor(right))}`
    return `${low} <=${fmt(fullVersion(right))}`
  }
  const parts = []
  for (const raw of text.split(/\s+/)) {
    const expanded = expandToken(raw)
    if (expanded === null) return null
    parts.push(expanded)
  }
  return parts.join(' ')
}

function tokenizeAlternative(alternative) {
  const expanded = expandAlternative(alternative)
  if (expanded === null) return null
  if (expanded === '*') return [{ op: '*', version: null }]
  const tokens = []
  for (const raw of expanded.split(/\s+/)) {
    const match = /^(>=|<=|>|<|=|\^|~)?\s*v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(raw)
    if (!match) return null
    const op = match[1] ?? '='
    const version = parseVersion(match[2])
    if (!version) return null
    tokens.push({ op, version })
  }
  return tokens
}

function satisfiesToken(version, token) {
  if (token.op === '*') return true
  const cmp = compareVersions(version, token.version)
  switch (token.op) {
    case '=': return cmp === 0
    case '>': return cmp > 0
    case '>=': return cmp >= 0
    case '<': return cmp < 0
    case '<=': return cmp <= 0
    case '^': return cmp >= 0 && compareVersions(version, upperForCaret(token.version)) < 0
    case '~': return cmp >= 0 && compareVersions(version, upperForTilde(token.version)) < 0
    default: return false
  }
}

/**
 * @param {string} version exact version to test
 * @param {string} range SemVer range
 * @returns {boolean}
 */
export function satisfies(version, range) {
  const parsed = parseVersion(version)
  if (!parsed || typeof range !== 'string') return false
  if (range.trim() === '') return false
  const alternatives = range.split('||')
  for (const alternative of alternatives) {
    const tokens = tokenizeAlternative(alternative)
    if (!tokens || tokens.length === 0) continue
    if (tokens.every(token => satisfiesToken(parsed, token))) return true
  }
  return false
}

/** @returns {boolean} whether `range` is a syntactically usable range for this checker. */
export function validRange(range) {
  if (typeof range !== 'string' || range.trim() === '') return false
  for (const alternative of range.split('||')) {
    if (!tokenizeAlternative(alternative)) return false
  }
  return true
}

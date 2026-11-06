/**
 * Minimal SemVer range matcher for the checker.
 *
 * The host evaluates plugin requirements with
 * `semver.satisfies(runtime, range, { includePrerelease: true })`
 * (deepseek-harness/packages/boot/app-boot/src/plugin-compatibility.ts).
 * This module implements the subset that appears in package manifests and in
 * npm documentation: exact versions, `>= > <= < =`, `^`, `~`, `*`/`x`,
 * space-separated AND (including `>= 0.2.2-rc.1`, where npm allows whitespace
 * between an operator and its version), `||` alternatives, hyphen ranges and
 * partial/x-ranges. Prereleases participate in ranges everywhere, matching the
 * host's `includePrerelease: true`.
 *
 * It does NOT implement `!=` or npm's "prerelease only matches the same
 * [major,minor,patch] tuple" exclusion: the host explicitly includes
 * prereleases, so the checker must use the same rule.
 */

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const OPERATORS = new Set(['>=', '<=', '>', '<', '=', '^', '~'])

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

// npm encodes an exclusive upper bound as `X.Y.Z-0`, which also excludes
// prereleases of the boundary version. This matters for `^0.2.2-alpha.2`:
// 0.3.0-0 must NOT satisfy it, while `<0.3.0` (an explicit user range) does.
function sentinel(version) {
  return { ...version, prerelease: ['0'] }
}

function upperForCaret(version) {
  if (version.major > 0) return sentinel({ ...version, major: version.major + 1, minor: 0, patch: 0 })
  if (version.minor > 0) return sentinel({ ...version, minor: version.minor + 1, patch: 0 })
  return sentinel({ ...version, patch: version.patch + 1 })
}

function upperForTilde(version) {
  return sentinel({ ...version, minor: version.minor + 1, patch: 0 })
}

/** A version with optional missing minor/patch and optional prerelease. */
function parsePartial(text) {
  const match = /^v?(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(text.trim())
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
function nextMinor(partial) { return { major: partial.major, minor: (partial.minor ?? 0) + 1, patch: 0, prerelease: ['0'] } }
function nextMajor(partial) { return { major: partial.major + 1, minor: 0, patch: 0, prerelease: ['0'] } }
function fmt(version) {
  const base = `${version.major}.${version.minor}.${version.patch}`
  return version.prerelease && version.prerelease.length ? `${base}-${version.prerelease.join('.')}` : base
}

/**
 * Expand one npm comparator (`^1.2`, `>= 0.2.2-rc.1`, `1.x`, ...) into the
 * primitive {@link satisfiesToken} comparators. Returns null when the token is
 * not a range this checker can evaluate.
 */
function comparatorsForToken(op, versionText) {
  if (versionText === '*' || versionText === 'x' || versionText === 'X') {
    return op === '=' || op === undefined ? [] : null
  }
  const partial = parsePartial(versionText)
  if (!partial) return null
  const normalized = op ?? '='
  if (!OPERATORS.has(normalized)) return null
  const low = fullVersion(partial)
  const noMinor = partial.minor === null
  const noPatch = partial.patch === null

  if (!noMinor && !noPatch) {
    const exact = parseVersion(fmt(low))
    if (!exact) return null
    if (normalized === '^') return [{ op: '>=', version: exact }, { op: '<', version: upperForCaret(low) }]
    if (normalized === '~') return [{ op: '>=', version: exact }, { op: '<', version: upperForTilde(low) }]
    return [{ op: normalized, version: exact }]
  }

  // Partial / x-range. Under includePrerelease npm gives the *lower* bound a
  // `-0` sentinel too, so `^1.2` matches 1.2.0-0 while `>=1.2.3` does not.
  const lowSentinel = sentinel(low)
  switch (normalized) {
    case '^':
      // ^1.2 -> <2.0.0-0, ^0.2 -> <0.3.0-0, ^0.0 -> <0.1.0-0
      return noMinor || partial.major > 0
        ? [{ op: '>=', version: lowSentinel }, { op: '<', version: nextMajor(partial) }]
        : [{ op: '>=', version: lowSentinel }, { op: '<', version: nextMinor(partial) }]
    case '~':
      return noMinor
        ? [{ op: '>=', version: lowSentinel }, { op: '<', version: nextMajor(partial) }]
        : [{ op: '>=', version: lowSentinel }, { op: '<', version: nextMinor(partial) }]
    case '=':
      return noMinor
        ? [{ op: '>=', version: lowSentinel }, { op: '<', version: nextMajor(partial) }]
        : [{ op: '>=', version: lowSentinel }, { op: '<', version: nextMinor(partial) }]
    case '>=': return [{ op: '>=', version: lowSentinel }]
    case '>': return noMinor ? [{ op: '>=', version: nextMajor(partial) }] : [{ op: '>=', version: nextMinor(partial) }]
    case '<': return [{ op: '<', version: lowSentinel }]
    case '<=': return noMinor ? [{ op: '<', version: nextMajor(partial) }] : [{ op: '<', version: nextMinor(partial) }]
    default: return null
  }
}

/** Split a `||` alternative into comparator chunks, allowing `>= 1.2.3`. */
function tokenizeComparators(text) {
  const chunks = []
  let rest = text
  while (rest.trim() !== '') {
    rest = rest.replace(/^\s+/, '')
    const match = /^(>=|<=|>|<|=|\^|~)?\s*([^\s,]+)\s*/.exec(rest)
    if (!match) return null
    const op = match[1]
    const versionText = match[2]
    // An operator with no following version (`>=` alone) is malformed; the
    // regex above would otherwise read the next operator as a version.
    if (!op && OPERATORS.has(versionText)) return null
    chunks.push({ op, versionText })
    rest = rest.slice(match[0].length)
  }
  return chunks.length > 0 ? chunks : null
}

function expandAlternative(alternative) {
  const text = alternative.trim()
  // An empty alternative is npm's `*` (node-semver treats `1.2.3 ||` as
  // `*`). The wholly-empty range is rejected by the callers below.
  if (text === '' || text === '*' || text === 'x' || text === 'X') return []
  const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(text)
  if (hyphen) {
    const left = parsePartial(hyphen[1])
    const right = parsePartial(hyphen[2])
    if (!left || !right) return null
    const low = fullVersion(left)
    // The left side is a floor: a concrete version keeps its exact prerelease,
    // while a partial version gets the same -0 sentinel npm uses.
    const lowToken = left.prerelease.length > 0
      ? { op: '>=', version: low }
      : { op: '>=', version: sentinel(low) }
    if (right.minor === null) return [lowToken, { op: '<', version: nextMajor(right) }]
    if (right.patch === null) return [lowToken, { op: '<', version: nextMinor(right) }]
    if (right.prerelease.length === 0) {
      return [lowToken, { op: '<', version: sentinel({ ...fullVersion(right), patch: fullVersion(right).patch + 1 }) }]
    }
    return [lowToken, { op: '<=', version: fullVersion(right) }]
  }
  const chunks = tokenizeComparators(text)
  if (!chunks) return null
  const tokens = []
  for (const chunk of chunks) {
    const expanded = comparatorsForToken(chunk.op, chunk.versionText)
    if (expanded === null) return null
    tokens.push(...expanded)
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
  for (const alternative of range.split('||')) {
    const tokens = expandAlternative(alternative)
    if (!tokens) continue
    if (tokens.every(token => satisfiesToken(parsed, token))) return true
  }
  return false
}

/** @returns {boolean} whether `range` is a syntactically usable range for this checker. */
export function validRange(range) {
  if (typeof range !== 'string' || range.trim() === '') return false
  for (const alternative of range.split('||')) {
    if (!expandAlternative(alternative)) return false
  }
  return true
}

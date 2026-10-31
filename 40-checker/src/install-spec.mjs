/**
 * Minimal port of plugin-manager/src/install-spec.ts:69 (parseInstallSpec).
 * The checker must not import the host TypeScript source (it is not built in
 * a plugin checkout), so this file reimplements the accepted forms and
 * refusal rules. It is deliberately narrower: it also requires a pinned
 * reference for git specs, which DS-C C-3 requires.
 */

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/
const PACKAGE_NAME_MAX_LENGTH = 214
const GIT_SHORTHAND = /^(?:github|gitlab|bitbucket|gist):/i
const GIT_URL = /^git(?:\+[a-z]+)?:\/\/|^git@[^:]+:/i
const HOSTED_REPOSITORY_URL = /^https?:\/\/[^/]+\/[^/]+\/[^/#]+(?:\.git)?(?:#.*)?$/i
const TARBALL_SPEC = /\.(?:tgz|tar\.gz)(?:#.*)?$/i
const COMMIT = /^[0-9a-f]{40}$/

export class InvalidInstallSpec extends Error {
  constructor(spec, reason) {
    super(`invalid install spec: ${reason}: ${spec}`)
    this.name = 'InvalidInstallSpec'
    this.spec = spec
    this.reason = reason
  }
}

function fail(spec, reason) {
  throw new InvalidInstallSpec(spec, reason)
}

/**
 * @param {string} raw
 * @returns {{kind:'registry'|'path'|'tarball'|'git', spec:string, name?:string, range?:string, path?:string, host?:string, commit?:string, pinned:boolean}}
 */
export function parseInstallSpec(raw) {
  if (typeof raw !== 'string') fail(String(raw), 'the spec must be a string')
  const spec = raw.trim()
  if (spec === '') fail(spec, 'the package spec must not be empty')

  const path = spec.replace(/^(?:file|link):/, '')
  if (path !== spec || /^(?:\/|[A-Za-z]:[\\/])/.test(spec)) {
    if (!/^(?:\/|[A-Za-z]:[\\/])/.test(path)) fail(spec, 'a local path must be absolute')
    if (TARBALL_SPEC.test(path)) return { kind: 'tarball', spec, path, pinned: true }
    return { kind: 'path', spec, path, pinned: true }
  }
  if (/^\.{1,2}(?:[\\/]|$)/.test(spec)) fail(spec, 'a local path must be absolute')

  const git = GIT_SHORTHAND.test(spec) || GIT_URL.test(spec) || HOSTED_REPOSITORY_URL.test(spec)
  if (git && !TARBALL_SPEC.test(spec)) {
    if (!/#[0-9a-f]{40}$/.test(spec)) fail(spec, 'a git spec must pin a 40-hex-digit commit (no HEAD/branch/tag)')
    return { kind: 'git', spec, host: 'git', commit: spec.slice(-40), pinned: true }
  }
  if (/^https?:\/\//i.test(spec)) {
    if (TARBALL_SPEC.test(spec)) return { kind: 'tarball', spec, host: new URL(spec).host, pinned: true }
    fail(spec, 'a URL must point at a git repository or a tarball')
  }

  const at = spec.indexOf('@', 1)
  const name = at === -1 ? spec : spec.slice(0, at)
  const range = at === -1 ? undefined : spec.slice(at + 1)
  if (name.length > PACKAGE_NAME_MAX_LENGTH || !PACKAGE_NAME.test(name)) {
    fail(spec, 'not a package name the registry accepts')
  }
  if (range === '') fail(spec, 'a version after @ must not be empty')
  return range === undefined
    ? { kind: 'registry', spec, name, pinned: false }
    : { kind: 'registry', spec, name, range, pinned: !/^(?:latest|next|beta|canary|\*|x)$/i.test(range) }
}

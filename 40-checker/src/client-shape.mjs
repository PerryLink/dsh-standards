/**
 * Static G4 check: when `dsh.client` exists, the package must expose
 * `exports["./client"]` and that target must exist in the package.
 *
 * This is a static shape check. It does not prove the client module loads or
 * renders; that is a runtime/UI probe and is reported separately.
 */
import path from 'node:path'
import { isFile } from './util.mjs'

function clientTarget(exported) {
  if (typeof exported === 'string') return exported
  if (exported && typeof exported === 'object' && !Array.isArray(exported)) {
    for (const key of ['default', 'import', 'require', 'node', 'browser']) {
      if (typeof exported[key] === 'string') return exported[key]
    }
    for (const value of Object.values(exported)) {
      const nested = clientTarget(value)
      if (nested) return nested
    }
  }
  return null
}

export function checkClientShape(manifest, dir = null) {
  const hasClient = manifest?.dsh?.client !== undefined
  if (!hasClient) {
    return {
      hasClient: false,
      ok: true,
      result: 'NA',
      reason: 'no dsh.client declaration',
    }
  }
  const client = manifest.dsh.client
  if (client === null || client === undefined || client === '') {
    return { hasClient: true, ok: false, result: 'FAIL', reason: 'dsh.client is empty' }
  }
  const exported = manifest.exports?.['./client']
  if (!exported) {
    return {
      hasClient: true,
      ok: false,
      result: 'FAIL',
      reason: 'dsh.client exists but exports["./client"] is missing; a package-root row cannot resolve it',
    }
  }
  const target = clientTarget(exported)
  if (target && typeof dir === 'string' && dir !== '' && !target.includes('*')) {
    const absolute = path.resolve(dir, target)
    const relative = path.relative(dir, absolute)
    if (relative.startsWith('..') || path.isAbsolute(relative) || !isFile(absolute)) {
      return {
        hasClient: true,
        ok: false,
        result: 'FAIL',
        reason: `exports["./client"] points to a missing file: ${target}`,
      }
    }
  }
  return {
    hasClient: true,
    ok: true,
    result: 'PASS',
    reason: 'dsh.client + exports["./client"] present and resolvable (static only)',
  }
}

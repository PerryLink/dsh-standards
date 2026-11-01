/**
 * Static G4 check: when `dsh.client` exists, the package must expose
 * `exports["./client"]` and declare the client at the package root.
 *
 * This is a static shape check. It does not prove the client module loads or
 * renders; that is a runtime/UI probe and is reported separately.
 */
export function checkClientShape(manifest) {
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
  return {
    hasClient: true,
    ok: true,
    result: 'PASS',
    reason: 'dsh.client + exports["./client"] present (static only)',
  }
}

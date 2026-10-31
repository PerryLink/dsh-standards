/**
 * T4 field validation: dsh.commitments / dsh.disclosure.
 *
 * These fields are declarations, not enforcement. The checker validates their
 * shape and reports missing/invalid values; it never FAILs C-12 merely because
 * a commitment is absent (the standard's transition rule).
 */

export const COMMITMENT_IDS = [
  'no-session-upload',
  'no-third-party-proxy',
  'no-credential-enumeration',
  'no-silent-prompt-rewrite',
  'no-adapter-bypass',
  'no-webhook-auto-session',
  'no-security-seam-replacement',
  'third-party-endpoint-disclosure',
  'no-danger-full-access',
]

function detail(item, result, reason) {
  return { item, result, reason, evidence: ['package.json#dsh.commitments'] }
}

export function validateCommitments(manifest) {
  const value = manifest?.dsh?.commitments
  if (value === undefined) return [detail('C-12.6', 'NA', 'dsh.commitments is not declared (optional disclosure)')]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [detail('C-12.6', 'WARN', 'dsh.commitments must be an object')]
  }
  const details = []
  for (const id of COMMITMENT_IDS) {
    if (!Object.hasOwn(value, id)) details.push(detail('C-12.6', 'WARN', `missing commitment: ${id}`))
    else if (typeof value[id] !== 'boolean') details.push(detail('C-12.6', 'WARN', `commitment ${id} must be boolean`))
  }
  if (details.length === 0) details.push(detail('C-12.6', 'PASS', 'all 9 commitments are declared as booleans'))
  return details
}

export function validateDisclosure(manifest) {
  const value = manifest?.dsh?.disclosure
  if (value === undefined) return [detail('C-12.7', 'NA', 'dsh.disclosure is not declared (optional disclosure)')]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [detail('C-12.7', 'WARN', 'dsh.disclosure must be an object')]
  }
  const details = []
  if (value.endpoints !== undefined) {
    if (!Array.isArray(value.endpoints) || value.endpoints.some(endpoint => typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint))) {
      details.push(detail('C-12.7', 'WARN', 'disclosure.endpoints must be an array of https URLs'))
    }
  }
  if (value.retention !== undefined && typeof value.retention !== 'string') {
    details.push(detail('C-12.7', 'WARN', 'disclosure.retention must be a string'))
  }
  if (value.systemPrompt !== undefined && typeof value.systemPrompt !== 'string') {
    details.push(detail('C-12.7', 'WARN', 'disclosure.systemPrompt must be a string'))
  }
  if (details.length === 0) details.push(detail('C-12.7', 'PASS', 'dsh.disclosure is well-formed'))
  return details
}

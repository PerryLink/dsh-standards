/** Shared result shape for every check. */

/**
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.clause
 * @param {string} input.layer
 * @param {'PASS'|'WARN'|'FAIL'|'NA'|'ERROR'} input.result
 * @param {string} [input.reason]
 * @param {string[]} [input.evidence]
 * @param {object[]} [input.details]
 * @param {'full'|'partial'|'not-run'} [input.coverage]
 * @param {'M'|'M+H'|'H'} [input.method]
 * @param {boolean} [input.advisory]
 */
export function check(input) {
  return {
    id: input.id,
    clause: input.clause,
    layer: input.layer,
    result: input.result,
    coverage: input.coverage ?? (input.result === 'NA' ? 'not-run' : 'full'),
    reason: input.reason ?? '',
    evidence: input.evidence ?? [],
    details: input.details ?? [],
    method: input.method ?? 'M',
    advisory: input.advisory === true,
  }
}

/**
 * @param {string} item e.g. "C-1.1"
 * @param {'PASS'|'WARN'|'FAIL'|'NA'|'ERROR'} result
 * @param {string} reason
 * @param {string[]} [evidence]
 */
export function detail(item, result, reason, evidence = []) {
  return { item, result, reason, evidence }
}

const RANK = { ERROR: 5, FAIL: 4, WARN: 3, PASS: 2, NA: 1 }

export function worst(results) {
  let current = 'NA'
  for (const result of results) {
    if (!result) continue
    if (RANK[result] > RANK[current]) current = result
  }
  return current
}

export function countByResult(checks) {
  const counts = { PASS: 0, WARN: 0, FAIL: 0, NA: 0, ERROR: 0 }
  for (const item of checks) counts[item.result] = (counts[item.result] ?? 0) + 1
  return counts
}

export function notRun(check, reason) {
  return { ...check, result: 'ERROR', coverage: 'not-run', reason }
}

#!/usr/bin/env node
/**
 * LEV-6 pure analyzer — turns a capture JSONL into prefix-reuse measurements.
 *
 * Input is the JSONL written by `lev6-capture-server.mjs`; nothing here touches
 * the network, DSH, or the clock beyond recording when it ran. Every number is a
 * property of the **request bytes DSH assembled**, not of a provider:
 *
 *   - `totalInputBytes/Tokens`   sum over the arm's requests
 *   - `prefixReusedBytes/Tokens` longest common prefix with the *previous*
 *                                request of the same arm (0 for the first)
 *   - `reuseRatio`               prefixReused / (sum of bytes that have a
 *                                predecessor). 1.0 means every later request
 *                                reused the whole previous prefix.
 *   - `firstDivergenceOffset`    byte offset of the first differing byte, or
 *                                null when the requests were identical.
 *
 * Two prefixes are computed:
 *
 *   1. `wire`         — the raw HTTP body bytes, exactly as sent. This is the
 *                       literal capture. JSON key order puts `system` and
 *                       `tools` *after* `messages`, so this view understates a
 *                       stable system prompt and overstates a stable message
 *                       list.
 *   2. `promptOrder`  — the cacheable prompt in provider order:
 *                       system text ‖ tool-schema JSON ‖ messages JSON, with no
 *                       separators. This is a derived canonicalization (documented,
 *                       deterministic) that mirrors the order a prefix-caching
 *                       provider hashes. It is still only assembled bytes; it is
 *                       not a provider cache hit rate.
 *
 * Tokens use DSH's fixed density, `ceil(bytes / 4)`, matching
 * `CHARS_PER_TOKEN = 4` in `packages/llm/token-meter/src/estimate.ts`.
 * Per-block structural overheads from that file are intentionally *not* added,
 * because the metric is a byte-span prefix, not a rendered message price.
 *
 * Usage:
 *   node lev6-analyze.mjs --capture capture.jsonl [--out summary.json]
 *        [--markdown summary.md] [--assert] [--arm-a arm-a] [--arm-b arm-b]
 *        [--max-volatile-prefix-offset 16]
 *
 * With `--assert`, the process exits 1 when an expectation fails. The summary
 * is still written, so a failed CI job keeps its evidence.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'

/** DSH's fixed text density: one token per four characters. */
const CHARS_PER_TOKEN = 4

/** Method label repeated in every artifact; the experiment is not billing. */
const METHOD = 'provider-capture (synthetic model, not billing)'

function parseArgs(argv) {
  const options = {
    capture: undefined,
    captureLabel: undefined,
    out: undefined,
    markdown: undefined,
    assert: false,
    armA: 'arm-a',
    armB: 'arm-b',
    maxVolatilePrefixOffset: 16,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const next = () => {
      const value = argv[index + 1]
      if (value === undefined) throw new Error(`${flag} needs a value`)
      index += 1
      return value
    }
    switch (flag) {
      case '--capture': options.capture = next(); break
      case '--capture-label': options.captureLabel = next(); break
      case '--out': options.out = next(); break
      case '--markdown': options.markdown = next(); break
      case '--assert': options.assert = true; break
      case '--arm-a': options.armA = next(); break
      case '--arm-b': options.armB = next(); break
      case '--max-volatile-prefix-offset': options.maxVolatilePrefixOffset = Number.parseInt(next(), 10); break
      case '--help': case '-h':
        process.stdout.write('usage: node lev6-analyze.mjs --capture <jsonl> [--out <json>]'
          + ' [--markdown <md>] [--assert] [--arm-a arm-a] [--arm-b arm-b]'
          + ' [--capture-label text] [--max-volatile-prefix-offset 16]\n')
        process.exit(0)
        break
      default: throw new Error(`unknown argument ${flag}`)
    }
  }
  if (options.capture === undefined) throw new Error('--capture <jsonl> is required')
  return options
}

/** Heuristic token count for a byte span. */
function estimateTokens(bytes) {
  return Math.ceil(bytes / CHARS_PER_TOKEN)
}

/** Byte length of one UTF-8 string. */
function byteLength(text) {
  return Buffer.byteLength(text, 'utf8')
}

/**
 * Longest common prefix length of two buffers, compared in 8 KiB slices.
 * @param {Buffer} a
 * @param {Buffer} b
 * @returns {number} matching byte count.
 */
function lcpBytes(a, b) {
  const limit = Math.min(a.length, b.length)
  const step = 8192
  let offset = 0
  while (offset < limit) {
    const end = Math.min(offset + step, limit)
    if (a.subarray(offset, end).equals(b.subarray(offset, end))) {
      offset = end
      continue
    }
    // Shrink to the exact first differing byte inside this slice.
    let index = offset
    while (index < end && a[index] === b[index]) index += 1
    return index
  }
  return limit
}

/**
 * Top-level request fields DSH appends *after* the Messages body: plugin-owned
 * request extensions. They carry per-session state, so they are the only part of
 * a stable assembly that legitimately differs between fresh sessions.
 */
const EXTENSION_FIELDS = new Set(['dsh_session_log', 'dsh_plugin_packages'])

/**
 * Read the top-level fields of one JSON object with their **byte** spans, so a
 * wire divergence can be attributed to a field name (for example a trailing
 * per-session extension field) instead of an opaque offset. String indices are
 * UTF-16 offsets and the body contains multi-byte characters, so every span is
 * converted to UTF-8 bytes before it is returned.
 * @param {string} raw - exact request body text.
 * @returns {{key: string, keyStart: number, valueStart: number, valueEnd: number}[]}
 */
function topLevelFields(raw) {
  if (raw[0] !== '{') return []
  const fields = []
  const toByte = (index) => Buffer.byteLength(raw.slice(0, index), 'utf8')
  let index = 1
  while (index < raw.length) {
    while (index < raw.length && /[\s,]/u.test(raw[index])) index += 1
    if (raw[index] !== '"') break
    const keyStart = index
    index += 1
    while (index < raw.length) {
      if (raw[index] === '\\') { index += 2; continue }
      if (raw[index] === '"') { index += 1; break }
      index += 1
    }
    let key
    try {
      key = JSON.parse(raw.slice(keyStart, index))
    } catch {
      return fields
    }
    while (index < raw.length && raw[index] !== ':') index += 1
    index += 1
    while (index < raw.length && /\s/u.test(raw[index])) index += 1
    const valueStart = index
    let depth = 0
    let inString = false
    let escaped = false
    for (; index < raw.length; index += 1) {
      const character = raw[index]
      if (inString) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') inString = false
        continue
      }
      if (character === '"') inString = true
      else if (character === '{' || character === '[') depth += 1
      else if (character === '}' || character === ']') {
        if (depth === 0) break
        depth -= 1
      } else if (character === ',' && depth === 0) break
    }
    fields.push({
      key,
      keyStart: toByte(keyStart),
      valueStart: toByte(valueStart),
      valueEnd: toByte(index),
    })
  }
  return fields
}

/** Field containing a byte offset, used to name a wire divergence. */
function fieldAt(fields, offset) {
  for (const field of fields) {
    if (offset >= field.keyStart && offset <= field.valueEnd) return field.key
  }
  return null
}

/**
 * Canonical cacheable prompt for one request, in provider order.
 * @param {Record<string, unknown>} body - parsed request body.
 * @returns {{system: Buffer, tools: Buffer, messages: Buffer}}
 */
function canonicalPrompt(body) {
  const system = typeof body.system === 'string' ? body.system : ''
  const tools = body.tools === undefined ? '' : JSON.stringify(body.tools)
  const messages = JSON.stringify(body.messages ?? [])
  return {
    system: Buffer.from(system, 'utf8'),
    tools: Buffer.from(tools, 'utf8'),
    messages: Buffer.from(messages, 'utf8'),
  }
}

/**
 * Longest common prefix of two canonical prompts, component by component.
 * @param {ReturnType<typeof canonicalPrompt>} previous
 * @param {ReturnType<typeof canonicalPrompt>} current
 * @returns {{bytes: number, component: 'system'|'tools'|'messages'|null}}
 */
function promptLcp(previous, current) {
  if (!previous.system.equals(current.system)) {
    return { bytes: lcpBytes(previous.system, current.system), component: 'system' }
  }
  let base = previous.system.length
  if (!previous.tools.equals(current.tools)) {
    return { bytes: base + lcpBytes(previous.tools, current.tools), component: 'tools' }
  }
  base += previous.tools.length
  if (!previous.messages.equals(current.messages)) {
    return { bytes: base + lcpBytes(previous.messages, current.messages), component: 'messages' }
  }
  base += previous.messages.length
  return { bytes: base, component: null }
}

/** Load one capture JSONL: messages requests for analysis, other traffic for diagnosis. */
function loadCapture(path) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    // A missing capture is a failed experiment, not a crash: the summary still
    // gets written so the CI artifact explains what happened.
    return { records: [], others: [], problems: [`capture unreadable: ${String(error)}`] }
  }
  const records = []
  const others = []
  const problems = []
  for (const [index, line] of text.split('\n').entries()) {
    if (line.trim() === '') continue
    let record
    try {
      record = JSON.parse(line)
    } catch (error) {
      problems.push(`line ${index + 1}: invalid JSON (${String(error)})`)
      continue
    }
    if (record.kind !== 'messages') {
      others.push({ seq: record.seq, method: record.method, path: record.path })
      continue
    }
    records.push(record)
  }
  records.sort((left, right) => left.seq - right.seq)
  return { records, others, problems }
}

/** Digest of the capture file, so the summary points at exact bytes. */
function fileSha256(path) {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex')
  } catch {
    return null
  }
}

/**
 * Build per-request facts plus wire and prompt-order prefix comparisons.
 * @param {Record<string, unknown>[]} records - this arm's messages requests in order.
 */
function analyzeArm(records) {
  const requests = []
  const wirePairs = []
  const promptPairs = []
  const canonicalCache = new Map()
  const baseBytesBySeq = new Map()
  const systemValueStartBySeq = new Map()

  for (const record of records) {
    const raw = typeof record.rawBody === 'string' ? record.rawBody : ''
    const wire = Buffer.from(raw, 'utf8')
    let body
    let parseError = null
    try {
      body = JSON.parse(raw)
    } catch (error) {
      parseError = String(error)
    }
    const canonical = body === undefined ? undefined : canonicalPrompt(body)
    if (canonical !== undefined) canonicalCache.set(record.seq, canonical)
    // The "base request" is everything before the first plugin request
    // extension: model, stream, messages, max_tokens, thinking, output_config,
    // system, tools. It is what a stable assembly is supposed to freeze.
    const fields = topLevelFields(raw)
    const firstExtension = fields.find(field => EXTENSION_FIELDS.has(field.key))
    const baseRequestBytes = firstExtension === undefined ? wire.length : firstExtension.keyStart
    // Point at the first byte of the system *text*, not at its JSON quote.
    const systemField = fields.find(field => field.key === 'system')
    const systemValueStart = systemField === undefined
      ? null
      : systemField.valueStart + (wire[systemField.valueStart] === 0x22 ? 1 : 0)
    baseBytesBySeq.set(record.seq, baseRequestBytes)
    systemValueStartBySeq.set(record.seq, systemValueStart)
    requests.push({
      seq: record.seq,
      sessionId: record.sessionId ?? null,
      model: record.model ?? null,
      bytes: wire.length,
      tokens: estimateTokens(wire.length),
      baseRequestBytes,
      systemValueStart,
      bodySha256: record.bodySha256 ?? createHash('sha256').update(wire).digest('hex'),
      promptBytes: canonical === undefined
        ? null
        : canonical.system.length + canonical.tools.length + canonical.messages.length,
      parseError,
    })
  }

  for (let index = 1; index < records.length; index += 1) {
    const previousRecord = records[index - 1]
    const currentRecord = records[index]
    const previousWire = Buffer.from(previousRecord.rawBody ?? '', 'utf8')
    const currentWire = Buffer.from(currentRecord.rawBody ?? '', 'utf8')
    const wireReused = lcpBytes(previousWire, currentWire)
    const fields = topLevelFields(currentRecord.rawBody ?? '')
    const identical = wireReused === Math.min(previousWire.length, currentWire.length)
    const divergenceField = identical ? null : fieldAt(fields, wireReused)
    const systemValueStart = systemValueStartBySeq.get(currentRecord.seq)
    const previousBase = baseBytesBySeq.get(previousRecord.seq) ?? previousWire.length
    wirePairs.push({
      fromSeq: previousRecord.seq,
      toSeq: currentRecord.seq,
      previousBytes: previousWire.length,
      currentBytes: currentWire.length,
      reusedBytes: wireReused,
      reusedTokens: estimateTokens(wireReused),
      reuseRatio: Math.min(previousWire.length, currentWire.length) === 0
        ? 0
        : wireReused / Math.min(previousWire.length, currentWire.length),
      divergenceOffset: identical ? null : wireReused,
      divergenceField,
      // How far into the `system` value the first difference sits: 0 means the
      // volatile prefix is the very first prompt byte, even though the wire
      // stores `system` after `messages`. Only meaningful when the divergence
      // really is in `system`.
      divergenceInsideSystemPrefix: divergenceField !== 'system' || systemValueStart === null || systemValueStart === undefined
        ? null
        : wireReused - systemValueStart,
      previousBaseRequestBytes: previousBase,
      baseRequestReusedBytes: Math.min(wireReused, previousBase),
      baseRequestFullyReused: wireReused >= previousBase,
    })

    const previousPrompt = canonicalCache.get(previousRecord.seq)
    const currentPrompt = canonicalCache.get(currentRecord.seq)
    if (previousPrompt === undefined || currentPrompt === undefined) continue
    const promptTotal = previousPrompt.system.length + previousPrompt.tools.length + previousPrompt.messages.length
    const prompt = promptLcp(previousPrompt, currentPrompt)
    promptPairs.push({
      fromSeq: previousRecord.seq,
      toSeq: currentRecord.seq,
      promptBytes: promptTotal,
      reusedBytes: prompt.bytes,
      reusedTokens: estimateTokens(prompt.bytes),
      reuseRatio: promptTotal === 0 ? 0 : prompt.bytes / promptTotal,
      divergenceOffset: prompt.component === null ? null : prompt.bytes,
      divergenceComponent: prompt.component,
    })
  }

  const withPredecessor = requests.slice(1)
  const sumBytes = (values) => values.reduce((total, value) => total + value, 0)
  const totalInputBytes = sumBytes(requests.map(request => request.bytes))
  const wireReusedBytes = sumBytes(wirePairs.map(pair => pair.reusedBytes))
  const promptReusedBytes = sumBytes(promptPairs.map(pair => pair.reusedBytes))
  const promptTotalBytes = sumBytes(promptPairs.map(pair => pair.promptBytes))
  const comparableBytes = sumBytes(withPredecessor.map(request => request.bytes))

  return {
    requestCount: requests.length,
    distinctSessions: new Set(requests.map(request => request.sessionId).filter(Boolean)).size,
    totalInputBytes,
    totalInputTokens: estimateTokens(totalInputBytes),
    wire: {
      prefixReusedBytes: wireReusedBytes,
      prefixReusedTokens: estimateTokens(wireReusedBytes),
      reuseRatio: comparableBytes === 0 ? 0 : wireReusedBytes / comparableBytes,
      firstDivergenceOffset: wirePairs.find(pair => pair.divergenceOffset !== null)?.divergenceOffset ?? null,
      firstDivergenceField: wirePairs.find(pair => pair.divergenceField !== undefined && pair.divergenceField !== null)?.divergenceField ?? null,
      firstDivergenceInsideSystemPrefix: wirePairs.find(pair => pair.divergenceInsideSystemPrefix !== null && pair.divergenceInsideSystemPrefix !== undefined)?.divergenceInsideSystemPrefix ?? null,
      systemValueStart: requests[0]?.systemValueStart ?? null,
      baseRequestBytes: sumBytes(wirePairs.map(pair => pair.previousBaseRequestBytes)),
      baseRequestReusedBytes: sumBytes(wirePairs.map(pair => pair.baseRequestReusedBytes)),
      baseRequestFullyReused: wirePairs.every(pair => pair.baseRequestFullyReused),
      pairs: wirePairs,
    },
    promptOrder: {
      totalBytes: promptTotalBytes,
      prefixReusedBytes: promptReusedBytes,
      prefixReusedTokens: estimateTokens(promptReusedBytes),
      reuseRatio: promptTotalBytes === 0 ? 0 : promptReusedBytes / promptTotalBytes,
      firstDivergenceOffset: promptPairs.find(pair => pair.divergenceOffset !== null)?.divergenceOffset ?? null,
      firstDivergenceComponent: promptPairs.find(pair => pair.divergenceComponent !== null)?.divergenceComponent ?? null,
      pairs: promptPairs,
    },
    sameCanonicalMessages: new Set(
      requests.map(request => JSON.stringify(canonicalCache.get(request.seq)?.messages.toString('utf8') ?? null)),
    ).size === 1,
    requests,
  }
}

/** Markdown rendering of one summary, for CI logs and the report. */
function renderMarkdown(summary) {
  const lines = []
  lines.push('# LEV-6 capture summary')
  lines.push('')
  lines.push(`- method: \`${summary.method}\``)
  lines.push(`- capture: \`${summary.capture.file}\` (${summary.capture.messagesRequests} messages requests, sha256 \`${(summary.capture.sha256 ?? 'unavailable').slice(0, 16)}\`)`)
  lines.push(`- generated: ${summary.generatedAt}`)
  lines.push(`- token estimate: ${summary.tokenEstimate}`)
  lines.push('')
  lines.push('| arm | requests | sessions | input bytes | input tokens | wire reused bytes | wire reuse | wire 1st divergence | base request bytes | base fully reused | prompt reused bytes | prompt reuse | prompt 1st divergence |')
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const arm of summary.arms) {
    const insideSystem = arm.wire.firstDivergenceInsideSystemPrefix
    const wireSuffix = arm.wire.firstDivergenceField === null ? '' : ` (${arm.wire.firstDivergenceField})`
    const wireOffset = arm.wire.firstDivergenceOffset === null
      ? 'none'
      : `${arm.wire.firstDivergenceOffset}${wireSuffix}`
        + (arm.wire.firstDivergenceField === 'system' && insideSystem !== null ? ` [+${insideSystem} in system]` : '')
    const promptOffset = arm.promptOrder.firstDivergenceOffset === null
      ? 'none'
      : `${arm.promptOrder.firstDivergenceOffset} (${arm.promptOrder.firstDivergenceComponent})`
    lines.push(`| ${arm.arm} | ${arm.requestCount} | ${arm.distinctSessions} | ${arm.totalInputBytes} | ${arm.totalInputTokens}`
      + ` | ${arm.wire.prefixReusedBytes} | ${(arm.wire.reuseRatio * 100).toFixed(2)}%`
      + ` | ${wireOffset}`
      + ` | ${arm.wire.baseRequestBytes} | ${arm.wire.baseRequestFullyReused ? 'yes' : 'no'}`
      + ` | ${arm.promptOrder.prefixReusedBytes} | ${(arm.promptOrder.reuseRatio * 100).toFixed(2)}%`
      + ` | ${promptOffset} |`)
  }
  lines.push('')
  for (const arm of summary.arms) {
    lines.push(`## ${arm.arm}`)
    lines.push('')
    lines.push('| seq | session | bytes | tokens | base request bytes |')
    lines.push('|---|---|---|---|---|')
    for (const request of arm.requests) {
      lines.push(`| ${request.seq} | \`${request.sessionId ?? '-'}\` | ${request.bytes} | ${request.tokens} | ${request.baseRequestBytes} |`)
    }
    lines.push('')
    lines.push('| pair | wire reused | wire ratio | wire divergence | base reused | base complete | prompt reused | prompt ratio | prompt divergence |')
    lines.push('|---|---|---|---|---|---|---|---|---|')
    for (const [index, pair] of arm.wire.pairs.entries()) {
      const promptPair = arm.promptOrder.pairs[index]
      lines.push(`| ${pair.fromSeq}→${pair.toSeq} | ${pair.reusedBytes} | ${(pair.reuseRatio * 100).toFixed(2)}%`
        + ` | ${pair.divergenceOffset ?? 'none'}${pair.divergenceField === null ? '' : ` (${pair.divergenceField})`}`
        + `${pair.divergenceField === 'system' && pair.divergenceInsideSystemPrefix !== null ? ` [+${pair.divergenceInsideSystemPrefix} in system]` : ''}`
        + ` | ${pair.baseRequestReusedBytes}/${pair.previousBaseRequestBytes} | ${pair.baseRequestFullyReused ? 'yes' : 'no'}`
        + ` | ${promptPair?.reusedBytes ?? '-'} | ${promptPair === undefined ? '-' : `${(promptPair.reuseRatio * 100).toFixed(2)}%`}`
        + ` | ${promptPair === undefined ? '-' : promptPair.divergenceOffset === null ? 'none' : `${promptPair.divergenceOffset} (${promptPair.divergenceComponent})`} |`)
    }
    lines.push('')
  }
  lines.push('## Assertions')
  lines.push('')
  lines.push('| id | result | detail |')
  lines.push('|---|---|---|')
  for (const assertion of summary.assertions) {
    lines.push(`| ${assertion.id} | ${assertion.ok ? 'PASS' : 'FAIL'} | ${assertion.detail} |`)
  }
  lines.push('')
  lines.push('## Non-claims')
  lines.push('')
  for (const nonClaim of summary.nonClaims) lines.push(`- ${nonClaim}`)
  lines.push('')
  return `${lines.join('\n')}\n`
}

const options = parseArgs(process.argv.slice(2))
const capturePath = resolve(options.capture)
const { records, others, problems } = loadCapture(capturePath)
const arms = new Map()
for (const record of records) {
  const arm = record.arm ?? 'unspecified'
  if (!arms.has(arm)) arms.set(arm, [])
  arms.get(arm).push(record)
}

const summary = {
  method: METHOD,
  generatedAt: new Date().toISOString(),
  capture: {
    file: options.captureLabel ?? options.capture,
    resolvedPath: capturePath,
    sha256: fileSha256(capturePath),
    messagesRequests: records.length,
    // Any non-Messages traffic: a mismatch here is how a rejected fake provider
    // shows up, so it is reported rather than silently dropped.
    otherRequests: others.length,
    otherPaths: [...new Set(others.map(other => `${other.method} ${other.path}`))],
    problems,
  },
  tokenEstimate: 'ceil(bytes / 4); CHARS_PER_TOKEN = 4 from packages/llm/token-meter/src/estimate.ts (per-block structural overheads excluded)',
  arms: [...arms.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([arm, armRecords]) => ({ arm, ...analyzeArm(armRecords) })),
  assertions: [],
  nonClaims: [
    'Assembled request prefix bytes/tokens only. No provider cache was hit and no cache hit rate is claimed.',
    'No billing, price, or money-saving claim: the model server is synthetic and reports no real usage.',
    'The `promptOrder` prefix is a derived canonicalization of the captured request, not a second capture.',
    '`syntheticUsage` in the capture JSONL is derived from request bytes and exists only to drive DSH usage plumbing.',
  ],
}

const armOf = (name) => summary.arms.find(arm => arm.arm === name)
const armA = armOf(options.armA)
const armB = armOf(options.armB)

const assertions = []
const assert = (id, ok, detail) => assertions.push({ id, ok, detail })

assert('captures-two-arms', armA !== undefined && armB !== undefined,
  `arms seen: ${summary.arms.map(arm => `${arm.arm}(${arm.requestCount})`).join(', ') || 'none'}`)
assert('two-requests-per-arm', (armA?.requestCount ?? 0) >= 2 && (armB?.requestCount ?? 0) >= 2,
  `${options.armA}=${armA?.requestCount ?? 0}, ${options.armB}=${armB?.requestCount ?? 0}`)
assert('fresh-session-per-request', (armA?.distinctSessions ?? 0) === (armA?.requestCount ?? -1)
  && (armB?.distinctSessions ?? 0) === (armB?.requestCount ?? -1),
  `${options.armA}: ${armA?.distinctSessions ?? 0}/${armA?.requestCount ?? 0}, `
  + `${options.armB}: ${armB?.distinctSessions ?? 0}/${armB?.requestCount ?? 0} distinct sessions`)
assert('same-task-text-per-arm', armA?.sameCanonicalMessages === true && armB?.sameCanonicalMessages === true,
  `${options.armA}: ${armA?.sameCanonicalMessages}, ${options.armB}: ${armB?.sameCanonicalMessages}`)

assert('stable-prompt-prefix-reuse', (armA?.promptOrder.reuseRatio ?? 0) >= 0.95,
  `${options.armA} promptOrder reuse ${((armA?.promptOrder.reuseRatio ?? 0) * 100).toFixed(2)}% (expected >= 95%)`)
assert('stable-base-request-reused', armA?.wire.baseRequestFullyReused === true,
  `${options.armA} base request (everything before the plugin extension fields) reused`
  + ` ${armA?.wire.baseRequestReusedBytes ?? 0}/${armA?.wire.baseRequestBytes ?? 0} bytes;`
  + ` the wire prefix stops only at ${armA?.wire.firstDivergenceField ?? 'n/a'}`
  + ` (wire reuse overall ${((armA?.wire.reuseRatio ?? 0) * 100).toFixed(2)}%)`)

assert('volatile-diverges-at-prompt-byte-zero', (armB?.promptOrder.firstDivergenceOffset ?? Infinity) <= 16,
  `${options.armB} promptOrder first divergence ${armB?.promptOrder.firstDivergenceOffset ?? 'null'} `
  + `in ${armB?.promptOrder.firstDivergenceComponent ?? 'n/a'} (expected <= 16, i.e. the volatile prefix itself)`)
assert('volatile-prompt-reuse-is-small', (armB?.promptOrder.reuseRatio ?? 1) <= 0.05,
  `${options.armB} promptOrder reuse ${((armB?.promptOrder.reuseRatio ?? 1) * 100).toFixed(2)}% (expected <= 5%)`)
assert('volatile-wire-diverges-at-system-prefix-start',
  (armB?.wire.firstDivergenceInsideSystemPrefix ?? Infinity) <= options.maxVolatilePrefixOffset,
  `${options.armB} wire first divergence ${armB?.wire.firstDivergenceOffset ?? 'null'}`
  + ` in ${armB?.wire.firstDivergenceField ?? 'n/a'},`
  + ` ${armB?.wire.firstDivergenceInsideSystemPrefix ?? 'n/a'} bytes into the system value`
  + ` (expected <= ${options.maxVolatilePrefixOffset}; the wire offset itself is ~${armB?.wire.systemValueStart ?? 'n/a'},`
  + ' because DSH serializes `system` after `messages`)')
assert('volatile-wire-diverges-at-system-field', armB?.wire.firstDivergenceField === 'system',
  `${options.armB} wire first divergence field ${armB?.wire.firstDivergenceField ?? 'null'} (expected "system")`)
assert('arms-are-distinguishable', armA !== undefined && armB !== undefined
  && (armA.promptOrder.reuseRatio - armB.promptOrder.reuseRatio) >= 0.50,
  `promptOrder reuse gap ${(((armA?.promptOrder.reuseRatio ?? 0) - (armB?.promptOrder.reuseRatio ?? 0)) * 100).toFixed(2)}pp (expected >= 50pp)`)

summary.assertions = assertions

const failures = assertions.filter(assertion => !assertion.ok)

if (options.out !== undefined) {
  const outPath = resolve(options.out)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`)
}
if (options.markdown !== undefined) {
  const markdownPath = resolve(options.markdown)
  mkdirSync(dirname(markdownPath), { recursive: true })
  writeFileSync(markdownPath, renderMarkdown(summary))
}

process.stdout.write(renderMarkdown(summary))
if (problems.length > 0) {
  process.stderr.write(`[lev6-analyze] capture problems:\n- ${problems.join('\n- ')}\n`)
}
if (options.assert && failures.length > 0) {
  process.stderr.write(`[lev6-analyze] ${failures.length} assertion(s) failed:\n`)
  for (const failure of failures) process.stderr.write(`- ${failure.id}: ${failure.detail}\n`)
  process.exitCode = 1
}

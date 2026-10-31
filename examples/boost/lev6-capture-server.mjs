#!/usr/bin/env node
/**
 * LEV-6 capture endpoint — a **synthetic** local model server that records the
 * exact request bytes DSH assembles.
 *
 * What this is
 * ------------
 * The installed `@deepseek-ai/dsh-llm-deepseek` provider speaks the Anthropic
 * Messages wire protocol (`POST {baseURL}/v1/messages`, SSE response), not
 * OpenAI chat-completions. This file implements just enough of that endpoint for
 * a headless DSH run to complete one turn:
 *
 *   request  → record raw bytes to JSONL, then answer with a scripted text block
 *   response → message_start / content_block_start / content_block_delta /
 *              content_block_stop / message_delta / message_stop
 *
 * It never calls the network, never talks to a model, and cannot bill anyone.
 * The `usage` numbers it reports are derived from the request byte length with
 * DSH's own fixed density (`CHARS_PER_TOKEN = 4`,
 * `packages/llm/token-meter/src/estimate.ts`) and are labelled synthetic in the
 * JSONL. They exercise DSH's usage plumbing; they are not provider billing.
 *
 * Routing
 * -------
 *   GET  /health                     → readiness probe (also reports counters)
 *   POST /v1/messages                → arm "unspecified"
 *   POST /<arm>/v1/messages          → arm "<arm>" (e.g. /arm-a/v1/messages)
 *
 * The capture path prefix is what lets one server separate experiment arms: the
 * DSH profile points `DEEPSEEK_BASE_URL` at `http://127.0.0.1:<port>/arm-a`, and
 * the adapter appends `/v1/messages`.
 *
 * CLI
 * ---
 *   node lev6-capture-server.mjs [--port 8787] [--host 127.0.0.1]
 *        [--out capture.jsonl] [--reply "text"] [--reset] [--quiet]
 *
 * `--reset` truncates `--out` first; without it records are appended, so a
 * capture can span several runs. Nothing outside `--out` is written.
 */

import { createServer } from 'node:http'
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'

/** DSH's fixed text density: one token per four characters. */
const CHARS_PER_TOKEN = 4

/** Default scripted answer; deterministic so the response never becomes a variable. */
const DEFAULT_REPLY = 'LEV6 synthetic reply (no model was called).'

/** Request body cap; a larger body is a bug, not a measurement. */
const MAX_BODY_BYTES = 64 * 1024 * 1024

/** Header values never copied into the capture file. */
const REDACTED_HEADERS = new Set(['authorization', 'x-api-key', 'anthropic-api-key', 'cookie', 'set-cookie'])

/** Parse the small CLI surface described in the file header. */
function parseArgs(argv) {
  const options = {
    port: 8787,
    host: '127.0.0.1',
    out: 'lev6-capture.jsonl',
    reply: DEFAULT_REPLY,
    reset: false,
    quiet: false,
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
      case '--port': options.port = Number.parseInt(next(), 10); break
      case '--host': options.host = next(); break
      case '--out': options.out = next(); break
      case '--reply': options.reply = next(); break
      case '--reset': options.reset = true; break
      case '--quiet': options.quiet = true; break
      case '--help': case '-h':
        process.stdout.write('usage: node lev6-capture-server.mjs [--port 8787] [--host 127.0.0.1]'
          + ' [--out capture.jsonl] [--reply text] [--reset] [--quiet]\n')
        process.exit(0)
        break
      default: throw new Error(`unknown argument ${flag}`)
    }
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65_535) {
    throw new Error('--port must be an integer in 0..65535')
  }
  return options
}

/** Heuristic token count shared with the analyzer: ceil(bytes / 4). */
function estimateTokens(bytes) {
  return Math.ceil(bytes / CHARS_PER_TOKEN)
}

/** Copy headers minus secrets; repetition keeps every value the client sent. */
function captureHeaders(raw) {
  const headers = {}
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue
    headers[name] = REDACTED_HEADERS.has(name.toLowerCase())
      ? '<redacted>'
      : Array.isArray(value) ? value : String(value)
  }
  return headers
}

/** Match `/v1/messages` and `/<arm>/v1/messages`; any other path is not a model request. */
function routeOf(pathname) {
  const match = /^\/(?:([A-Za-z0-9._-]+)\/)?v1\/messages\/?$/u.exec(pathname)
  if (match === null) return undefined
  return { arm: match[1] ?? 'unspecified' }
}

/** Serialize one SSE frame; `event:` must match the JSON `type` DSH parses. */
function frame(event) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

/**
 * Build the scripted Messages stream for one request.
 * @param model - model id echoed from the request.
 * @param inputTokens - synthetic input-token count for this request.
 * @param reply - assistant text.
 * @returns SSE frames in protocol order.
 */
function responseFrames(model, inputTokens, reply) {
  return [
    {
      type: 'message_start',
      message: {
        id: 'msg_lev6_synthetic',
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        // Cache counters are explicitly zero: this server models no caching, so
        // it must not look like a cache hit. These are not billing numbers.
        usage: {
          input_tokens: inputTokens,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: reply } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: estimateTokens(Buffer.byteLength(reply, 'utf8')) },
    },
    { type: 'message_stop' },
  ].map(frame).join('')
}

const options = parseArgs(process.argv.slice(2))
const outPath = resolve(options.out)
mkdirSync(dirname(outPath), { recursive: true })
if (options.reset && existsSync(outPath)) rmSync(outPath)
if (options.reset) writeFileSync(outPath, '')

/** Monotonic record counter; the analyzer orders pairs by it. */
let sequence = 0
/** Messages requests answered, reported by /health. */
let messagesRequests = 0

/** Append one JSONL record; synchronous so concurrent requests cannot interleave. */
function record(entry) {
  appendFileSync(outPath, `${JSON.stringify(entry)}\n`)
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${options.host}`)
  const chunks = []
  let bytes = 0
  let aborted = false

  request.on('data', (chunk) => {
    bytes += chunk.length
    if (bytes > MAX_BODY_BYTES) {
      aborted = true
      response.writeHead(413, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { type: 'invalid_request_error', message: 'body too large' } }))
      request.destroy()
      return
    }
    chunks.push(chunk)
  })

  request.on('end', () => {
    if (aborted) return

    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        ok: true,
        synthetic: true,
        messagesRequests,
        records: sequence,
        out: outPath,
        pid: process.pid,
      }))
      return
    }

    const route = request.method === 'POST' ? routeOf(url.pathname) : undefined
    const body = Buffer.concat(chunks)
    const raw = body.toString('utf8')

    if (route === undefined) {
      // Unexpected traffic is fine to answer, but it is not a model request and
      // must never enter the prefix analysis.
      sequence += 1
      record({
        kind: 'other',
        seq: sequence,
        receivedAt: new Date().toISOString(),
        method: request.method ?? 'GET',
        path: url.pathname,
        headers: captureHeaders(request.headers),
        bodyBytes: body.length,
        ...body.length > 0 && body.length <= 4096 ? { rawBody: raw } : {},
      })
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { type: 'not_found_error', message: `no route ${url.pathname}` } }))
      return
    }

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = undefined
    }
    const model = typeof parsed?.model === 'string' ? parsed.model : 'unknown'
    const inputTokens = estimateTokens(body.length)
    const sessionId = typeof request.headers['x-deepseek-harness-session-id'] === 'string'
      ? request.headers['x-deepseek-harness-session-id']
      : null

    sequence += 1
    messagesRequests += 1
    record({
      kind: 'messages',
      seq: sequence,
      arm: route.arm,
      receivedAt: new Date().toISOString(),
      method: request.method,
      path: url.pathname,
      headers: captureHeaders(request.headers),
      bodyBytes: body.length,
      bodySha256: createHash('sha256').update(body).digest('hex'),
      model,
      sessionId,
      // Synthetic: derived from request bytes with DSH's fixed 4-chars/token
      // density. Not provider usage and not billing.
      syntheticUsage: {
        basis: 'ceil(bodyBytes / 4)',
        input_tokens: inputTokens,
        output_tokens: estimateTokens(Buffer.byteLength(options.reply, 'utf8')),
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      rawBody: raw,
    })

    if (!options.quiet) {
      process.stderr.write(`[lev6-capture] #${sequence} arm=${route.arm} bytes=${body.length}`
        + ` tokens≈${inputTokens} session=${sessionId ?? '-'} model=${model}\n`)
    }

    const stream = responseFrames(model, inputTokens, options.reply)
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-lev6-capture': 'synthetic',
    })
    response.end(stream)
  })

  request.on('aborted', () => {
    aborted = true
    process.stderr.write('[lev6-capture] client aborted a request\n')
  })
})

server.on('error', (error) => {
  process.stderr.write(`[lev6-capture] server error: ${error.stack ?? String(error)}\n`)
  process.exitCode = 1
})

server.listen(options.port, options.host, () => {
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : options.port
  process.stdout.write(`LEV6_CAPTURE_URL=http://${options.host}:${port}\n`)
  process.stdout.write(`LEV6_CAPTURE_OUT=${outPath}\n`)
  process.stdout.write(`LEV6_CAPTURE_READY=1\n`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      process.stdout.write(`[lev6-capture] stopped after ${messagesRequests} messages request(s)\n`)
      process.exit(0)
    })
    // Do not let a keep-alive socket hold the process open forever.
    server.closeAllConnections?.()
  })
}

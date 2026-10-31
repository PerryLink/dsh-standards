# LEV-6 — stable prefix / assembly reuse (provider-capture, synthetic model)

- **Status:** `measured` — **provider-capture (synthetic model, not billing)**
- **Practice:** LEV-6 / stable prefix · assembly reuse (BOOST)
- **DSH:** `@deepseek-ai/dsh@0.2.2-alpha.2`, Node `v24.22.1` (CI: `ubuntu-latest`, Node 24)
- **Wire protocol:** Anthropic Messages `POST {baseURL}/v1/messages`, SSE stream
  (`anthropic-version: 2023-06-01`) — **not** OpenAI chat-completions; see §2
- **Evidence:**
  [lev6.json](lev6.json) · [capture.jsonl](capture.jsonl) (275 KB, 4 raw requests) ·
  [capture-sample.json](capture-sample.json) (anatomy of one request) ·
  [replication-r1.json](replication-r1.json) (summary of the second, standalone replication)
- **Harness:**
  [lev6-capture-server.mjs](../../../examples/boost/lev6-capture-server.mjs) ·
  [lev6-analyze.mjs](../../../examples/boost/lev6-analyze.mjs) ·
  [lev6-arm.patch.yml](../../../examples/boost/lev6-arm.patch.yml) ·
  [lev6-capture.yml](../../../.github/workflows/lev6-capture.yml)
- **Generated at:** `2026-10-31T16:07:22.027Z` (JSON `generatedAt`); capture sha256
  `0b5a2e644548d63b67e37aae0f47aa2a1e7586c03b159c48ef653ba4aa74f19b`
- **Claim scope:** assembled request prefix bytes/tokens and byte-reuse ratios
  only. **No billing, cost, or cache-hit claim is made anywhere in this
  report**, and the two replications below are two runs of the same two arms,
  not additional arms.

## 0. One-line result

Two fresh headless sessions per arm, same short task, both pointed at a local
synthetic endpoint: **arm A reused 100.00 % of the cacheable prompt prefix
(25,785 / 25,785 bytes ≈ 6,447 estimated tokens) and 100 % of the 25,966-byte
base request body**, while **arm B, whose persona prefix starts with a per-run
nonce, reused 0 bytes and diverged at prompt byte 0**. Raw HTTP-body reuse was
lower for both arms (A 40.99 %, B 6.44 %) because DSH appends a per-session
`dsh_session_log` extension after the base request; that field, not the prompt,
sets the wire-prefix boundary.

## 1. What is measured, and what is not

| Measured | Not measured |
|---|---|
| The exact request bytes DSH assembled (captured verbatim over loopback) | Any real provider's cache behaviour or cache hit rate |
| Longest common prefix with the previous request of the same arm, in raw wire bytes and in prompt order | Billing, price, or money saved |
| Token counts under DSH's own fixed density, `ceil(bytes / 4)` | Real tokenizer output (DSH itself uses this heuristic, not a tokenizer) |
| Session identity, headers, and request-extension contents | Whether `api.deepseek.com` accepts the extension fields (never contacted) |

The token rule is DSH's, not an invention here: `CHARS_PER_TOKEN = 4` in
`packages/llm/token-meter/src/estimate.ts`. The analyzer adds no per-block
structural overhead because the metric is a byte-span prefix, not a rendered
message price.

## 2. Correction to the experiment brief: the provider is Anthropic Messages

The brief said `llm-deepseek` speaks an OpenAI-compatible chat-completions API.
At `0.2.2-alpha.2` it does not, and a `/chat/completions` stub would have been
rejected before any capture happened:

| Evidence in the checkout | Value |
|---|---|
| `packages/llm/llm-deepseek/src/config.ts` `PUBLIC_BASE_URL` | `https://api.deepseek.com/anthropic` |
| `packages/llm/llm-deepseek/src/messages-api.ts` `messagesApiRoot()` | appends `/v1` unless the base path already ends in `/v1` |
| `packages/llm/llm-deepseek/src/adapter.ts` fetch | `POST ${messagesApiRoot(baseURL)}/messages`, `accept: text/event-stream`, `anthropic-version: 2023-06-01`, optional `anthropic-beta` |
| `packages/llm/llm-deepseek/src/wire-types.ts` | `WireRequest` = `{model, stream, max_tokens, messages, system, thinking, output_config?, tools?}` |
| `packages/llm/llm-deepseek/src/translate.ts` | requires `message_start` → block events → `message_delta.stop_reason` → `message_stop` |

The capture server therefore implements `POST /v1/messages` and the six SSE
events the translator accepts. **The DSH client accepted it on the first run**
(exit 0, synthetic answer printed); no fallback to a lower-level capture was
needed.

## 3. Method

### 3.1 Capture server

`examples/boost/lev6-capture-server.mjs` — zero dependencies, never calls the
network, writes one JSONL record per request and answers with a scripted
Messages stream.

| Route | Meaning |
|---|---|
| `GET /health` | readiness probe; also reports counters and the output path |
| `POST /v1/messages` | arm `unspecified` |
| `POST /<arm>/v1/messages` | arm `<arm>` — the URL path is the arm label |

Each JSONL record carries `seq`, `arm`, `receivedAt`, `method`, `path`,
`headers` (auth values replaced by `<redacted>`), `bodyBytes`, `bodySha256`,
`model`, `sessionId`, `syntheticUsage`, and the exact `rawBody`. Non-Messages
traffic is recorded with `kind: "other"` (0 such requests in this capture), so a
rejected fake provider would be visible rather than silently dropped.

`syntheticUsage` is derived from the request length (`ceil(bodyBytes / 4)`,
output from the reply length) and is labelled as such. It exists to drive DSH's
usage plumbing; the cache counters are explicitly `0` because the server models
no caching.

### 3.2 Pointing DSH at the endpoint

No source change and no credential file: two environment variables the provider
already reads, plus a profile overlay.

| Mechanism | Where it comes from |
|---|---|
| `DEEPSEEK_BASE_URL=http://127.0.0.1:<port>/<arm>` | `BASE_URL_ENV` in `llm-deepseek/src/config.ts`, resolved from the launch environment (`resolveAdapterOptions(config, environment)`) |
| `DEEPSEEK_API_KEY=sk-lev6-fixture-no-real-key` | headless reads credentials from the launch environment (`packages/bundle/headless/README.md`); a blank or header-unsafe key fails `assertUsableApiKey`, any other value passes |
| `DSH_HOME=<temp>/home-a` | isolated profile, sessions, storages — no user state is read |
| `DSH_TELEMETRY_DISABLED=1` | opt out of the OTel exporter |
| `LEV6_PERSONA_PREFIX` | read by the overlay below |

Profile overlay `examples/boost/lev6-arm.patch.yml` (applied with `--patch`,
after the bundle and profile layers):

```yaml
- id: system-prompt
  config:
    includeHarnessIdentity: false          # the persona prefix becomes prompt byte 0
    personaPrefix: !!js process.env.LEV6_PERSONA_PREFIX
- id: session-title-llm
  disabled: true                           # otherwise a second, unrelated request per session
- id: agent-default-model
  config:
    provider: deepseek-official
    model: deepseek-flash
```

Both arms use the same overlay and the same task text
(`Reply with one short sentence.`); they differ only in the persona prefix.

### 3.3 Arms and sessions

| Arm | Persona prefix (first bytes of the system prompt) | Sessions |
|---|---|---|
| `arm-a` | `LEV6 persona prefix: stable benchmark persona.` | 2 fresh sessions, same bytes |
| `arm-b` | `<fresh UUID v4> LEV6 persona prefix: stable benchmark persona.` | 2 fresh sessions, new UUID per run |

Fresh sessions are real: headless creates a new `session-<uuid>` per invocation,
each with its own session log in its `DSH_HOME`; the capture confirms 4 distinct
`x-deepseek-harness-session-id` values for 4 requests.

### 3.4 Analyzer: two prefix views

`examples/boost/lev6-analyze.mjs` is pure (file in, JSON/markdown out):

1. **wire** — the raw HTTP body bytes. This is the literal capture. Note that
   DSH serializes `messages` **before** `system` and `tools`, so this view
   understates a stable system prompt.
2. **promptOrder** — the cacheable prompt in provider order:
   `system` text ‖ tool-schema JSON ‖ messages JSON, no separators. This is a
   documented, deterministic canonicalization of the captured request (not a
   second capture) that mirrors the order a prefix-caching provider hashes.

Both views report: request count, total input bytes/tokens, prefix-reused
bytes/tokens, reuse ratio (reused ÷ the bytes that have a predecessor), and the
first divergence offset. The wire view additionally names the top-level field
that contains the divergence and reports whether the **base request** — every
field before the plugin request extensions — was fully reused.

### 3.5 Local validation

Endpoint smoke test with `curl` (see §7), then two independent replications of
the full experiment on WSL2 Ubuntu 24.04:

| Replication | How | Body sizes (A1/A2/B1/B2) |
|---|---|---|
| R1 | direct `node <dsh>/lib/bin.js --profile headless …` runs, 4 sessions | 63,582 / 63,582 / 63,656 / 63,656 bytes |
| R2 | the CI workflow's `run:` steps executed verbatim by a local harness with a `dsh` shim | 63,568 / 63,568 / 63,642 / 63,642 bytes |

R1 and R2 are **two independent replications of the same experiment — the same
two arms (`arm-a`, `arm-b`) re-executed — not a third and fourth arm.** The
experiment proper has exactly two arms and four sessions; R1/R2 exist only to
show the result repeats across two independent runs of the same code path.

R2 is the committed capture (`capture.jsonl`, `lev6.json`); R1's summary is
[replication-r1.json](replication-r1.json) (its raw capture lived in a scratch
directory and is not committed). The ±14-byte offset between replications is the
length of the workspace path echoed into the runtime context message. Every
conclusion below holds identically in both.

## 4. Results

`40-checker/results/lev6/lev6.json`, capture sha256 `0b5a2e64…`:

| arm | requests | sessions | input bytes | input tokens | wire reused | wire reuse | wire 1st divergence | base request | base fully reused | prompt reused | prompt reuse | prompt 1st divergence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `arm-a` | 2 | 2 | 127,136 | 31,784 | 26,059 B / 6,515 tok | **40.99 %** | 26,059 (`dsh_session_log`) | 25,966 B | **yes (25,966/25,966)** | 25,785 B / 6,447 tok | **100.00 %** | none |
| `arm-b` | 2 | 2 | 127,284 | 31,821 | 4,098 B / 1,025 tok | **6.44 %** | 4,098 (`system`, +0 into the system value) | 26,003 B | no (4,098/26,003) | 0 B / 0 tok | **0.00 %** | **0 (`system`)** |

Per-request facts:

| arm | seq | session | bytes | tokens | base request bytes |
|---|---|---|---|---|---|
| `arm-a` | 1 | `session-83128dee-a158-411f-8ed1-9e60b07ffea7` | 63,568 | 15,892 | 25,966 |
| `arm-a` | 2 | `session-032ee526-b3fb-49ee-a9f0-5f44ba918c71` | 63,568 | 15,892 | 25,966 |
| `arm-b` | 3 | `session-ec7578bc-d8e6-4e94-8384-8a308f6f0172` | 63,642 | 15,911 | 26,003 |
| `arm-b` | 4 | `session-e560bada-6790-4759-9f46-d2302449670d` | 63,642 | 15,911 | 26,003 |

R1 (standalone) gives the same picture: arm A wire reuse 40.99 % (26,063 B),
base 100 % (25,970/25,970), prompt 100 % (25,789/25,789); arm B wire 6.44 %
(4,102 B), prompt 0.00 % with divergence at prompt byte 0.

Assertions (all 11 pass in R1 and R2; the analyzer exits non-zero on failure):

| id | R2 result | detail |
|---|---|---|
| `captures-two-arms` | PASS | `arm-a(2), arm-b(2)` |
| `two-requests-per-arm` | PASS | 2 per arm |
| `fresh-session-per-request` | PASS | 2/2 distinct sessions per arm |
| `same-task-text-per-arm` | PASS | canonical messages identical within each arm |
| `stable-prompt-prefix-reuse` | PASS | arm A prompt reuse 100.00 % (≥ 95 %) |
| `stable-base-request-reused` | PASS | arm A base request 25,966/25,966 B; the wire prefix stops only at `dsh_session_log` |
| `volatile-diverges-at-prompt-byte-zero` | PASS | arm B prompt divergence 0 in `system` (≤ 16) |
| `volatile-prompt-reuse-is-small` | PASS | arm B prompt reuse 0.00 % (≤ 5 %) |
| `volatile-wire-diverges-at-system-prefix-start` | PASS | arm B wire divergence 4,098, i.e. 0 bytes into the system value |
| `volatile-wire-diverges-at-system-field` | PASS | arm B wire divergence field = `system` |
| `arms-are-distinguishable` | PASS | prompt reuse gap 100.00 pp (≥ 50 pp) |

## 5. Where the 63.5 KB goes — request anatomy

From `capture-sample.json` (arm A, seq 1). Top-level fields, in wire order and
byte size:

| # | field | offset | bytes | kind |
|---|---|---|---|---|
| 1 | `model` | 1 | 16 | base |
| 2 | `stream` | 26 | 4 | base |
| 3 | `messages` | 40 | 3,952 | base |
| 4 | `max_tokens` | 4,004 | 6 | base |
| 5 | `thinking` | 4,024 | 18 | base |
| 6 | `output_config` | 4,054 | 17 | base |
| 7 | `system` | 4,088 | 2,665 (text 2,639) | base |
| 8 | `tools` | 6,763 | 19,194 (24 tools) | base |
| 9 | `dsh_session_log` | 25,966 | 31,509 | extension |
| 10 | `dsh_plugin_packages` | 57,494 | 6,051 (87 packages) | extension |

Two facts follow directly, and they matter for LEV-6:

1. **The base request is the stable unit, and it is only 41 % of the bytes.**
   The remaining 59 % (37,602 B) are plugin request extensions appended by
   `prepareRequestExtensions` (`JSON.stringify({ ...body, ...fields })`). The
   `dsh_session_log` field carries the session envelope (`session.id`,
   `createdAt`, `cwd`) and therefore differs between every fresh session; the
   `dsh_plugin_packages` inventory is constant for one installation.
2. **`dsh_session_log` re-sends much of the request.** Its 14 wire events
   include a 2,826-byte `system/message` copy of the system prompt, a
   19,357-byte `request/header` copy of the tool schemas, and 152 + 1,526 +
   5,845-byte `user/message` copies — i.e. the payload is duplicated behind a
   per-session identifier. Whether a provider charges for these bytes is a
   provider-side billing question this experiment does not answer; what is
   measured is that DSH assembles and sends them.

Event breakdown of `dsh_session_log` in this request:
`permission/preset` 28 · `sandbox/mode` 26 · `approval/policy` 16 ·
`agent/inbox/spliced` 198 + 63 · `turn/start` 10 · `step/start` 19 ·
`system/message` 2,826 · `user/message` 152 + 1,526 + 5,845 ·
`request/header` 19,357 · `request/context` 115 · `session/title` 89.

Headers of the same request:

```http
POST /arm-a/v1/messages HTTP/1.1
host: 127.0.0.1:8787
connection: keep-alive
user-agent: deepseek-harness/0.2.2-alpha.2 (+https://github.com/deepseek-ai/deepseek-harness)
content-type: application/json
accept: text/event-stream
x-api-key: <redacted>
anthropic-version: 2023-06-01
x-deepseek-harness-user-id: ff34d592-c014-43a0-aacd-fae009d599c7
x-deepseek-harness-session-id: session-83128dee-a158-411f-8ed1-9e60b07ffea7
accept-language: *
sec-fetch-mode: cors
accept-encoding: gzip, deflate
content-length: 63568
```

No `anthropic-beta` header was needed: no file API, no in-history tool changes.

## 6. What this means for the LEV-6 practice

- **A stable system prefix is achievable and byte-exact.** With the same
  persona and the same task, two fresh sessions assemble a base request that is
  byte-identical (25,966/25,966 B), including the 24 tool schemas and the
  system prompt. Nothing volatile leaks into `system`, `tools`, or `messages`
  in this composition — no clock, no session id, no port, no cwd inside the
  prompt (the cwd appears in the runtime-context *context* message, which is
  stable for a fixed workspace).
- **One nonce at the first prompt byte erases the whole prompt prefix.** Arm B
  diverges at prompt byte 0 and reuses nothing, even though the rest of the
  system prompt, all 24 tool schemas, and the entire message list are
  unchanged. The lesson for plugin authors is the one LEV-6 states: put
  per-run values in runtime context (a separate user-role snapshot), never in
  the persona/system prefix.
- **Raw request bytes are the wrong prefix model for this harness.** DSH
  appends `dsh_session_log` *after* the base request, and that field carries
  the session id. A provider that cached raw HTTP bytes would stop at byte
  25,966 regardless of how stable the prompt is (hence A's 40.99 %); a
  provider that caches the semantic prompt (system → tools → messages) would
  see the full 25,785 bytes (100 %). The `promptOrder` view exists so the two
  effects are not confused. Neither view is a measured cache hit.
- **The JSON key order is a trap when auditing this by hand.** `system` is
  serialized after `messages` (offset 4,088 of 63,568), so a naive "first
  differing byte" reading of a volatile *system* prefix reports ~4 KB instead
  of the 2.6 KB prompt. The analyzer therefore reports both the wire offset and
  the offset inside the system value (`+0` for arm B).

## 7. Recorded sample request

Endpoint validation with `curl` (arm route, hand-written 194-byte body). Nothing
is redacted for sensitivity: the only key involved is the fixture value
`sk-lev6-curl-sample-not-a-real-key`, redacted by the server's header policy.

```console
$ curl -sS -D - -X POST http://127.0.0.1:8798/arm-a/v1/messages \
    -H 'content-type: application/json' \
    -H 'x-api-key: sk-lev6-curl-sample-not-a-real-key' \
    -H 'anthropic-version: 2023-06-01' \
    --data '{"model":"deepseek-flash","stream":true,"max_tokens":64,
             "messages":[{"role":"user","content":[{"type":"text","text":"Say hi."}]}],
             "system":"You are a test agent.","thinking":{"type":"disabled"}}'
HTTP/1.1 200 OK
content-type: text/event-stream; charset=utf-8
cache-control: no-cache, no-transform
connection: keep-alive
x-lev6-capture: synthetic

event: message_start
data: {"type":"message_start","message":{"id":"msg_lev6_synthetic","type":"message","role":"assistant","model":"deepseek-flash","content":[],"usage":{"input_tokens":49,"output_tokens":0,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"LEV6 synthetic reply (no model was called)."}}

event: content_block_stop
event: message_delta … {"stop_reason":"end_turn","usage":{"output_tokens":11}}
event: message_stop
```

The record written for it (`rawBody`, byte-exact):

```json
{"model":"deepseek-flash","stream":true,"max_tokens":64,"messages":[{"role":"user","content":[{"type":"text","text":"Say hi."}]}],"system":"You are a test agent.","thinking":{"type":"disabled"}}
```

`bodyBytes: 194`, `bodySha256: 56f65947…`, `syntheticUsage.input_tokens: 49`.
The real DSH request from the experiment is in
[capture-sample.json](capture-sample.json) (field table, headers, event
breakdown, first 1,600 bytes) and verbatim in [capture.jsonl](capture.jsonl).

## 8. CI: exact command and artifacts

Workflow: [.github/workflows/lev6-capture.yml](../../../.github/workflows/lev6-capture.yml),
manual trigger only.

```console
gh workflow run lev6-capture.yml          # or: Actions → lev6-capture → Run workflow
gh run watch
gh run download <run-id> -n lev6-capture
```

What the job does, in order: Node 24 + `npm install --global
@deepseek-ai/dsh@0.2.2-alpha.2` → start the capture server on
`127.0.0.1:8787` (`--reset`, so each run starts empty) and wait for `/health` →
in an **empty workspace** under the runner temp dir, run `dsh --profile headless
--patch examples/boost/lev6-arm.patch.yml "Reply with one short sentence."`
twice for `arm-a` (constant persona) and twice for `arm-b` (fresh
`crypto.randomUUID()` per run), each arm with its own `DSH_HOME` → stop the
server → run the analyzer with `--assert` → publish the markdown table to the
job page → upload the artifact even if assertions fail → fail the job if the
analyzer exited non-zero.

The artifact `lev6-capture` contains `capture.jsonl`, `lev6.json` (written by CI
as `summary.json`; same object), `summary.md`, `server.out`, `server.err`, the
four `stdout-*.txt` / `stderr-*.txt` pairs, `nonces.txt`, and the recorded
toolchain versions.

## 9. Limitations and non-claims

- **Synthetic model.** The server returns a fixed text block; no model ran.
  Tool-call streaming, thinking blocks, and multi-turn tool loops are not
  exercised, so this says nothing about those paths' assembly.
- **No provider, no cache, no billing.** No provider cache was hit or
  emulated; the `usage` counters are derived from request bytes and the cache
  counters are zero. "Reuse ratio" here is a byte-prefix property of two
  assembled requests, not a cache hit rate and not money.
- **`promptOrder` is a model.** It is a deterministic canonicalization
  (`system` ‖ tools ‖ messages) of the captured bytes. A real provider may
  serialize tool schemas differently; the view is labelled and never mixed with
  the raw capture.
- **Framework fields are unverified against the official gateway.** The
  `dsh_session_log` and `dsh_plugin_packages` extensions are what DSH assembles
  for the official route in this composition; whether `api.deepseek.com`
  accepts or bills them was not tested (no request left the machine).
- **Composition deviations, both arms equally:** `session-title-llm` is
  disabled (it would add a second, differently-shaped request per session, and
  the capture would mix two request kinds), and `includeHarnessIdentity` is off
  so the configurable persona is prompt byte 0 (the shipped headless profile
  starts with a fixed identity section). Restoring the default would move arm
  B's divergence to the persona section offset, not to 0, without changing the
  conclusion.
- **Two sessions per arm, one task, one host.** Linux/WSL2 locally and
  `ubuntu-latest` in CI; no Windows/macOS run. Byte counts shift with the
  workspace path length (observed ±14 bytes), which is why the assertions are
  relative, not absolute.
- **Session identity drives the wire boundary.** The `dsh_session_log`
  envelope means the wire prefix can never reach 100 % across fresh sessions,
  even for a perfect prefix. That is a property of this DSH composition, and
  the report states it rather than hiding it behind the prompt-order number.

## 10. Reproduction (local)

```sh
# 1. install the anchor (CI installs globally; locally a project install is fine)
npm install @deepseek-ai/dsh@0.2.2-alpha.2

# 2. capture server
node examples/boost/lev6-capture-server.mjs \
  --port 8787 --out capture.jsonl --reset &

# 3. two fresh sessions per arm, empty workspace, isolated homes
mkdir -p /tmp/lev6/workspace
for run in 1 2; do
  ( cd /tmp/lev6/workspace && \
    DSH_HOME=/tmp/lev6/home-a \
    DEEPSEEK_API_KEY=sk-lev6-fixture-no-real-key \
    DEEPSEEK_BASE_URL=http://127.0.0.1:8787/arm-a \
    DSH_TELEMETRY_DISABLED=1 \
    LEV6_PERSONA_PREFIX='LEV6 persona prefix: stable benchmark persona.' \
    dsh --profile headless --patch "$PWD/examples/boost/lev6-arm.patch.yml" \
        'Reply with one short sentence.' )
done
for run in 1 2; do
  nonce="$(node -p 'crypto.randomUUID()')"
  ( cd /tmp/lev6/workspace && \
    DSH_HOME=/tmp/lev6/home-b \
    DEEPSEEK_API_KEY=sk-lev6-fixture-no-real-key \
    DEEPSEEK_BASE_URL=http://127.0.0.1:8787/arm-b \
    DSH_TELEMETRY_DISABLED=1 \
    LEV6_PERSONA_PREFIX="$nonce LEV6 persona prefix: stable benchmark persona." \
    dsh --profile headless --patch "$PWD/examples/boost/lev6-arm.patch.yml" \
        'Reply with one short sentence.' )
done

# 4. pure analysis (exit 1 if an expectation fails)
node examples/boost/lev6-analyze.mjs \
  --capture capture.jsonl --out lev6.json --markdown summary.md --assert
```

---

## CI replication (2026-11-01)

`lev6-capture` run [41218936165](https://github.com/PerryLink/dsh-standards/actions/runs/41218936165)
completed with the analyzer's 11/11 assertions:

| arm | wire reuse | base request fully reused | prompt-order reuse | prompt first divergence |
|---|---|---|---|---|
| arm-a (stable) | 42.05% (22,855 B) | yes, 22,762/22,762 B | **100.00%** (22,581 B) | none |
| arm-b (per-run nonce) | 1.64% (894 B) | no | **0.00%** (0 B) | **0 (`system`)** |

Absolute byte counts differ from the committed capture because the CI workspace
path and profile layers change the serialized prefix; the relative result and the
falsification are identical. Artifact: `lev6-capture` (run 41218936165).

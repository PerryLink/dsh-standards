#!/usr/bin/env node
/**
 * Real-browser probe for the DSH Web host page.
 *
 * Opens the token URL printed by `dsh --profile <name> ...`, lets the browser
 * exchange the per-process launch token for the signed `dsh-auth-*` cookie,
 * waits for the composed client graph and for the boot page to be replaced by
 * the mounted application, then records console/page errors, failed same-origin
 * JavaScript requests, the `window.__DSH_BOOT__` wire graph, and resource
 * timings for the expected package bundles.
 *
 * This probes the client *module loading path* in a real browser. It does not
 * prove any plugin slot is visually correct; call a passing row
 * `client-module-loaded`, not `UI-rendered`.
 *
 * Usage:
 *   node web-probe.mjs --url <token-url> --expect pkg-a,pkg-b \
 *     --out result.json --screenshot shot.png
 *
 * Optional:
 *   --login-file <file>   Username/password bootstrap file for a gated app
 *                         (dsh-ui-auth). The probe logs in through
 *                         POST /auth/login before opening the token URL.
 *   --executable <path>   Explicit Chromium executable (local runs without a
 *                         Playwright-managed browser).
 *   --timeout <ms>        Total wait budget for graph + mount (default 90000).
 *
 * Exit codes: 0 ok, 1 probe failure, 2 usage error.
 *
 * The token URL is treated as a credential: it is never written to the result
 * JSON and never printed by this script.
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const SCHEMA = 'dsh-web-probe/1'
export const DEFAULT_TIMEOUT_MS = 90_000
const GRAPH_WAIT_MS = 30_000
const LOGIN_PATH = '/auth/login'

/**
 * Split a comma-separated `--expect` value into package ids.
 * @param {string} value - raw comma-separated value.
 * @returns {string[]} trimmed, non-empty ids.
 */
export function parseExpected(value) {
  if (typeof value !== 'string') return []
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

/**
 * Parse the first-run credential file written by dsh-ui-auth.
 *
 * Accepts either JSON (`{"username":"...","password":"..."}`) or the shipped
 * text form:
 *   用户名: admin
 *   密码:   secret
 *
 * @param {string} text - file contents.
 * @returns {{username: string, password: string}} parsed credentials.
 * @throws {Error} when either field is absent.
 */
export function parseCredentialFile(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('credential file is empty')
  }
  try {
    const parsed = JSON.parse(text)
    if (parsed !== null && typeof parsed === 'object'
      && typeof parsed.username === 'string' && typeof parsed.password === 'string') {
      return { username: parsed.username, password: parsed.password }
    }
  } catch {
    // Not JSON; fall through to the shipped text format.
  }
  const username = /用户名\s*[:：]\s*(\S+)/u.exec(text)?.[1]
  const password = /密码\s*[:：]\s*(\S+)/u.exec(text)?.[1]
  if (username === undefined || password === undefined) {
    throw new Error('credential file has no username/password pair')
  }
  return { username, password }
}

/**
 * Pure projection of the `window.__DSH_BOOT__` wire graph and resource timings.
 *
 * Kept free of browser imports so it can be exercised by a Node fixture.
 *
 * @param {unknown} wire - raw `window.__DSH_BOOT__` value (undefined when absent).
 * @param {string[]} expected - package ids that must appear in the graph.
 * @param {string[]} resourceUrls - `performance.getEntriesByType('resource')` names.
 * @returns {{
 *   bootGraph: 'ok'|'missing'|'invalid',
 *   bootRev: string|null,
 *   bootIds: string[],
 *   loadedEntries: string[],
 *   missingEntries: string[],
 *   rows: Array<{id: string, booted: boolean, loaded: boolean, url: string|null, matchedResource: string|null}>,
 *   error?: string,
 * }} normalized projection.
 */
export function summarizeBootGraph(wire, expected = [], resourceUrls = []) {
  const ids = Array.isArray(expected) ? expected.filter(id => typeof id === 'string' && id !== '') : []
  const resources = Array.isArray(resourceUrls) ? resourceUrls.filter(url => typeof url === 'string') : []
  const empty = {
    bootGraph: 'missing',
    bootRev: null,
    bootIds: [],
    loadedEntries: [],
    missingEntries: [...ids],
    rows: ids.map(id => ({ id, booted: false, loaded: false, url: null, matchedResource: null })),
  }
  if (wire === undefined || wire === null) return empty
  if (typeof wire !== 'object' || !Array.isArray(/** @type {any} */ (wire).entries)) {
    return { ...empty, bootGraph: 'invalid', error: 'window.__DSH_BOOT__.entries is not an array' }
  }
  const graph = /** @type {any} */ (wire)
  const entries = graph.entries.filter(entry => entry !== null && typeof entry === 'object' && typeof entry.id === 'string')
  const bootIds = entries.map(entry => entry.id)
  const rows = ids.map(id => {
    const entry = entries.find(candidate => candidate.id === id)
    if (entry === undefined) {
      return { id, booted: false, loaded: false, url: null, matchedResource: null }
    }
    const entryUrl = typeof entry.url === 'string' ? entry.url : null
    const encoded = encodeURIComponent(id)
    const candidates = [entryUrl, id, encoded].filter(value => typeof value === 'string' && value !== '')
    const matchedResource = resources.find(url => candidates.some(candidate => url.includes(candidate))) ?? null
    return {
      id,
      booted: true,
      loaded: matchedResource !== null,
      url: entryUrl,
      matchedResource,
    }
  })
  return {
    bootGraph: 'ok',
    bootRev: typeof graph.rev === 'string' ? graph.rev : null,
    bootIds,
    loadedEntries: rows.filter(row => row.loaded).map(row => row.id),
    missingEntries: rows.filter(row => !row.booted).map(row => row.id),
    rows,
  }
}

/**
 * Parse probe argv.
 * @param {string[]} argv - arguments after `node script`.
 * @returns {object} parsed options.
 */
function parseArgs(argv) {
  const options = {
    url: null,
    expect: [],
    out: null,
    screenshot: null,
    loginFile: null,
    executable: null,
    timeout: DEFAULT_TIMEOUT_MS,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') {
      options.help = true
      continue
    }
    const equals = token.indexOf('=')
    const key = equals === -1 ? token : token.slice(0, equals)
    const value = () => {
      if (equals !== -1) return token.slice(equals + 1)
      const next = argv[index + 1]
      if (next === undefined) throw new Error(`${key} needs a value`)
      index += 1
      return next
    }
    switch (key) {
      case '--url': options.url = value(); break
      case '--expect': options.expect.push(...parseExpected(value())); break
      case '--out': options.out = value(); break
      case '--screenshot': options.screenshot = value(); break
      case '--login-file': options.loginFile = value(); break
      case '--executable': options.executable = value(); break
      case '--timeout': {
        const parsed = Number(value())
        if (!Number.isFinite(parsed) || parsed < 1000) throw new Error('--timeout must be >= 1000 ms')
        options.timeout = parsed
        break
      }
      default: throw new Error(`unknown argument ${token}`)
    }
  }
  if (options.help) return options
  if (options.url === null) throw new Error('--url is required')
  if (options.out === null) throw new Error('--out is required')
  options.expect = [...new Set(options.expect)]
  if (options.screenshot === null) options.screenshot = options.out.replace(/\.json$/u, '') + '.png'
  return options
}

/** Create the parent directory of a file path. */
function ensureParent(file) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
}

/** Write the result JSON. */
function writeResult(file, result) {
  ensureParent(file)
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n')
}

/** Redact a token-bearing URL for logs and JSON. */
function redactUrl(value) {
  if (typeof value !== 'string') return value
  return value.replace(/([?&]token=)[^&\s]+/gu, '$1<redacted>')
}

/** Truncate a string for diagnostics. */
function truncate(value, limit) {
  if (typeof value !== 'string') return ''
  return value.length > limit ? value.slice(0, limit) + '…' : value
}

/**
 * Decide whether a request is a same-origin JavaScript request worth reporting.
 * @param {string} url - request URL.
 * @param {string} origin - page origin.
 * @param {string} resourceType - Playwright resource type.
 * @returns {boolean} true for same-origin JavaScript.
 */
function isSameOriginJs(url, origin, resourceType) {
  if (resourceType !== 'script') return false
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

/** Run the browser probe and return the result object. */
async function probe(options) {
  const started = Date.now()
  const expected = options.expect
  const result = {
    schema: SCHEMA,
    ok: false,
    expected,
    expectedEntries: Object.fromEntries(expected.map(id => [id, false])),
    bootGraph: 'missing',
    bootRev: null,
    bootIds: [],
    loadedEntries: [],
    notLoadedEntries: [],
    missingEntries: [...expected],
    entries: [],
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    failedRequests: [],
    login: null,
    loginError: null,
    navigationStatus: null,
    finalUrl: null,
    title: null,
    rootChildren: 0,
    bootPageVisible: true,
    bootPageText: '',
    bodyTextLength: 0,
    bodyText: '',
    screenshot: path.resolve(options.screenshot),
    elapsedMs: 0,
    error: null,
  }

  let browser
  let page
  try {
    const { chromium } = await import('playwright')
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    }
    if (options.executable !== null) launchOptions.executablePath = options.executable
    browser = await chromium.launch(launchOptions)
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const origin = new URL(options.url).origin

    // A gated app (dsh-ui-auth) answers the token URL with a login redirect
    // before the host token exchange. Log in first so the page reaches the real
    // shell; the cookie jar is shared by context.request and the browser page.
    if (options.loginFile !== null) {
      try {
        const credentials = parseCredentialFile(fs.readFileSync(options.loginFile, 'utf8'))
        const response = await context.request.post(new URL(LOGIN_PATH, origin).href, {
          data: { username: credentials.username, password: credentials.password, totp: '' },
          failOnStatusCode: false,
          timeout: 30_000,
        })
        const body = await response.text()
        let parsed
        try { parsed = JSON.parse(body) } catch { parsed = null }
        result.login = {
          path: LOGIN_PATH,
          status: response.status(),
          ok: response.status() === 200 && parsed?.ok === true,
        }
        if (!result.login.ok) {
          result.loginError = `POST ${LOGIN_PATH} returned ${response.status()}: ${truncate(body, 300)}`
        }
      } catch (error) {
        result.loginError = `login failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }

    page = await context.newPage()
    page.on('console', message => {
      const type = message.type()
      if (type !== 'error' && type !== 'warning') return
      const entry = {
        type,
        text: truncate(message.text(), 4000),
        url: message.location().url ?? null,
        lineNumber: message.location().lineNumber ?? null,
      }
      if (type === 'error') result.consoleErrors.push(entry)
      else result.consoleWarnings.push(entry)
    })
    page.on('pageerror', error => {
      result.pageErrors.push({
        message: truncate(error instanceof Error ? error.message : String(error), 4000),
        stack: truncate(error instanceof Error ? (error.stack ?? '') : '', 6000),
      })
    })
    page.on('requestfailed', request => {
      if (!isSameOriginJs(request.url(), origin, request.resourceType())) return
      result.failedRequests.push({
        url: request.url(),
        resourceType: request.resourceType(),
        status: null,
        failure: truncate(request.failure()?.errorText ?? 'request failed', 500),
      })
    })
    page.on('response', response => {
      if (response.status() < 400) return
      const request = response.request()
      if (!isSameOriginJs(response.url(), origin, request.resourceType())) return
      if (result.failedRequests.some(item => item.url === response.url())) return
      result.failedRequests.push({
        url: response.url(),
        resourceType: request.resourceType(),
        status: response.status(),
        failure: null,
      })
    })

    const navigation = await page.goto(options.url, {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(options.timeout, 60_000),
    })
    result.navigationStatus = navigation?.status() ?? null

    let bootWire
    try {
      await page.waitForFunction(
        () => globalThis.__DSH_BOOT__ !== undefined && globalThis.__DSH_BOOT__ !== null,
        null,
        { timeout: Math.min(options.timeout, GRAPH_WAIT_MS) },
      )
      // The waitForFunction handle is the boolean predicate, not the graph.
      bootWire = await page.evaluate(() => globalThis.__DSH_BOOT__)
    } catch {
      bootWire = undefined
    }
    const boot = summarizeBootGraph(bootWire, expected, [])
    result.bootGraph = boot.bootGraph
    result.bootRev = boot.bootRev
    result.bootIds = boot.bootIds
    result.missingEntries = boot.missingEntries
    result.expectedEntries = Object.fromEntries(boot.rows.map(row => [row.id, row.booted]))

    if (boot.bootGraph === 'ok') {
      const remaining = Math.max(5_000, options.timeout - (Date.now() - started))
      try {
        await page.waitForFunction(
          () => {
            const root = document.querySelector('#root')
            return root !== null && root.children.length > 0
              && root.querySelector('[data-dsh-boot]') === null
          },
          null,
          { timeout: remaining },
        )
      } catch {
        // The boot page may still be visible; the snapshot below captures its text.
      }
    }

    const snapshot = await page.evaluate(() => {
      const root = document.querySelector('#root')
      const bootPage = root?.querySelector('[data-dsh-boot]') ?? null
      const bodyText = document.body !== null ? (document.body.innerText ?? '') : ''
      return {
        rootChildren: root !== null ? root.children.length : 0,
        bootPageVisible: bootPage !== null,
        bootPageText: (bootPage !== null ? bootPage.textContent : '') ?? '',
        bodyText,
        bodyTextLength: bodyText.length,
        resources: performance.getEntriesByType('resource').map(entry => entry.name),
      }
    })

    const projection = summarizeBootGraph(bootWire, expected, snapshot.resources)
    result.entries = projection.rows
    result.loadedEntries = projection.loadedEntries
    result.notLoadedEntries = projection.rows.filter(row => row.booted && !row.loaded).map(row => row.id)
    result.missingEntries = projection.missingEntries
    result.expectedEntries = Object.fromEntries(projection.rows.map(row => [row.id, row.booted]))
    result.finalUrl = redactUrl(page.url())
    result.title = await page.title()
    result.rootChildren = snapshot.rootChildren
    result.bootPageVisible = snapshot.bootPageVisible
    result.bootPageText = truncate(snapshot.bootPageText, 4000)
    result.bodyTextLength = snapshot.bodyTextLength
    result.bodyText = truncate(snapshot.bodyText, 2000)

    result.ok = projection.bootGraph === 'ok'
      && projection.missingEntries.length === 0
      && result.notLoadedEntries.length === 0
      && result.consoleErrors.length === 0
      && result.pageErrors.length === 0
      && result.failedRequests.length === 0
      && result.rootChildren > 0
      && result.bootPageVisible === false
      && result.loginError === null
  } catch (error) {
    result.error = error instanceof Error ? (error.stack ?? error.message) : String(error)
  } finally {
    if (page !== undefined) {
      try {
        ensureParent(options.screenshot)
        await page.screenshot({ path: options.screenshot, fullPage: true, timeout: 15_000 })
      } catch (error) {
        result.screenshotError = error instanceof Error ? error.message : String(error)
      }
    }
    result.elapsedMs = Date.now() - started
    result.screenshot = path.resolve(options.screenshot)
    try {
      if (browser !== undefined) await browser.close()
    } catch {
      // A failed close must not hide the probe result.
    }
    if (result.error !== null) result.ok = false
    if (typeof result.error === 'string') result.error = redactUrl(result.error)
    if (typeof result.loginError === 'string') result.loginError = redactUrl(result.loginError)
    result.url = redactUrl(options.url)
    result.generatedAt = new Date().toISOString()
    writeResult(options.out, result)
  }
  return result
}

/** CLI entry point. */
async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`web-probe: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
    return
  }
  if (options.help) {
    console.log('usage: node web-probe.mjs --url <token-url> --out <json> [--expect pkg1,pkg2]')
    console.log('       [--screenshot <png>] [--login-file <file>] [--executable <path>] [--timeout <ms>]')
    return
  }
  const result = await probe(options)
  if (!result.ok) {
    const reasons = []
    if (result.error) reasons.push(result.error.split('\n')[0])
    if (result.bootGraph !== 'ok') reasons.push(`boot graph ${result.bootGraph}`)
    if (result.missingEntries.length > 0) reasons.push(`missing entries: ${result.missingEntries.join(', ')}`)
    if (result.notLoadedEntries.length > 0) reasons.push(`no resource observed: ${result.notLoadedEntries.join(', ')}`)
    if (result.failedRequests.length > 0) reasons.push(`${result.failedRequests.length} failed script request(s)`)
    if (result.consoleErrors.length > 0) reasons.push(`${result.consoleErrors.length} console error(s)`)
    if (result.pageErrors.length > 0) reasons.push(`${result.pageErrors.length} page error(s)`)
    if (result.rootChildren === 0) reasons.push('#root has no children')
    if (result.bootPageVisible) reasons.push('boot page still visible')
    if (result.loginError !== null) reasons.push(`login: ${result.loginError}`)
    console.error(`web-probe: FAIL (${reasons.join('; ')})`)
    console.error(`web-probe: result ${path.resolve(options.out)}`)
    process.exitCode = 1
    return
  }
  console.log(`web-probe: PASS ${result.expected.join(', ')} (${result.elapsedMs} ms, ${result.loadedEntries.length}/${result.expected.length} resource(s) observed)`)
}

const invoked = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invoked) await main()

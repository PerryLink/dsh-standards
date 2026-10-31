#!/usr/bin/env node
/**
 * web-probe.mjs — real-browser evidence for a DSH Web profile.
 *
 * Opens the token URL printed by `dsh web`, lets the browser exchange it for the
 * signed cookie, waits for the client boot graph and the mounted shell, and
 * records what actually happened. It is deliberately strict about the things a
 * static check cannot see: console errors, page errors, failed module requests,
 * the composed `window.__DSH_BOOT__` roster, and a non-empty `#root`.
 *
 * Usage:
 *   node 40-checker/scripts/web-probe.mjs \
 *     --url "http://127.0.0.1:18770/?token=..." \
 *     --expect "dsh-ui-auth" \
 *     --out result.json --screenshot shot.png
 *
 * Exit codes: 0 ok, 1 probe failure, 2 usage error, 3 Playwright unavailable.
 *
 * What a pass does and does not mean:
 * - pass: the expected package is in the host's client roster, the shell
 *   mounted, and the page produced no console/page errors during boot;
 * - not claimed: every plugin's visual slot is correct. This is
 *   `client-module-loaded`, not a UI pixel review.
 */
import fs from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const options = { url: null, expect: [], out: null, screenshot: null, timeout: 90_000, headed: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      i += 1
      return value
    }
    if (arg === '--url') options.url = next()
    else if (arg === '--expect') options.expect = next().split(',').map(s => s.trim()).filter(Boolean)
    else if (arg === '--out') options.out = next()
    else if (arg === '--screenshot') options.screenshot = next()
    else if (arg === '--timeout') options.timeout = Number(next())
    else if (arg === '--headed') options.headed = true
    else if (arg === '--help' || arg === '-h') { console.log('usage: node web-probe.mjs --url <token-url> --expect <pkg[,pkg]> --out <json> [--screenshot <png>] [--timeout <ms>]'); process.exit(0) }
    else throw new Error(`unknown option: ${arg}`)
  }
  if (!options.url) throw new Error('--url is required')
  // An empty --expect is meaningful: it still proves the shell mounts with the
  // plugin installed, for packages that declare no `./client` export.
  if (!Number.isFinite(options.timeout) || options.timeout < 1000) throw new Error('--timeout must be >= 1000')
  return options
}

/** Keep only fields useful for evidence; never persist cookies or tokens. */
function summarizeUrl(raw) {
  try {
    const url = new URL(raw)
    return { origin: url.origin, pathname: url.pathname, hasToken: url.searchParams.has('token') }
  } catch {
    return { invalid: true }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const startedAt = new Date()
  const result = {
    schema: 'dsh-web-probe/1',
    startedAt: startedAt.toISOString(),
    url: summarizeUrl(options.url),
    expected: options.expect,
    ok: false,
    bootGraph: 'missing',
    bootIds: [],
    expectedEntries: Object.fromEntries(options.expect.map(id => [id, false])),
    loadedEntries: [],
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    failedRequests: [],
    rootChildren: 0,
    title: null,
    bodyTextLength: 0,
    bodyTextHead: '',
    screenshot: options.screenshot ?? null,
    elapsedMs: 0,
    error: null,
  }

  let browser
  try {
    const { chromium } = await import('playwright')
    browser = await chromium.launch({ headless: !options.headed })
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()

    page.on('console', (message) => {
      if (message.type() === 'error') result.consoleErrors.push(message.text())
      else if (message.type() === 'warning') result.consoleWarnings.push(message.text())
    })
    page.on('pageerror', (error) => result.pageErrors.push(String(error)))
    page.on('requestfailed', (request) => {
      result.failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? null })
    })
    page.on('response', (response) => {
      if (response.status() >= 400 && response.request().resourceType() === 'script') {
        result.failedRequests.push({ url: response.url(), status: response.status() })
      }
    })

    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: options.timeout })

    // The host injects the composed client roster into the document. If it is
    // absent, the page never reached the real shell; record the boot-page text.
    try {
      await page.waitForFunction(() => globalThis.__DSH_BOOT__ !== undefined, undefined, { timeout: Math.min(options.timeout, 60_000) })
      result.bootGraph = 'present'
    } catch {
      result.bootGraph = 'missing'
    }

    // The shell mount replaces the boot page. Give client plugins a bounded
    // window to activate; a plugin that throws leaves the boot page visible.
    try {
      await page.waitForFunction(() => {
        const root = document.querySelector('#root')
        return root !== null && root.children.length > 0
      }, undefined, { timeout: Math.min(options.timeout, 60_000) })
    } catch {
      // Captured below as rootChildren === 0 with the boot-page text.
    }

    // Let late plugin activation and the first paint settle without waiting for
    // network idle (the app may keep a long-lived connection open).
    await page.waitForTimeout(3000)

    const snapshot = await page.evaluate(() => {
      const graph = globalThis.__DSH_BOOT__
      const entries = Array.isArray(graph?.entries) ? graph.entries : []
      const resources = performance.getEntriesByType('resource').map(entry => entry.name)
      const root = document.querySelector('#root')
      return {
        bootIds: entries.map(entry => entry.id),
        entryUrls: Object.fromEntries(entries.map(entry => [entry.id, entry.url])),
        resources,
        rootChildren: root?.children.length ?? 0,
        title: document.title,
        bodyText: (document.body?.innerText ?? '').slice(0, 2000),
      }
    })

    result.bootIds = snapshot.bootIds
    result.title = snapshot.title
    result.rootChildren = snapshot.rootChildren
    result.bodyTextLength = snapshot.bodyText.length
    result.bodyTextHead = snapshot.bodyText.slice(0, 500)
    result.expectedEntries = Object.fromEntries(options.expect.map(id => [id, snapshot.bootIds.includes(id)]))
    result.loadedEntries = options.expect.map((id) => {
      const url = snapshot.entryUrls[id]
      return {
        id,
        bootUrl: url ?? null,
        resourceSeen: url === undefined ? false : snapshot.resources.some(name => name.includes(url) || name.includes(id)),
      }
    })

    if (options.screenshot) {
      fs.mkdirSync(path.dirname(path.resolve(options.screenshot)), { recursive: true })
      await page.screenshot({ path: options.screenshot, fullPage: false })
    }

    const missing = options.expect.filter(id => !result.expectedEntries[id])
    result.ok = result.bootGraph === 'present'
      && missing.length === 0
      && result.consoleErrors.length === 0
      && result.pageErrors.length === 0
      && result.rootChildren > 0
    if (!result.ok) {
      result.error = result.bootGraph !== 'present'
        ? 'window.__DSH_BOOT__ was not injected'
        : missing.length > 0
          ? `expected client entries missing from boot graph: ${missing.join(', ')}`
          : result.rootChildren === 0
            ? 'the shell never mounted (#root has no children)'
            : 'console/page errors occurred during boot'
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
  } finally {
    await browser?.close().catch(() => {})
    result.elapsedMs = Date.now() - startedAt.getTime()
    result.finishedAt = new Date().toISOString()
    const output = JSON.stringify(result, null, 2)
    if (options.out) {
      fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true })
      fs.writeFileSync(options.out, `${output}\n`)
    }
    console.log(output)
  }

  process.exit(result.ok ? 0 : result.error?.includes('Cannot find package') ? 3 : 1)
}

try {
  await main()
} catch (error) {
  console.error(`web-probe: ${error.message}`)
  process.exit(2)
}

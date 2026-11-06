#!/usr/bin/env node
// Public umbrella entry point for the DSH standards checker.
// The implementation lives in 40-checker/; this shim keeps the package-level
// command stable while the checker remains independently runnable from source.
//
//   dsh-standards check [dir]   author-facing Markdown / --json / --html report
//   dsh-standards <dir>         raw checker report (backwards compatible)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'))
const argv = process.argv.slice(2)

if (argv.includes('--version') || argv.includes('-v')) {
  console.log(`dsh-standards ${pkg.version} (checker 0.1.0)`)
  process.exit(0)
}

if (argv[0] === 'check') {
  const { runCheck } = await import('../40-checker/src/author-cli.mjs')
  const code = await runCheck(argv.slice(1))
  process.exitCode = code
  // The checker may have imported a plugin; do not let stray handles hang us.
  setTimeout(() => process.exit(code), 250)
} else {
  process.env.DSH_CHECKER_BRAND = `dsh-standards ${pkg.version} (checker 0.1.0)`
  await import('../40-checker/bin/dsh-plugin-verify.mjs')
}

// Runs the checker tests when the dev-only test tree is present. The npm package
// does not ship 40-checker/test, so an installed copy must not fail `npm test`
// on a missing directory.
import { existsSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dirs = [join(here, '..', 'test'), join(here, '..', '..', 'test')]
const files = dirs.filter((dir) => existsSync(dir)).flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).map((f) => join(dir, f)))
if (files.length === 0) {
  console.log('checker tests are not shipped in the npm package; nothing to run')
  process.exit(0)
}
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' })
process.exit(r.status ?? 1)

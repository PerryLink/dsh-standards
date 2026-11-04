// Preflight helper shipped with the package, never imported by the entry module.
// A module-scope fs mutation here is not an entry import-time side effect (C-10.3).
import { mkdirSync } from 'node:fs'

mkdirSync('/tmp/dsh-fixture-selfcheck', { recursive: true })

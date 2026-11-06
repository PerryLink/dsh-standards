/**
 * Environment policy for child processes that may load third-party plugin code.
 *
 * A plugin boots on first import: anything it can read from `process.env` is
 * already exfiltratable before a single check runs. `...process.env` therefore
 * must never be forwarded to `dsh plugin add`, a host boot, or a runtime child.
 * The policy is an allowlist (not a denylist) so a newly named credential does
 * not silently leak; the secret-shaped name filter stays as a second gate in
 * case an allowlisted name is ambiguous.
 *
 * Callers that need isolation (temporary HOME, DSH_HOME, TMPDIR) pass those as
 * explicit overrides. Overrides are the caller's own values, never inherited.
 */

const ALLOWED = new Set([
  // Portable process essentials.
  'PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP', 'PWD', 'SHELL',
  'USER', 'LOGNAME', 'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE', 'LC_MESSAGES',
  'TZ', 'TERM', 'NO_COLOR', 'FORCE_COLOR', 'COLORTERM',
  // Windows needs these to locate node/npm/tmp; they carry no credentials.
  'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'PATHEXT', 'OS',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_ARCHITEW6432',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES',
  'PROGRAMFILES(X86)', 'COMMONPROGRAMFILES', 'HOMEDRIVE', 'HOMEPATH',
])

const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|CREDENTIAL|AUTH|COOKIE|SESSION|_KEY$)/i

export function isSecretEnvName(name) {
  return SECRET_NAME.test(String(name ?? ''))
}

export function isAllowedEnvName(name) {
  return ALLOWED.has(String(name)) && !isSecretEnvName(name)
}

/**
 * Build the child environment: inherited allowlisted keys + caller overrides.
 * Overrides are trusted call values (paths the caller just created), not
 * inherited state, so they are not filtered.
 */
export function sanitizedEnv(overrides = {}) {
  const env = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || !isAllowedEnvName(key)) continue
    env[key] = value
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null) continue
    env[key] = String(value)
  }
  return env
}

/**
 * In-process variant for scripts that boot a plugin in this very process
 * (bundle smoke, runtime child). It deletes everything not allowlisted, so a
 * direct `node script.mjs` invocation gets the same policy as a spawned one.
 * Returns the removed key names (never values) for logging.
 */
export function scrubProcessEnv() {
  const removed = []
  for (const key of Object.keys(process.env)) {
    if (isAllowedEnvName(key)) continue
    removed.push(key)
    delete process.env[key]
  }
  return removed
}

export function envPolicy() {
  return {
    mode: 'allowlist',
    allow: [...ALLOWED].sort(),
    denyNamePattern: SECRET_NAME.source,
    note: 'tokens/keys/secrets/credentials are dropped even if a future allowlist entry matches',
  }
}

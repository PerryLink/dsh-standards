/**
 * LEV-3 fixture plugin: one volatile field (`greeting`) and one ordinary field
 * (`mode`).
 *
 * `apply()` records an instance id + fiber uid through the `lev3Probe` service,
 * installs one named effect, and listens for `loader/volatile-update` — the
 * event the Loader dispatches, to the owning fiber only, after it has committed
 * volatile-only config values without remounting.
 *
 * The schema is imported by absolute path because this fixture lives outside an
 * installed DSH tree. The benchmark sets `LEV3_SCHEMASTER_PATH`; there is
 * deliberately no bare-import fallback, so a missing/incorrect runtime fails
 * loudly instead of silently measuring a different package copy.
 */
import { pathToFileURL } from 'node:url'

const schemaPath = process.env.LEV3_SCHEMASTER_PATH
if (!schemaPath) {
  throw new Error('LEV3_SCHEMASTER_PATH is required (absolute path to @deepseek-ai/schemastery/lib/index.mjs)')
}
const Schema = (await import(pathToFileURL(schemaPath).href)).default

export const name = 'lev3-fixture'
export const inject = ['lev3Probe']

export const Config = Schema.object({
  /** Ordinary (non-volatile) field: changing it must restart the plugin. */
  mode: Schema.string().default('mode-0'),
  /** Volatile field: changing it must update the running reference in place. */
  greeting: Schema.string().default('greeting-0').volatile(),
})

function volatileValue(value, field) {
  if (!value || typeof value.get !== 'function') {
    throw new TypeError(`LEV3 fixture: config.${field} is not a volatile reference`)
  }
  return value.get()
}

export function apply(ctx, config) {
  const probe = ctx.lev3Probe
  if (!probe) throw new Error('LEV3 fixture: lev3Probe service is missing')

  const uid = ctx.fiber?.uid ?? null
  const instanceId = probe.beginInstance({
    uid,
    state: ctx.fiber?.state ?? null,
    greeting: volatileValue(config.greeting, 'greeting'),
    mode: config.mode,
  })

  ctx.effect(() => {
    probe.effectInstall({ uid, instanceId })
    return () => {
      probe.effectDispose({ uid, instanceId })
    }
  }, 'lev3.fixture.lifecycle')

  ctx.on('loader/volatile-update', (paths) => {
    probe.volatileUpdate({
      uid,
      instanceId,
      paths: paths.map(path => path.join('.')),
      greeting: volatileValue(config.greeting, 'greeting'),
      mode: config.mode,
    })
  })
}

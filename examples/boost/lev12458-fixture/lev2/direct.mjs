/**
 * LEV-2 negative control: no inject declaration. Reading ctx.lev2Svc directly
 * throws; the plugin catches it only so the harness can record the message.
 */
export const name = 'lev2-direct'
export const inject = []

export function apply(ctx) {
  const probe = ctx.get('lev2Probe', false)
  let outcome
  try {
    const service = ctx.lev2Svc
    outcome = { ok: true, value: service?.value ?? null }
  } catch (error) {
    outcome = { ok: false, name: error.name, message: error.message.split('\n')[0] }
  }
  probe?.record({ type: 'direct-access', ...outcome })
}

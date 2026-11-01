/**
 * LEV-1 negative control: the interval is created with the raw global and has
 * no ctx.effect disposer. The listener and aux effect are still managed, so the
 * only uncontrolled resource is the timer.
 */
export const name = 'lev1-negative'
export const inject = ['lev1Probe']

export function apply(ctx, config) {
  const probe = ctx.lev1Probe
  const instanceId = probe.begin({ mode: config?.mode ?? null, uid: ctx.fiber.uid ?? null })

  // Deliberately not wrapped in ctx.effect and no disposer is registered.
  setInterval(() => {}, 1_000_000)

  ctx.on('lev1/ping', () => probe.ping({ instanceId }))

  ctx.effect(() => {
    probe.effectInstall('lev1.aux', { instanceId })
    return () => probe.auxDispose({ instanceId })
  }, 'lev1.aux')

  probe.recordEffects({
    instanceId,
    labels: ctx.fiber.getEffects().map(effect => effect.label),
  })
}

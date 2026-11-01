/**
 * LEV-1 positive fixture: every resource is owned by ctx.effect, so a loader
 * restart disposes the timer and the listener before apply() runs again.
 */
export const name = 'lev1-positive'
export const inject = ['lev1Probe']

export function apply(ctx, config) {
  const probe = ctx.lev1Probe
  const instanceId = probe.begin({ mode: config?.mode ?? null, uid: ctx.fiber.uid ?? null })
  const timer = setInterval(() => {}, 1_000_000)

  ctx.effect(() => {
    probe.effectInstall('lev1.timer', { instanceId })
    return () => {
      clearInterval(timer)
      probe.timerDispose({ instanceId })
    }
  }, 'lev1.timer')

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

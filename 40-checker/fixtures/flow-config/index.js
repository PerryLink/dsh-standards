export const name = 'flow-config'

export function apply(ctx, config = {}) {
  if (config.port !== undefined && typeof config.port !== 'number') {
    throw new Error('config.port must be a number; got ' + JSON.stringify(config.port))
  }
  console.log(`flow-config@1.0.0 started (port=${config.port ?? 'default'})`)
  ctx.effect(() => () => {}, 'flow-config.effect')
}

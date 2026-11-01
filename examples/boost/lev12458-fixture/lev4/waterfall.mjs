/**
 * LEV-4 waterfall fixture. Listener 1 either calls next() (preserving listener
 * 2) or returns a veto value (short-circuiting listener 2 and the inner next).
 */
export const name = 'lev4-waterfall'

export function apply(ctx, config) {
  const calls = config.calls
  ctx.on('lev4/waterfall', (value, next) => {
    calls.push('L1')
    if (config.shortCircuit) return 'veto-L1'
    return next()
  })
  ctx.on('lev4/waterfall', (value, next) => {
    calls.push('L2')
    return next()
  })
}

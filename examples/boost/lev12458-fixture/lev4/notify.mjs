/**
 * LEV-4 notification fixture: listener 2 throws, listener 3 records whether the
 * dispatch mode reached it. Return values are deliberately undefined so this is
 * not a bail-value test.
 */
export const name = 'lev4-notify'

export function apply(ctx, config) {
  const calls = config.calls
  const event = config.event
  ctx.on(event, () => { calls.push('L1') })
  ctx.on(event, () => {
    calls.push('L2')
    throw new Error('L2-boom')
  })
  ctx.on(event, () => { calls.push('L3') })
}

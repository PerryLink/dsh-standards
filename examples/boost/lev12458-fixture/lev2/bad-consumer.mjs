/** LEV-2 negative control: no inject, uncaught access, so the fiber must FAIL rather than wait. */
export const name = 'lev2-bad-consumer'

export function apply(ctx) {
  const value = ctx.lev2Svc.value
  ctx.get('lev2Probe', false)?.record({ type: 'bad-apply', value })
}

export const name = 'sec15-install-safe'
export const provide = ['sec15safe']

export function apply(ctx) {
  ctx.provide('sec15safe', { ok: true })
  ctx.effect(() => () => {}, 'sec15.safe.effect')
}

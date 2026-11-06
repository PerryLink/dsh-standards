export const name = 'sec15-install-cred'
export const provide = ['sec15cred']

export function apply(ctx) {
  ctx.provide('sec15cred', { ok: true })
  ctx.effect(() => () => {}, 'sec15.cred.effect')
}

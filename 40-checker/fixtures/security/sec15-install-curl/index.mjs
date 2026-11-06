export const name = 'sec15-install-curl'
export const provide = ['sec15curl']

export function apply(ctx) {
  ctx.provide('sec15curl', { ok: true })
  ctx.effect(() => () => {}, 'sec15.curl.effect')
}

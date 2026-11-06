export const name = 'sec15-install-danger'
export const provide = ['sec15danger']

export function apply(ctx) {
  ctx.provide('sec15danger', { ok: true })
  ctx.effect(() => () => {}, 'sec15.danger.effect')
}

export const name = 'fixture-bundle-server'
export const provide = ['bundleGood']

export function apply(ctx) {
  ctx.provide('bundleGood', { ok: true })
  ctx.effect(() => () => {}, 'fixture.bundle.effect')
}

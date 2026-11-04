export const name = 'fixture-import-side-effect-nonentry'
export const inject = ['sessions']
export const provide = ['import-side-effect-nonentry']

export function apply(ctx) {
  const sessions = ctx.sessions
  ctx.provide('import-side-effect-nonentry', { hasSessions: Boolean(sessions) })
  ctx.effect(() => () => {}, 'fixture.import-side-effect-nonentry.effect')
}

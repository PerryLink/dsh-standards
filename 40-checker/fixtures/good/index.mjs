export const name = 'fixture-good'
export const inject = ['sessions']
export const provide = ['good']

export function apply(ctx) {
  // Touch the declared capability so C-11's static trigger fires.
  const sessions = ctx.sessions
  ctx.provide('good', { hello: () => 'hi', hasSessions: Boolean(sessions) })
  ctx.effect(() => () => {}, 'fixture.good.effect')
}

export const name = 'fixture-declaration-file'
export const inject = ['sessions']
export const provide = ['declaration-file']

export function apply(ctx) {
  const sessions = ctx.sessions
  ctx.provide('declaration-file', { hasSessions: Boolean(sessions) })
  ctx.effect(() => () => {}, 'fixture.declaration-file.effect')
}

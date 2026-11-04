import './side-effectful.mjs'

export const name = 'fixture-import-local-side-effect'
export const inject = ['sessions']
export const provide = ['import-local-side-effect']

export function apply(ctx) {
  const sessions = ctx.sessions
  ctx.provide('import-local-side-effect', { hasSessions: Boolean(sessions) })
  ctx.effect(() => () => {}, 'fixture.import-local-side-effect.effect')
}

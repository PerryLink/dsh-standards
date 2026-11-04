import path from 'node:path'

export const name = 'fixture-import-package-only'
export const inject = ['sessions']
export const provide = ['import-package-only']

export function apply(ctx) {
  const sessions = ctx.sessions
  ctx.provide('import-package-only', { basename: path.basename('.'), hasSessions: Boolean(sessions) })
  ctx.effect(() => () => {}, 'fixture.import-package-only.effect')
}

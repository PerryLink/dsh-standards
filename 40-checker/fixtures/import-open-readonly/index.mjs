import { openSync } from 'node:fs'

export const name = 'fixture-import-open-readonly'
export const inject = ['sessions']
export const provide = ['import-open-readonly']

export function apply(ctx) {
  const sessions = ctx.sessions
  ctx.provide('import-open-readonly', { hasSessions: Boolean(sessions) })
  ctx.effect(() => () => {}, 'fixture.import-open-readonly.effect')
}

// C-10.4 is about fs *writes*; a read-only open is a different side effect.
openSync(new URL(import.meta.url), 'r')

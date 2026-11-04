import { writeFileSync } from 'node:fs'

export const name = 'fixture-import-side-effect'
export const inject = ['sessions']
export const provide = ['import-side-effect']

export function apply(ctx) {
  const sessions = ctx.sessions
  ctx.provide('import-side-effect', { hasSessions: Boolean(sessions) })
  ctx.effect(() => () => {}, 'fixture.import-side-effect.effect')
}

// DSC-10.4: a module-scope fs mutation, executed on import.
writeFileSync('/tmp/dsh-fixture-import-side-effect.txt', 'x')

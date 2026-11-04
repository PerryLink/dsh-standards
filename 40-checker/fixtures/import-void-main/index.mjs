export const name = 'fixture-import-void-main'
export const inject = ['sessions']
export const provide = ['import-void-main']

export function apply(ctx) {
  const sessions = ctx.sessions
  ctx.provide('import-void-main', { hasSessions: Boolean(sessions) })
  ctx.effect(() => () => {}, 'fixture.import-void-main.effect')
}

function main() {
  return undefined
}

// C-10.2: an immediate module-scope call, expressed as `void main()`.
void main()

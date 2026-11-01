export const name = 'dsh-plugin-template'
export const inject = []

export function apply(ctx) {
  ctx.effect(() => () => {}, 'dsh-plugin-template.noop')
}

/** LEV-2 provider: registers the service that consumer.mjs injects. */
export const name = 'lev2-service-a'

export function apply(ctx, config) {
  ctx.provide('lev2Svc', {
    value: config?.value ?? 'A1',
    providerUid: ctx.fiber.uid,
  })
}

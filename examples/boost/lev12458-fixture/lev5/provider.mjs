/** LEV-5 provider fixture; the loader isolate option decides which realm owns this registration. */
export const name = 'lev5-provider'

export function apply(ctx, config) {
  ctx.provide('lev5Svc', {
    version: config.version,
    realm: config.realm,
    providerUid: ctx.fiber.uid,
  })
}

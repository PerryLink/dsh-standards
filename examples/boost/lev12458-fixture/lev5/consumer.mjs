/**
 * LEV-5 consumer fixture. It imports no provider module: the only seam is the
 * injected service property, so replacing the provider does not edit this file.
 */
export const name = 'lev5-consumer'
export const inject = ['lev5Svc', 'lev5Probe']

export function apply(ctx, config) {
  const service = ctx.lev5Svc
  ctx.lev5Probe.record({
    type: 'apply',
    consumer: config.consumer,
    version: service.version,
    realm: service.realm,
    providerUid: service.providerUid,
    uid: ctx.fiber.uid,
  })
  ctx.effect(() => () => {
    ctx.lev5Probe.record({
      type: 'dispose',
      consumer: config.consumer,
      version: service.version,
      realm: service.realm,
    })
  }, 'lev5.consumer')
}

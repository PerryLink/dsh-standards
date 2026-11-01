/** LEV-2 consumer: declares inject, so it must stay PENDING until the service exists. */
export const name = 'lev2-consumer'
export const inject = ['lev2Svc', 'lev2Probe']

export function apply(ctx) {
  ctx.lev2Probe.record({
    type: 'apply',
    value: ctx.lev2Svc.value,
    providerUid: ctx.lev2Svc.providerUid,
    uid: ctx.fiber.uid,
  })
}

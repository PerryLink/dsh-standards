/** LEV-2 recorder service. It is registered outside the Loader so it outlives every entry. */
export const name = 'lev2-probe'

export function apply(ctx) {
  const state = { events: [] }
  const api = {
    record(event) {
      state.events.push({ seq: state.events.length + 1, ...event })
    },
    snapshot() {
      return { events: state.events.map(event => ({ ...event })) }
    },
  }
  ctx.provide('lev2Probe', api)
}

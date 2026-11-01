/** LEV-5 recorder service, registered at the root scope so both isolate labels can inject it. */
export const name = 'lev5-probe'

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
  ctx.provide('lev5Probe', api)
}

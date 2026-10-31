/**
 * LEV-3 probe service.
 *
 * A separate loader entry from the fixture plugin, so the recorder survives
 * every restart of the fixture. It is a real Cordis service: registered with
 * `ctx.provide()`, consumed by the fixture through `inject`, and read back by
 * the benchmark as `ctx.lev3Probe`.
 *
 * Strings only (no Cordis import) keep this module loadable by both the
 * installed DSH and a vendored checkout runtime.
 */
export const name = 'lev3-probe'

export function apply(ctx) {
  const state = {
    applies: 0,
    effectInstalls: 0,
    effectDisposals: 0,
    volatileUpdates: 0,
    events: [],
    instances: [],
  }

  const record = (type, data = {}) => {
    state.events.push({ seq: state.events.length + 1, type, at: performance.now(), ...data })
  }

  const api = {
    /** Assign the next instance id and record one `apply` invocation. */
    beginInstance(fields) {
      state.applies += 1
      const instance = { instanceId: state.applies, ...fields }
      state.instances.push(instance)
      record('apply', instance)
      return instance.instanceId
    },
    record,
    effectInstall(fields) {
      state.effectInstalls += 1
      record('effect-install', fields)
    },
    effectDispose(fields) {
      state.effectDisposals += 1
      record('effect-dispose', fields)
    },
    volatileUpdate(fields) {
      state.volatileUpdates += 1
      record('volatile-update', fields)
    },
    /** Detached copy; the benchmark never holds live references across a reload. */
    snapshot() {
      return {
        applies: state.applies,
        effectInstalls: state.effectInstalls,
        effectDisposals: state.effectDisposals,
        volatileUpdates: state.volatileUpdates,
        instances: state.instances.map(instance => ({ ...instance })),
        events: state.events.map(event => ({ ...event })),
      }
    },
  }

  ctx.provide('lev3Probe', api)
}

/**
 * LEV-1 probe service.
 *
 * Installs an in-process interval-handle counter around globalThis.setInterval /
 * clearInterval, then publishes a real Cordis service (`lev1Probe`) that the
 * fixture entries inject. State is created per plugin application, so the two
 * arms of one harness process do not share counters.
 */
const timers = new Set()
let wrapped = false

function wrapTimers() {
  if (wrapped) return
  wrapped = true
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  globalThis.setInterval = function (...args) {
    const handle = originalSetInterval(...args)
    timers.add(handle)
    // Keep a leaked control timer from holding the harness process open; the
    // handle is still counted as open until clearInterval() is called.
    handle?.unref?.()
    return handle
  }
  globalThis.clearInterval = function (handle) {
    timers.delete(handle)
    return originalClearInterval(handle)
  }
}

export const name = 'lev1-probe'

export function apply(ctx) {
  wrapTimers()
  const state = {
    applies: 0,
    effectInstalls: 0,
    timerDisposers: 0,
    auxDisposers: 0,
    disposerCalls: 0,
    pings: 0,
    instances: [],
    effects: [],
  }
  const api = {
    begin(fields) {
      state.applies += 1
      const instance = { instanceId: state.applies, ...fields }
      state.instances.push(instance)
      return instance.instanceId
    },
    effectInstall(kind, fields) {
      state.effectInstalls += 1
      state.effects.push({ type: 'effect-install', kind, ...fields })
    },
    timerDispose(fields) {
      state.timerDisposers += 1
      state.disposerCalls += 1
      state.effects.push({ type: 'timer-dispose', ...fields })
    },
    auxDispose(fields) {
      state.auxDisposers += 1
      state.disposerCalls += 1
      state.effects.push({ type: 'aux-dispose', ...fields })
    },
    recordEffects(fields) {
      state.effects.push({ type: 'effects', ...fields })
    },
    ping(fields) {
      state.pings += 1
      state.effects.push({ type: 'ping', ...fields })
    },
    snapshot() {
      return {
        applies: state.applies,
        effectInstalls: state.effectInstalls,
        timerDisposers: state.timerDisposers,
        auxDisposers: state.auxDisposers,
        disposerCalls: state.disposerCalls,
        pings: state.pings,
        openTimers: timers.size,
        instances: state.instances.map(instance => ({ ...instance })),
        events: state.effects.map(event => ({ ...event })),
      }
    },
    drainTimers() {
      const count = timers.size
      for (const handle of timers) clearInterval(handle)
      timers.clear()
      return count
    },
  }
  ctx.provide('lev1Probe', api)
}

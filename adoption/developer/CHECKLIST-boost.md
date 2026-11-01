# BOOST checklist (LEV-1–8)

> BOOST is **guidance**, not “advanced”. One measured LEV is enough to say
> “BOOST has evidence for LEV-x”; it is not a quality grade and not a pass.

## LEV-1 — reversible effects

- [ ] Timers, connections, watchers, subprocesses, and listeners are registered
      as effects.
- [ ] On dispose, the count returns to baseline.
- [ ] Evidence: a before/after count and a negative control.

## LEV-2 — inject/wait

- [ ] Required services are declared in `inject`.
- [ ] Optional services use `ctx.get`, not polling.
- [ ] Missing service leaves the plugin PENDING; it does not throw.

## LEV-3 — volatile hot config

- [ ] Hot values use `volatile()` / `ctx.get`.
- [ ] A config change does not remount the plugin.
- [ ] Evidence: remount count 0/N vs a control that remounts.

## LEV-4 — event modes

- [ ] `emit` / `waterfall` / `serial` / `bail` / `parallel` match the semantics.
- [ ] Waterfall observers call `next()`.
- [ ] Notification listeners are isolated (one throwing does not stop others).

## LEV-5 — seam/isolate/group

- [ ] `isolate`/`group` is used only when a real seam is needed.
- [ ] Per-agent context is honored; two realms do not leak.
- [ ] Evidence: two realms, zero cross-talk.

## LEV-6 — prefix/prompt stability

- [ ] Tool/prompt declarations are byte-stable across calls.
- [ ] Volatile data goes through `systemPrompt.context`.
- [ ] Evidence: stable prefix 100% vs volatile 0%.

## LEV-7 — bounded parallelism/jobs

- [ ] Independent calls use bounded parallelism.
- [ ] Long work uses jobs, not blocking.
- [ ] Cancellation propagates.
- [ ] Evidence: concurrency cap and a latency number; label it synthetic if it is.

## LEV-8 — composition/evidence card

- [ ] A bundle patch/preset expresses differences instead of a fork.
- [ ] Every practice has an evidence card with command, environment, result, and
      limitations.
- [ ] Evidence: applying the patch changes only the target row.

## Final record

```json
{
  "level": "boost",
  "status": "measured|not-measured|failed|stale",
  "evidence": [{ "id": "LEV-3", "result": "measured", "artifact": "..." }],
  "limitations": ["synthetic/loader-level; not a production billing baseline"]
}
```

Do not write “faster”, “optimized”, or “production-ready” from a synthetic
benchmark.

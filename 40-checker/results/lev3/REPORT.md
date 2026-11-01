# LEV-3 — volatile config does not remount the plugin (real-loader measurement)

- **Status:** `measured` (loader-level)
- **Practice:** LEV-3 / volatile 免重挂
- **Evidence file:** [lev3.json](lev3.json)
- **Generated at:** `2026-10-31T15:53:03.695Z` (JSON `generatedAt`)
- **Harness:** [lev3-loader-bench.mjs](../../../examples/boost/lev3-loader-bench.mjs) — sha256 `dd40d361ed58557064a67083b8aa611dc87a8d8c05ff9d9ab70e5b091e9887b1`
- **Fixture:** [lev3-fixture/](../../../examples/boost/lev3-fixture/) ([cordis.yml](../../../examples/boost/lev3-fixture/cordis.yml), [plugin.mjs](../../../examples/boost/lev3-fixture/plugin.mjs), [probe.mjs](../../../examples/boost/lev3-fixture/probe.mjs))

## 0. One-line result

Across **two real loader runtimes**, 20/20 YAML-only changes to the volatile
field (`greeting`) updated the running volatile reference with **0 plugin
re-applies, 0 effect disposals, and 20 `loader/volatile-update` events**. The
control arm (20 changes to the ordinary field `mode`) re-applied the plugin and
disposed/reinstalled its effect in **20/20** iterations. The arms are not
identical, so the probe is falsifiable.

## 1. Runtime matrix

| Host | DSH | Cordis | Loader | Include | Schemastery | Boot path | Git |
|---|---|---|---|---|---|---|---|
| `installed` | `0.2.1-rc.5` | `4.0.5` | `1.0.6` | `1.0.10` (bundled in app-boot) | `3.18.5` | real `dsh-app-boot` `boot()` | n/a (npm install) |
| `checkout` | `0.2.2-alpha.2` | `4.0.6-alpha.1` | `1.0.7-alpha.1` | `1.0.11-alpha.1` (standalone copy) | `3.18.6-alpha.1` | direct `Context` + `Loader` + `Include` | `ce7073d51254c26cd63b22a60835b8f948deb447` (dirty: 3 unrelated entries) |

The checkout host copies the vendored packages into a temporary
`node_modules` sandbox because this checkout has no linked `node_modules` for
Cordis; the copied source files are hashed in the JSON
(`hosts.checkout.runtime.source`). The installed app-boot statically bundles
its own `Include` class, so `versions.include` there is the installed
standalone package version of the same release; `runtime.includeBoot` records
which implementation actually ran and its hash. The installed host is booted through the
installed app-boot, which also runs DSH's startup audit. **The installed DSH is
not the checkout version** — this is reported, not papered over.

Node `v24.22.1`, Linux/WSL2 x86_64.

## 2. Method

### 2.1 Composition

The YAML is a real Loader entry list, mounted through the file-backed
`@deepseek-ai/cordis-plugin-include` tree:

```yaml
- id: lev3-probe
  name: ./probe.mjs
- id: lev3-fixture
  name: ./plugin.mjs
  config:
    mode: mode-0
    greeting: greeting-0
```

`probe` registers a real Cordis service with `ctx.provide('lev3Probe', …)`;
`fixture` declares `inject = ['lev3Probe']`. The probe outlives fixture
restarts and records every apply, effect install/dispose, and volatile-update
event with instance id + fiber uid. It is read back as `ctx.lev3Probe`.

`fixture` declares:

```js
Config = Schema.object({
  mode: Schema.string().default('mode-0'),
  greeting: Schema.string().default('greeting-0').volatile(),
})
```

`apply()` records an instance, installs one named effect, and listens for
`loader/volatile-update` (which the Loader delivers only to the owning fiber).

### 2.2 Reload trigger

For every iteration the harness:

1. rewrites the fixture `cordis.yml` in the temp directory (`writeMs` measured
   separately);
2. calls `include.refresh()` — the same function `@deepseek-ai/dsh-hmr` calls
   from its watched-file handler after a config change;
3. awaits `ctx.loader.await()` (fiber inertia included) and reads the probe.

This is the real loader path. Chokidar, HMR debounce and `awaitWriteFinish` are
**not** in the measured interval; see limitations.

### 2.3 Arms

| Arm | Field | Schema | Iterations |
|---|---|---|---|
| `volatile` | `greeting` | `Schema.string().volatile()` | 2 warm-up + 20 measured |
| `control` | `mode` | ordinary string | 2 warm-up + 20 measured |

The control arm mutates the ordinary field in the same YAML, through the same
refresh path. It is the falsifiability check: if it also failed to re-apply,
the probe would be blind to restarts.

### 2.4 Metric definitions

- `remounted` — per iteration: `appliesDelta > 0 || effectDisposalsDelta > 0`.
- `restarts` — number of rows with `pluginReapplied` (`appliesDelta > 0`).
- `effectInstalls` / `effectDisposals` — probe counters for the fixture's
  single `ctx.effect`.
- `volatileUpdates` — probe counter for `loader/volatile-update` deliveries.
- `configUpdated` — the post-reload effective config value equals the value
  written to YAML, and the other field is unchanged.
- `reloadMs` — `performance.now()` around `include.refresh()` +
  `loader.await()`.
- `writeMs` — `performance.now()` around `fs.writeFileSync` of the YAML.
- Percentiles: `median` = `p50`; `p50`/`p95` use linear interpolation over the
  sorted 20 samples (R-7). No values are synthesized.

### 2.5 What the loader actually did

This is not inferred from the fixture; it is the Loader's own gate:

1. `Include.refresh()` re-reads the YAML and calls `root.update(...)` —
   [`include/src/index.ts:279`](/mnt/c/Users/zzhdz/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis-plugin-include/src/index.ts).
2. `Entry.update()` computes `changes === ['config']`, then gates on:
   `fiber.state === ACTIVE && ctx prototype unchanged && equalExceptVolatile(...)` —
   [`loader/src/config/entry.ts:146`](/mnt/c/Users/zzhdz/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis-plugin-loader/src/config/entry.ts) (checkout: [`entry.ts:149`](<dsh-checkout>/vendor/loader/src/config/entry.ts)).
3. `equalExceptVolatile` returns true when the differing path's schema has
   `meta.volatile` —
   [`diff.ts:18`](/mnt/c/Users/zzhdz/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis-plugin-loader/src/config/diff.ts).
4. `_commitVolatile()` re-resolves the candidate config, finds the existing
   `Volatile` reference at path `['greeting']`, compares `.get()`, writes the
   new snapshot with `updateVolatile`, and emits `loader/volatile-update` to
   that fiber only. `pending` becomes `[]`, so `_patchContext` does not call
   `fiber.update()`.
5. The control change fails `equalExceptVolatile`, keeps `changes` non-empty,
   and calls `fiber.update(config, true)` → `internal/update` → restart →
   effect disposal → `apply()` again. **The Fiber object and uid are reused**;
   the plugin instance and effects are recreated.

The event contract is declared at
[`loader/src/index.ts:34`](/mnt/c/Users/zzhdz/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis-plugin-loader/src/index.ts);
the HMR call site is
[`packages/boot/hmr/src/index.ts:472`](<dsh-checkout>/packages/boot/hmr/src/index.ts).

### 2.6 Commands

```bash
node examples/boost/lev3-loader-bench.mjs                 # both hosts, 20+2 per arm
node examples/boost/lev3-loader-bench.mjs --host installed
node examples/boost/lev3-loader-bench.mjs --host checkout
node --test examples/boost/lev3-result.test.mjs          # JSON schema + row consistency
```

Exit code `0` = measured (supported or refuted), `2` = harness invalid/error.
Both hosts exited `0`.

## 3. Results (this JSON run)

### 3.1 Lifecycle

| Host | Arm | n | restarts | effect installs | effect disposals | volatile updates | config updated | fiber uid changed |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `installed` | `volatile` (`greeting`) | 20 | **0** | **0** | **0** | **20** | 20/20 | 0 |
| `installed` | `control` (`mode`) | 20 | **20** | **20** | **20** | 0 | 20/20 | 0 |
| `checkout` | `volatile` (`greeting`) | 20 | **0** | **0** | **0** | **20** | 20/20 | 0 |
| `checkout` | `control` (`mode`) | 20 | **20** | **20** | **20** | 0 | 20/20 | 0 |

Every volatile row has `appliesDelta=0`, `effectInstallsDelta=0`,
`effectDisposalsDelta=0`, `volatileUpdatesDelta=1`. Every control row has
`appliesDelta=1`, `effectInstallsDelta=1`, `effectDisposalsDelta=1`,
`volatileUpdatesDelta=0`. Both hosts' final probe counters are identical:
`applies=23`, `effectInstalls=23`, `effectDisposals=22`,
`volatileUpdates=22` (initial boot + 2 warm-ups + 20 measured each arm).

### 3.2 Reload latency

| Host | Arm | median/p50 (ms) | p95 (ms) | min | max | mean | write median (ms) |
|---|---|---:|---:|---:|---:|---:|---:|
| `installed` | `volatile` | 0.668 | 0.863 | 0.530 | 0.871 | 0.670 | 0.063 |
| `installed` | `control` | 0.775 | 1.000 | 0.632 | 1.041 | 0.794 | 0.067 |
| `checkout` | `volatile` | 0.682 | 0.793 | 0.488 | 0.793 | 0.659 | 0.074 |
| `checkout` | `control` | 0.738 | 0.935 | 0.601 | 1.400 | 0.773 | 0.066 |

In this run the control median is `1.160×` the volatile median on the installed
host and `1.082×` on the checkout host. That is a small, single-run difference;
the categorical result is the lifecycle churn (0 vs 20), not the sub-millisecond
latency delta. Previous runs of the same harness produced the same 0-vs-20
lifecycle split with medians in the same sub-millisecond band, but the
volatile/control latency ordering is within run-to-run noise.

Raw per-iteration `reloadMs` arrays (also in `hosts.*.arms.*.rows`):

```
installed volatile: 0.871 0.763 0.708 0.612 0.790 0.863 0.811 0.571 0.635 0.530 0.701 0.751 0.547 0.555 0.548 0.587 0.712 0.708 0.596 0.536
installed control : 0.693 0.906 0.795 0.726 0.708 0.807 0.960 0.888 1.041 0.755 0.753 0.690 0.998 0.911 0.673 0.797 0.632 0.821 0.696 0.634
checkout  volatile: 0.689 0.793 0.682 0.768 0.694 0.648 0.793 0.678 0.582 0.699 0.570 0.522 0.556 0.488 0.582 0.762 0.694 0.591 0.712 0.682
checkout  control : 0.804 0.734 0.742 0.677 0.807 0.675 0.722 0.910 0.601 0.722 1.400 0.768 0.703 0.660 0.807 0.816 0.823 0.686 0.663 0.745
```

### 3.3 Boot

| Host | boot mode | bootMs | entries |
|---|---|---:|---|
| `installed` | app-boot | 1343.276 | `include` (uid 3), `include:lev3-probe` (uid 4), `include:lev3-fixture` (uid 5), all state `2` (ACTIVE) |
| `checkout` | direct-loader | 19.795 | same three entries and states |

`bootMs` is recorded for provenance only. The installed number includes
app-boot's policy/audit work and is not comparable to the direct checkout boot.

## 4. Falsifiability check

- **Control arm restarted 20/20** on both hosts: `apply()` ran again and the
  effect was disposed and reinstalled every time. A probe blind to restarts
  would have shown `0` here too.
- **The arms are not identical:** volatile `remounts=0`, control
  `remounts=20`; volatile effect disposals `0`, control `20`.
- **Config value actually changed:** `configUpdated` is `20/20` in both arms,
  and `volatileUpdatesTotal=20` in the volatile arm. The volatile arm is not a
  no-op.
- **The volatile reference is real:** `boot.fixture.volatileReference=true`;
  the fixture throws if `config.greeting.get` is not a function, and it booted.
- **Fiber identity is the wrong discriminator here:** `fiberUidSame=true` and
  `fiberObjectSame=true` in both arms. Cordis reuses the Fiber across a config
  restart. `remounted` is therefore defined as re-apply/effect disposal, not as
  a new Fiber object. This nuance is important: a probe that only compares
  `entry.fiber.uid` would report "no remount" for the control arm too and would
  be wrong.

## 5. What this proves, and what it does not

**Proves (loader-level):**

- On both measured loader versions, a volatile-only YAML config change is
  committed into the live `Volatile` reference and emits
  `loader/volatile-update` without re-running `apply()` or disposing the
  plugin's effect.
- The same harness detects the ordinary-field restart (20/20), so the zero is
  a measured difference, not a dead probe.
- The zero-restart result holds on the source-of-truth checkout
  (`0.2.2-alpha.2`, Cordis `4.0.6-alpha.1`) as well as the installed DSH.

**Does not prove:**

- Anything about a full DSH profile boot, profile patch layers, app plugins,
  client UI, or CLI startup. This is deliberately labelled **loader-level**,
  not profile-level.
- End-to-end HMR latency including chokidar debounce / `awaitWriteFinish`.
- Production latency; the fixture is synthetic and the sample is one run of
  20 iterations on one warm WSL2 filesystem.
- Compatibility with upstream Cordis beyond the two DSH-vendored versions
  measured here.

## 6. Limitations

1. **Loader-level only.** A real `Context` + `Loader` + `Include` over two
   fixture entries, not a DSH CLI profile. No app plugins, profile patches,
   client UI or CLI process participate.
2. **Trigger is `Include.refresh()` directly**, which is what `dsh-hmr` calls
   after its chokidar handler; the watcher, debounce and write-stabilization
   window are excluded.
3. **Synthetic fixture.** It exercises the documented volatile mechanism but
   is not a shipped plugin. Shipped volatile consumers such as `ui-theme` and
   `llm-pi-ai` need browser/LLM services and are not booted here.
4. **Single machine, single process, one run.** Node `24.22.1` on WSL2, warm
   filesystem. `p95` from 20 samples is unstable, and the volatile/control
   median difference is small and noisy.
5. **Cordis reuses the same Fiber/uid on a config restart.** "Remount" is
   operationalized as re-apply + effect disposal; see §4.
6. **Installed/checkout mismatch.** The installed DSH is `0.2.1-rc.5`
   (Cordis `4.0.5`, loader `1.0.6`), while the source-of-truth checkout is
   `0.2.2-alpha.2` (Cordis `4.0.6-alpha.1`, loader `1.0.7-alpha.1`). Both were
   measured; no upstream Cordis compatibility is claimed.
7. **Checkout needs a sandbox copy.** The checkout has no linked
   `node_modules` for the vendored packages, so the checkout host copies them
   to a temp tree. Source hashes and the git commit are in the JSON; the temp
   paths in `hosts.checkout.runtime.paths` no longer exist after the run.
8. **Local DSH CLI hangs**, so app-boot/Cordis are imported directly rather
   than launching a profile. This is why the evidence cannot be profile-level.
9. **Checkout dirty tree.** `git status` had 3 unrelated dirty entries during
   the run; recorded as `hosts.checkout.runtime.git`.

## 7. What would upgrade this to a full profile benchmark

1. **Boot a real profile:** run `dsh --profile <name>` (or the same app-boot
   sequence with real bundle/profile patch layers) and let the profile's own
   plugin set activate, rather than a two-entry fixture composition.
2. **Drive the real HMR pipeline:** edit the watched profile patch YAML with
   chokidar/`dsh-hmr` active, and measure from the file-change event through
   `include.refresh()`, `loader.await()` and any module reload. Include the
   debounce/`awaitWriteFinish` window that this bench deliberately excludes.
3. **Use a shipped volatile consumer** instead of the fixture (a host plugin
   that consumes `loader/volatile-update`, or a client plugin through the real
   Web UI), and measure its observable behavior (settings re-render, adapter
   re-registration, effect/store deltas), not only counters from a test probe.
4. **Add a same-field negative control:** declare the *same* field ordinary in
   a second fixture variant and show that the same YAML change then restarts.
   This isolates the `.volatile()` marker as the cause rather than the field
   name.
5. **Add a full entry remove/create arm** that recreates the Fiber (new uid),
   so the "Fiber reuse vs recreation" distinction is measured, not only
   inferred.
6. **Repeat runs and hosts:** 5×20 iterations, cold/warm filesystems, and a
   second machine to report confidence intervals rather than one p95.
7. **Guard against config write-back:** assert the profile's real config file
   is unchanged except for the intended value, and test invalid YAML / partial
   writes through the live watcher.

## 8. Reproduce / verify

```bash
cd <standards>
node examples/boost/lev3-loader-bench.mjs
node --test examples/boost/lev3-result.test.mjs
```

The test checks the JSON schema and recomputes every summary count from the
raw rows. It deliberately does **not** assert the LEV-3 claim: a future run
where the volatile field remounts must still be representable as a valid
`refuted` result.

## 9. Deliverables

| File | Purpose |
|---|---|
| [lev3-loader-bench.mjs](../../../examples/boost/lev3-loader-bench.mjs) | Real-loader harness (both hosts) |
| [lev3-fixture/cordis.yml](../../../examples/boost/lev3-fixture/cordis.yml) | Composition template |
| [lev3-fixture/plugin.mjs](../../../examples/boost/lev3-fixture/plugin.mjs) | Fixture plugin with volatile + ordinary fields |
| [lev3-fixture/probe.mjs](../../../examples/boost/lev3-fixture/probe.mjs) | Real Cordis service recording lifecycle |
| [lev3.json](lev3.json) | Raw per-iteration rows + summaries + hashes |
| [lev3-result.test.mjs](../../../examples/boost/lev3-result.test.mjs) | JSON schema/consistency test (1/1 pass) |
| [REPORT.md](REPORT.md) | This report |

## Appendix A — source hashes recorded in the JSON

| Artifact | SHA-256 |
|---|---|
| harness `lev3-loader-bench.mjs` | `dd40d361ed58557064a67083b8aa611dc87a8d8c05ff9d9ab70e5b091e9887b1` |
| fixture `plugin.mjs` | `fec44add01e90c7c99dcde5e4a7b6090b878d420c7f564019ee5aaecd93a4a2d` |
| fixture `probe.mjs` | `8dda527a87989a4641c0106423d30d17e5a3e9723516a032e2033bfbd0839f1e` |
| fixture `cordis.yml` | `7a9ca76b81f577a64191a965a7dacb6d8841c63d5b02947c158fa444c56874ea` |
| installed loader `src/config/entry.ts` | `6a061f1d3c2cdaac19409bf8ec6956ec5a0a457c4f1689be658d50af7c9ee294` |
| installed loader `src/config/diff.ts` | `6025a6b9798a0a16af017bb7d8d6394bbe345685b2ace56b15975add5843edb3` |
| checkout loader `src/config/entry.ts` | `ee57422010f5aa82a25365b2f54dd346a51a0c924c92a5dabbd19b36899b2ef0` |
| checkout loader `src/config/diff.ts` | `6025a6b9798a0a16af017bb7d8d6394bbe345685b2ace56b15975add5843edb3` |

The JSON also records `hasVolatileOnlyGate`, `hasCommitVolatile`,
`hasVolatileMeta`, `hasEqualExceptVolatile` and
`declaresVolatileUpdateEvent` booleans for each loader source tree, plus the
checkout git commit.

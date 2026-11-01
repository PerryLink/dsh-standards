# BOOST LEV-1 / LEV-2 / LEV-4 / LEV-5 / LEV-8 — evidence card

- **Status:** `measured` for all five practices in this card (`loader-level` for LEV-1/2/5/8, `context-level` for LEV-4)
- **Evidence file:** [lev12458.json](lev12458.json)
- **Harness:** [lev12458-bench.mjs](../../../examples/boost/lev12458-bench.mjs) — sha256 `36f9ffa1c96e0eb05d57e19808714a512998ad4a113edf8f277ff705493b957c`
- **Fixtures:** [lev12458-fixture/](../../../examples/boost/lev12458-fixture/)
- **Shape/consistency test:** [lev12458-result.test.mjs](../../../examples/boost/lev12458-result.test.mjs) — sha256 `326ef496fe58c51faf5230edb2c717f9aae760ac7925b2f3c726664fcfda3ed0`
- **Generated at:** `2026-11-01T04:24:39.795Z` (JSON `generatedAt`)
- **Run:** `node examples/boost/lev12458-bench.mjs --runs 5`

> 这不是生产 profile 的端到端基准。所有结果只在这组合成 fixture、这台机器、这套版本上成立；
> 不能写成“DSH 变快了 N 倍”“真实插件不会泄漏”“真实 bundle 一定这样组合”。

## 0. One-line result

| LEV | Practice | Level | Verdict | Key observation |
|---|---|---|---|---|
| LEV-1 | 可逆（effects dispose after restarts） | loader-level | `supported` | positive: timer disposer **5/5**, open interval handles **1 → 1**; negative raw `setInterval`: timer disposers **0**, handles **1 → 6 (+5)** |
| LEV-2 | 等待（inject PENDING → ACTIVE） | loader-level | `supported` | consumer **PENDING (0)** before provider, **ACTIVE (2)** after one `loader.await()`; activation **4.666 ms**; direct access without inject throws before and after |
| LEV-4 | 事件（waterfall next/veto, throw modes） | context-level | `supported` | next: `[L1,L2,inner]`; veto: `[L1]`; `emit/serial/bail` stop after throwing L2, `parallel` runs **all three** and raises `AggregateError` |
| LEV-5 | seam/隔离（two loader isolate realms） | loader-level | `supported` | consumer A sees `a1 → a2`, consumer B stays `b1`; root-scope consumer **PENDING**, root `lev5Svc` **undefined**, foreign-realm applies **0**; swap **0.344 ms** |
| LEV-8 | 组合（bundle patch composition） | loader-level | `supported` | base 2 rows + sample 1 row; toggle changes **only** `lev8-sample.disabled`; malformed insert rejected; missing target warns and is inert |

All five negative controls were observed. The JSON `summary.evidenceCard` also validates that every
measurement row has `practice / level / environment / input / command / negativeControl / result / limitations`
(`ok: true`, five practices checked).

## 1. Environment

The harness imports the **installed** Cordis packages as files (no DSH CLI, no profile boot):

| Item | Value |
|---|---|
| Node | `v24.22.1`, `linux/x64`, WSL2 kernel `6.6.114.1-microsoft-standard-WSL2`, 20 CPUs |
| DSH | `0.2.2-alpha.2` — `/tmp/dsh022/node_modules/@deepseek-ai/dsh`, package.json sha256 `fcfbff65bc9a7beae1d5bd56af6eb166b61dcd22bd20234653d2b8d56d09aa63` |
| Cordis | `4.0.6-alpha.1` — `lib/index.js` sha256 `e2154e2748ace61fa34631cd3081b9fe71c8d744e5a6b90d36c659f44d6470eb` |
| Loader | `1.0.7-alpha.1` — `lib/index.js` sha256 `bf2cf32746fa3a249ca95518993795a7f49595fe26772ceefc5fc9b645e92a0e` |
| Include | `1.0.11-alpha.1` — installed and hashed, **not used** |
| app-boot | installed `dsh-app-boot` — used only by LEV-8 for `bundlePatchFiles` / `bundlePatchPaths` / `loadOverlayPatches` / `composeEntries` |
| DSH checkout | `<dsh-checkout>` at `ce7073d51254c26cd63b22a60835b8f948deb447`, package version `0.2.2-alpha.2`, **dirty: 3 entries** (recorded in JSON) |

The npm packages carry no `gitHead`. The checkout commit is provenance for the matching source tree,
**not** a byte-identity claim about the installed tree. Installed file hashes and the checkout commit
are both in `environment`; they are not conflated.

## 2. Method

One process, one harness, five scenarios. Every scenario creates a fresh real `Context` and imports
the installed runtime by absolute file URL. No network, API key, user session, or DSH profile is used.

### 2.1 LEV-1 — real Loader restarts

Composition: `lev1-probe` (a real Cordis service) + `lev1-fixture` (positive or negative fixture).
The probe wraps `globalThis.setInterval` / `clearInterval` in-process to count open interval handles,
and counts `ctx.effect` timer/aux disposers. After boot it records the effect labels from
`ctx.fiber.getEffects()` as the baseline.

Each iteration calls the real loader restart path:

```js
await ctx.loader.update('lev1-fixture', { config: { mode: `m${i}` } })
await ctx.loader.await()
```

This is the same `Entry.update()` path `Include.refresh()` drives after a YAML change. Five restarts
per arm (`--runs 5`), plus one `lev1/ping` emit after the restarts to check listener cleanup.

- **Positive** (`lev1/positive.mjs`): timer, listener, and auxiliary effect are all owned by `ctx.effect`.
- **Negative** (`lev1/negative.mjs`): listener and aux effect are managed, but the interval is a raw
  global `setInterval` with no disposer. The probe must detect the leak without trusting the fixture.

Observed:

| Arm | baseline effects | timer disposers | open handles after 1st apply → after 5 restarts | handles after dispose | p50 / p95 restart |
|---|---|---|---|---|---|
| positive | `lev1.timer`, `ctx.on("lev1/ping")`, `lev1.aux` | **5** | **1 → 1** | 0 | 0.302 / 0.778 ms (n=5) |
| negative | `ctx.on("lev1/ping")`, `lev1.aux` | **0** | **1 → 6** (+5) | 6 (drained by harness) | 0.179 / 0.226 ms (n=5) |

`getEffects()` returned the same label set after every restart in both arms; the negative arm's
baseline simply lacks the timer effect. The probe distinguishes the arms by the open-handle delta
(+0 vs +5), not by the fixture's own report.

### 2.2 LEV-2 — inject waits instead of throwing

Composition: root `lev2Probe` service + loader entries `lev2-b` (`consumer.mjs`, injects
`lev2Svc` + `lev2Probe`), `lev2-direct-before`, `lev2-bad`, `lev2-a` (provider), `lev2-direct-after`.

1. Boot with only the consumer: its fiber is **PENDING (0)**, `loader.getTasks()` is **0** (nothing is
   stuck), and no error is emitted.
2. Insert the provider entry and await the loader **once**: consumer becomes **ACTIVE (2)** and
   records `value: "A1"`. Activation took **4.666 ms** (includes loader bookkeeping).
3. Negative controls: `direct.mjs` (no inject) reads `ctx.lev2Svc`; it catches the error only to record
   it. The same error appears **before and after** the provider exists:
   `cannot get property "lev2Svc" without inject`.
   `bad-consumer.mjs` (no inject, uncaught) ends **FAILED (3)**, not PENDING — inject is what buys waiting.

### 2.3 LEV-4 — real Context, real plugin fibers

Two listener plugins, registered with `ctx.plugin()` on a fresh real `Context` (no Loader/Include).
This is labelled **context-level**: it measures the Cordis `EventsService`, not a DSH event contract.

- Waterfall: L1 records; with `next()` it also calls the continuation (L2 then the harness `inner`),
  without `next()` it returns `veto-L1` and must skip L2 + inner.
- Notification: L1 records, L2 records and throws `Error("L2-boom")`, L3 records. Listeners return
  `undefined`, so a bail value is not the cause of any stop.

Observed:

| Case | Calls | Result / error |
|---|---|---|
| waterfall next | `L1, L2, inner` | `inner-result` |
| waterfall veto | `L1` | `veto-L1` |
| `emit` | `L1, L2` | throws `Error: L2-boom`; L3 not reached |
| `parallel` | `L1, L2, L3` | throws `AggregateError` with 1 error; all listeners still ran |
| `serial` | `L1, L2` | rejects `Error: L2-boom`; L3 not reached |
| `bail` | `L1, L2` | throws `Error: L2-boom`; L3 not reached |

The `emit` / `serial` / `bail` behavior (a throw stops the remaining listeners) and the `parallel`
behavior (all run, errors aggregated) match the implementation in
`vendor/cordis/src/events.ts` (`emit` maps callbacks without catching; `parallel` uses
`Promise.allSettled`; `serial`/`bail` stop on a throw/bail value). The JSON records this as
`documentedBehavior` per mode.

### 2.4 LEV-5 — two loader isolate realms, one provider swap

The installed loader really supports per-entry isolation (`vendor/loader/src/config/isolate.ts`), so
this is **loader-level**, not a two-Context fallback.

Entries:

```yaml
lev5-provider-a:  isolate: { lev5Svc: realm-a }   config: { version: a1, realm: a }
lev5-provider-b:  isolate: { lev5Svc: realm-b }   config: { version: b1, realm: b }
lev5-consumer-a:  isolate: { lev5Svc: realm-a }   config: { consumer: a }
lev5-consumer-b:  isolate: { lev5Svc: realm-b }   config: { consumer: b }
lev5-consumer-root: (no isolate)                   config: { consumer: root }
```

`consumer.mjs` imports no provider module; it only reads the injected `ctx.lev5Svc` property. The
provider is replaced by restarting only `lev5-provider-a`:

```js
await ctx.loader.update('lev5-provider-a', { config: { version: 'a2', realm: 'a' } })
await ctx.loader.await()
```

Observed:

| Check | Result |
|---|---|
| consumer A applies | `a1` then `a2` (2 applies, 1 dispose of `a1`) |
| consumer B applies | `b1` only (1 apply, 0 disposers) |
| consumer A / B fiber uid | reused (`6` / `7`) across the swap |
| root-scope consumer | **PENDING (0)** before and after |
| root `ctx.get('lev5Svc', false)` | `undefined` |
| provider impls in `ctx.reflect.store` | 2: `a2` (realm a, uid 4), `b1` (realm b, uid 5) |
| foreign-realm apply events | **0** |
| consumer source hash | unchanged (`sha256` before === after) |
| swap latency | **0.344 ms** (one `loader.await()`, n=1) |

`leakedServices` in the JSON is `[]`; it is a **computed probe** (root-scope visibility + foreign-realm
applies), because `leakedServices()` is not an exported Cordis/DSH API in these versions. The report
labels it rather than pretending an API exists.

### 2.5 LEV-8 — bundle patch composition, no boot

This scenario imports only the real app-boot patch helpers. It does **not** boot, import a plugin, or
activate a runtime, so the evidence is about **patch composition**, not a full profile.

Two synthetic bundle packages, each with a real `dsh.bundle.patch` manifest field:

- `lev8/bundles/base/package.json` → `cordis.patch.yml` inserts `lev8-base-a`, `lev8-base-b`.
- `lev8/bundles/sample/package.json` → `cordis.patch.yml` inserts `lev8-sample`.
- `lev8/toggle.patch.yml` (profile-level overlay, applied after both bundles) disables `lev8-sample`.

The harness resolves `bundlePatchPaths()` + `bundlePatchFiles()`, parses with `loadOverlayPatches()`,
and composes with `composeEntries()` — the same functions `bundle-smoke` uses. Compositions:

| Composition | Rows | Warnings |
|---|---|---|
| `[base]` | `lev8-base-a`, `lev8-base-b` | none |
| `[base, sample]` | + `lev8-sample` (enabled) | none |
| `[base, sample, toggle]` | + `lev8-sample` (**disabled: true**) | none |
| `[base, toggle]` (negative) | base only, no sample | `patch: entry "lev8-sample" not found` |

Row diff `[base, sample] → [base, sample, toggle]`:

```json
{
  "added": [], "removed": [],
  "changed": [{ "id": "lev8-sample", "keys": ["disabled"],
                "before": { "disabled": null }, "after": { "disabled": true } }]
}
```

Both base rows are byte-identical across all three valid compositions (`baseRowsStableAcrossCompositions: true`).
The local row-schema check (id string, name string, config object, boolean disabled, known EntryOptions
keys, no duplicate ids) passes for all three compositions. `invalid.patch.yml` (`insert: not-a-list`)
is rejected by the real parser: `patch.insert?.forEach is not a function`.

The JSON also validates its own evidence-card rows: all five have the required keys, an allowed level,
a command naming the harness, a negative control with a description, a non-empty limitations list, and
a `supported|refuted` verdict. This is the `result.evidenceCardCheck` field under LEV-8.

## 3. Raw numbers and commands

Full raw rows are in [lev12458.json](lev12458.json); this section lists the headline numbers.

| Practice | n | Positive / main | Negative control |
|---|---|---|---|
| LEV-1 | 5 restarts per arm | timer disposers 5; open handles 1→1; effects match baseline 5/5 | timer disposers 0; open handles 1→6; after dispose 6 |
| LEV-2 | 1 provider insertion | PENDING 0 → ACTIVE 2 in one await; 4.666 ms | direct access throws before/after; uncaught access FAILED (3) |
| LEV-4 | 2 waterfall + 4 modes | all expectation checks pass | veto case is the negative of next; modes differ (`parallel` all 3 vs others 2) |
| LEV-5 | 5 entries + 1 swap | A `a1→a2`, B `b1`, root PENDING, 0 foreign applies | root consumer PENDING; root service undefined |
| LEV-8 | 4 compositions | base stable; toggle only sample.disabled; schema ok | missing target warns + inert; malformed insert throws |

Exact commands to reproduce this card:

```bash
# from the workspace root
node examples/boost/lev12458-bench.mjs --runs 5
node --test examples/boost/lev12458-result.test.mjs

# one practice only (each also writes the full JSON shape)
node examples/boost/lev12458-bench.mjs --only LEV-1 --runs 5
node examples/boost/lev12458-bench.mjs --only LEV-2
node examples/boost/lev12458-bench.mjs --only LEV-4
node examples/boost/lev12458-bench.mjs --only LEV-5
node examples/boost/lev12458-bench.mjs --only LEV-8
```

Expected: exit `0`, `summary.status = "measured"`, five practices measured, evidence card `ok: true`.
The test currently reports **7/7 pass**.

## 4. Measured vs not-measured

**Measured by this card (all five):**

- LEV-1 — `loader-level`
- LEV-2 — `loader-level`
- LEV-4 — `context-level`
- LEV-5 — `loader-level`
- LEV-8 — `loader-level` (composition only; no boot)

**Previously measured elsewhere (not re-run here, not changed by this card):**

- LEV-3 — `loader-level`, real Loader + Include, volatile 0/20 vs control 20/20 remount:
  [../lev3/REPORT.md](../lev3/REPORT.md).
- LEV-6 — provider-capture, prompt prefix 100% vs 0%: [../lev6/REPORT.md](../lev6/REPORT.md).
- LEV-7 — synthetic timer 8.24×: [lev7-bench.mjs](../../../examples/boost/lev7-bench.mjs).

**Not measured anywhere in this card (do not claim):**

- a real DSH CLI/profile end-to-end boot under these five practices;
- real DSH plugins/resources (the fixtures are synthetic);
- real provider billing / cache hits / token savings;
- OS/process-level isolation (LEV-5 is loader namespace isolation, not a security boundary);
- a full bundle boot with a real profile (LEV-8 composes patches only);
- chokidar/HMR debounce and `awaitWriteFinish` latency (LEV-1/5 restart directly through `loader.update`).

**Status of BOOST as a whole:** all eight LEVs now have at least one reproducible, non-production
evidence card. That is not the same as `boost-evidenced` for a production profile: none of these
numbers is a production guarantee, and LEV-3/6/7 evidence lives in their own cards/files.

## 5. Limitations

- **Synthetic fixtures only.** No DSH CLI, profile, bundle boot, real provider, network, API key, or
  user session data participates.
- **Versions.** Installed DSH `0.2.2-alpha.2` / Cordis `4.0.6-alpha.1` / loader `1.0.7-alpha.1`.
  npm packages have no `gitHead`; the checkout commit is provenance, not byte identity. Checkout was
  dirty (3 unrelated entries).
- **Single machine/process.** WSL2, Node 24.22.1, warm filesystem, one process, 20 CPUs. Latencies are
  warm observations, not production profile numbers. LEV-1 has n=5 per arm; LEV-2/5 swap are n=1.
- **LEV-1 probe scope.** It wraps `globalThis.setInterval`/`clearInterval` in this process only.
  `setTimeout`, `setImmediate`, sockets, native resources, and non-timer effects are not instrumented.
  The negative fixture is deliberately synthetic; it proves the probe detects this leak class, not that
  real plugins commonly leak.
- **LEV-1 semantics.** "Restart" means `Entry.update()` re-ran `apply()` and disposed the previous
  effects; Cordis reuses the Fiber object/uid. `getEffects()` comparison is over effect labels, not
  resource identity.
- **LEV-2 semantics.** "One epoch" means one `loader.await()` after provider insertion, not a
  wall-clock guarantee. The direct-access negative catches the error only to report it; the access
  under test is the undeclared service read. Cordis 4's strict inject model is the documented behavior.
- **LEV-4 scope.** Real Context + real plugin fibers, but no Loader/Include and no DSH-specific event
  contract. The four modes share identical listeners, so the comparison is controlled; it describes
  Cordis `EventsService`, not every DSH event.
- **LEV-5 isolation.** Loader namespace isolation, not OS/process isolation; same Node runtime, module
  cache, and event bus. `leakedServices` is a computed probe, not an exported API. Provider replacement
  restarts the provider entry; it does not hot-swap a value inside a running object. Isolate is
  configuration-sensitive: a mismatched/missing label yields PENDING (the negative control), not a
  fallback to root.
- **LEV-8 composition.** No boot, no plugin import, no activation. Both bundle manifests are synthetic.
  `composeEntries()` starts from an empty root and is not a full profile composition. The row-schema
  check is a local whitelist, not a published JSON Schema; the real parser was observed to accept
  unknown row keys, while a non-list `insert` is rejected.
- **Evidence-card meta-check.** It validates this file's rows, not external or production evidence.

## 6. What this adds / what it does not prove

It adds a falsifiable, reproducible negative control for each of the five missing BOOST practices, using
the installed real Cordis `Context`/`Loader` (and the real app-boot patch helpers for LEV-8). It does
not prove that a real DSH profile is faster, that real plugins are leak-free, that production services
wait correctly, that real events are contained, that isolate is a security boundary, or that a real
bundle boots.

# BOOST fixture plan (2026-11-02)

> 非官方 · 非排名 · 环境限定. B1–B7 are fixture-level; B8 is optional and environment-scoped.

## B1/B6 — lifecycle + uninstall

- Use `omdsh-dev/plugin-template/tests/harness.ts` shape: real `Context`, `ctx.plugin`, `fiber.dispose`.
- Fixture: timer/socket/watcher/listener registered through `ctx.effect`/`ctx.on`.
- Observe: `fiber.getEffects()` returns to baseline after dispose; `process.getActiveResourcesInfo()` has no new handles; dispose 10 times.
- Negative control: module-level timer / no disposer; must be detected.

## B2 — inject / optional service

- Fixture: provider service + consumer with required `inject` and optional `ctx.get`.
- Required: consumer stays PENDING when provider absent; becomes active when provider mounts; replacement reloads.
- Optional: `ctx.get` returns `undefined` when absent; no crash.
- Negative control: required service fetched via `ctx.get` (should not be treated as satisfied).
- The pilot fixture syntax was not accepted by Cordis 4.0.5; do not fake a pass. Use the template harness shape or mark `blocked`.

## B4 — events

- Fixture: waterfall observer must call `next()`; downstream receives the value.
- Serial/bail: order is deterministic; a bail stops later handlers.
- Negative control: observer does not call `next()`; downstream must not run.
- If the event API shape is not confirmed, mark `not-run`; do not invent an API.

## B7 — patch lines

- Temporary profile `--dump-config`: each patch line is visible; disable is visible; no hidden/manual extra patch.

## B8 — performance (optional)

- Fixed host/Cordis/Node/OS/profile; warmup 3; 20 cold starts; record boot-to-URL, RSS/heap, bundle bytes, dispose residue.
- Report raw p50/p95 + environment; no cross-plugin ranking; resolution limit must be stated (pilot polling was 250 ms).

## Output

`boost-fixtures.jsonl` per fixture + `BOOST-REPORT.md`; failed fixture is a real finding, not a reason to change the plugin.

# F. GB/Z 级应该写什么 —— "充分利用 Cordis 特性，更好更快完成任务"

> 第六路研究报告。只读研究，未修改仓库任何文件。
> 证据根：`deepseek-harness/`（下文相对路径均以此根为基准）。
> Cordis 内核：`vendor/cordis/src/`（context.ts 146 / fiber.ts 820 / service.ts 115 / events.ts 371 / reflect.ts 436 / registry.ts 337，共约 2811 行）。

---

## 0. 结论先行：GB/Z 级不是"语法手册"，而是"效能手册"

三级标准的定位差异应当这样切分：

| 级别 | 回答的问题 | 判据形态 |
|---|---|---|
| 一级（基础/规范） | 插件能不能被正确加载、卸载、不崩 | 强制：Loader 四件套、无顶层副作用、schema 校验 |
| 二级（接口/互操作） | 插件之间能不能对齐契约 | 强制：服务名、事件名与 `@mode`、能力缝三层角色 |
| **三级（GB/Z 指导性）** | **同样的功能，能不能更少代码、更快迭代、更省 token、更可诊断** | **推荐 + 可验证收益 + 明示陷阱** |

本报告主张：**GB/Z 级的全部条目必须能被翻译成一句"不这么做的代价"**。做不到这一条的（例如"建议尽量用 effect"这种无代价陈述）不该进 GB/Z，应该退回二级。因此下面每条都按四要素给出：**做什么 / 不做的代价 / 证据（文件:行号 或 文档章节）/ 如何判断做到了**。

同时，GB/Z 级与一二级最大的不同是：**它必须显式收录"看起来高级、实际是陷阱"的用法**（第 9 节）。这是指导性技术文件区别于规范性文件的价值所在。

---

## 1. 依赖与启动：把"顺序"编译成"依赖"

### F1.1 用 `inject` 声明硬依赖，而不是靠 `cordis.yml` 行序

- **做什么**：插件用 `export const inject = ['tools', 'systemPrompt']`（函数插件）或 `static inject = [...]`（Service 子类）声明所有必需服务；缺一即不启动。
- **不做的代价**：
  - 靠行序 → 任何一次配置编辑、preset 组装、overlay 叠加都可能翻转顺序，表现为"换个组合就崩"。
  - 反过来，不声明而直接 `ctx.tools.xxx` → 服务未就绪时读到 `undefined`，在 apply 里抛错变成 FAILED，或在异步回调里变成难以定位的 TypeError。
- **证据**：
  - `docs/cordis-tutorial/03-services.md:52-72` —— "Cordis holds the plugin in PENDING until every listed service exists… Load order in `cordis.yml` does not matter — dependencies, not file order, decide when plugins start."
  - `vendor/cordis/src/fiber.ts:242-249` —— inject 条目写入 `ctx[Context.intercept]`，由 fiber 在构造末尾逐个 `_checkImpl()`（320-325）再 `_refresh()`。
  - `vendor/cordis/src/registry.ts:37-60`（`@Inject` 装饰器，类上贡献静态 inject、方法上延迟到依赖可用）、`registry.ts:71-88`（`Inject.resolve` 归一化数组/对象/原型继承）。
  - 模范：`packages/core/tools/src/index.ts:100` `static inject = ['systemPrompt']`；`packages/core/agent-loop/src/index.ts:292` `static inject = ['agents','sessions','llm','tools','systemPrompt','sessionProjections']`。
- **如何判断做到了**：删掉任一被 inject 的提供方后，插件**不启动且不报错**（PENDING），重新挂载后立即自动加载（`fiber.ts:630-646` epoch 迁移驱动重挂）。

### F1.2 用 `ctx.inject(deps, cb)` 等待能力，而不是轮询 `ctx.get`

- **做什么**：在服务内部或启动期需要"某个能力稍后才出现"时，用 `await ctx.inject([...], scope => {...})`；它是 `ctx.plugin({ inject, apply })` 的语法糖，依赖变化会自动卸载并重跑回调。
- **不做的代价**：轮询/定时器等待 = 把正确性寄托在"回调落在事件循环的哪个位置"。仓库明确把这类做法列为缺陷类：
  `docs/defensive-patterns/general.md:19-23` —— "Timing does not carry correctness… a `setTimeout` that decides whether work is correct races the rest of the program: it holds under a light load and silently fails under a busy one."
- **证据**：
  - `vendor/cordis/src/registry.ts:300-302` —— `inject(inject, callback) { return this.plugin({ inject, apply: callback, name: callback.name }) }`。
  - 模范：`packages/interaction/user-approval/src/index.ts:190` `await this.ctx.inject(['systemPrompt'], (scope: Context) => { scope.systemPrompt.context({...}) })`；
    `packages/api/gateway/src/index.ts:248,255`；`packages/context/file-reference-local/src/index.ts:70`；`packages/agent-loop/src/index.ts:358-369`（在 `ctx.effect` 内 `ctx.inject(['sessionPersistence'], ...)` 并 `return fiber.dispose`）。
- **如何判断做到了**：源码中不存在"周期性检查服务是否出现"的代码；所有此类等待都表达为 `inject` 或事件监听（`internal/service`、`llm/adapters-updated`）。

### F1.3 可选依赖用 `ctx.get(name)` 现场探测，不写进 `inject`

- **做什么**：能用也能不用的能力，不声明 inject；在调用点 `ctx.get('x')` 判空降级。
- **不做的代价**：写进 inject 会让插件在该能力缺失时**完全不启动**，把一个可选增强变成硬约束；且该能力一旦被热替换，你的插件会被级联重启。
- **证据**：`docs/cordis-tutorial/03-services.md:80-90`；`vendor/cordis/src/reflect.ts:247-257`（`get(name, strict=true)` 只返回 ACTIVE 服务的实现）。
- **如何判断做到了**：插件在依赖缺失时仍能 ACTIVE，且降级路径有独立测试。

### F1.4 PENDING 是合法状态——必须会诊断，不能"等它自己好"

- **做什么**：把"某插件什么都不做也不报错"当成 PENDING 排查，而不是重启重试。
- **不做的代价**：PENDING 静默无声。**`docs/cordis-tutorial/06-composition-and-hmr.md:61-63`** 原文："a plugin whose `inject` names a service nobody provides waits forever, printing nothing. No error — PENDING is a legitimate state." 教程里 HMR 的例子（同文件 42 行）："without `@deepseek-ai/cordis-plugin-timer` it sits in PENDING forever, silently."
- **证据 / 诊断范式**：
  - `packages/boot/app-boot/src/index.ts:1056`：`const missing = Object.keys(fiber.inject).filter(service => fiber.ctx.get(service) === undefined)` —— 官方启动审计就是这么算缺失服务的（`inactiveEntries`，1035-1060；状态常量 `FIBER_PENDING` 在 935）。
  - `docs/cordis-tutorial/06-composition-and-hmr.md:65-83`：`for (const runtime of ctx.registry.values()) for (const fiber of runtime.fibers) if (fiber.state === FiberState.PENDING) …`
  - preset 场景：`packages/preset/agent-preset-registry/src/mount.ts:134-158` `auditRows()` 把行区分为 `failed` / `pending`。
- **如何判断做到了**：启动时能把"哪个条目、缺哪个服务"打印成一行诊断；有测试覆盖缺 provider 的组合。

### F1.5 启动期（异步）注册前检查 fiber 活性

- **做什么**：`Service.init` / 异步 apply 中 `await` 之后、注册之前，检查 `this.ctx.fiber.uid === null`（或 `fiber.assertActive()`）。
- **不做的代价**：异步准备完成时插件已被卸载（HMR、配置编辑、依赖消失），此时注册会写入已死上下文，或抛 `CordisError('INACTIVE_EFFECT')`。
- **证据**：
  - `packages/interaction/user-approval/src/index.ts:181-182`：`// Registration can finish after an unload has started. Do not add effects then.` + `if (this.ctx.fiber.uid === null) return`。
  - `vendor/cordis/src/fiber.ts:357-360` `assertActive()`；`fiber.ts:426-428` UNLOADING 状态下 `effect()` 直接抛 `INACTIVE_EFFECT`。
  - `packages/core/agent-loop/src/index.ts:41-45,581` 用 `INACTIVE_STATES` 集合在关键路径上判活。
- **如何判断做到了**：每个 `await` 之后的第一句注册性代码前面有活性判断；有"卸载竞态"测试。

---

## 2. 卸载与热重载：把"可逆"写进注册方式

### F2.1 所有注册走 effect 并返回 disposer；Cordis 不认识的资源必须自己包

- **做什么**：`ctx.on()` / `ctx.plugin()` / 仓库注册表（`ctx.tools.register`、`ctx.systemPrompt.section`）已经是可逆 effect；**定时器、子进程、watcher、连接、临时文件**这些 Cordis 不认识的资源，必须 `ctx.effect(() => { const r = acquire(); return () => release(r) })`。
- **不做的代价**：热重载后旧实例继续 tick / 子进程泄漏 / 监听器重复叠加。仓库把它定为 P0 缺陷类：
  `.agents/skills/cordis-styling-nitpicking/SKILL.md:31-35` —— "P0: unreversed side effect — Flag an owner that leaves a live effect behind after disposal: listeners, registrations, timers, watchers, child fibers, processes, connections, temporary files…"
- **证据**：
  - `docs/cordis-tutorial/02-lifecycle-and-effects.md:9-27`（timer 范例）、`84-92`（"What is already an effect"：`ctx.on` / `ctx.plugin` / 服务注册 / `ctx.tools.register`）。
  - `AGENTS.md` §Conventions 第 133 行附近："**Registrations are effects**: every contribution goes through `ctx.effect()` / `ctx.on()`; a registry's `register()` returns the disposer."
  - `vendor/cordis/src/fiber.ts:421-567`（effect 契约：disposer 可同步/异步/生成器）、`433-448`（逆序释放）。
- **如何判断做到了**：HMR 保存一次后，`setInterval` 的 tick 停止、监听器数量回到基线；`fiber.getEffects()`（`fiber.ts:574-578`）不增长。

### F2.2 import 期零副作用，禁止顶层 await

- **做什么**：模块顶层只做类型/常量/纯函数定义；所有工作从 `apply`、`Service.init` 或显式 `main()` 开始。
- **不做的代价**：模块级副作用脱离 Cordis 生命周期——不可卸载、不可热重载、跨测试串味；顶层 await 会让**每个 importer 的求值都被阻塞**，且拒绝会变成模块求值失败。
- **证据**：
  - `docs/defensive-patterns/package-surface.md:227-233` —— "Package modules do not await at module scope… a module-scope wait makes every importer's evaluation wait, turns a rejection into a module-evaluation failure." 由 `scripts/verify-no-top-level-await.ts` 机械判定，无例外。
  - `docs/defensive-patterns/general.md:104-122` —— "Shared state has one owner"：`globalThis.__dshCache` 这类模块级缓存"shared across instances, reclaimed never"，会让实例互相覆盖、回收时机不可知、测试间泄漏。
  - `.agents/skills/cordis-styling-nitpicking/SKILL.md:25-29` —— "P0: singleton pattern… Weak keys, size bounds, generation checks, and behavior-preserving memoization do not give a module-level cache Cordis ownership."
- **如何判断做到了**：`pnpm run verify-no-top-level-await` 通过；把模块 `import` 一遍后无任何资源被创建（可用测试断言监听数/句柄数为 0）。

### F2.3 支持 restart 幂等：插件可被反复挂载而不累积

- **做什么**：把 `apply` 写成可重复执行；不缓存"上次挂载"的状态；不依赖"只运行一次"。
- **不做的代价**：HMR / 配置编辑 / 依赖热替换会不断重挂，任何"只增不减"的状态（Map、数组、监听器、临时目录）都会累积成泄漏或重复行为。
- **证据**：
  - `vendor/cordis/src/fiber.ts:768-774` `restart()`；`754-760` `await()`（会重抛启动错误，所以幂等 + 大声失败是配套的）；`783-819` `update()`。
  - `docs/cordis-tutorial/06-composition-and-hmr.md:23-59` —— HMR 就是"卸载旧实例（所有 effect 回滚）+ 用新代码重新 apply"，并给出实测输出（55-57 行）。
- **如何判断做到了**：连续 `fiber.update(cfg)` 或 HMR 十次后，`ctx.tools.definitions()` 数量、`fiber.getEffects().length`、已注册监听器数与首次一致。

### F2.4 清理顺序：逆序只保证同步 disposer，异步 disposer 是并发的

- **做什么**：需要严格顺序的清理，**放在同一个 disposer 里 await**，或用 `ctx.effect(function*(){ yield a; yield b })` 让组合 effect 串行回收。
- **不做的代价**：`vendor/cordis/src/fiber.ts:720` 是 `await Promise.all(this._disposables.clear().map(...))`——**多个异步 disposer 并发执行**。所以"我先注册资源、后注册服务"并不能保证"服务先撤、资源后关"。这正是 P0 缺陷类第三条：
  `.agents/skills/cordis-styling-nitpicking/SKILL.md:37-43` —— "The current fiber unload starts sibling disposers concurrently… Adding `inject`, reversing registration order, or retaining a service reference does not fix that race."
- **证据**：`docs/cordis-tutorial/02-lifecycle-and-effects.md:94` —— "disposers start in reverse registration order, but multiple **async** disposers run concurrently. If teardown steps must run in sequence, keep them in one disposer and await them there."
- **如何判断做到了**：检查每个有依赖关系的清理对（资源 vs 消费者），确认它们在同一个 generator effect 里被 `yield`，或在同一 disposer 内顺序 await。

### F2.5 服务提供方：用 generator effect 组合，最后 `yield ctx.provide(...)`

- **做什么**：提供方插件用**一个** `ctx.effect(function*(){ … yield 资源/监听器 disposer …; yield ctx.provide(name, service) })`，把服务发布放在最后 yield。
- **不做的代价**：服务先被撤回、资源先被关闭 → 依赖方的 cleanup 仍在跑，却调用到一个已经死了的服务（P0 "cleanup dependency released before consumer completion"）。
- **证据**：
  - `.agents/skills/cordis-styling-nitpicking/SKILL.md:45-55` —— 明确的 workaround 步骤与限制：不要 yield 已注册 effect 的包装器（"the original effects would remain independently owned"）；顶层 plugin yield 不够，必须放进组合 effect。
  - `vendor/cordis/src/reflect.ts:311-325` —— `provide` 的 disposer 会 `await` 所有 `dependents` 释放后再删 store 条目，这正是"最后 yield provide"能生效的机制。
  - 模范：`packages/llm/llm/src/index.ts:408-417`（`registerAdapter` 用 `ctx.effect(function*(){ … yield () => {…} })` 并带 label）。
- **如何判断做到了**：provider 卸载时，consumer 的 cleanup 仍能成功调用服务方法（有对应测试：暂停 consumer 于最后一次服务调用前 → 启动 provider 卸载 → 断言资源仍可用）。

### F2.6 给 effect 起 label，为诊断埋点

- **做什么**：`ctx.effect(fn, 'tools.register()')` 这类标签；注册表内部已经这么做了。
- **不做的代价**：`fiber.getEffects()` 返回一片 `anonymous`，出问题时无法定位是谁注册的。
- **证据**：`vendor/cordis/src/fiber.ts:421-424`（label 默认 `'anonymous'`）、`574-578` `getEffects()`；`vendor/cordis/src/events.ts:305`（`ctx.on("…")` 自动 label）；`packages/core/tools/src/index.ts:151,187,331,349,385`；`packages/core/system-prompt/src/index.ts:492,526,542,556,575`。
- **如何判断做到了**：`getEffects()` 输出的 label 可读，且包含注册来源。

### F2.7 定时器用 Cordis 管理的 timer 服务（或 effect 包裹），不要裸 `setTimeout`

- **不做的代价**：裸定时器不属于任何 fiber，卸载后继续触发；`ctx.throttle()`/`ctx.debounce()` 的包装器在 dispose 后是惰性的，裸定时器不是。
- **证据**：`docs/upgrade-guide/v0.2.1-alpha.2/cordis-timer-wrappers/guide.md:14` —— "Calling `.dispose()` or disposing the owning fiber cancels pending work and makes later wrapper calls inert."；消费方写法 `inject: ['timer']` + `ctx.timer`（同文件 23 行）。
- **如何判断做到了**：源码中不存在"生命周期资源型"的裸 `setInterval`/`setTimeout`（短促的一次性调度除外），且无裸 `chokidar.watch`。

---

## 3. 配置：schema 是契约，默认值是服务，volatile 是性能开关

### F3.1 `Config` 必须是 Standard Schema（仓库用 schemastery），且与 TS interface 同名

- **做什么**：`export interface Config {...}` + `export const Config = z.object({...})`（同名：类型是给人看的，schema 是给 Cordis 的）。
- **不做的代价**：导出一个普通对象当 `Config` **不会生效**——`docs/cordis-tutorial/05-config.md:34` 明确："a plain object exported as `Config` will not work." 于是配置无校验、无默认值，错误延后到运行时深处。
- **证据**：
  - `vendor/cordis/src/fiber.ts:50-62` `resolveConfig()`（走 `Config['~standard'].validate`）；`19-36` `ValidationError`（把 issues 聚合成带路径的报错）。
  - 模范：`packages/core/agent-loop/src/index.ts:295-307`；`packages/core/system-prompt/src/index.ts:437-444`；`packages/core/tools/src/index.ts:101-104`（用 `z.never()` 表达"字段已移除/已迁移"，这是很好的迁移写法）。
- **如何判断做到了**：`Config` 是 schema 值；`apply(ctx, config)` 里没有 `config.x ?? default` 的兜底。

### F3.2 默认值写进 schema，`apply` 永远收到完整配置

- **证据**：`docs/cordis-tutorial/05-config.md:51` —— "`apply` always receives complete, validated config." 模范：`packages/core/system-prompt/src/index.ts:438-443`、`packages/core/agent-loop/src/index.ts:296-306`。
- **如何判断做到了**：最小配置（空对象）也能启动，且所有分支都有确定值。

### F3.3 每次操作读取的字段标 `.volatile()`——改配置不重挂 fiber

- **做什么**：对"运行中会被频繁调整"的字段（如并发上限、开关、阈值）标 `.volatile()`，在插件里持有引用并 `config.field.get()` 读取。
- **不做的代价**：**改一次配置 → 整个 fiber 卸载重载 → 所有 inject 它的插件级联重启 → 所有它注册的工具/提示段/监听器全部注销再注册**。在 agent 场景下这还会打断正在跑的会话，并让 prompt/工具 schema 抖动（见 F6.1）。
- **证据**：
  - `docs/cordis-tutorial/05-config.md:70-95`（volatile 字段语义与 `loader/volatile-update` 事件）：volatile-only 变更"commits the new values into the running references… bypassing the target plugin's `internal/update`"。
  - `vendor/cordis/src/fiber.ts:783-819` `update()`：loaded fiber 走 `internal/update` waterfall，监听者可否决 restart（809-812 行 "a listener may veto the restart"）；未 loaded 则直接 restart。
  - 模范：`packages/core/agent-loop/src/index.ts:296` `maxParallelToolCalls: z.number()…default(10).volatile()`；`docs/event-producer-consumer.md:115` 列出 `loader/volatile-update` 的监听方（llm-deepseek、llm-pi-ai、plugin-market、product-analytics…）。
- **如何判断做到了**：改该字段后 `internal/update` 被触发但 restart 被否决、插件实例 identity 不变；`loader/volatile-update` 监听者能读到新值。

### F3.4 错误配置大声失败，且尽早失败

- **做什么**：schema 层的类型错误由 ValidationError 变成 FAILED；**语义层**（引用了不存在的 provider / 资源 / 路径）也要在能解析该引用的最早时刻抛，不允许静默跳过。
- **不做的代价**：半配置启动 → 后面每一步都在踩空；或"配置看起来生效了其实被忽略"。
- **证据**：
  - `docs/cordis-tutorial/05-config.md:53-68`（`ValidationError: invalid config: - $.targets expected array but got not-an-array`；fiber 进 FAILED；并明确要求："A plugin should also reject schema-valid config that names an unavailable resource or provider as soon as it can resolve that reference."）
  - `AGENTS.md` §Conventions："**Misconfiguration fails loud** at load when self-contained, otherwise at the earliest resolvable point; never silently skip a missing referent."
  - 模范：`packages/core/tools/src/index.ts:130-147`（注册期校验 output/timeoutMs/保留名）、`179-183`（`tools.restrict()` 校验未知名并列出已知名）、`packages/core/system-prompt/src/index.ts:215-226`（`toolOrder` 缺少 rest 标记/重名直接抛）。
- **如何判断做到了**：每个非法配置有一条测试断言 fiber 进入 FAILED 且错误信息含字段名与原因。

### F3.5 部署可变的选择做成 Config 字段，不写死常量

- **证据**：`AGENTS.md` §Conventions："**No hardcoded tunables in plugins**: deployment-varying choices are validated `Config` fields changeable from cordis.yml; a `DEFAULT_*` constant or test hook is not configurability."
- **如何判断做到了**：插件源码里没有"业务可调数值"的字面量（协议常量与安全不变量除外）。

---

## 4. 事件优于耦合：用类型化事件与正确的 dispatch 模式

### F4.1 事件必须声明合并 + `@mode` + `@param`

- **做什么**：`declare module '@deepseek-ai/cordis' { interface Events { 'ns/action'(a: A, b: B): R } }`，JSDoc 带 `@mode` 与每个 payload 的 `@param`。
- **不做的代价**：事件退化为字符串 → 无类型、无模式约束、无法被 `docs/event-producer-consumer.md` 的生成脚本（由 TypeScript Program 解析）收录，也就无法被审计。
- **证据**：`docs/cordis-tutorial/04-events.md:12-21,44`；`AGENTS.md` §Conventions："**Typed events use declaration merging** … Event JSDoc needs `@mode` and payload `@param`."；`docs/event-producer-consumer.md:11-101`（生成的 mode/声明位置/派发方/监听方矩阵）；模范 `packages/core/tools/src/events.ts:6-58`、`packages/compaction/compaction/src/index.ts:88-104`。
- **如何判断做到了**：`pnpm run gen-doc-graphs` 后新事件出现在矩阵里，且 mode 列与调用点一致。

### F4.2 按语义选 dispatch 模式（这是契约的一部分，不是风格）

| 目的 | 应该用 | 关键性质（源码） |
|---|---|---|
| 广播观察，不等结果 | `emit` | `events.ts:203-206` 同步调用、不 await、不收集返回值 |
| 广播并等待全部完成 | `parallel` | `events.ts:191-196` `Promise.allSettled`，**任一 reject 会抛 `AggregateError`** |
| 依次询问直到有人给答案 | `serial` | `events.ts:214-220` 顺序 await，首个非 null/false/undefined 返回值胜出 |
| 同步版决策 | `bail` | `events.ts:228-234`；`isBailed` 定义见 `events.ts:12-14` |
| 包住下游、可改写可否决 | `waterfall` | `events.ts:246-261`，`next()` 只能调一次（254 行） |

- **证据**：`docs/cordis-primer.md:19-27`（表 + "The dispatch mode is part of the event's public contract"）；`docs/cordis-tutorial/04-events.md:84-92`。
- **如何判断做到了**：事件的 `@mode` 与所有派发点一致（生成脚本会比对）；没有"用 emit 做需要等待的事"（见陷阱 T6）或"用 parallel 做纯观察"（T7）。

### F4.3 waterfall 监听者：观察/注解必须 `next()`，只有拥有决策权才短路

- **不做的代价**：**一个忘记 `next()` 的日志监听者，会静默吞掉整条链的默认行为**——而且看起来"插件加载成功了、事件也触发了"，极难定位。
- **证据**：
  - `docs/cordis-tutorial/04-events.md:138` —— "**a waterfall listener that only observes or annotates must call `next()`**; returning without it is a deliberate short-circuit. Forgetting `next()` in a logging listener silently swallows the default behavior for everyone downstream. It is a standing rule of this repository."
  - `docs/cordis-primer.md:31-35`；`AGENTS.md` §Conventions："**Waterfall listeners MUST call `next()`** to delegate; returning without it short-circuits the chain."
  - 正确范式（拥有决策权才短路）：`packages/compaction/compaction/src/index.ts:88-104` `compaction/summary-error` —— "Return true only after making progress… Call next() when the failure cannot be recovered."
- **如何判断做到了**：每个 waterfall 监听者的每个 `return` 分支都能回答"这里为什么不 next()"。

### F4.4 插件之间不 import 彼此实现

- **做什么**：消费方只 import **服务定义包**的类型（`import type {}` 触发声明合并），运行时通过 `ctx.<service>` 与事件连接。
- **不做的代价**：包边界被穿透 → provider 与 consumer 焊死 → 换 provider 必须改 consumer，能力缝失效。
- **证据**：
  - `docs/user/develop/practice/index.md:50-56` —— "The Service Provider and Consumer **do not depend on each other**."
  - `docs/defensive-patterns/package-surface.md:7-43` —— 入口只导出 Loader 四件套；"a test fixture stays inside its own package — a relative path into another package's `src` bypasses the `exports` map and the package-boundary checks."
  - `docs/cordis-tutorial/07-into-the-harness.md:96` —— "Neither of your plugins knows the other exists — the registry service and the event connect them."
  - `docs/cordis-tutorial/04-events.md:65,74` —— `import type {} from './stats.ts'` / `import type {} from '@deepseek-ai/dsh-tools'` 的标准姿势。
- **如何判断做到了**：consumer 包的 `import` 图中不含任何 provider 包；换 provider 的 PR 不触碰 consumer。

### F4.5 通知类事件要"包含式派发"，不让一个坏监听者饿死其他人

- **做什么**：对 registry 变更这类"不可否决"的通知，用 `ctx.events.dispatch('emit', args)` 逐个 try/catch，而不是 `ctx.emit`。
- **不做的代价**：`Array.map` 式派发下，**一个同步 throw 会让后续所有监听者收不到事件**（这是 `emit` 的实现细节，不是理论风险）。
- **证据**：
  - `packages/llm/llm/src/index.ts:367-391` 注释原文："Cordis emit uses Array.map: one synchronous throw starves later listeners. Registry notifications are non-vetoing, so contain each callback independently." 并显式处理 async 监听者的 rejection。
  - `vendor/cordis/src/fiber.ts:120-137` `emitPluginDisposed` 同构；`packages/core/agent-loop/src/index.ts:396-405` 同样逐 callback 容错。
  - `docs/defensive-patterns/general.md:200-212` —— "Contain callback exceptions in the dispatcher."
- **如何判断做到了**：通知型事件的派发处有 per-listener 容错，且失败落到 `ctx.logger.warn`。

---

## 5. 作用域与隔离：全局管公共，作用域管变体

### F5.1 per-agent 变体注册到 `agent.ctx`，全局注册管公共能力

- **做什么**：默认注册在根作用域；某个 agent 需要不同提示/工具时，通过该 agent 的 `agent.ctx` 注册同名项来**遮蔽**全局项。
- **不做的代价**：
  - 为了让"某个 agent 不一样"而在全局做条件注册 → 影响所有 agent。
  - 在全局注册同名项 → 直接抛错（见下）。
- **证据**：
  - `packages/core/tools/src/index.ts:62-71` —— 重名错误信息本身就是指南：`tool "x" is already registered (for a per-agent variant, register through that agent's \`agent.ctx\` instead)`。
  - `packages/core/system-prompt/src/index.ts:415-422` —— section/context/variable 三条同样的提示。
  - `packages/core/scope/README.md:27` —— "a tool registered through `agent.ctx` is visible only to that agent"。
  - `packages/core/agent/README.md:174` —— "Registrations through `agent.ctx` can shadow prompt sections or tools… so one agent sees a different prompt and tool set than its neighbors."
  - 遮蔽机制实现：`packages/core/scope/src/store.ts:208-217` `merge()`（global 打底，沿 scope 链由远及近覆盖，近者胜）。
- **如何判断做到了**：`ctx.tools.get(name, agent)` 与 `ctx.tools.get(name)` 能给出不同结果；`scopeOf(agent.ctx)` 非空。

### F5.2 用 `isolate` realm 给一组插件独立的同名服务实例

- **做什么**：当"同一服务在同一进程里需要同时存在多份不同配置的实现"时（典型：preset 里挂一个自己的 shell/llm provider），用 `isolate` realm 把它圈起来。
- **不做的代价**：preset 子树的 provider 会写进 **root realm** 的 store，把整个应用的公共服务替换掉。仓库对此有**硬失败检查**：
  `packages/preset/agent-preset-registry/src/mount.ts:69-83`（`leakedServices`：遍历 `ctx.reflect.store`，凡属于该子树 fiber 却挂在 `rootIsolate[name]` 键上的即泄漏）+ `mount.ts:213` `throw new Error(\`Preset services require isolate realms: ${leaked.join(', ')}\`)`。
- **证据**：
  - `vendor/cordis/src/context.ts:121-125` `isolate(name, label)`；`vendor/cordis/src/reflect.ts:160-180`（解析沿 scope 的 isolate 键向上查找，父级键不同则终止）。
  - 配置形态：`docs/user/develop/framework/service.md:111-139`（`cordis:group` + `isolate: { shell: true }`，两个组各自 5s/60s 超时）。
  - `packages/boot/app-boot/README.md:138` —— "a group row gives one `isolate` realm to a provider and its consumers together"。
- **如何判断做到了**：preset 挂载不报 "Preset services require isolate realms"；`leakedServices()` 返回空数组。

### F5.3 能力缝三层分离（定义 / 提供方 / 消费方），且只在需要独立演进时才拆包

- **做什么**：`dsh-<cap>`（抽象 Service + Request/Result 类型）+ `dsh-<cap>-<impl>`（提供方）+ `tool-<cap>`（消费方）。
- **收益（可验证）**：换 provider 不改 consumer。见 `docs/capability-seams.md:733` `ctx.shell`：`bash-local` / `bash-sandbox` / `pwsh-local` 三个实现，消费方 `tool-bash` / `tool-pwsh` 零改动。同类：`ctx.fs`（741 行，fs-local/fs-sandbox/fs-ssh → tool-fs）、`ctx.subagents`（743 行，6 个 provider → 3 个消费方）、`ctx.llm`（676 行，llm-deepseek/llm-pi-ai/llm-replay → agent-loop、compaction-basic）。
- **证据**：
  - `docs/user/develop/practice/index.md:9-56`（定义/收益/拆分判据），`147-153`（"**Do not split preemptively**"）。
  - `AGENTS.md` §Conventions："**A capability seam comprises Service Definition / Service Provider / Consumer roles.** It is complete, never one role; split only when roles evolve independently."
  - 抽象定义模范：`packages/sandbox/sandbox/src/index.ts:174-193`（`abstract SandboxProvider.confine`，注释里写明"silent unconfined passthrough is forbidden"）、`packages/compaction/compaction/src/index.ts:110-140`（`abstract CompactionEngine`）、`packages/jobs/jobs/src/index.ts:1-80`（`abstract JobRegistry` 及语义清单）。
- **如何判断做到了**：抽象基类只定义契约与"实现必须遵守的语义"，不含任一后端细节；新增 provider 的 PR 不含 consumer 改动。

### F5.4 作用域事件路由：事件沿 scope 链**向上**流，不向下

- **做什么**：需要在"一个 standing composition 观察其下所有 agent"时，把监听者注册在**祖先 scope**；`scopeTarget(subject, key)` 会放行 `key` 及其所有祖先标签的监听者。
- **不做的代价**：把监听者注册在子 scope，却期待收到父级/兄弟 scope 的事件 → 永远收不到，且无报错。
- **证据**：`packages/core/scope/src/index.ts:158-185` `scopeTarget` 注释："a listener owned by an enclosing scope receives every descendant scope's events… A tag BELOW the dispatch key stays excluded — events flow up the chain, never down."；`packages/core/tools/src/events.ts:14,25,36,44` 每个 scope-filtered 事件的 JSDoc 都标注了这层语义。
- **如何判断做到了**：有测试覆盖"祖先注册能收到后代事件 / 后代注册收不到兄弟事件"。

### F5.5 作用域限制必须作用于作用域上下文

- **证据**：`packages/core/tools/src/index.ts:162-171` —— 无 scope 时抛错："a context-global restriction would mask every agent — deny the tool for the intended agent instead"；空 filter 也抛错（"almost always a materialized-empty-config bug"）。
- **如何判断做到了**：`restrict` 类的 API 只在 `agent.ctx` 下调用。

---

## 6. 与 agent 循环协作：稳定即省钱，取消即响应

### F6.1 工具 schema 与 prompt section 必须保持稳定——它们直接决定 KV cache 命中

- **做什么**：工具名/描述/参数 JSON Schema、system section 的文本与顺序，在同一 provider+model 路由下**逐字节稳定**；把会变的信息放到 runtime context（F6.2）。
- **不做的代价（可量化）**：`packages/core/agent-loop/README.md:164` —— "Prefix reuse requires earlier messages and declarations to stay byte-identical… **Changing a retained tool definition or rebuilding declarations invalidates reuse from the first altered request token.**" 即：每一步都要重付 system + tools token，命中率归零 → 延迟与成本双升。
- **证据**：
  - `packages/core/agent-loop/README.md:164`（整段 KV Cache effect 分析）。
  - `packages/compaction/compaction-basic/src/summarizer.ts:30,76,112` 与 `README.md:245` —— 摘要请求刻意复用"与上次路由请求逐字节相同的 system prompt、tools 与消息"，"so the provider's warm prefix cache is reused up to the trailing instruction"。
  - `packages/interaction/user-approval/src/index.ts:187-188` —— "The complete current value travels after retained history, so switching policy does not rewrite the stable system-prompt cache prefix."（把策略变更放进 runtime context 而非 system section 的教科书式注释。）
  - 验证手段：`packages/core/agent-loop/tests/request-cache.e2e.ts`（真实 API 断言每一步都命中 provider prefix cache）。
- **如何判断做到了**：连续两步的 system 段与 tools 声明逐字节相同；有 e2e 或快照断言 cache 命中。

### F6.2 易变信息走 `systemPrompt.context`，不走 `section`

- **证据**：`packages/core/system-prompt/src/index.ts:78-90`（`PromptContext` 定义为"dynamic model context materialized as a durable user-role snapshot"）、`177-189` `CONTEXT_ORDERS` 注释 "Process-specific paths and endpoints stay out of the cached system prompt."；`589-609` `refreshContext()` 在**不重跑 section provider 与 waterfall** 的前提下刷新 context 文本。
- **如何判断做到了**：`grep` 插件注册的 `section` 里不含 `Date.now()`、cwd、PID、端口等每次可能变的值。

### F6.3 复用集中分配的提示位置，不写魔法数字

- **证据**：`packages/core/system-prompt/src/index.ts:136-189`（`SECTION_ORDERS` / `CONTEXT_ORDERS`）、`501-512`（`getSectionOrder()` / `getContextOrder()`）、`197-200`（`PERSONA_PREFIX_SECTION` 导出，以便 preset 用同名 section 遮蔽而非重复）。
- **如何判断做到了**：注册处只出现 `getSectionOrder('TOOL_BASH')` 这样的命名常量。

### F6.4 取消信号必须贯穿到底

- **做什么**：工具 `execute` 接收 `exec.signal` 并传递；异步 gate/wrapper 必须观察 `exec.signal`；长操作在 abort 后要给出合成结果（而不是静默消失）。
- **不做的代价**：用户取消后进程仍在跑（资源泄漏 + 结果污染），或调用永远没有结果导致 replay 无效。
- **证据**：
  - `packages/core/tools/src/events.ts:10-13` —— "Async gates must observe `exec.signal`; the registry rechecks cancellation after they settle but never abandons their promise."
  - `packages/core/tools/src/events.ts:32-36` —— "wrappers may change only `exec.signal`… the registry re-fuses the original caller signal before the body, so replacement cannot detach caller cancellation."
  - `packages/core/tools/src/batch.ts:44-84` —— abort 时"stops starts, drains and commits started calls, records results for skipped calls"（`TOOL_ABORTED_BEFORE_DISPATCH`），保证 replay 有效。
  - `packages/core/tools/src/index.ts:264-297` `resolve()` 中在多处 `signal.throwIfAborted()`。
  - `packages/core/agent-loop/src/index.ts:112-149` `raceAbort` / `raceAbortCall`（含"取消后到达的值要被释放"的 `releaseAbandoned`）。
- **如何判断做到了**：工具的每个 await 点都传 signal；有"取消后无残留进程/结果完整"的测试。

### F6.5 并发：可并行的调用要能被并行调度，用 `maxParallelToolCalls` 限流

- **做什么**：把无副作用的调用声明为 parallel-safe；用 volatile 的 `maxParallelToolCalls` 控制上限；不要把 N 个独立调用串行 await。
- **不做的代价**：N 个独立读变成 N 倍等待；或反过来无上限并发打爆本地资源。
- **证据**：
  - `packages/core/tools/src/batch.ts:38-88` —— `executeToolBatch`：exclusive 调用形成 barrier，parallel 调用走"bounded rolling pool"，且"policy, results, and result context remain model-ordered"。
  - `packages/core/agent-loop/src/constants.ts:6` `DEFAULT_MAX_PARALLEL_TOOL_CALLS = 10`；`packages/core/agent-loop/src/index.ts:296` 该字段为 volatile（运行中可调，见 F3.3）。
- **如何判断做到了**：批处理的墙钟时间 ≈ 单批中最慢者，而非各调用之和（benchmark 或日志可证）。

### F6.6 子任务用 subagent 并行化

- **证据**：`packages/subagent/subagent/src/manager.ts:238,258,281,339,788,1144` —— 激活、等待 idle、materialization、失败收集全部走 `Promise.all` / `Promise.allSettled`；`docs/capability-seams.md:743`（`ctx.subagents` 6 个 provider 供 `tool-subagent` / `tool-subagent-control` / `tool-ralph` 消费）。
- **如何判断做到了**：一次派遣 N 个子 agent 的耗时接近最慢的那个。

### F6.7 长活工作交给后台任务（jobs / schedule），不阻塞 step

- **做什么**：超过单步预算的工作注册为 job，返回 jobId；模型通过 `tool-jobs` 读/列/kill。
- **不做的代价**：把长任务塞进工具体 → step 阻塞 → 取消无法及时生效，且无法被并行调度。
- **证据**：`packages/jobs/jobs/src/index.ts:1-80` —— `JobRegistry` 抽象类的语义清单明确："Registrations outlive producer and controller fibers. Owner and service disposal cancel live work and await compliant producers"；每个 job 一个 output ring + cursor，模型只读增量。消费方见 `docs/capability-seams.md:748`。
- **如何判断做到了**：长任务有 jobId 与独立的读/杀路径；`tool-jobs` 能列出并终止。

### F6.8 主循环上的 waterfall 监听者要快且可取消

- **证据**：`docs/event-producer-consumer.md:22` —— `agent/pre-step` waterfall 有 20+ 个监听者（action-cards、agent、agent-instructions、compaction-basic、goal-round-driver、hooks-*、plan-mode、repeat-tool-reminder、session-*、time-context、tmux-context、tool-skill…）。任何一个是慢的同步/不可取消异步，都会被乘以所有 agent 的所有 step。
- **如何判断做到了**：`agent/pre-step` / `tools/*` 上的监听者不做 I/O 阻塞；异步必须有 signal。

---

## 7. 性能与资源

### F7.1 批处理 + singleflight，但必须有 owner、失效与取消

- **证据**：`docs/subsystems/attachment.md:176` —— 本地实现 "lazily encodes preferred candidates, **singleflights equal request identities**, lets each waiter cancel independently, stops shared work when no waiter remains, and bounds all transforms with its instance-level limiter"。`saveImages()` "prepares every validated attachment once before publishing the batch"。
- **边界（必须同时满足，否则是陷阱）**：`.agents/skills/dsh-speed-up-perf/SKILL.md:72` —— "Use revision-keyed reuse or singleflight only with explicit invalidation, bounded retention, independent waiter cancellation, and disposal ownership." 以及 `docs/defensive-patterns/general.md:104-122`（禁止无 owner 的模块级缓存）。
- **如何判断做到了**：缓存挂在服务实例（有生命周期）上，有显式失效点、容量上限、disposer。

### F7.2 复用已接受的 assembly / 已解析的能力，不每步重算

- **证据**：
  - `packages/core/system-prompt/src/index.ts:589-609` `refreshContext()` —— "Sections, tools, and interpolation variables retain the accepted assembly; their providers and waterfall do not rerun."
  - `packages/llm/llm/src/index.ts:960-1018` `prepareCall()` —— 把"能力解析"与"派发"绑定到**同一个 adapter generation**，注释："so HMR cannot combine one adapter's capability result with another adapter."（一次解析、一次冻结、派发时校验 config 未变，1003-1008 行）。
- **如何判断做到了**：热路径上不存在"每次调用都重新解析同一份元数据"的代码；解析结果以不可变快照（`deepFreeze` / `Object.freeze`）传递。

### F7.3 避免重复注册：唯一名 + 幂等 undo

- **证据**：`packages/core/scope/src/store.ts:30-54` `NamedEntries.insert` —— 重名抛**调用方传入的诊断错误**（所以 tools/system-prompt 的重名错误才能精确提示 `agent.ctx`），返回的 undo **幂等**（`active` 标志）；`114-150` `AnonymousEntries.append` 同构；`226-266` `ScopedLayers.effect` 在 action 抛错时回收新建的空 layer。
- **如何判断做到了**：注册表没有"先删后插"的更新路径；disposer 调两次不出错。

### F7.4 只在所有权转移处做结构化克隆/冻结

- **证据**：`packages/core/system-prompt/src/index.ts:649-654`（`structuredClone(parameters)` 只在投影给模型时做一次）；`packages/llm/llm/src/index.ts:976-987,1199-1207`（`deepFreeze(structuredClone(...))` 只在跨边界处做）。`.agents/skills/dsh-speed-up-perf/SKILL.md:66` —— "Remove duplicate parsing, copying, freezing, and validation only after identifying the actual ownership and trust transition."
- **如何判断做到了**：同一份数据在一条热路径上不被 clone/freeze 两次。

### F7.5 泄漏面清单：定时器、子进程、watcher、订阅、临时文件都要有 owner

- **证据**：`.agents/skills/cordis-styling-nitpicking/SKILL.md:31-35`（P0 unreversed side effect 的完整清单）；`docs/defensive-patterns/general.md:194-198`（"Dispose must reach quiescence, not just request it"：kill 之后要 await 子进程退出）；`vendor/cordis/src/reflect.ts:311-325`（provide 的 disposer 等 dependents 释放）。
- **如何判断做到了**：卸载后句柄数/监听器数/子进程数回到基线；有"卸载后资源已释放"的断言。

### F7.6 性能改动必须带测量证据

- **证据**：`docs/defensive-patterns/general.md:151-174`（三项指标：runtime / peak memory / steady-state memory；基线是"去掉改动后的同一路径"，不是"上一版实现"）；`.agents/skills/dsh-speed-up-perf/SKILL.md:37-55`（measurement card 字段表 + 负向控制要求）。
- **如何判断做到了**：PR 里有"命令 + 数值 + 环境 + 输入规模 + 负向控制"。

---

## 8. 可观测性

### F8.1 用 `ctx.logger(name)`，不用 `console.*`

- **不做的代价**：日志不进 Cordis 日志管线 → 无级别、无导出器、无法被 Host/Client 收集；教程里就有现成的坑：HMR 日志走 Cordis logger，"without a console exporter you would not see its messages"（`docs/cordis-tutorial/06-composition-and-hmr.md:42`）。
- **证据**：`vendor/cordis/src/logger.ts`（`LoggerService`、`Message` 结构化记录含 `fiber?: WeakRef<Fiber>` 即 33-39 行）；模范 `packages/core/agent-loop/src/index.ts:394` `this.ctx.logger.warn(...)`；`packages/llm/llm/src/index.ts:389-390`。
- **如何判断做到了**：插件源码中没有 `console.log/warn/error`。

### F8.2 遥测走 seam，不自建通道

- **证据**：`docs/capability-seams.md:707` `ctx.sessionTelemetry`（"The seam captures, redacts, and hands session records to one backend"）、`715` `ctx.productTelemetry`（"mounting alone collects nothing"——即不订阅就不采集）；`docs/subsystems/session-telemetry.md`、`docs/subsystems/product-telemetry.md`。
- **如何判断做到了**：插件不自己发 HTTP 上报；新后端只是新增一个 provider 包。

### F8.3 提供诊断入口：`getEffects()` / registry 遍历 / `internal/*` 事件

- **做什么**：插件与宿主都要能回答"现在挂了什么、谁在等什么、谁注册了什么"。
- **证据**：
  - `vendor/cordis/src/fiber.ts:574-578` `getEffects()`（`EffectMeta` 树，label + children）。
  - `vendor/cordis/src/registry.ts:269-292` `keys/values/entries/forEach`；`docs/cordis-tutorial/06-composition-and-hmr.md:65-83` 的诊断插件范式。
  - `vendor/cordis/src/events.ts:165-167` `internal/dispatch`（非 internal 事件派发前广播 mode/name/args/thisArg，供观测）、`events.ts:370`；`vendor/cordis/src/fiber.ts:592` `internal/status`；`events.ts:334-371` 内置事件清单。
  - 现成工具：`packages/experimental/inspector/src/shared/cordis/collector.ts:150-166`（遍历 `root.registry.values()` × `runtime.fibers` + `root.events._hooks` 构造 Cordis 树快照）；`packages/boot/app-boot/src/index.ts:1035-1060`（启动审计把 failed/pending 分行渲染）；`packages/preset/agent-preset-registry/src/mount.ts:134-158`。
- **如何判断做到了**：一条命令能列出所有 PENDING fiber 及其缺失服务；能导出 effects 树。

### F8.4 监听者异常要被包含并记录

- **证据**：`docs/defensive-patterns/general.md:200-212`；`packages/llm/llm/src/index.ts:371-384`（逐个 callback try/catch + 处理返回 Promise 的 async 监听者，避免 unhandled rejection）；`packages/core/agent-loop/src/index.ts:396-405`。
- **如何判断做到了**：派发处每个 callback 都有独立容错并落到 logger。

---

## 9. 陷阱：看起来高级、实际是坑（GB/Z 必须收录的部分）

| # | 陷阱 | 为什么是坑 | 证据 | 正确做法 / 判据 |
|---|---|---|---|---|
| T1 | **过度 isolate** | isolate 之后该服务只在同 realm 内可见；沿 scope 链查找时父级键不同即终止（`reflect.ts:160-180`），于是"别人找不到我的服务"。同时 preset 又**强制**要求 provider 进 realm（否则 mount 直接失败，`mount.ts:213`），容易矫枉过正 | `context.ts:121-125`；`reflect.ts:160-180`；`mount.ts:69-83,213` | 只在"同一服务需同时存在多份不同实例"时 isolate；其余用全局服务 + agent 作用域遮蔽（F5.1） |
| T2 | **过度 waterfall** | waterfall 是"可改写可否决"的强耦合；监听者一多就无法预测谁 veto 了；观察型监听者漏 `next()` 会静默吞掉默认行为；链路顺序取决于注册顺序 | `tutorial 04:138`；`AGENTS.md` §Conventions；`primer.md:31-35` | 单一决策用 `serial`/`bail`；需要"包住下游并改写结果"才 waterfall；每个 `return` 分支都要能解释为何不 `next()` |
| T3 | **全局 vs agent 作用域注册选错** | 全局注册被所有 agent 看到，且同名直接抛错（错误信息本身就是提示）；为了"某个 agent 有变体"而在全局做条件注册会污染所有 agent | `tools/src/index.ts:62-71,162-171`；`system-prompt/src/index.ts:415-422`；`scope/README.md:27` | 公共能力→全局；变体→`agent.ctx` 同名遮蔽；限制类 API 只允许在作用域内调用 |
| T4 | **动态事件名**（模板字符串拼 `'x/' + id`） | 失去类型与 `@mode` 校验；无法进入 `docs/event-producer-consumer.md` 的生成矩阵（由 TS Program 解析字面量）；无法被审计与文档化 | `event-producer-consumer.md:11-101`；`tutorial 04:44`（`namespace/action` 命名约定） | 事件名必须是字面量常量；可变部分放进 payload |
| T5 | **在 effect 里做重活** | effect body 在加载/重挂时**同步**执行（`fiber.ts:528`），阻塞激活；异步 effect 会推迟 ACTIVE 且失败即 FAILED；重挂（每次配置变更/HMR）都会重做 | `fiber.ts:362-406,528,681-710`；`tutorial 02:64-66` | effect 里只做注册与短同步准备；重活放 `Service.init`、后台 job 或首次使用时惰性初始化 |
| T6 | **用 `emit` 做需要等待的事** | `emit` 同步调用、不 await、不收集返回值；async 监听者的 rejection 会变成 unhandled rejection | `events.ts:203-206`；`llm/src/index.ts:367-391` | 需要等待用 `parallel`；需要返回值用 `serial`/`bail`；通知用 dispatch + per-listener 容错 |
| T7 | **用 `parallel` 做纯观察** | `parallel` 任一监听者 reject 会向派发方抛 `AggregateError`，把"某个观察者崩了"升级成"业务操作失败" | `events.ts:191-196` | 观察型广播用 `emit`（配合容错派发）；只有"全部完成才算完成"才 `parallel` |
| T8 | **模块级 Map / `getInstance()` / `globalThis.__x` 当缓存** | 无 owner → 跨实例串味、卸载后仍存活、测试间泄漏；Weak/bounded/memoization 都不等于 Cordis ownership | `defensive-patterns/general.md:104-122`；`cordis-styling-nitpicking:25-29` | 挂在服务实例上（有生命周期）；或用 scoped context / 服务持有的 keyed record |
| T9 | **import 期副作用 / 顶层 await** | 不可卸载、不可热重载、阻塞所有 importer 求值、拒绝变成模块求值失败 | `package-surface.md:227-233`（机械 gate，无例外） | 一切从 `apply` / `Service.init` / 显式 `main()` 开始 |
| T10 | **以为"逆序注册"能保证清理顺序** | 异步 disposer 是**并发**执行的（`Promise.all`，`fiber.ts:720`）；服务撤回与兄弟资源关闭存在竞态（P0） | `tutorial 02:94`；`fiber.ts:720`；`cordis-styling-nitpicking:37-59` | 顺序敏感的清理放进同一个 generator effect 顺序 `yield`；provider 最后 `yield ctx.provide(...)` |
| T11 | **把 PENDING 当"还没到时间"** | PENDING 无日志、无错误、不占事件循环；教程明说"waits forever, printing nothing" | `tutorial 06:61-63,42,109` | 启动时审计 PENDING 并打印缺失服务（`app-boot/src/index.ts:1056` 范式） |
| T12 | **每次调用重建工具 schema / 提示段** | 直接击穿 provider prefix cache："invalidates reuse from the first altered request token"，每步重付全部 system+tools | `agent-loop/README.md:164`；`compaction-basic/README.md:245` | 稳定声明；易变信息走 runtime context（F6.1/F6.2） |
| T13 | **把频繁变更的配置当普通字段** | 改一次配置 → fiber 重挂 → 依赖方级联重启 → 工具/prompt 抖动 → cache 失效 | `tutorial 05:70-95`；`fiber.ts:783-819` | 标 `.volatile()`，用引用 `.get()` 读（F3.3） |
| T14 | **为"启动顺序"而 inject 一个并不真正依赖的服务** | epoch 里含 `impl.uid`（`fiber.ts:617-628`），该服务每次热替换都会带着你一起重挂 | `fiber.ts:617-646` | 只为"真正会调用的能力"声明 inject；其余用 `ctx.get()` 或事件 |
| T15 | **长期持有 `ctx.get()` 取到的值** | 服务被替换/撤回后你手里是僵尸引用；`_getImpl(strict=true)` 只返回 ACTIVE 实现 | `reflect.ts:247-257`；`tutorial 03:74-78` | 每次使用时经 `ctx.<service>` 读取，或持有服务本身并保持在你的 fiber 生命周期内 |
| T16 | **用定时器轮询代替 `ctx.inject()` / 事件** | 正确性依赖时序 → 轻载下正常、重载/批处理下静默失败 | `defensive-patterns/general.md:19-30`；`registry.ts:300-302` | 用 `ctx.inject()`；或监听 `internal/service` / 领域事件 |

---

## 10. 建议的分级与落地形态

**GB/Z 级条目建议分三档**（避免"推荐"变成"变相强制"）：

- **强烈推荐（有明确代价，几乎无例外）**：F1.1、F1.4、F2.1、F2.2、F3.1、F3.4、F4.1、F4.3、F4.4、F5.1、F6.1、F6.4、F8.1。
- **推荐（有收益，需权衡）**：F1.2、F2.3、F2.5、F3.3、F4.5、F5.2、F5.3、F6.2、F6.5、F6.7、F7.1、F7.3、F8.3。
- **场景相关**：F1.3、F2.7、F5.4、F5.5、F6.3、F6.6、F6.8、F7.2、F7.4、F7.6、F8.2、F8.4。

**每条在标准文档中的固定模板**（保证"可传授、可验证收益"）：

```
### <条目名>
- 做什么：<一句话动作，附最小代码片段>
- 不做的代价：<具体故障模式，最好引一句源码/文档原文>
- 证据：<file:line> 或 <docs 章节>
- 如何判断做到了：<可执行的检查：grep / 命令 / 测试断言 / 指标>
- 例外：<什么情况下不适用>
```

**建议配套的机械检查（把 GB/Z 变成可跑的 lint，而不是纸面建议）**：

1. 入口无 `console.*`（F8.1）。
2. 无顶层 await（已有 `verify-no-top-level-await`，F2.2）。
3. `Config` 是 Standard Schema 值（F3.1）。
4. 事件名是字面量且带 `@mode`（F4.1 / T4）。
5. 每个 waterfall 监听者的所有 `return` 路径要么 `next()`，要么有注释说明"拥有决策权"（F4.3）。
6. `setInterval` / `watch` / `spawn` 出现在 `ctx.effect` 内（F2.1 / F7.5）。
7. 通知型派发用 `events.dispatch` + per-listener 容错，而非裸 `emit`（F4.5）。

---

## 11. 一句话总结

GB/Z 级要写的不是"Cordis 有哪些 API"，而是：**"每一种 Cordis 特性，分别替你省掉了哪一种具体的痛（顺序耦合 / 静默挂起 / 泄漏 / 级联重启 / 缓存击穿 / 无法诊断），以及踩过界的代价是什么"**。上面 8 个方向 40 条 + 16 个陷阱，就是这个命题在 DSH 代码库里的可引用答案。

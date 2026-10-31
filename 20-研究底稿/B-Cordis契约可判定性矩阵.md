# B · DSH 插件 Cordis 契约点可判定性矩阵

> 第二路产出：枚举一个 dsh 插件身上**第三方工具能客观判定**的所有契约点，给出判定方式、源码证据与建议分级。
> 只读研究，未修改仓库任何文件。
>
> 分级口径（沿用本项目设想）：
> - **GB 强制** = 基本可运行与基础安全（不做就坏、或会污染宿主）
> - **GB/T 推荐** = 运行顺畅（不做也能跑，但热重载 / 组合 / 升级会疼）
> - **GB/Z 指导** = 充分利用 Cordis 特性，更好更快完成任务（架构质量 / 生态协同）

## 0. 判定方式图例

| 代号 | 判定方式 | 说明 |
|---|---|---|
| `S1` | 静态正则 | 文本匹配即可，最脆但零成本 |
| `S2` | 静态 AST | 需要解析 TS（ts-morph / oxc / TS compiler API） |
| `T` | 类型检查 | `tsc --noEmit`，依赖 `declare module '@deepseek-ai/cordis'` 的声明合并 |
| `L` | lint 规则 | 可固化为 oxlint / eslint 自定义规则 |
| `R` | 运行时冒烟 | 挂载 → 断言 → 卸载 → 断言 → 重挂 → 断言（状态差分） |
| `H` | 人工评审 | 需要理解意图，机器只能给线索 |
| `X` | 无法判定 | 或仅有假阳性/假阴性极高的弱信号 |

**运行时冒烟的关键可观测面**（全部是 Cordis 公开内部，够做差分断言）：
`ctx.registry.size / entries()`（`registry.ts:269-292`）、`ctx.reflect.props`（`reflect.ts:224`）、
`ctx.reflect.store`（`reflect.ts:222`）、`ctx.events._hooks`（`events.ts:131`）、
`ctx.fiber.getEffects()`（`fiber.ts:574-578`）、`fiber.state`（`fiber.ts:147-154`）、
`fiber.provisions`（`fiber.ts:198`）。

---

## A. 清单与身份

| # | 契约点 | 判定方式 | 源码证据 | 建议分级 | 理由（一句） |
|---|---|---|---|---|---|
| A1 | `package.json` 可被解析、含 `name` / `version` | `S1`+`R` | `packages/util/package-manifest/src/types.ts:8-29`（`DshPackageManifest` 要求 `name`、`version` 必填） | **GB** | 连身份都没有的包装不进宿主，是最低门槛 |
| A2 | `engines.dsh` 声明的 SemVer 区间与运行时匹配 | `S1`+`R`（已有实现） | `packages/boot/app-boot/src/plugin-compatibility.ts:49-90`（`unmetRequirements`：`engines.dsh` 单独裁决，否则所有 `@deepseek-ai/dsh-*` peer 必须满足） | **GB** | 已有官方机械实现，不兼容即整行 `disabled`，属于"会不会坏"层 |
| A3 | 由 A2 推导的 profile 准入（含 `cordis:include` 递归） | `R`（已有实现） | `packages/boot/app-boot/src/compatibility-preflight.ts:89-169`（`preflight` → `check` 递归 group/include） | **GB** | 宿主已经这么判了，第三方照抄同一套即可 |
| A4 | `dsh.manifestVersion` 声明 | `S1` | `types.ts:33-34`（`manifestVersion?: 1`） | **GB/T** | 缺了不坏，但未来格式迁移无锚点 |
| A5 | `dsh.client.platform` 必填 / `inject` / `external` 合理 | `S2`（对 `dsh` 字段做 JSON schema） | `types.ts:86-100`（`DshClientManifest.platform` 必填；`inject` 注释明确"不是 Cordis 服务注入"） | **GB/T** | 影响客户端装载批次，错了只在 web 端出问题 |
| A6 | 插件模块导出 `name`（fiber 显示名 / 日志前缀） | `S2` | `vendor/cordis/src/registry.ts:324-326`（`runtime.name = plugin.name`，`'apply'` 视作未命名）；`docs/cordis-tutorial/02-lifecycle-and-effects.md`（`export const name = 'lifecycle-demo'`） | **GB/T** | 无名字不影响运行，但诊断与日志全部退化成匿名 |
| A7 | 插件导出 `Config`（standard-schema） | `S2`+`T` | `registry.ts:104`（`Config?: StandardSchemaV1`）、`registry.ts:326`（`Config: plugin.Config`）；schemastery 提供 `~standard`（`vendor/schemastery/src/index.ts:290`） | **GB** | 无 schema 即无任何配置校验，与 GB 的"基础安全"直接冲突（见 D1） |
| A8 | 包导出面 `exports` / `files` 与源码一致（不漏 `locale/*.json`） | `S1`+`R` | `packages/core/tools/package.json` 的 `exports`/`files`；`scripts/check-workspace-constraints.ts:302-303`（断言声明文件存在） | **GB/T** | 漏文件在发布后才炸，属于质量而非安全 |
| A9 | Loader 行 `id` 稳定性（组合里的持久键） | `S1`（仅 YAML 层） | `compatibility-preflight.ts:81`（`row.id` 作为诊断标签）；`docs/cordis-primer.md` "Loader Configuration" | **GB/T** | id 变了 patch 会失配；但**包内不可判**（见 X-9） |
| A10 | 插件身份（registry 回调身份）稳定 | `X` | `registry.ts:322`（`this._internal.get(callback)`：runtime 以函数为键） | — | HMR 换模块即换身份，见「判不了」X-9 |

---

## B. 依赖声明

| # | 契约点 | 判定方式 | 源码证据 | 建议分级 | 理由（一句） |
|---|---|---|---|---|---|
| B1 | 声明 `inject`（`static inject` / `export const inject` / `@Inject()`） | `S2` | `registry.ts:106`、`registry.ts:37-59`（`@Inject` 装饰器）、`registry.ts:330`（`Inject.resolve(plugin.inject)`） | **GB** | 这是 Cordis 唯一能表达"依赖就绪才加载"的机制，缺失即退化成加载顺序赌博 |
| B2 | 读到的每个 `ctx.<service>` 都在 `inject` 里 | `S2`（AST：收集 `ctx.X` 成员读 + 比对 inject 键）+ `T` | `reflect.ts:152` `cannot get property "${prop}" without inject`；`reflect.ts:163-180` `internal/get` waterfall | **GB** | 未声明也能跑（见 X-1），所以必须**静态**拦，不能靠运行时 |
| B3 | 依赖真的等到服务可用才激活（PENDING→ACTIVE） | `R` | `fiber.ts:603-628`（`_checkImpl` / `_refresh` / `_setEpoch`）、`fiber.ts:147-154`（`FiberState`） | **GB** | 无需依赖即直接加载的插件，在服务缺失时会静默错 |
| B4 | 可选依赖用 `inject` 或 `ctx.inject([...], cb)` 而非 try/catch | `S2`+`H` | `registry.ts:300-302`（`inject(deps, callback)`）；`packages/preset/agent-preset/skills/cordis-plugin-development/references/practices.md:20`（"Put optional services in `inject` or `ctx.inject([...])` so the plugin stays inactive in profiles without them instead of throwing"） | **GB/T** | 不做也能跑，但在缺服务的 profile 里会抛错或半残 |
| B5 | `provide` 的服务名与消费方解耦（消费方只用 `ctx.<key>`，不 import 具体实现类） | `S2`+`T` | `service.ts:42-59`（`super(ctx, name)` → `reflect.provide`）；`reflect.ts:291-327`；`capability-seams.md` 三层（Definition / Implementations / Direct consumers） | **GB** | 消费方直接 import 实现类 = 绕过 seam，等于把可替换能力焊死，属于结构性破坏 |
| B6 | 服务名不与既有服务冲突（同名重复注册） | `R`（会抛） | `reflect.ts:303-305`（`service "${name}" has been registered at <...>`） | **GB** | 冲突直接抛错并导致宿主半瘫 |
| B7 | `provide` 与 `inject` 的自洽（不 inject 自己提供的服务） | `S2` | `fiber.ts:319-325`（构造后遍历 `inject` 做 `_checkImpl`） | **GB/T** | 逻辑错误但不致命 |
| B8 | 用 `intercept` 声明消费的服务配置 | `S2` | `registry.ts:110`（`intercept?: Dict<boolean>`）、`service.ts:86-102`（`resolveConfig` 合并祖先 intercept） | **GB/Z** | 只有需要"按插件定制服务配置"的高级插件才用得上 |

---

## C. 副作用与卸载

| # | 契约点 | 判定方式 | 源码证据 | 建议分级 | 理由（一句） |
|---|---|---|---|---|---|
| C1 | 资源注册走 `ctx.effect()` / `ctx.on()`（返回 disposer） | `S2`+`L` | `fiber.ts:421-567`（`effect()` 接受函数 / Promise / 生成器；`fiber.ts:377-403` 对非法形状抛 `TypeError('Invalid effect')`）；`events.ts:263-270`（listener 注册本身包在 effect 里） | **GB** | 不走 effect 的资源在插件卸载后必然泄漏，直接污染宿主进程 |
| C2 | **卸载后无残留**：`getEffects()` 空、`events._hooks` 回到基线、`reflect.props`/`store` 回到基线 | `R`（差分断言） | `fiber.ts:574-578` `getEffects()`；`fiber.ts:712-746` `_unload`（`_disposables.clear()` 逆序 await）；`events.ts:272-281` `unregister`；`reflect.ts:311-325`（provision 的 disposer 删 store / notify / 等 dependents） | **GB** | 这是唯一能证明"卸载干净"的机械手段，也是 GB 的核心判据 |
| C3 | **重挂幂等**：卸载→重挂后 `registry.size`、`reflect.props`、effect 数量与首次一致 | `R` | `fiber.ts:768-774`（`restart()`：`_revision++` → `_refresh` → `await()`）；`fiber.ts:783-819`（`update()`：`internal/update` waterfall 可 veto 重启） | **GB** | 重挂后状态漂移 = 热重载不可用，属于"基本可运行"的连续性要求 |
| C4 | `restart()` / `update()` 不抛 `INACTIVE_EFFECT` | `R` | `fiber.ts:357-360`（`assertActive`）、`fiber.ts:157-174`（`CordisError.Code.INACTIVE_EFFECT`） | **GB/T** | 只在已销毁 ctx 上再注册时触发，是"顺序错"而非"结构坏" |
| C5 | 无 import 期副作用：**顶层 `await`** | `S2`（AST：模块顶层 `AwaitExpression`） | 反例：`packages/workflow/workflow-ptc/src/host.ts:27` 是模板字符串内的 `await`（合法，说明正则会假阳性，必须走 AST） | **GB** | 顶层 await 让"加载"变成不可控的异步副作用，HMR 与依赖仲裁都会失真 |
| C6 | 无 import 期副作用：**顶层全局修改 / 自动启动**（`process.on`、`process.env=`、`setInterval` 裸调用、立即 `void main()`） | `S2`+`H` | `docs/cordis-tutorial/02-lifecycle-and-effects.md`（"resources managed outside those APIs must be wrapped in `ctx.effect()`"）；仓库内非测试代码 `setInterval(`/`setTimeout(` 出现 139 处，需逐个确认是否被 effect 包住 | **GB** | 未被 effect 包裹的定时器/监听器是宿主进程泄漏的第一来源 |
| C7 | 泄漏检测：定时器 / 子进程 / socket / 文件句柄 | `R`（句柄统计）+`H` | `fiber.ts:712-730`（只 await 已登记的 disposer：未登记的资源 Cordis 根本不知道）；`packages/subprocess`、`packages/terminal`（子进程/PTY 的真实来源） | **GB**（定时器/子进程） / **GB/T**（socket/句柄） | 定时器与子进程不回收会拖垮宿主；句柄级泄漏只能靠运行时句柄计数 + 人工兜底 |
| C8 | 异步 disposer 真的被 await（卸载后 quiesce） | `R` | `fiber.ts:299-301`（`while (this.inertia) await this.inertia`）；`packages/core/scope/src/index.ts:114-118`（`quiesceFiber`：await dispose 后再 drain inertia） | **GB** | 异步清理不等待 = 重挂时新旧实例交错 |
| C9 | `ctx.on()` 注册的监听器随 fiber 消失（不用裸 `events.on`） | `S2`+`R` | `events.ts:263-270`（`this.ctx.fiber.effect(...)`）、`events.ts:294-307` | **GB** | 裸注册监听器 = 卸载后仍被分发，是典型的"幽灵监听" |
| C10 | HMR 安全（模块替换后能重建） | `R` | `packages/boot/hmr/README.md:57-59`（"A replacement that fails to load stops the previous plugin and is reported as `failed`"）；`vendor/hmr` | **GB/T** | HMR 是开发期顺畅度问题，不影响冷启动正确性 |

---

## D. 配置

| # | 契约点 | 判定方式 | 源码证据 | 建议分级 | 理由（一句） |
|---|---|---|---|---|---|
| D1 | 有 schema 校验（`Config` 是 standard-schema） | `S2`+`T` | `fiber.ts:50-62`（`resolveConfig`：`Config['~standard'].validate`）；无 `Config` 直接 `return config` 原样放行 | **GB** | 无 schema 时任何用户配置都被静默接受，是"基础安全"的洞 |
| D2 | 错误配置**大声失败**：`ValidationError` 抛出且 fiber 进入 `FAILED` | `R` | `fiber.ts:19-40`（`ValidationError`，聚合 issues 带 path）；`fiber.ts:693-701`（`_reload` catch → `logger.error` → `_error` → epoch 置 INACTIVE）；`fiber.ts:580-585`（`_getState` 返回 `FAILED`） | **GB** | 静默降级比崩溃更危险；必须断言"抛了 + 状态是 FAILED"，只断言"没崩"会假阴性（见 X-4） |
| D3 | 有默认值（schema 每个字段带 `.default()`） | `S2`+`R` | `packages/boot/plugin-market/src/index.ts:112`：`indexes: z.array(...).default([]).volatile()` | **GB/T** | 无默认值时 profile patch 一改就炸，属于顺畅度 |
| D4 | `volatile` 字段用法正确（在无 volatile 的定长路径上、且真的不需要重挂载） | `S2`+`R` | `packages/boot/app-boot/src/config-schema/projector.ts:124-134`（"volatile fields require a fixed object path without an enclosing volatile field"）；`hmr/README.md:59`（"Loader commits volatile-only changes in place"） | **GB/T** | 该标 volatile 没标 → 改个 URL 就重挂整个服务 |
| D5 | 配置校验不是异步的 | `S2`+`T` | `fiber.ts:52-56`（`Async config validation is not supported` → 抛 `TypeError`） | **GB** | 异步 schema 在 Cordis 里直接抛错，是硬性的可运行约束 |
| D6 | 配置是"表达式可插值"友好的（不依赖运行时对象） | `H` | `docs/cordis-primer.md` "Loader Configuration"（`!!js` 表达式在注入激活后对插件 ctx 求值） | **GB/Z** | 影响组合能力，纯指导 |
| D7 | 可调值都在 `Config` 里，不硬编码 | `H` | `practices.md:22`（"Put tunable values in the plugin's `Config` so users change them in `cordis.patch.yml`; the user's patch layer survives upgrades"） | **GB/Z** | 升级友好性，机器只能给"存在 Config"这个弱信号 |

---

## E. 事件

| # | 契约点 | 判定方式 | 源码证据 | 建议分级 | 理由（一句） |
|---|---|---|---|---|---|
| E1 | 事件通过 `declare module '@deepseek-ai/cordis' { interface Events }` **类型化** | `S2`+`T` | `packages/core/tools/src/events.ts:1-58`（完整 `Events` 声明合并）；`vendor/cordis/src/events.ts:334-371`（内置 `Events`） | **GB** | 未类型化的事件名 = 拼写错误无法在编译期发现，且进不了生成目录 |
| E2 | 事件声明带 `@mode` 标注 | `S1`（JSDoc 正则） | `docs/cordis-primer.md:27`（"New harness events document it with an `@mode` tag so the generated catalog can check declarations against dispatch sites"）；`packages/core/tools/src/events.ts` 每个事件都带 `@mode waterfall` / `@mode emit` | **GB/T** | 模式是事件公开契约的一部分（primer 原文），缺标注会让消费方选错分发方法 |
| E3 | `@mode` 与**分发调用点**一致（声明 waterfall 就只用 `ctx.waterfall` 发） | `S2`（跨文件交叉引用）+`R` | 同上；`scripts/jsdoc.ts`、`scripts/gen-persistence-catalog.ts` 是抽取端 | **GB/T** | 不一致会导致监听器语义反转（emit 发的事件被 waterfall 消费 = 静默丢结果） |
| E4 | 分发模式选择正确（观察用 emit、包中用 waterfall、并发用 parallel、有序取首值用 serial/bail） | `H`+`R` | `events.ts:31`（`DispatchMode`）、`docs/cordis-primer.md` "Dispatch Modes" 表（Awaited / Order / Return value） | **GB/T** | 选错模式通常"能跑但结果不对"，需行为断言 |
| E5 | waterfall 监听器**调用 `next()`**（不拥有决策时必须委派） | `R`（路径断言）+`H` | `events.ts:246-261`（`waterfall`：不调 `next()` 即 veto 掉整条链与内建行为）；`practices.md:16`（"A waterfall listener ... that does not own the decision must return `next()`"）；`events.ts:253-256` 只防重复调用 | **GB** | 漏调 `next()` 会静默吞掉别人的贡献与默认行为，是"会让宿主行为消失"级问题 |
| E6 | waterfall 改写决策时展开原对象（`{ ...decision, messages }`） | `S2`（弱）+`H` | `practices.md:16`（"spread it so fields such as `startsRequestSeries` survive"） | **GB/T** | 丢字段通常不崩，只是下游行为退化 |
| E7 | 事件名使用域前缀、不与它人冲突 | `S1`（命名规范）+`R`（全局 Events 键集合去重） | `packages/core/tools/src/events.ts`（`tools/pre-execute` 等）；`docs/capability-seams.md` 表按 `ctx` 键组织 | **GB/T** | 冲突需跨包比对，单包内判不了 |
| E8 | 分发时的 `this` 用 scope carrier（agent 作用域事件路由） | `S2`+`R` | `packages/core/scope/src/index.ts:151-181`（`scopeTarget`：祖先能收后代事件，反向不行）；`packages/core/tools/src/events.ts`（`this: Scoped<ToolsService>`） | **GB/Z** | 只有需要 per-agent 事件路由的插件才涉及 |

---

## F. 作用域与隔离

| # | 契约点 | 判定方式 | 源码证据 | 建议分级 | 理由（一句） |
|---|---|---|---|---|---|
| F1 | 服务注册在正确的 ctx（全局 vs `agent.ctx`） | `S2`+`R` | `packages/core/tools/src/index.ts:63-68`（错误提示："for a per-agent variant, register through that agent's `agent.ctx` instead"） | **GB** | 注册在错的作用域 = 该 agent 看不到、或污染全局 |
| F2 | per-agent 注册**双持有**：既挂 `agent.ctx.effect()`，又把 disposer 存进插件自己的 effect | `S2`+`R` | `practices.md:19`（"Wrap it in one `agent.ctx.effect()` and **also** keep that disposer, keyed by agent, in your plugin's own effect; unloading the plugin does not dispose `agent.ctx` registrations by itself"） | **GB** | 不做就是确定的泄漏：插件卸载后 agent 上的注册全留下 |
| F3 | 用 `ctx.isolate(name, label)` 而非手搓作用域 | `S2` | `context.ts:121-125`（`isolate`：子作用域内读写独立，同 label 合并）；`reflect.ts:300-307`（按 isolate key 分 store） | **GB/Z** | 只有需要"同进程多实现"的高级组合才用 |
| F4 | 组合层用 `cordis:group` 给提供方+消费方同一个 isolate realm | `S1`（YAML/组合层）+`R` | `packages/boot/app-boot/README.md:138`（"a group row gives one `isolate` realm to a provider and its consumers together"）；`compatibility-preflight.ts:130-131` | **GB/T** | 组合层的正确性判据，影响多实例共存 |
| F5 | capability seam 的**定义 / 提供方 / 消费方**三层分离 | `S2`+`H`（半自动） | `docs/capability-seams.md:762`（"Maintenance mode: hybrid: services are discovered from Cordis declarations; interface/implementation/consumer roles are classified in `scripts/gen-doc-graphs.ts` with a completeness guard"）；`packages/skill/skill/src/index.ts:1-10`（自称 "Service Definition role of the skill capability seam"） | **GB**（定义/实现不得混装） / **GB/T**（消费方归类） | 定义包同时 import 实现包 = seam 失效，可直接静态判定；角色分类本身是启发式（见 X-7） |
| F6 | 不跨作用域泄漏：`ctx.<svc>` 的读取发生在正确 isolate 下 | `R` | `reflect.ts:163-180`（按 `defSite[symbols.isolate][prop]` 逐层上溯，isolate 不同直接 throw）；`service.ts:61-63`（`[symbols.filter]` 比较 isolate label） | **GB/T** | 跨作用域读到错实现，行为诡异但不崩 |
| F7 | 用最弱机制达成目的（restrict < guard < waterfall < 整体替换） | `H` | `practices.md:10`（"use the weakest mechanism that suffices"） | **GB/Z** | 纯架构指导，机器只能统计"用了哪种" |

---

## G. 其他

| # | 契约点 | 判定方式 | 源码证据 | 建议分级 | 理由（一句） |
|---|---|---|---|---|---|
| G1 | 有 `locale/*.json` 且 `exports` 暴露 `./locale/*.json` | `S1` | `packages/core/tools/package.json`（`"./locale/*.json"`）；`packages/util/package-manifest/src/types.ts:43-56`（`LocalizedText` / `PluginLocalizedMeta`，`en` 为必填回退） | **GB/T** | 缺 locale 只是显示退化，不影响运行 |
| G2 | 所有用户可见字符串走 i18n | `H`（`X`） | `types.ts:43-44`（`{ readonly en: string; readonly [locale: string]: string }`） | **GB/Z** | 覆盖率不可机械判定 |
| G3 | 日志走 `ctx.logger`，不用 `console.*` | `L`（`no-console`）+`S1` | `vendor/cordis/src/logger.ts`（`LoggerService` / `Message` / `Exporter`）；实际用法 `packages/acp/acp/src/index.ts:100,129`（`const logger = ctx.logger` / `logger.warn(...)`） | **GB/T** | console 输出绕过了宿主的 exporter/级别/归属 fiber，但不致命 |
| G4 | 取消信号传播：`AbortSignal` 透传到每个 await 点 | `S2`（弱）+`R`（取消注入）+`H` | `packages/core/tools/src/index.ts`（`resolve()` 里 `signal.throwIfAborted()` 在每轮循环后复检）；`packages/core/tools/src/events.ts`（"Async gates must observe `exec.signal`"）；仓库内 811 个文件含 `AbortSignal` 字样 | **GB**（长耗时路径） / **GB/T**（其余） | 不传播取消 = 用户中断后后台继续烧 token/子进程，属"基础安全" |
| G5 | 工具 schema 稳定性（影响 prompt / KV cache） | `R`（快照 diff） | `docs/tool-catalog.md:5-9`（"a tool schema is **not statically knowable** … this generator BOOTS each tool plugin on a real context and reads `ctx.tools.schemas()`"；由 `pnpm run verify-tool-catalog` 校验新鲜度） | **GB/T** | 变了不坏但会打爆 KV cache 前缀；只能"运行后 diff"，不能静态判 |
| G6 | 工具 schema 合法（支持 `output { schema, render, presentationMeta? }`、JSON Schema 子集） | `R`（注册即抛） | `packages/core/tools/src/index.ts` `register()`：`throw new TypeError('tool "x" must declare output { schema, render, presentationMeta? }')`；`assertSupportedJsonSchema(output.schema)` | **GB** | 注册时抛错，是硬性可运行约束 |
| G7 | 工具名不与保留名冲突（如 `run_code`） | `R`（注册即抛） | `packages/core/tools/src/index.ts`（`RUN_CODE_NAME` 保留，注册/shadow 都拒绝） | **GB** | 撞名会破坏 PTC 传输层 |
| G8 | 工具名/描述稳定（不随配置漂移） | `R`（多配置快照 diff）+`H` | `docs/tool-catalog.md`（"The registered tool NAME can be a load-time config … so a deployment may expose a package under a different or additional name"） | **GB/T** | 名字可由配置决定，判"是否稳定"要跑多组配置 |
| G9 | 状态派生走 `ctx.sessionProjections` 而非自己扫日志 | `S2`+`H` | `practices.md:26`（"Keep per-session state derived from the log in a `ctx.sessionProjections` unit instead of subscribing to `session/event` and rescanning"） | **GB/Z** | 性能与正确性指导，机器只能看有没有订阅 `session/event` |
| G10 | 不向 session 追加新 `type` 事件 | `S2`+`R` | `practices.md:21`（未知 type 只在 envelope 带 `ignorable: true` 时被接受；`Session.append()` 无法设置 → Session 拒绝重开） | **GB** | 一条不兼容事件可让整个 Session 无法重开，属于数据层"会不会坏" |

---

## X. 「看似能判定，其实判不了」清单

这些是最容易在标准里被写成"检查项"、但机械实现必然假阳性/假阴性的点。**建议：不要放进 GB 强制，或明确降级为人工评审项。**

| # | 看似可判的点 | 为什么判不了 | 证据 |
|---|---|---|---|
| **X-1** | "插件是否正确声明了依赖" —— 运行时冒烟能测出来吗？ | **测不出来。** 未声明 `inject` 的 `ctx.foo` 读取，**只要祖先链上已有该实现就正常返回**；`reflect.ts:172` 只在"声明了 inject 却拿不到"时才把错误改写成 `cannot get required service "X" in inactive context`，`reflect.ts:176` 的 `cannot get property "X" without inject` 只在整条链都找不到时才抛。所以在依赖全部就绪的冒烟环境里，**漏写 inject 的插件 100% 通过**。只能静态 AST 判。 | `reflect.ts:152,163-180` |
| **X-2** | "插件有没有资源泄漏" —— 只看 `getEffects()` | `getEffects()` 只覆盖**登记过**的 effect。`fiber.ts:720` 的 `_unload` 只是 `await` 一遍已登记 disposer：一个裸 `setInterval` / 未 `kill()` 的子进程 / 未 `close()` 的 socket，Cordis **根本不知道它存在**，差分断言全绿它照样泄漏。可机械判的是"已登记的都回收了"，不可判的是"该登记的都登记了"。 | `fiber.ts:712-730`；`C6/C7` |
| **X-3** | "有没有 import 期副作用" —— 扫顶层语句 | AST 只能抓**本文件**顶层。通过 `import './side-effectful-module.ts'` 间接触发、或依赖包在自己模块里 `process.on(...)`，属于跨文件/跨包传播，需要全程序分析才能真正判；而 `packages/workflow/workflow-ptc/src/host.ts:27` 这种"模板字符串里的 `await`"会让纯正则直接假阳性。 | `host.ts:27`；`C5` |
| **X-4** | "错误配置会不会大声失败" —— 只看"进程没崩" | `fiber.ts:693-701`：配置/启动异常被 `_reload` catch，**只 `logger.error` 然后把 fiber 置 `FAILED`**，异常不冒泡到进程。所以"进程没崩"是**必然通过**的假信号。正确断言是 `fiber.state === FiberState.FAILED` 且 logger 收到 error；而"日志是否真的被用户看到"又依赖 exporter 配置，仍不可判。 | `fiber.ts:693-701,580-585` |
| **X-5** | "waterfall 是否调用了 `next()`" —— 跑一次覆盖 | 运行时只能证明**走过的那条路径**调了。`events.ts:253` 只防 `next()` 重复调用，不防"某个分支提前 return 而不调 next"。分支组合不可穷举；静态又受限于"监听器可能来自任意包、任意注册时机"。可行的最强机械结论是"本次冒烟路径未 veto"，不是"不会 veto"。 | `events.ts:246-261`；`practices.md:16` |
| **X-6** | "`@mode` 与分发点一致" —— 交叉校验 | 只对**字面量事件名**有效。`ctx.emit(\`${prefix}/change\`)`、事件名来自变量/配置时，静态无从匹配声明；而 `waterfall` 与 `emit` 的差别只在返回值处理，监听器照常被调用，跑起来"看着正常"。 | `docs/cordis-primer.md:27`；`scripts/jsdoc.ts` |
| **X-7** | "capability seam 三层分离" —— 读 capability-seams 表 | 该表自己声明是 **hybrid**：服务发现是机械的，但 `service / seam / core / bundle` 与"定义/实现/消费方"**角色分类出自 `scripts/gen-doc-graphs.ts` 的启发式**（"with a completeness guard"）。角色判定不是事实，是脚本意见。可机械判的只有"定义包是否静态依赖了某个实现包"。 | `docs/capability-seams.md:762` |
| **X-8** | "工具 schema 是否稳定（不影响 KV cache）" —— 比 JSON | `docs/tool-catalog.md:5-9` 明说 **a tool schema is not statically knowable**（运行时展开的 enum、拼接的 description、配置驱动的名字、raw JSON Schema 的 MCP 工具）。可行的只有"boot 后快照 + diff"（`verify-tool-catalog`）。而 diff 能判"变了"，**判不了"这次变化是否破坏 prompt 前缀顺序/是否值得"**——那是 KV cache 语义，需要人定阈值。 | `docs/tool-catalog.md:5-9` |
| **X-9** | "插件 id 稳定性" —— 看包里有没有 id | 有两套身份：Loader 行的 `id`（组合层持久键）与 registry 的**回调函数身份**（`registry.ts:322`）。后者在 HMR 换模块时必然改变；包内源码里根本没有"id"这个东西。因此"id 稳定"只在 profile YAML / patch 层可判，包内不可判。 | `registry.ts:322`；`compatibility-preflight.ts:81` |
| **X-10** | "AbortSignal 是否传播到底" —— 数 `signal` 出现次数 | 含 `AbortSignal` 的文件有 811 个，但"每个 await 点都透传/复检"等价于路径覆盖问题。`packages/core/tools/src/index.ts` `resolve()` 的正确姿势是**每轮循环后 `signal.throwIfAborted()` 复检**——这种"复检密度"没有静态特征，只能注入取消做行为断言。 | `packages/core/tools/src/index.ts` `resolve()`；`tools/src/events.ts` |
| **X-11** | "日志都走了 `ctx.logger`" —— lint `no-console` | `no-console` 只能证明"没用 console"，证明不了"该记日志的地方记了"；反过来 `const logger = ctx.logger` 之后是否真被用来报异常，也不可判。同理 i18n 覆盖率（G2）只能判"有 locale 文件"，判不了"字符串都走了 i18n"。 | `logger.ts`；`packages/acp/acp/src/index.ts:100` |
| **X-12** | "重挂幂等" —— 只比 `registry.size` | `fiber.ts:783-819` 的 `update()` 走 `internal/update` waterfall，**监听器可以 veto 重启**（`result === undefined` 时直接 `publish()` 返回）。所以"重挂"可能被别人拦掉，冒烟里表现为幂等，实际是没重挂。必须同时断言 epoch/revision 真的推进了。 | `fiber.ts:783-819`；`events.ts:139-154` |

---

## 附：一条建议的机械流水线（对应三级的落地形态）

1. **静态层（GB 的骨架）**：解析 `package.json` → `S1`（A1/A2/A4/A5）；AST 扫插件导出 `name` / `inject` / `provide` / `Config`（A6/A7、B1/B5）；AST 收集 `ctx.<member>` 读集合与 `inject` 键比对（B2）；顶层 `AwaitExpression` 与裸全局副作用（C5/C6）；`Events` 声明合并与 `@mode`（E1/E2）。
2. **类型层**：`tsc --noEmit` 覆盖事件签名、Config 与插件入参（A7、E1、B5）。
3. **lint 层**：`no-console`、禁用裸 `setInterval` 未包 effect、禁用未类型化的字符串事件名（C1/C6/C9、G3、E1）。
4. **运行时冒烟（GB 的核心，唯一能证明 C2/C3 的手段）**：
   `boot → 快照 S0(registry/props/store/_hooks/getEffects) → 断言功能 → dispose → 快照 S1 → 断言 S1 == 基线 且 fiber.state∈{UNLOADING,DISPOSED} → 重挂 → 快照 S2 → 断言 S2 == S0 且 revision 已推进`。
   再叠加：错误配置注入（断言 FAILED，非"不崩"）、取消注入（断言 quiesce）、工具 schema 快照 diff（G5/G8）。

**分级落点建议**：把 `A1/A2/A3/A7`、`B1/B2/B5/B6`、`C1/C2/C3/C5/C9`、`D1/D2/D5`、`E1/E5`、`F1/F2`、`G6/G7/G10` 定为 **GB**；`A4/A5/A6/A8/A9`、`B4/B7`、`C4/C7/C10`、`D3/D4`、`E2/E3/E4/E6/E7`、`F4/F5(消费方)/F6`、`G1/G3/G4/G5/G8` 定为 **GB/T**；`B8`、`D6/D7`、`E8`、`F3/F7`、`G2/G9` 定为 **GB/Z**。`X-1…X-12` **不进 GB**，需在标准正文里显式标注为"人工评审 / 行为断言（非结构断言）"。

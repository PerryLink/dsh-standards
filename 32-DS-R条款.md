# 32 · DS-R 推荐级条款（定稿候选）

> **v1 历史命名**：v2 以 `89-三套标准命名决定.md` 为准（DSH-ENTRY / DSH-FLOW / DSH-BOOST）；本文件保留旧码作历史，不在新文档引用。

> **版本**：v1.0.0-rc.1（T1 定稿候选，待工作组确认）
> **日期**：2026-10-31
> **依据**：`01-项目纲领.md`、`03-可行性与条款草案.md`、`10-输入/源码取证索引.md`、`20-研究底稿/B-Cordis契约可判定性矩阵.md`、`20-研究底稿/E-一致性检查器可行性.md`、`20-研究底稿/F-GBZ级Cordis效能实践.md`，以及 `deepseek-harness` 源码实测（commit `ce7073d51254c26cd63b22a60835b8f948deb447`）。
> **覆盖条款**：R-1 ～ R-12（R-11/R-12 仅 listing profile，见 §1.4）。
> **已知未完成项**：
> 1. **DS-R 检查器未实现**；DS-C 检查器已实现（`40-checker`，16 tests）。本文件给 `DSR-01`～`DSR-12` 的判定方式与机器/人工分界。
> 2. R-5/R-6/R-7/R-8/R-10 依赖人工评审或 L4 行为断言；没有人工签署时只能出 `proposed`，不能声称 DS-R。
> 3. R-11/R-12 是 listing 模式条款；package 模式只能给 NA 或弱证据。
> 4. 角色分类（定义/提供方/消费方）依赖 `scripts/gen-doc-graphs.ts` 的启发式，不是事实（X-7）。
> 5. DS-R 的复审周期、工作组与上诉机制由 T6（`80`/`84`/`86`）给出草案；真实工作组/签署仍未建立。

---

## 一、总则

### 1.1 DS-R 回答什么

DS-R 推荐级回答：**这个插件跑得顺、可维护、契约正确吗？**

它与 DS-C 是**不同的问题**，不是更高的分数：

- DS-C = 能装、能跑、不破坏宿主；
- DS-R = 与 Cordis 契约正确对齐：生命周期、依赖声明、配置、事件、作用域；
- DS-G = 用足框架、更快更好（另一份文件）。

DS-R 不重复 DS-C 的强制项。通过 DS-R **隐含**通过 DS-C；若 DS-C 未通过，DS-R 不得单独发证。

### 1.2 判定主体：机器为主 + 工作组共识

| 类型 | 谁判 | 证据形态 |
|---|---|---|
| 机器可判（M） | 检查器 | 源码 AST、manifest、L0.5/L1/L2/L3 运行时观测 |
| 机器辅助 + 人工（M+H） | 检查器给线索，工作组签署 | 机器证据 + 评审记录 + 反例/豁免理由 |
| 人工（H） | 工作组 | 代码阅读、行为断言、设计意图说明 |

**硬规则**：机器全绿不能替代人工项；人工项缺失时，结论是 `proposed`（提案），不是 `confirmed`（已确认）。`proposed` 不得对外宣称 "DS-R"。

### 1.3 三值与 NA

| 结果 | 含义 |
|---|---|
| `PASS` | 条款满足；机器项有证据，人工项有签署 |
| `WARN` | 部分满足、使用了替代写法、或证据不足；不阻断但必须披露 |
| `FAIL` | 有明确反例；阻断 DS-R（不阻断安装） |
| `NA` | 形态/场景不适用；**不是 PASS** |
| `ERROR` | 检查器失效；exit 2；不得当通过 |

每个条款还要带 `method: M | M+H | H` 与 `coverage: full | partial | not-run`。**禁止"跳过即通过"**。

### 1.4 两个 profile

R-11/R-12 是 listing 属性（市场条目的 `status`/`upstream`/`mirrorOf`），package 模式拿不到。因此 DS-R 分两个 profile：

- `package`（作者本地）：R-1～R-10 共 10 条；R-11/R-12 为 `NA`。
- `listing`（市场门禁）：R-1～R-12 共 12 条。

徽章必须分别写 `DS-R (package)` / `DS-R (listing)`，不得混写。`NA` 是显式不适用，不是"没跑"。

### 1.5 版本锚与失效

与 DS-C 相同的五元锚：`(repo, commit, scanner, dsh, cordis)`。本 commit：`dsh=0.2.2-alpha.2`、`cordis=4.0.6-alpha.1`（上游基线 `4.0.0-rc.11`，见 `REPO/vendor/README.md:19`）。

- 宿主 minor bump → DS-R 徽章 `stale`，需重跑；
- Cordis 跨 minor → 适配层必须重验；
- DS-R 复审周期 **≤ 6 个月**；到期未复审 → `expired`，不得继续展示。

### 1.6 不排名、不打分

DS-R 是条款集合（`package` 10 条 / `listing` 12 条），不是分数。禁止折算总分、禁止"R 分高/低"、禁止把 DS-R 当"比 DS-C 高级"。一个插件可以 DS-C 通过而 DS-R 不通过；这不表示它"差"，只表示它没有对齐推荐契约。

---

## 二、DS-R 条款

### R-1 用 inject 声明依赖，不靠加载顺序

**要求（祈使句）**：插件必须在 `inject` 中声明运行时会读取的全部宿主服务；不得依赖 Loader 行序；可选依赖不得写进 `inject`，应在调用点用 `ctx.get()` 或 `ctx.inject()` 等待；不得用 try/catch 吞掉"服务还没到"。

**判定方式**：L0 AST（DSR-01，M）。收集源码中 `ctx.<service>` 的成员读，与服务名清单比对 `inject` 键；动态访问 `ctx[name]`/`ctx.get(name)` 记 WARN。

| 子项 | 检查 | 结果 |
|---|---|---|
| R-1.1 | 静态可读的每个宿主服务都在 `inject` 中 | 缺失 → FAIL |
| R-1.2 | `inject` 中的每个服务都在源码中被真实读取 | 多声明 → WARN（会导致级联重挂，T14） |
| R-1.3 | 可选依赖用 `ctx.get()` / `ctx.inject()`，不写进 `inject` | 用 try/catch 包 `ctx.<service>` → WARN |
| R-1.4 | 动态服务名（`ctx[name]`、配置驱动） | 无法静态比对 → WARN，转人工 |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | R-1.1 满足；R-1.2 无多声明；R-1.4 无动态访问 |
| WARN | R-1.2 多声明；R-1.3 用 try/catch；R-1.4 动态访问 |
| FAIL | R-1.1 缺失；或插件在缺服务时靠"先加载"才能工作 |
| NA | 插件不读任何宿主服务 |

**已知反例**：
- 消费方直接 `ctx.tools.xxx` 而不 `inject`：在依赖就绪的冒烟环境里 100% 通过；换一个组合就 PENDING 或 TypeError（`REPO/docs/cordis-tutorial/03-services.md:72`；`20/B` X-1）。
- 反过来，为了"启动顺序" inject 一个并不真正依赖的服务：该服务每次热替换都会带着插件一起重挂（`REPO/vendor/cordis/src/fiber.ts:617-628`；`20/F` T14）。

**证据锚点**：
- `REPO/vendor/cordis/src/registry.ts:37-60`：`@Inject` 装饰器；`:71-88` `Inject.resolve` 归一化；`:330` 构造 Fiber 时解析 `plugin.inject`。
- `REPO/vendor/cordis/src/reflect.ts:152,172-176`：无 inject 时只有在整条链都找不到才抛；依赖就绪则正常返回。
- `REPO/docs/cordis-tutorial/03-services.md:52-72`：inject/PENDING 语义。

**正面示例**：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'greet-tool'
export const inject = ['tools'] as const

export function apply(ctx: Context) {
  ctx.tools.register(/* ... */)
}
```

**建议分级**：DS-R（推荐级）；对应 `20/B` B1/B2。伪阳性主要来自动态访问，一律 WARN，不 FAIL。

**边界说明**：X-1 说明"漏写 inject"在运行时不可判；R-1 只能静态判，动态访问必须转人工。服务名清单来自 `Context` 接口的声明合并（`declare module '@deepseek-ai/cordis' { interface Context }`）与内置服务（events/logger/reflect/registry/fiber）；检查器应维护一份版本化清单，未知 `ctx.<name>` 只记 WARN，不误判为"漏 inject"。R-1 不判"这个依赖是否必要"——那是设计评审。

---

### R-2 资源登记进 effect，清理顺序显式化

**要求（祈使句）**：所有资源注册必须由 `ctx.effect()` / `ctx.on()` / 注册表的 `register()` 承载并返回 disposer；顺序敏感的清理必须放在同一个 generator effect 里顺序 `yield`，或放在同一个 disposer 里顺序 `await`；不得依赖"逆序注册"保证异步清理顺序。

**判定方式**：L0 AST + L1 effect 树 + L2 差分（DSR-02，M+H）。

| 子项 | 检查 | 结果 |
|---|---|---|
| R-2.1 | 定时器/watcher/子进程/socket/临时文件在 `ctx.effect` 内获取并返回 disposer | 裸分配 → FAIL（明确）；模式可疑 → WARN |
| R-2.2 | effect 有可读 label（不是全 `anonymous`） | 全匿名 → WARN |
| R-2.3 | 有依赖关系的清理（provider/consumer、资源/服务）在同一 generator effect 中顺序 yield | 分开注册且顺序敏感 → WARN；有明确反例 → FAIL |
| R-2.4 | 卸载后 effect 归零（C-7 前置） | 非零 → FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | R-2.1～R-2.4 满足；顺序敏感清理显式化 |
| WARN | 有裸分配但手动注册了 disposer；label 全匿名；顺序敏感但无法证明 |
| FAIL | 资源无 disposer；直接写私有注册面；卸载后 effect 非零 |
| NA | 插件不获取任何外部资源 |

**已知反例**：
- `fiber.ts:720` 对多个异步 disposer 做 `Promise.all`：逆序只是**启动顺序**，异步清理是并发的；"我先注册资源、后注册服务"不保证"服务先撤、资源后关"（`REPO/vendor/cordis/src/fiber.ts:720`；`REPO/docs/cordis-tutorial/02-lifecycle-and-effects.md:94`；`20/F` F2.4/T10）。
- provider 把 `ctx.provide` 与资源放在不同 effect：provider 的 store 条目先被删，consumer 的 cleanup 还在跑，调用到已死服务（`REPO/vendor/cordis/src/reflect.ts:311-325`；`20/F` F2.5）。

**证据锚点**：
- `REPO/vendor/cordis/src/fiber.ts:421-567`：effect 接受函数/Promise/生成器；`:433-448` 逆序同步释放。
- `REPO/vendor/cordis/src/fiber.ts:720`：卸载时 `Promise.all` 并发。
- `REPO/vendor/cordis/src/reflect.ts:311-325`：provide disposer 等 dependents。
- `REPO/docs/cordis-tutorial/02-lifecycle-and-effects.md:9-27,84-94`：timer effect 与并发告警。
- `REPO/packages/llm/llm/src/index.ts:408-417`：generator effect 注册 adapter 的模范。

**正面示例**：

```ts
export function apply(ctx: Context) {
  ctx.effect(function* () {
    const timer = setInterval(() => { /* ... */ }, 1_000)
    yield () => clearInterval(timer)
    yield ctx.provide('greet', api)   // 服务最后发布
  }, 'greet.resources')
}
```

**建议分级**：DS-R（推荐级）；对应 `20/B` C1/C2/C8、`20/F` F2.1/F2.4/F2.5。

**边界说明**：R-2 仍不能证明"未登记资源无泄漏"（X-2）。它判"已知资源 + 已登记 effect + 顺序敏感清理"，不判"绝对无泄漏"。

---

### R-3 配置有 schema、有默认值、错误大声失败

**要求（祈使句）**：插件必须导出 Standard Schema 的 `Config`，字段带默认值；非法配置必须让 fiber 进入 `FAILED` 并抛出 `ValidationError`，不得静默兜底；配置校验不得是异步的。

**判定方式**：L0.5 导入不 apply + L1 配置注入（DSR-03，M）。

| 子项 | 检查 | 结果 |
|---|---|---|
| R-3.1 | `Config` 是 Standard Schema 值（有 `~standard.validate`），不是普通对象 | 普通对象 → FAIL |
| R-3.2 | 空对象 `{}` 能通过校验（默认值齐全） | 失败 → WARN/FAIL（看是否必填） |
| R-3.3 | 注入非法配置：抛 `ValidationError`，fiber `FAILED` | 不抛/不 FAILED → FAIL |
| R-3.4 | 源码中无 `config.x ?? default` 式兜底（默认值应在 schema） | 命中 → WARN |
| R-3.5 | 配置校验不是 `async` | 异步 → FAIL（Cordis 直接抛 TypeError，`fiber.ts:54-56`） |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | R-3.1～R-3.3、R-3.5 满足；无 R-3.4 命中 |
| WARN | 无 `Config` 但插件完全不读配置；有默认值缺失但字段必填；R-3.4 命中 |
| FAIL | `Config` 是普通对象；非法配置不抛/不 FAILED；异步校验 |
| NA | 插件不接收配置 |

**已知反例**：
- `export const Config = { ... }` 普通对象：Cordis 不会校验，教程原文 "a plain object exported as `Config` will not work"（`REPO/docs/cordis-tutorial/05-config.md:34-36`）。
- `apply(ctx, config)` 里到处 `config.timeout ?? 30_000`：schema 没有默认值，配置永远"看起来生效了"（`20/F` F3.2/F3.4）。

**证据锚点**：
- `REPO/vendor/cordis/src/fiber.ts:50-62`：`resolveConfig` 走 `Config['~standard'].validate`；`:54-56` 异步校验直接抛。
- `REPO/vendor/cordis/src/fiber.ts:19-36`：`ValidationError` 聚合 issues。
- `REPO/vendor/cordis/src/fiber.ts:693-701`：启动/配置异常置 `FAILED`，不冒泡。
- `REPO/docs/cordis-tutorial/05-config.md:34-36,51,53-68`：schema/默认值/大声失败。
- `REPO/packages/core/agent-loop/src/index.ts:296`：`.default(...).volatile()` 的模范。

**正面示例**：

```ts
import Schema from '@deepseek-ai/schemastery'

export const Config = Schema.object({
  greeting: Schema.string().default('Hello'),
  timeoutMs: Schema.number().default(30_000),
})

export function apply(ctx: Context, config: ReturnType<typeof Config>) {
  // config 已是完整、校验后的值
}
```

**建议分级**：DS-R（推荐级）；对应 `20/B` D1/D2/D5、`20/F` F3.1/F3.2/F3.4。

**边界说明**：X-4 说明"进程没崩"是假信号；R-3.3 必须断言 `fiber.state === FAILED`，不能只断言"没崩"。

---

### R-4 事件类型化，@mode 与分发一致

**要求（祈使句）**：插件声明/监听的事件必须通过 `declare module '@deepseek-ai/cordis' { interface Events }` 类型化；新事件 JSDoc 必须带 `@mode` 与 payload 的 `@param`；事件名必须是字面量；`@mode` 必须与所有字面量分发点一致。

**判定方式**：L0 AST + 类型检查（DSR-04，M+H）。字面量事件名可自动比对；动态名只能 WARN。

| 子项 | 检查 | 结果 |
|---|---|---|
| R-4.1 | 每个字面量事件名都在 `Events` 声明合并中 | 未声明 → FAIL |
| R-4.2 | 每个新事件有 `@mode`，且与 `ctx.emit/waterfall/parallel/serial/bail` 一致 | 缺失/矛盾 → FAIL（字面量）或 WARN（动态） |
| R-4.3 | 事件名是字面量；模板字符串/变量名 | 动态 → WARN |
| R-4.4 | payload 的 `@param` 与签名一致 | 缺失 → WARN |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | R-4.1/R-4.2 全部满足；无动态名 |
| WARN | R-4.3 动态名；R-4.4 缺 `@param`；事件名来自配置 |
| FAIL | 字面量事件未声明；`@mode` 与字面量分发方法矛盾 |
| NA | 插件不发/不听任何事件 |

**已知反例**：
- ``ctx.emit(`ns/${id}`)``：失去类型与 `@mode` 校验，进不了生成的 producer/consumer 矩阵（`20/F` T4）。
- 声明 `@mode waterfall`，实际用 `ctx.emit` 发：监听器照常被调用，但返回值语义丢失，跑起来"看着正常"（X-6）。

**证据锚点**：
- `REPO/packages/core/tools/src/events.ts:1-58`：完整的 `Events` 声明合并与 `@mode` 标注范本。
- `REPO/vendor/cordis/src/events.ts:334-371`：内置事件清单与 `@mode`。
- `REPO/docs/cordis-primer.md:19-27`：dispatch mode 是事件公开契约的一部分。
- `REPO/docs/cordis-tutorial/04-events.md:12-21,44,138`：声明合并/命名/waterfall 纪律。
- `REPO/docs/event-producer-consumer.md:11`：生成的 mode/声明/派发/监听矩阵。

**正面示例**：

```ts
declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * @param name - the greeting target
     * @mode emit
     */
    'greet/done'(name: string): void
  }
}

ctx.emit('greet/done', name)
```

**建议分级**：DS-R（推荐级）；对应 `20/B` E1/E2/E3、`20/F` F4.1/F4.2。

**边界说明**：X-6：动态事件名不可判；R-4 只对字面量有效。不要把"全部事件都类型化"写成 DS-C 的强制项。

---

### R-5 waterfall 监听器必须委派，短路必须有所有权

**要求（祈使句）**：waterfall 监听器在不拥有决策时必须调用 `next()`；短路（不调 `next()`）必须有显式所有权声明（JSDoc `@owns-decision` 或等价注释）；改写决策对象时必须展开原对象，不得丢掉未修改字段。

**判定方式**：L0 AST + 人工评审（DSR-05，M+H）。静态只能看"有没有调用 `next()`"和"有没有所有权注释"；分支路径覆盖靠人。

| 子项 | 检查 | 结果 |
|---|---|---|
| R-5.1 | 监听器函数体内至少有一条 `next()` 调用 | 完全没有 → FAIL（除非有 `@owns-decision`） |
| R-5.2 | 每个 `return` 分支要么调 `next()`，要么有所有权注释 | 可疑短路 → WARN；明确反例 → FAIL |
| R-5.3 | 改写决策对象时用 `{ ...decision, ... }` | 直接替换对象 → WARN/FAIL |
| R-5.4 | 监听器注册在 waterfall 事件上（不是 emit/parallel 事件） | 模式不匹配 → WARN |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | R-5.1/R-5.2/R-5.3 满足；每个短路分支有所有权说明 |
| WARN | 有短路但注释不充分；改写对象未展开；分支复杂无法静态判定 |
| FAIL | 观察型监听器完全不调 `next()` 且无所有权声明；明确吞掉默认行为 |
| NA | 插件没有 waterfall 监听器 |

**已知反例**：
- 一个只做日志的 waterfall 监听器 `return` 而不 `next()`：整条链的默认行为被静默吞掉，插件"加载成功、事件也触发了"，极难定位（`REPO/docs/cordis-tutorial/04-events.md:138`；`REPO/vendor/cordis/src/events.ts:246-261`）。
- 改写决策对象时直接 `return { messages }`，丢掉 `startsRequestSeries` 等字段（`20/F` F4.3）。

**证据锚点**：
- `REPO/vendor/cordis/src/events.ts:246-261`：waterfall 组合；`:253-256` 只防重复 `next()`，不防"提前 return 不调 next"。
- `REPO/docs/cordis-tutorial/04-events.md:138`：观察型监听器必须 `next()`。
- `REPO/docs/cordis-primer.md:31-35`：waterfall 语义与"拥有决策才短路"。
- `REPO/packages/compaction/compaction/src/index.ts:88-104`：拥有决策时才短路的范式。

**正面示例**：

```ts
ctx.on('agent/pre-step', (decision, next) => {
  // 只观察/注解：必须委派
  return next()
}, { prepend: true })
```

**建议分级**：DS-R（推荐级）；对应 `20/B` E5/E6、`20/F` F4.3。

**边界说明**：X-5：运行时只能证明"走过的路径调了 next"，不能证明"所有分支都不会 veto"；R-5 的最终结论必须有人工签署。

---

### R-6 插件之间不 import 彼此实现

**要求（祈使句）**：插件之间不得 import 彼此的实现；只允许 `import type` 服务定义/声明合并包；运行时通过 `ctx.<service>` 与事件连接；不得用相对路径进入别的包的 `src`。

**判定方式**：L0 import 图 + 人工（DSR-06，M+H）。

| 子项 | 检查 | 结果 |
|---|---|---|
| R-6.1 | 运行时 import 中不含另一个插件的实现包 | 命中 → FAIL |
| R-6.2 | 服务定义只用 `import type {}` / 类型导入 | 运行时导入定义包 → WARN |
| R-6.3 | 无相对路径 `../../<other-package>/src/...` | 命中 → FAIL |
| R-6.4 | provider/consumer 之间没有直接构造/调用 | 命中 → FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | R-6.1/R-6.3/R-6.4 满足；R-6.2 只用类型导入 |
| WARN | 运行时导入了定义包但只用其类型（打包器可能 tree-shake）；角色分类不确定 |
| FAIL | 运行时 import 实现包；相对路径穿透包边界 |
| NA | 插件不依赖任何其他插件 |

**已知反例**：
- consumer 直接 `import { LlmService } from '@deepseek-ai/dsh-llm'` 并 `new` 它：provider 一换，consumer 就断（`REPO/docs/user/develop/practice/index.md:50-56`）。
- 测试夹具用相对路径进入另一个包的 `src`：绕过 `exports` 与包边界检查（`REPO/docs/defensive-patterns/package-surface.md:7-43`）。

**证据锚点**：
- `REPO/docs/user/develop/practice/index.md:50-56`：Provider 与 Consumer 互不依赖，只依赖 Definition。
- `REPO/docs/defensive-patterns/package-surface.md:7-43`：包入口/相对路径的边界。
- `REPO/docs/cordis-tutorial/07-into-the-harness.md:96`："Neither of your plugins knows the other exists."
- `REPO/docs/capability-seams.md:733,741,743`：shell/fs/subagents 的定义/实现/消费方表。

**正面示例**：

```ts
import type {} from '@deepseek-ai/dsh-tools'   // 只为声明合并
// 运行时只通过 ctx.tools 访问
```

**建议分级**：DS-R（推荐级）；对应 `20/B` B5、`20/F` F4.4/F5.3。

**边界说明**：X-7：定义/实现/消费方的角色分类是 `scripts/gen-doc-graphs.ts` 的启发式；R-6 只硬判"定义包是否静态依赖实现包"，角色歧义转人工。

---

### R-7 作用域：全局管公共，变体走 agent.ctx

**要求（祈使句）**：per-agent 变体必须注册在该 agent 的 `agent.ctx`；全局注册只用于所有 agent 共享的公共能力；限制类 API 必须在作用域上下文调用；per-agent 注册必须双持有 disposer（既挂 `agent.ctx.effect()`，又把 disposer 存进插件自己的 effect）。

**判定方式**：L0 AST + L1 + 人工（DSR-07，M+H）。

| 子项 | 检查 | 结果 |
|---|---|---|
| R-7.1 | per-agent 变体使用 `agent.ctx`，不是 root ctx | 在 root 做条件注册 → FAIL |
| R-7.2 | 限制类 API（`restrict`/`deny`）只在作用域 ctx 调用 | 在 root 调用 → FAIL |
| R-7.3 | per-agent 注册的 disposer 被插件 effect 持有（双持有） | 只挂 agent.ctx → FAIL（确定泄漏） |
| R-7.4 | 全局注册不含"按 agent 条件"的分支 | 命中 → WARN/FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | R-7.1～R-7.3 满足；R-7.4 无命中 |
| WARN | 作用域来源不明确（ctx 作为参数传递）；全局注册带 agent 过滤但无法证明意图 |
| FAIL | 变体注册在 root；`restrict` 在 root；per-agent 注册无插件侧 disposer |
| NA | 插件不做 per-agent 注册 |

**已知反例**：
- 为了"某个 agent 不一样"而在全局做条件注册：所有 agent 都看到，同名注册直接抛错（`REPO/packages/core/tools/src/index.ts:69`；`REPO/packages/core/system-prompt/src/index.ts:415-422`）。
- `restrict` 在全局 ctx 调用：错误信息明确 "a context-global restriction would mask every agent — deny the tool for the intended agent instead"（`REPO/packages/core/tools/src/index.ts:162-171`）。
- per-agent 注册只挂 `agent.ctx.effect()`，插件卸载时 `agent.ctx` 不会自动 dispose 这些注册（`practices.md:19`）。

**证据锚点**：
- `REPO/packages/core/tools/src/index.ts:62-71`：重名错误与 `agent.ctx` 提示；`:162-171` `restrict` 的作用域约束。
- `REPO/packages/core/system-prompt/src/index.ts:415-422`：section/variable 的同名错误。
- `REPO/packages/core/scope/README.md:27`：`agent.ctx` 注册只对该 agent 可见。
- `REPO/packages/core/agent/README.md:174`：`agent.ctx` 可遮蔽全局。
- `REPO/packages/preset/agent-preset/skills/cordis-plugin-development/references/practices.md:19`：双持有 disposer。

**正面示例**：

```ts
ctx.on('agent/created', (agent) => {
  const dispose = agent.ctx.tools.register(/* agent-only tool */)
  ctx.effect(() => dispose, 'greet.agentTool')   // 双持有
})
```

**建议分级**：DS-R（推荐级）；对应 `20/B` F1/F2、`20/F` F5.1/F5.5。

**边界说明**：R-7 的"意图"（这个注册是不是 per-agent 变体）是语义判断；静态只能抓"在 root 上按 agent 条件注册"这种明确反例，其余转人工。

---

### R-8 取消信号贯穿到底

**要求（祈使句）**：长耗时工具/操作必须接收并传播 `exec.signal`；每个 `await` 之后必须复检 `signal.throwIfAborted()`；取消后不得继续产生副作用；工具不得吞掉取消错误。

**判定方式**：L0 AST（弱）+ L4 取消注入 + 人工（DSR-08，M+H）。

| 子项 | 检查 | 结果 |
|---|---|---|
| R-8.1 | 工具 `execute` 接收 `exec.signal` 并传给下游 | 未接收/未传 → WARN/FAIL |
| R-8.2 | 每个 `await` 后有 `throwIfAborted()` 或等价复检 | 缺失 → WARN（路径覆盖不可判） |
| R-8.3 | 取消注入测试：abort 后不再启动新工作、已启动的工作 drain/commit | 失败 → FAIL |
| R-8.4 | 不吞取消错误（不把 `AbortError` 当成功） | 吞掉 → FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | R-8.1～R-8.4 满足；取消测试通过 |
| WARN | 接收了 signal 但复检不足；动态调用图无法证明；L4 不可构造 |
| FAIL | 长耗时工具完全忽略 signal；取消后仍产生副作用；吞掉 AbortError |
| NA | 插件没有长耗时操作 |

**已知反例**：
- 用轮询/定时器等待，取消后循环继续跑：轻载正常，重载/批处理下静默失败（`REPO/docs/defensive-patterns/general.md:19-23`；`20/F` T16）。
- 只在入口检查一次 signal，`await` 之后不再复检：取消后仍写文件/发请求（X-10）。

**证据锚点**：
- `REPO/packages/core/tools/src/events.ts:10-13,32-36`：async gate 必须观察 `exec.signal`；wrapper 只能改 signal，registry 会 re-fuse 原 signal。
- `REPO/packages/core/tools/src/batch.ts:50-88`：abort 时 stops starts / drains / commits。
- `REPO/packages/core/tools/src/index.ts:264-297`：`resolve()` 中多处 `throwIfAborted()`。
- `REPO/packages/core/agent-loop/src/index.ts:112-149`：`raceAbort`/`raceAbortCall` 与 `releaseAbandoned`。

**正面示例**：

```ts
async execute(exec: ToolExecution) {
  exec.signal.throwIfAborted()
  const result = await doWork(exec.signal)
  exec.signal.throwIfAborted()
  return result
}
```

**建议分级**：DS-R（推荐级）；对应 `20/B` G4、`20/F` F6.4。

**边界说明**：X-10：`AbortSignal` 出现次数不等于传播到底；R-8 的强结论必须来自 L4 取消注入 + 人工路径审查，静态只给线索。

---

### R-9 日志走 ctx.logger，不用 console.*

**要求（祈使句）**：运行时日志必须走 `ctx.logger`，不得使用 `console.log/warn/error`；不得自建日志通道绕过宿主的 exporter/级别/归属 fiber。

**判定方式**：L0 lint/AST（DSR-09，M）。

| 子项 | 检查 | 结果 |
|---|---|---|
| R-9.1 | 运行时代码无 `console.*` | 命中 → FAIL |
| R-9.2 | `ctx.logger` 的使用带上下文（fiber 归属自动） | 只用 `console` → FAIL |
| R-9.3 | 测试/示例里的 `console.*` | 只算 WARN，不 FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | R-9.1 满足 |
| WARN | 仅测试/示例命中；或 `ctx.logger` 被包了一层但没传 fiber 上下文（无法自动判） |
| FAIL | 运行时源码命中 `console.*` |
| NA | 插件不产生日志 |

**已知反例**：
- 教程里的最小插件用 `console.log`（`REPO/docs/cordis-tutorial/07-into-the-harness.md:60-70`）——教程可以，插件不行：console 输出绕过 Cordis 的 logger/exporter/级别/归属 fiber（`20/F` F8.1）。
- 用 `process.stdout.write` 绕过 logger，同样丢失归属与级别。

**证据锚点**：
- `REPO/vendor/cordis/src/logger.ts:29-38`：`Message` 含 `fiber?: WeakRef<Fiber>`；`:83` `Logger`；`:194` `LoggerService`。
- `REPO/packages/acp/acp/src/index.ts:100,129`：`const logger = ctx.logger` / `logger.warn(...)`。
- `REPO/docs/cordis-tutorial/06-composition-and-hmr.md:42`：HMR 日志走 Cordis logger；没有 console exporter 就看不到。

**正面示例**：

```ts
export function apply(ctx: Context) {
  ctx.logger('greet').info('greet plugin loaded')
}
```

**建议分级**：DS-R（推荐级）；对应 `20/B` G3、`20/F` F8.1。

**边界说明**：X-11：`no-console` 只证明"没用 console"，证明不了"该记的记了"；日志覆盖率是人工评审，不是 R-9 的 PASS 条件。

---

### R-10 通知型派发逐 listener 容错

**要求（祈使句）**：通知型事件的派发必须逐个 listener 容错，不得让一个同步 `throw` 饿死后续 listener；异步 listener 的 rejection 必须被捕获并记录；不得把"某个观察者崩了"升级成"业务操作失败"。

**判定方式**：L0 AST + L4 行为 + 人工（DSR-10，M+H）。

| 子项 | 检查 | 结果 |
|---|---|---|
| R-10.1 | 通知型事件用 `ctx.events.dispatch('emit', args)` + per-listener try/catch | 用裸 `ctx.emit` 派发多 listener → WARN |
| R-10.2 | 异步 listener 的返回 Promise 有 `.catch`/`then(undefined, ...)` | 未处理 → FAIL（unhandled rejection） |
| R-10.3 | 失败落到 `ctx.logger.warn/error` | 静默吞 → WARN |
| R-10.4 | 行为断言：注册两个 listener，一个 throw，另一个仍被调用 | 失败 → FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | R-10.1～R-10.4 满足 |
| WARN | 用裸 `ctx.emit` 但只有单个 listener；失败未记录；L4 不可构造 |
| FAIL | 显式循环无 try/catch；async rejection 未处理；一个 throw 饿死其余 |
| NA | 插件不派发通知型事件 |

**已知反例**：
- `ctx.emit` 的实现是 `for (const callback of callbacks) Reflect.apply(...)`：一个同步 throw 直接中断循环，后续 listener 收不到（`REPO/vendor/cordis/src/events.ts:203-206`）。`llm` 的注释写的是 "Array.map"，实际实现是 `for-of`，但结论相同：必须逐 callback 容错（`REPO/packages/llm/llm/src/index.ts:367-391`）。
- `parallel` 用 `Promise.allSettled`，但会把所有 rejection 聚合成 `AggregateError` 抛给派发方（`REPO/vendor/cordis/src/events.ts:191-196`）；纯观察型广播不该用它（T7）。

**证据锚点**：
- `REPO/vendor/cordis/src/events.ts:191-196,203-206`：parallel/emit 的失败语义。
- `REPO/packages/llm/llm/src/index.ts:367-391`：逐 listener try/catch + async rejection 处理。
- `REPO/packages/core/agent-loop/src/index.ts:396-405`：同构的 per-callback 容错。
- `REPO/docs/defensive-patterns/general.md:200-212`：dispatcher 的容错规则。

**正面示例**：

```ts
for (const listener of ctx.events.dispatch('emit', ['greet/changed', value])) {
  try {
    const result = listener()
    if (result && typeof result.then === 'function') {
      void result.catch(error => ctx.logger.warn(error))
    }
  } catch (error) {
    ctx.logger.warn(error)
  }
}
```

**建议分级**：DS-R（推荐级）；对应 `20/B` C9、`20/F` F4.5/F8.4。

**边界说明**：R-10 的"通知型"是语义分类；`emit` 用于单 listener 或同步观察是合法的。L4 行为断言需要能构造两个 listener 的夹具。

---

### R-11 生命周期状态机器可读

**要求（祈使句）**：插件在市场/登记条目中必须声明机器可读的生命周期状态（`active` / `frozen` / `retired` / `deprecated` / `unknown`）与最近复核日期；状态不得从 star 数、更新时间或目录收录推断；`retired`/`deprecated` 条目必须给出替代或说明。

**判定方式**：L0 listing 模式（DSR-11，M）；package 模式可选看 `dsh.lifecycle`。

| 子项 | 检查 | 结果 |
|---|---|---|
| R-11.1 | listing 条目有 `status`，值在闭集内 | 缺失 → WARN；非法 → FAIL |
| R-11.2 | 有 `lastReviewedAt`（ISO 日期） | 缺失/超 6 个月 → WARN |
| R-11.3 | `retired`/`deprecated` 有 `replacement` 或 `reason` | 缺失 → WARN |
| R-11.4 | package 的 `dsh.lifecycle` 与 listing `status` 一致 | 矛盾 → WARN/FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | R-11.1/R-11.2 满足；R-11.3 在需要时满足；R-11.4 一致 |
| WARN | 缺 `status`（历史条目）；复核超期；缺 `replacement` |
| FAIL | 非法 `status`；listing 与 manifest 矛盾；`retired` 仍可无提示安装 |
| NA | package 模式且无 listing；或非 plugin |

**已知反例**：
- `tabbit-browser/dsh-plugin` 已 404 仍被 3 个目录收录（`10-输入/生态调研报告.md:264`）——没有 `status` 的直接后果。
- `dsh-purge` 四个并行主体，没有统一的 active/frozen/retired 声明（`10-输入/生态调研报告.md:36-59`）。
- 外部目录 star 滞后约 6–8 倍，monorepo 子包继承宿主 star（`10-输入/生态调研报告.md:264`）；用 star 推断"还在维护"必然失真。

**证据锚点**：
- `REPO/packages/util/plugin-market-index/src/types.ts:67-96`：`MarketVersion`/`MarketPlugin` 当前**没有** `status`/`lastReviewedAt`/`upstream`。
- `REPO/packages/util/plugin-market-index/src/index.ts:292`：format-1 对未定义成员 "ignore and drop"；新增字段需 T3 打补丁。
- `10-输入/生态调研报告.md:36-59,264`：生态实例与数字（唯一来源）。

**正面示例**（T3 schema 补丁后的 listing 条目）：

```json
{
  "name": "@acme/dsh-greet",
  "status": "active",
  "lastReviewedAt": "2026-10-31",
  "versions": [/* ... */]
}
```

**建议分级**：DS-R（推荐级）；对应 `03` R-11、`20/A` P2。

**边界说明**：R-11 是 listing 模式条款；package 模式只能看可选的 `dsh.lifecycle`，不能强制。状态字段的 schema 由 T3 定稿，本文件只定枚举与语义。

---

### R-12 派生关系声明（upstream / mirrorOf / deprecated）

**要求（祈使句）**：镜像、分叉、降级包必须声明派生关系：`dsh.upstream`（上游 URL）、`dsh.mirrorOf`（上游包名@版本，若为精确镜像）、`dsh.deprecated`（是否弃用及原因/替代）；`mirrorOf` 必须同时有 `upstream`；`upstream` 不得指向自身；不得与上游同名发布而不标注。

**判定方式**：L0 manifest/listing + 人工（DSR-12，M+H）。

| 子项 | 检查 | 结果 |
|---|---|---|
| R-12.1 | `dsh.upstream` 是合法 https URL | 非法/缺失（声明了 mirror） → FAIL |
| R-12.2 | `dsh.mirrorOf` 存在时 `dsh.upstream` 必须存在 | 缺失 → FAIL |
| R-12.3 | `upstream` 不等于自身 `repository` | 自指 → FAIL |
| R-12.4 | `deprecated: true` 时 listing `status` 为 `retired`/`deprecated`，且有替代/原因 | 矛盾/缺失 → WARN |
| R-12.5 | 描述/README 自称 mirror/fork 但无字段 | 文本启发 → WARN，转人工 |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | R-12.1～R-12.4 满足；无 R-12.5 命中 |
| WARN | 无字段但文本疑似镜像；`deprecated` 缺替代；跨索引重名无法自动判 |
| FAIL | `mirrorOf` 无 `upstream`；`upstream` 自指/非法；同名未标注且证据明确 |
| NA | 明确不是镜像/分叉/弃用包 |

**已知反例**：
- `dsh-purge` 四个主体：13,357★ 主仓、3,441★ 社区维护版、2,701★ 全量镜像、541★ 非官方分支（`10-输入/生态调研报告.md:36-59`）——用户无法从名字分辨谁是上游、谁是镜像。
- "上游将删库，下游标注 mirror"是生态里已出现的做法（`10-输入/生态调研报告.md:59`）；没有字段就只能靠 README 文本。

**证据锚点**：
- `REPO/packages/util/plugin-market-index/src/types.ts:77-96`：`MarketPlugin` 没有 `upstream`/`mirrorOf`/`deprecated`。
- `REPO/packages/util/plugin-market-index/src/index.ts:292`：未定义成员被 drop。
- `10-输入/生态调研报告.md:36-59`：四主体实例。
- `20-研究底稿/C-安全基线与权限面.md:252`：Mirror 类强制标注建议。

**正面示例**：

```json
{
  "dsh": {
    "upstream": "https://github.com/upstream/dsh-purge",
    "mirrorOf": "@upstream/dsh-purge@1.4.2",
    "deprecated": false
  }
}
```

**建议分级**：DS-R（推荐级）；对应 `03` R-12、`20/A` P0-4。

**边界说明**：跨索引重名/同名套壳需要拿多个索引比对，单包静态判不了；R-12 的"同名未标注"必须有外部证据，否则只 WARN。T3 的 `upstream`/`mirrorOf` 字段落地后，这条才可全量机器判。

---

## 三、机器判定与人工评审的分界

| 条款 | 机器可判部分 | 人工必须确认 | 结论类型 |
|---|---|---|---|
| R-1 | 静态 `ctx.<svc>` 读 vs `inject` | 动态访问、可选依赖意图 | M（动态转 M+H） |
| R-2 | effect 拓扑、裸分配器、L2 差分 | 顺序敏感清理是否真的正确 | M+H |
| R-3 | Config schema、空配置、非法配置 FAILED | 默认值是否安全/合理 | M |
| R-4 | 字面量事件、`@mode`、分发方法 | 动态事件名、payload 语义 | M+H |
| R-5 | 是否调用 `next()`、是否有所有权注释 | 每个短路分支的理由 | H（M 辅助） |
| R-6 | import 图、类型导入、相对路径 | 定义/实现角色分类 | M+H |
| R-7 | `agent.ctx`、`restrict` 位置、双持有 | 注册意图 | M+H |
| R-8 | signal 参数、`throwIfAborted` 线索 | 路径覆盖、取消后副作用 | M+H |
| R-9 | `console.*` | 日志覆盖率/级别是否合理 | M |
| R-10 | 派发循环、try/catch、Promise catch | 通知型事件的语义分类 | M+H |
| R-11 | listing `status`/日期/替代 | 状态是否真实 | M（listing） |
| R-12 | `upstream`/`mirrorOf`/`deprecated` | 跨索引同名/套壳 | M+H |

**硬规则**：R-5、R-7、R-8、R-10、R-12 没有人工签署 → `proposed`；不得对外称 DS-R。

---

## 四、DS-R 的报告与结论

### 4.1 报告 schema（最小契约）

```json
{
  "schema": "dsh-conformance/1",
  "standard": { "id": "DS-R", "version": "1.0.0" },
  "subject": { "profile": "package", "kind": "plugin", "name": "@acme/dsh-greet", "version": "1.2.3" },
  "anchor": {
    "repo": "deepseek-ai/deepseek-harness",
    "commit": "ce7073d51254c26cd63b22a60835b8f948deb447",
    "scanner": "dsh-plugin-verify@0.1.0",
    "dsh": "0.2.2-alpha.2",
    "cordis": "4.0.6-alpha.1"
  },
  "checks": [
    { "id": "DSR-01", "clause": "R-1", "method": "M", "result": "PASS", "coverage": "full", "evidence": ["..."] }
  ],
  "humanReview": [
    { "clause": "R-5", "reviewer": "<name>", "reviewedAt": "2026-10-31", "decision": "PASS", "evidence": "..." }
  ],
  "conclusion": { "status": "confirmed", "level": "DS-R (package)", "profile": "package", "exitCode": 0 }
}
```

### 4.2 结论状态

| 状态 | 含义 | exit |
|---|---|---|
| `confirmed` | 该 profile 的全部条款有结论（package=10 条，listing=12 条）；机器项 PASS；人工项已签署；无 FAIL | 0 |
| `proposed` | 机器项全绿，但至少一个人工项未签署 | 2（不完整，不得声称 DS-R） |
| `fail` | 任一 R 条 FAIL | 1 |
| `incomplete` | 有 `not-run`/`ERROR`/`partial`（listing-only 条款在 package profile 下的 NA 不算） | 2 |

**禁止**：把 `proposed` 展示成 "DS-R"；把 DS-C 的 PASS 当成 DS-R 的 PASS；把 `WARN` 当 `PASS`。

### 4.3 与 DS-C 的关系

- DS-R 的检查器必须先跑 DS-C，且 profile 必须对齐（package→package，listing→listing）；DS-C `fail`/`incomplete` → DS-R 直接 `incomplete`，不得继续。
- DS-C 的 C-4～C-9 与 DS-R 的 R-1/R-2/R-3 有重叠（装载/卸载/配置），但**判据不同**：C 判"能不能跑/卸干净"，R 判"契约是否正确/顺序是否显式"。
- 报告必须分栏列出 DS-C 与 DS-R 的结果，不得合并成一个总分。

---

## 五、复审与失效

- **周期**：DS-R ≤ 6 个月；宿主 minor bump 立即 `stale`。
- **复审输入**：新的 `(repo, commit, scanner, dsh, cordis)` 锚、机器报告、人工评审记录、已知反例/豁免。
- **复审结论**：维持 / 降级（转回 DS-C 或撤销）/ 废止。降级必须留痕并给申诉窗口。
- **变更**：条款文本变更需工作组 2/3 通过；技术判定方式变更（例如新增一条 AST 规则）需在 changelog 写明误报/漏报影响。
- **上诉**：作者可对 FAIL 提出证据复核；工作组必须在 14 天内给出书面结论；申诉不影响安装，只影响徽章。

---

## 六、附录 · 证据核验表

| # | 锚点 | 证明什么 | 状态 |
|---|---|---|---|
| 1 | `REPO/vendor/cordis/src/registry.ts:37-60,71-88,330` | inject 的三种写法/归一化/构造时解析 | 已核验 |
| 2 | `REPO/vendor/cordis/src/reflect.ts:152,172-176` | 无 inject 的错误语义（X-1） | 已核验 |
| 3 | `REPO/docs/cordis-tutorial/03-services.md:52-72` | PENDING 与 inject | 已核验 |
| 4 | `REPO/vendor/cordis/src/fiber.ts:421-567` | effect 契约 | 已核验 |
| 5 | `REPO/vendor/cordis/src/fiber.ts:720` | 异步 disposer 并发 | 已核验 |
| 6 | `REPO/docs/cordis-tutorial/02-lifecycle-and-effects.md:9-27,84-94` | timer effect/清理顺序 | 已核验 |
| 7 | `REPO/packages/llm/llm/src/index.ts:408-417` | generator effect 注册 adapter | 已核验 |
| 8 | `REPO/vendor/cordis/src/reflect.ts:311-325` | provide disposer 等 dependents | 已核验 |
| 9 | `REPO/vendor/cordis/src/fiber.ts:50-62` | resolveConfig/异步校验 | 已核验 |
| 10 | `REPO/vendor/cordis/src/fiber.ts:19-36` | ValidationError | 已核验 |
| 11 | `REPO/vendor/cordis/src/fiber.ts:693-701` | 启动异常置 FAILED | 已核验 |
| 12 | `REPO/docs/cordis-tutorial/05-config.md:34-36,51,53-68` | Config/默认值/大声失败 | 已核验 |
| 13 | `REPO/packages/core/agent-loop/src/index.ts:296` | `.default().volatile()` | 已核验 |
| 14 | `REPO/packages/core/tools/src/events.ts:1-58` | Events 声明合并 + @mode | 已核验 |
| 15 | `REPO/vendor/cordis/src/events.ts:334-371` | 内置事件 + @mode | 已核验 |
| 16 | `REPO/docs/cordis-primer.md:19-27` | dispatch mode 是契约 | 已核验 |
| 17 | `REPO/docs/cordis-tutorial/04-events.md:12-21,44,138` | 事件声明/命名/waterfall | 已核验 |
| 18 | `REPO/docs/event-producer-consumer.md:11` | 生成的事件矩阵 | 已核验 |
| 19 | `REPO/vendor/cordis/src/events.ts:246-261` | waterfall/next 语义 | 已核验 |
| 20 | `REPO/packages/compaction/compaction/src/index.ts:88-104` | 拥有决策才短路 | 已核验 |
| 21 | `REPO/docs/user/develop/practice/index.md:50-56` | Provider/Consumer 不互依赖 | 已核验 |
| 22 | `REPO/docs/defensive-patterns/package-surface.md:7-43` | 包边界/导出形态 | 已核验 |
| 23 | `REPO/docs/cordis-tutorial/07-into-the-harness.md:96` | 插件互不知道对方 | 已核验 |
| 24 | `REPO/docs/capability-seams.md:733,741,743` | 定义/实现/消费方 | 已核验 |
| 25 | `REPO/packages/core/tools/src/index.ts:62-71,162-171` | 重名/restrict 作用域 | 已核验 |
| 26 | `REPO/packages/core/system-prompt/src/index.ts:415-422` | section/variable 重名 | 已核验 |
| 27 | `REPO/packages/core/scope/README.md:27` | agent.ctx 可见性 | 已核验 |
| 28 | `REPO/packages/core/agent/README.md:174` | agent.ctx 遮蔽 | 已核验 |
| 29 | `REPO/packages/preset/agent-preset/skills/cordis-plugin-development/references/practices.md:19` | 双持有 disposer | 已核验 |
| 30 | `REPO/packages/core/tools/src/events.ts:10-13,32-36` | signal 契约 | 已核验 |
| 31 | `REPO/packages/core/tools/src/batch.ts:50-88` | abort 批处理 | 已核验 |
| 32 | `REPO/packages/core/tools/src/index.ts:264-297` | `throwIfAborted` 复检 | 已核验 |
| 33 | `REPO/packages/core/agent-loop/src/index.ts:112-149` | raceAbort | 已核验 |
| 34 | `REPO/vendor/cordis/src/logger.ts:29-38,83,194` | Message/Logger/LoggerService | 已核验 |
| 35 | `REPO/packages/acp/acp/src/index.ts:100,129` | ctx.logger 模范 | 已核验 |
| 36 | `REPO/vendor/cordis/src/events.ts:191-196,203-206` | parallel/emit 失败语义 | 已核验 |
| 37 | `REPO/packages/llm/llm/src/index.ts:367-391` | per-listener 容错 | 已核验 |
| 38 | `REPO/packages/core/agent-loop/src/index.ts:396-405` | per-callback 容错 | 已核验 |
| 39 | `REPO/docs/defensive-patterns/general.md:200-212` | dispatcher 容错 | 已核验 |
| 40 | `REPO/packages/util/plugin-market-index/src/types.ts:67-96` | 无 status/upstream 字段 | 已核验（缺失） |
| 41 | `REPO/packages/util/plugin-market-index/src/index.ts:292` | 未定义成员被 drop | 已核验 |
| 42 | `10-输入/生态调研报告.md:36-59,264` | 生态实例/数字 | 输入（未重抓） |
| 43 | `20/B` §X-1～X-12 | 判不了的 12 项 | 输入（研究结论） |

---

## 七、下一步建议（按优先级）

1. **T2 先实现 `DSR-01/03/04/09` 四个纯机器项**，再实现 `DSR-02/06/07/10/11/12` 的机器部分；`DSR-05/08` 只出线索，必须进人工评审队列。没有人工签署时，报告只能写 `proposed`。
2. **T6 把人工评审流程章程化**：评审员资格、回避规则、14 天申诉窗口、决策留痕、可 fork；否则 R-5/R-7/R-8/R-10/R-12 永远无法 `confirmed`。
3. **T3 把 `status`/`lastReviewedAt`/`upstream`/`mirrorOf` 写进 format-1 schema 补丁**，并在 M1 只读通道里跑 R-11/R-12；M2 再跑 R-1～R-10 的可执行部分。

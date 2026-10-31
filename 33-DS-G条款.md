# 33 · DS-G 指导级条款（定稿候选）

> **v1 历史命名**：v2 以 `89-三套标准命名决定.md` 为准（DSH-ENTRY / DSH-FLOW / DSH-BOOST）；本文件保留旧码作历史，不在新文档引用。

> **版本**：v1.0.0-rc.1（T1 定稿候选，待工作组确认）
> **日期**：2026-10-31
> **依据**：`01-项目纲领.md`、`03-可行性与条款草案.md`、`20-研究底稿/F-GBZ级Cordis效能实践.md`、`20-研究底稿/E-一致性检查器可行性.md`、`10-输入/源码取证索引.md`，以及 `deepseek-harness` 源码实测（commit `ce7073d51254c26cd63b22a60835b8f948deb447`）。
> **覆盖条款**：G-1 ～ G-10 + 16 个陷阱（T1～T16）。
> **已知未完成项**：
> 1. DS-G 是**登记制**，不是强制门禁；本文件定义实践、判定方式、登记模板与复审出口，不提供自动发证。
> 2. G-2/G-5/G-7 的收益需要测量数据；没有基线数据的登记只能标 `WARN`。
> 3. G-10 的"consumer cleanup 仍能调用服务"需要专门的 L4 行为夹具，当前未实现。
> 4. 16 个陷阱中有 6 个与 DS-R 条款重叠（T2/T3/T4/T6/T7/T14/T16），本文件只做交叉引用，不重复判据。
> 5. 3 个月复审的"升为 DS-R"标准由 T6（`80`/`84`/`86`）给出草案；本文件给技术判据。

---

## 一、总则

### 1.1 DS-G 回答什么

DS-G 指导级回答：**这个插件用足 Cordis 了吗？更快、更好吗？**

它**不是**"比 DS-R 更高级"。按 D2，DS-G 是"技术尚在发展中、尚不具备制定推荐条款条件"的**更不成熟、更快、更短命**的一级：

- 它探索新实践，允许失败，允许被废止；
- 它没有强制力，不进安装校验，不进市场默认筛选；
- 它 3 个月复审一次，结论三选一：**废止 / 继续有效 / 升为 DS-R**。

把 DS-G 叫"高级/进阶"是语义反转，会诱导作者追 rc API；本标准禁止这种用法。

### 1.2 判定主体：个人/小团队署名，登记制

- 任何人可以登记一条 DS-G 实践，署名并给出证据；
- 登记不等于官方认可，也不等于安全审计；
- 任何人可以提异议，异议与回应都留痕；
- 不做投票数、不做 star 门槛、不做排名。

### 1.3 三值与"FAIL"的特殊含义

| 结果 | 在 DS-G 里的含义 |
|---|---|
| `PASS` | 有证据表明该实践被采用，且收益/行为可验证 |
| `WARN` | 部分采用、证据不足、适用条件不满足，或收益未测量 |
| `FAIL` | 存在**明确反例**（该实践被证伪或反模式被复现） |
| `NA` | 场景不适用（例如没有工具 schema 的插件谈 G-2 无意义） |
| `ERROR` | 检查器/夹具失效 |

**关键区别**：DS-G 的 `FAIL` **不表示插件不合格**，只表示"这条实践在该插件上被证伪"。DS-G 没有强制力，不产生"降级"，也不影响插件安装。报告必须写 `guidanceOnly: true`。

### 1.4 版本锚与复审

五元锚同 DS-C：`(repo, commit, scanner, dsh, cordis)`；本 commit `dsh=0.2.2-alpha.2`、`cordis=4.0.6-alpha.1`（上游基线 `4.0.0-rc.11`，`REPO/vendor/README.md:19`）。

- **复审周期 3 个月**；到期未复审 → `expired`。
- 复审输入：新锚、采用者证据、收益数据、反例、API 变更。
- 复审结论：**废止 / 继续有效 / 升为 DS-R**。
- 被废止的条目**不删除**，标 `retired` 并保留历史证据页；被升为 DS-R 的条目保留 G 编号作为历史别名。

### 1.5 与 DS-C/DS-R 的关系

- DS-G 不重复 DS-C/DS-R 的强制/推荐条款；它只写"用足框架"的实践。
- 一个插件可以 DS-C 通过、DS-R 未确认，同时登记若干 DS-G 实践；DS-G 不构成"更高等级"。
- 反之，DS-G 的实践不能替代 DS-C 的强制项；例如 G-1 的 volatile 不能替代 C-4 的"能装载"。
- 升为 DS-R 的前提：该实践已被至少两个独立采用者验证，且能被稳定判定（机器或人工 rubric）。

---

## 二、DS-G 实践

### G-1 热改字段标 volatile，改配置不重挂 fiber

**要求（祈使句）**：对运行中会被频繁调整的配置字段（并发上限、开关、阈值、端点）必须标 `.volatile()`，在插件里持有引用并在每次操作时用 `.get()` 读取；不得把这类字段当普通字段，也不得在 `apply` 时读一次就长期持有值。

**判定方式**：L0.5 读 `Config` schema + L1 配置变更行为 + 人工（DSG-01，M+H）。

| 子项 | 检查 | 结果 |
|---|---|---|
| G-1.1 | 运行时可调字段标了 `.volatile()` | 未标 → WARN/FAIL（看是否明确可调） |
| G-1.2 | 读取用 `config.field.get()`，不是 `config.field` | 直接读值 → WARN |
| G-1.3 | 不跨操作长期持有 volatile 的值 | 持有 → WARN（文档明确要求每次重读） |
| G-1.4 | 改该字段不触发 fiber 重挂（`internal/update` 被否决或走 `loader/volatile-update`） | 触发重挂 → FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | G-1.1～G-1.4 满足；改字段后实例 identity 不变 |
| WARN | 标了 volatile 但读法不对/长期持有；字段是否"频繁可调"有争议 |
| FAIL | 明确可调字段未标，改一次配置整 fiber 重挂并级联重启依赖方 |
| NA | 插件没有运行时配置 |

**收益（可验证）**：改配置不再卸载/重载整个 fiber，不级联重启 inject 它的插件，不打断正在跑的会话，不让 prompt/工具 schema 抖动。验证：改字段后 `fiber.state` 不变、实例 identity 不变、`loader/volatile-update` 收到新值。

**已知反例**：
- `maxParallelToolCalls` 当普通字段：改一次并发上限 → agent loop 重挂 → 所有工具/prompt 重新注册 → KV cache 前缀失效（`20/F` T13）。
- 把部署可变的选择写成 `DEFAULT_*` 常量：用户只能改代码（`20/F` F3.5）。

**证据锚点**：
- `REPO/docs/cordis-tutorial/05-config.md:70-95`：volatile 语义、`.get()`、固定路径约束。
- `REPO/packages/boot/app-boot/src/config-schema/projector.ts:124-134`：native volatile containment 检查。
- `REPO/packages/core/agent-loop/src/index.ts:296`：`.default(10).volatile()` 的模范。
- `REPO/vendor/cordis/src/fiber.ts:783-819`：`update()` 与 restart veto；volatile-only 变更绕过 `internal/update`。

**正面示例**：

```ts
export const Config = Schema.object({
  maxParallelToolCalls: Schema.number().default(10).volatile(),
})

export function apply(ctx: Context, config: ReturnType<typeof Config>) {
  ctx.on('some/event', () => {
    const limit = config.maxParallelToolCalls.get()   // 每次操作重读
  })
}
```

**建议分级**：DS-G；3 个月复审。对应 `20/F` F3.3、T13。**若 3 个月内出现 ≥2 个独立采用者的收益数据，可提名为 DS-R 的 R-13 候选。**

**边界说明**：不是所有字段都该 volatile；只有"运行中频繁调整、且不需要重挂"的字段才标。volatile 要求固定对象路径、不能嵌套 volatile；标错会直接校验失败（tutorial 05:95）。

---

### G-2 工具 schema 与提示段保持稳定，易变信息走 context

**要求（祈使句）**：同一 provider+model 路由下，工具名/描述/参数 JSON Schema 与 system prompt section 必须逐字节稳定；易变信息（时间、cwd、端口、会话状态）必须走 `systemPrompt.context`，不得写进 `section`；不得每次调用重建 schema。

**判定方式**：L4 快照 diff（两次 boot / 两步请求）+ 人工（DSG-02，M+H）。

| 子项 | 检查 | 结果 |
|---|---|---|
| G-2.1 | 两次同配置 boot 的 `ctx.tools.schemas()` 逐字节相同 | 不同 → FAIL |
| G-2.2 | system section 不含 `Date.now()`/cwd/PID/端口等每次变化的值 | 命中 → FAIL |
| G-2.3 | 易变信息在 `systemPrompt.context`，不在 section | 放错 → WARN/FAIL |
| G-2.4 | 没有"每次调用重建 schema/提示段"的代码 | 命中 → FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | G-2.1～G-2.4 满足；有快照/e2e 证据 |
| WARN | schema 随配置合法变化但已文档化；没有 cache 命中数据 |
| FAIL | 同配置两次 boot schema 不同；section 含时间/路径；每次调用重建 |
| NA | 插件不注册工具/提示段 |

**收益（可验证）**：provider prefix cache 命中；每一步不必重付 system+tools token；延迟与成本下降。验证：连续两步的 system 段与 tools 声明逐字节相同；`packages/core/agent-loop/tests/request-cache.e2e.ts` 这类 e2e 断言 cache 命中。

**已知反例**：
- 每次调用把 `Date.now()` 拼进工具描述：从第一个变化的 token 起 cache 全失效（`REPO/packages/core/agent-loop/README.md:164`；`20/F` T12）。
- 把"当前策略"写进 system section 而不是 runtime context：切换策略就重写稳定前缀（`20/F` F6.2 的反例）。

**证据锚点**：
- `REPO/packages/core/agent-loop/README.md:164`：prefix reuse 要求逐字节相同；改一个 retained tool definition 就从第一个变化 token 起失效。
- `REPO/docs/tool-catalog.md:9`：tool schema **不是静态可知**的；只能 boot 后读 `ctx.tools.schemas()`。
- `REPO/packages/core/system-prompt/src/index.ts:589-609`：`refreshContext()` 不重跑 section provider/waterfall。
- `REPO/packages/core/system-prompt/src/index.ts:78-90,177-189`：runtime context 与 CONTEXT_ORDERS 的语义。
- `REPO/packages/core/agent-loop/tests/request-cache.e2e.ts`：真实 API 的 cache 命中 e2e。

**正面示例**：

```ts
ctx.systemPrompt.section({ name: 'greet', order: 100, text: 'Stable instructions.' })
ctx.systemPrompt.context({ name: 'greet-now', order: 200, text: `now=${new Date().toISOString()}` })
```

**建议分级**：DS-G；3 个月复审。对应 `20/F` F6.1/F6.2、T12。

**边界说明**：X-8：schema 不可静态知；G-2 只能用 boot 后快照 diff，判不了"这次变化是否值得"。收益判断需要人定阈值。

---

### G-3 capability seam 三层分离，且不提前拆包

**要求（祈使句）**：能力必须按"定义 / 提供方 / 消费方"三层组织：定义包只放 Service 抽象、请求/结果类型与声明合并；提供方实现定义；消费方只依赖定义，不 import 提供方；只有在三层会独立演进时才拆包，不得为了"看起来架构化"提前拆。

**判定方式**：L0 import 图 + 人工角色分类（DSG-03，M+H）。

| 子项 | 检查 | 结果 |
|---|---|---|
| G-3.1 | 定义包不 import 任何提供方实现 | 命中 → FAIL |
| G-3.2 | 消费方只 `import type` 定义包，运行时走 `ctx.<service>` | 运行时 import 实现 → FAIL |
| G-3.3 | 提供方实现定义，不反向依赖消费方 | 反向依赖 → WARN/FAIL |
| G-3.4 | 没有为"未来可能"提前拆出的空壳层 | 命中 → WARN |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | G-3.1/G-3.2 满足；角色清晰；无提前拆包 |
| WARN | 角色分类不确定；三层在同一包但无反向依赖；提前拆包 |
| FAIL | 定义包依赖实现；消费方 import 实现；提供方依赖消费方 |
| NA | 插件不提供/不消费任何能力缝 |

**收益（可验证）**：换 provider 不改 consumer。典型证据：`ctx.shell` 有 3 个 provider，消费方 `tool-bash`/`tool-pwsh` 零改动（`REPO/docs/capability-seams.md:733`）；`ctx.fs`、`ctx.subagents` 同构（`:741,743`）。

**已知反例**：
- 定义包同时 import 实现包：seam 失效，换 provider 必须改定义包（`20/F` F5.3）。
- 消费方直接 `new` provider 类：provider/consumer 焊死（`REPO/docs/user/develop/practice/index.md:50-56`）。
- 为了"架构好看"把一个只有一种实现的 service 拆成三个包：维护成本上升，收益为零（`20/F` F5.3 "Do not split preemptively"）。

**证据锚点**：
- `REPO/docs/capability-seams.md:733,741,743`：shell/fs/subagents 的定义/提供方/消费方表。
- `REPO/docs/user/develop/practice/index.md:50-56`：Provider/Consumer 互不依赖。
- `REPO/packages/sandbox/sandbox/src/index.ts:174-193`：`abstract SandboxProvider` 只定义契约。
- `REPO/packages/jobs/jobs/src/index.ts:57,88`：`JobRegistry` 的语义清单与抽象类。
- `REPO/AGENTS.md:140`：seam 三角色的仓库约定。

**正面示例**：

```ts
// dsh-greet（定义）
export abstract class Greeter extends Service {
  abstract hello(name: string): string
}

// dsh-greet-local（提供方）
export class LocalGreeter extends Greeter { /* ... */ }

// tool-greet（消费方）
import type {} from '@deepseek-ai/dsh-greet'
ctx.greeter.hello('world')
```

**建议分级**：DS-G；3 个月复审。对应 `20/F` F5.3、X-7。

**边界说明**：X-7：角色分类是 `scripts/gen-doc-graphs.ts` 的启发式；G-3 的硬判据只有"定义包是否静态依赖实现包"，其余转人工。

---

### G-4 isolate / cordis:group 给一组插件独立能力域

**要求（祈使句）**：当同一服务在同一进程里需要同时存在多份不同配置的实现时，必须用 `ctx.isolate(name, label)` 或 `cordis:group` + `isolate` 把 provider 与其消费者圈进同一个 realm；不得把 preset 子树的 provider 写进 root realm；不得为了"隔离感"过度 isolate。

**判定方式**：L1/L2 组合装载 + 人工（DSG-04，M+H）。

| 子项 | 检查 | 结果 |
|---|---|---|
| G-4.1 | provider 与消费者在同一 group/isolate realm | 跨 realm → FAIL |
| G-4.2 | preset 服务不泄漏到 root（`leakedServices` 为空） | 泄漏 → FAIL（`mount.ts:213` 直接抛） |
| G-4.3 | 没有多实例需求时不 isolate | 过度 isolate → WARN |
| G-4.4 | isolate 后消费者仍能解析到预期实现 | 解析不到 → FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | G-4.1/G-4.2/G-4.4 满足；无过度 isolate |
| WARN | 过度 isolate；realm 边界不清但未泄漏 |
| FAIL | preset 服务泄漏到 root；消费者解析到错误实现/解析不到 |
| NA | 插件不涉及同一服务的多实例 |

**收益（可验证）**：同一 runtime 内跑不同能力组合（例如两个 shell provider 各自 5s/60s 超时，`REPO/docs/user/develop/framework/service.md:111-139`），互不覆盖。验证：preset 挂载不报 "Preset services require isolate realms"；`leakedServices()` 返回空。

**已知反例**：
- 过度 isolate：服务只在同 realm 可见，沿 scope 链查找时父级键不同即终止，"别人找不到我的服务"（`REPO/vendor/cordis/src/reflect.ts:160-180`；`20/F` T1）。
- 不 isolate：preset 子树的 provider 写进 root store，替换整个应用的公共服务；`mount.ts:213` 直接抛错（`REPO/packages/preset/agent-preset-registry/src/mount.ts:69-83,213`）。

**证据锚点**：
- `REPO/vendor/cordis/src/context.ts:121-125`：`isolate(name, label)`。
- `REPO/vendor/cordis/src/reflect.ts:160-180`：按 isolate 键逐层查找，父级键不同即终止。
- `REPO/packages/boot/app-boot/README.md:138`：group row 给 provider 与消费者同一个 isolate realm。
- `REPO/packages/bundle/web-app/presets/standard.patch.yml:50,71,88`：`planMode`/`compaction`/`workflowEngine` 三个隔离域。
- `REPO/packages/preset/agent-preset-registry/src/mount.ts:213`：泄漏硬失败。

**正面示例**：

```yaml
- id: my-sandbox
  name: cordis:group
  group: true
  isolate:
    shell: true
  config:
    - id: my-bash
      name: '@acme/dsh-bash-local'
    - id: my-tool
      name: '@acme/dsh-tool-bash'
```

**建议分级**：DS-G；3 个月复审。对应 `20/F` F5.2、T1。

**边界说明**：isolate 是强机制，不是默认；只有"同一服务需要多份实例"时才用。普通全局服务 + `agent.ctx` 遮蔽（R-7）优先。

---

### G-5 并行执行 + 有界并发，长活交给 jobs

**要求（祈使句）**：无副作用的独立调用必须能并行调度；并发必须有界（`maxParallelToolCalls` 或等价配置）；长活任务必须注册为 job 并返回 jobId，不得阻塞单步；不得无上限并发，也不得把 N 个独立调用串行 await。

**判定方式**：L4 基准 + 人工（DSG-05，M+H）。

| 子项 | 检查 | 结果 |
|---|---|---|
| G-5.1 | 独立调用走批量/并行 API，不串行 await | 串行 → WARN |
| G-5.2 | 并发有上限且可配置 | 无上限 → FAIL |
| G-5.3 | 长活有 jobId、可读/可杀 | 阻塞 step → FAIL |
| G-5.4 | 结果顺序与模型请求顺序一致（不因并行乱序） | 乱序 → FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | G-5.1～G-5.4 满足；有墙钟/日志证据 |
| WARN | 串行独立调用；并发上限硬编码；没有基准数据 |
| FAIL | 无上限并发；长活阻塞 step；结果乱序 |
| NA | 插件没有可并行的独立调用 |

**收益（可验证）**：N 个独立调用的墙钟 ≈ 最慢者，而非各调用之和。验证：基准/日志显示并行批次的耗时；`executeToolBatch` 保证 "policy, results, and result context remain model-ordered"。

**已知反例**：
- N 个独立读串行 await：N 倍等待（`20/F` F6.5）。
- 无上限 `Promise.all`：打爆本地资源/触发 provider 限流（`20/F` F6.5 的反面）。
- 长任务塞进工具体：step 阻塞，取消无法及时生效（`20/F` F6.7）。

**证据锚点**：
- `REPO/packages/core/tools/src/batch.ts:50-88`：`executeToolBatch` 的 bounded rolling pool / barrier / model-ordered 结果。
- `REPO/packages/core/agent-loop/src/constants.ts:6`：`DEFAULT_MAX_PARALLEL_TOOL_CALLS = 10`；`REPO/packages/core/agent-loop/src/index.ts:296` 该字段 volatile。
- `REPO/packages/jobs/jobs/src/index.ts:57,88`：`JobRegistry` 的"注册 outlive producer/controller、owner 处置取消 live work"语义。
- `REPO/docs/capability-seams.md:748`：`ctx.jobs` 的 provider/consumer。

**正面示例**：

```ts
const limit = config.maxParallelToolCalls.get()
// 复用宿主的 bounded rolling pool，或自写同样有界、结果保持模型顺序的 map
const results = await mapBounded(independentCalls, limit, runCall)
```

**建议分级**：DS-G；3 个月复审。对应 `20/F` F6.5/F6.6/F6.7（性能实践，无直接陷阱号；与 T5 的"effect 里做重活"相邻）。

**边界说明**：并行只适用于无副作用/可交换的调用；有依赖的调用必须串行。G-5 的收益必须有测量数据，否则只 WARN。

---

### G-6 用 ctx.inject() 等待能力，禁轮询

**要求（祈使句）**：需要"某个能力稍后才出现"时，必须用 `inject` 声明或 `ctx.inject(deps, cb)` 等待；不得用 `setInterval`/`setTimeout` 轮询 `ctx.get()` 直到服务出现；不得把正确性寄托在"回调落在事件循环的哪个位置"。

**判定方式**：L0 AST + 人工（DSG-06，M+H）。

| 子项 | 检查 | 结果 |
|---|---|---|
| G-6.1 | 等待能力用 `inject` / `ctx.inject()` | 用轮询 → FAIL |
| G-6.2 | 没有周期性 `ctx.get()` 检查 | 命中 → FAIL |
| G-6.3 | 可选能力用 `ctx.get()` 现场探测（不写进 inject） | 写法正确 → PASS |
| G-6.4 | 轮询有清理且是业务必需（例外） | 有清理 → WARN，转人工 |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | G-6.1/G-6.2 满足；可选依赖写法正确 |
| WARN | 业务必需的轮询且有清理/退避；动态依赖无法静态判 |
| FAIL | `setInterval` 轮询 `ctx.get()`；把时序当正确性 |
| NA | 插件不等待任何异步能力 |

**收益（可验证）**：正确性不依赖时序；轻载/重载行为一致；依赖变化时自动卸载/重跑，而不是"等它自己好"。

**已知反例**：
- `setInterval` 检查 `ctx.get('x')`，直到出现才继续：轻载正常，忙时静默失败（`REPO/docs/defensive-patterns/general.md:19-23`；`20/F` T16）。
- 用 `setTimeout` 决定"工作是否完成"：时序不是正确性（同上）。

**证据锚点**：
- `REPO/vendor/cordis/src/registry.ts:300-302`：`ctx.inject(deps, cb)` 是 `ctx.plugin({ inject, apply })` 的语法糖。
- `REPO/vendor/cordis/src/reflect.ts:247-257`：`get(name, strict=true)` 只返回 ACTIVE 实现。
- `REPO/docs/defensive-patterns/general.md:19-23`：timing does not carry correctness。
- `REPO/docs/cordis-tutorial/03-services.md:80-90`：可选依赖的写法。

**正面示例**：

```ts
export function apply(ctx: Context) {
  ctx.inject(['systemPrompt'], (scope) => {
    scope.systemPrompt.context({ name: 'greet', order: 200, text: 'ready' })
  })
}
```

**建议分级**：DS-G；3 个月复审。对应 `20/F` F1.2/F1.3、T16。

**边界说明**：`ctx.get()` 用于"可选能力现场探测"是合法的（G-6.3）；G-6 反对的是"用定时器轮询等待"。

---

### G-7 缓存有 owner、可失效、有界，复用 assembly

**要求（祈使句）**：缓存必须挂在有生命周期的服务实例/fiber 上，必须有显式失效点、容量上限与 disposer；必须复用已接受的 assembly/已解析的能力（如 `refreshContext()`、`prepareCall()`），不得每步重算；不得用模块级 `Map`/`globalThis.__cache` 当缓存。

**判定方式**：L0 AST + 人工（DSG-07，M+H）。

| 子项 | 检查 | 结果 |
|---|---|---|
| G-7.1 | 缓存挂在服务实例/fiber，不是模块级 | 模块级 → FAIL |
| G-7.2 | 有失效点/版本键/容量上限 | 缺失 → WARN/FAIL |
| G-7.3 | 有 disposer/随 fiber 卸载清理 | 缺失 → FAIL |
| G-7.4 | 热路径复用 assembly/解析结果，不每步重算 | 重算 → WARN |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | G-7.1～G-7.4 满足；有失效/上限/清理证据 |
| WARN | 有界但无显式失效；WeakMap 但无 owner；复用不明显 |
| FAIL | `globalThis.__cache`/模块级 Map；无界缓存；无 disposer |
| NA | 插件没有缓存/重计算热点 |

**收益（可验证）**：避免重复解析/复制/冻结；避免跨实例串味与卸载后泄漏；热路径成本下降。验证：同一份数据在一条热路径上不被 clone/freeze 两次；卸载后缓存随 fiber 消失。

**已知反例**：
- `globalThis.__dshCache` / 模块级 `Map`：跨实例串味、卸载后仍存活、测试间泄漏；Weak/bounded/memoization 都不等于 Cordis ownership（`REPO/docs/defensive-patterns/general.md:104-122`；`REPO/.agents/skills/cordis-styling-nitpicking/SKILL.md:25-29`；`20/F` T8）。
- 每步重新解析同一份元数据：热路径重复解析/克隆（`20/F` F7.2/F7.4）。

**证据锚点**：
- `REPO/packages/core/system-prompt/src/index.ts:589-609`：`refreshContext()` 复用已接受的 assembly，不重跑 provider/waterfall。
- `REPO/packages/llm/llm/src/index.ts:951,960-1018`：`prepareCall()` 把能力解析与派发绑定到同一 adapter generation，避免 HMR 混用两代能力。
- `REPO/docs/subsystems/attachment.md:176`：singleflight + independent waiter cancellation + instance-level limiter。
- `REPO/docs/defensive-patterns/general.md:104-122`：共享状态必须有一个 owner。
- `REPO/.agents/skills/cordis-styling-nitpicking/SKILL.md:25-29`：模块级单例是 P0。

**正面示例**：

```ts
class GreetService extends Service {
  #cache = new Map<string, Result>()   // 实例级，随 fiber 卸载

  constructor(ctx: Context) {
    super(ctx, 'greet')
    ctx.effect(() => () => this.#cache.clear(), 'greet.cache')
  }
}
```

**建议分级**：DS-G；3 个月复审。对应 `20/F` F7.1/F7.2/F7.4、T8。

**边界说明**：缓存不是越多越好；只有测量证明热点、且有明确失效/上限/owner 时才加。G-7 的收益需要基准数据（`REPO/docs/defensive-patterns/general.md:151-160`）。

---

### G-8 HMR 友好：import 期零副作用、可 restart

**要求（祈使句）**：入口模块在 import 期不得创建资源/注册监听/启动定时器；所有副作用必须从 `apply`/`Service.init` 开始；`apply` 必须可重复执行（restart 幂等）；不得依赖"只运行一次"的模块级状态。

**判定方式**：L3 + L0 + 人工（DSG-08，M+H）。

| 子项 | 检查 | 结果 |
|---|---|---|
| G-8.1 | 入口顶层无资源创建/监听注册/定时器 | 命中 → FAIL |
| G-8.2 | `restart()` 可重复，effect 不累积 | 失败 → FAIL |
| G-8.3 | `dispose()` → 重新装载仍 ACTIVE | 失败 → FAIL |
| G-8.4 | 无模块级可变状态跨重挂残留 | 命中 → WARN/FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | G-8.1～G-8.3 满足；G-8.4 无命中 |
| WARN | restart 可用但模块级缓存会重置（已文档化）；同进程冷重装无法重置 ESM 缓存 |
| FAIL | HMR 替换失败/停旧插件；顶层副作用；重挂累积 |
| NA | 插件不支持热重载（明确声明） |

**收益（可验证）**：开发迭代从"重启进程"到"保存即生效"；配置编辑/HMR 不泄漏。验证：连续 restart 后 `getEffects().length`、`ctx.tools.definitions()` 数量、监听器数与首次一致。

**已知反例**：
- 模块顶层 `setInterval`/`process.on`：HMR 后旧实例继续跑，无法卸载（`20/F` T9）。
- 替换失败：HMR 会停掉旧插件并报 `failed`，不会回滚到旧版本（`REPO/packages/boot/hmr/README.md:49,113`）。

**证据锚点**：
- `REPO/packages/boot/hmr/README.md:49,113`：替换失败停旧插件、报 failed、不回滚。
- `REPO/vendor/cordis/src/fiber.ts:768-774`：`restart()`。
- `REPO/docs/cordis-tutorial/06-composition-and-hmr.md:23-59`：HMR 的卸载→重装语义。
- `REPO/docs/defensive-patterns/package-surface.md:227-233`：模块顶层 await 的禁令。

**正面示例**：

```ts
export const name = 'greet'
export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => { /* ... */ }, 1_000)
    return () => clearInterval(timer)
  }, 'greet.tick')
}
```

**建议分级**：DS-G；3 个月复审。对应 `20/F` F2.2/F2.3、T9。

**边界说明**：同进程冷重装不能重置 ESM 模块缓存；G-8 的"模块级状态"只判可观测残留，彻底干净需要换进程（L3-4）。

---

### G-9 提供诊断入口：effect 标签、PENDING 缺失服务、registry 遍历

**要求（祈使句）**：插件必须给 effect 起可读 label；必须能在启动/诊断时列出 PENDING fiber 及其缺失服务；必须能导出 effect 树/注册表快照；不得让 PENDING 静默无声。

**判定方式**：L0 label + L1 诊断 + 人工（DSG-09，M+H）。

| 子项 | 检查 | 结果 |
|---|---|---|
| G-9.1 | 主要 effect 有 label（不是全 `anonymous`） | 全匿名 → WARN |
| G-9.2 | 能打印 PENDING fiber 的缺失服务（`Object.keys(fiber.inject)` + `ctx.get`） | 无诊断 → FAIL |
| G-9.3 | 能遍历 `ctx.registry` / `fiber.getEffects()` 导出快照 | 无入口 → WARN |
| G-9.4 | `internal/status`/`internal/dispatch` 观测可用 | 不可用 → WARN |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | G-9.1～G-9.3 满足；PENDING 有诊断 |
| WARN | 部分 effect 匿名；诊断只在 debug/测试里 |
| FAIL | PENDING 完全无诊断；effect 全匿名且无 registry 导出 |
| NA | 插件不注册任何 effect（纯函数） |

**收益（可验证）**：PENDING 不再"等它自己好"；一条命令能列出所有 PENDING fiber 及缺失服务；能导出 effects 树。

**已知反例**：
- `inject` 了没人提供的服务：PENDING forever, printing nothing, no error（`REPO/docs/cordis-tutorial/06-composition-and-hmr.md:61-63`；`20/F` T11）。
- 所有 effect 都是 `anonymous`：出问题时无法定位是谁注册的（`20/F` F2.6）。

**证据锚点**：
- `REPO/vendor/cordis/src/fiber.ts:574-578`：`getEffects()` 的 label/children 树。
- `REPO/packages/boot/app-boot/src/index.ts:1074`：`Object.keys(fiber.inject).filter(service => fiber.ctx.get(service) === undefined)` 的缺失服务审计。
- `REPO/vendor/cordis/src/registry.ts:269-292`：`keys/values/entries/forEach`。
- `REPO/docs/cordis-tutorial/06-composition-and-hmr.md:65-83`：诊断插件范式。
- `REPO/vendor/cordis/src/events.ts:165-167,334-371`：`internal/dispatch` 与内置事件。

**正面示例**：

```ts
for (const runtime of ctx.registry.values()) {
  for (const fiber of runtime.fibers) {
    if (fiber.state !== FiberState.PENDING) continue
    const missing = Object.keys(fiber.inject).filter(name => ctx.get(name) === undefined)
    ctx.logger.warn(`PENDING ${fiber.name}: missing ${missing.join(', ')}`)
  }
}
```

**建议分级**：DS-G；3 个月复审。对应 `20/F` F1.4/F2.6/F8.3、T11。

**边界说明**：`getEffects()` 只覆盖已登记 effect；未登记资源不可见（X-2）。G-9 的"诊断"是给 PENDING/注册面用的，不是泄漏证明。

---

### G-10 提供方在 cleanup 中最后 yield provide

**要求（祈使句）**：服务提供方必须用一个组合 generator effect，把资源/监听器 disposer 先 `yield`，最后 `yield ctx.provide(...)`；不得把 provide 放在资源之前，也不得依赖"逆序注册"保证异步清理顺序；consumer 的 cleanup 必须仍能调用到服务。

**判定方式**：L2/L4 行为 + 人工（DSG-10，M+H）。

| 子项 | 检查 | 结果 |
|---|---|---|
| G-10.1 | provider 用一个 generator effect 组合资源与 provide | 分开 effect → WARN |
| G-10.2 | provide 是最后一个 yield | provide 在前 → FAIL |
| G-10.3 | 卸载时 consumer cleanup 仍能调用服务（专项测试） | 失败 → FAIL |
| G-10.4 | 不 yield 已注册 effect 的包装器（会保留独立 owner） | 命中 → WARN/FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | G-10.1～G-10.3 满足；provide 最后 |
| WARN | provide 最后但在不同 effect；consumer 测试缺失 |
| FAIL | provide 在资源之前；consumer cleanup 打到已死服务 |
| NA | 插件不提供任何服务 |

**收益（可验证）**：provider 卸载时，consumer 的 cleanup 仍能成功调用服务方法，不会"服务先死、清理踩空"。验证：暂停 consumer 于最后一次服务调用前 → 启动 provider 卸载 → 断言资源仍可用。

**已知反例**：
- 异步 disposer 并发：`fiber.ts:720` 的 `Promise.all`；provider 与兄弟资源同时撤，consumer cleanup 可能踩空（`20/F` T10）。
- 顶层 plugin yield 不够：必须放进组合 `ctx.effect()` generator；yield 已注册 effect 的包装器会保留独立 owner（`REPO/.agents/skills/cordis-styling-nitpicking/SKILL.md:45-55`）。

**证据锚点**：
- `REPO/vendor/cordis/src/reflect.ts:311-325`：provide disposer 等所有 dependents 释放后再删 store。
- `REPO/vendor/cordis/src/fiber.ts:720`：异步 disposer 并发。
- `REPO/packages/llm/llm/src/index.ts:408-417`：generator effect 注册 adapter 的模范。
- `REPO/docs/cordis-tutorial/02-lifecycle-and-effects.md:94`：异步 disposer 并发告警。
- `REPO/.agents/skills/cordis-styling-nitpicking/SKILL.md:45-55`：provider 最后 yield provide 的 workaround。

**正面示例**：

```ts
export function apply(ctx: Context) {
  ctx.effect(async function* () {
    const conn = await openConnection()
    yield () => conn.close()
    yield ctx.provide('greet', new GreetService(conn))
  }, 'greet.provider')
}
```

**建议分级**：DS-G；3 个月复审。对应 `20/F` F2.4/F2.5、T10。

**边界说明**：G-10 的强结论需要 L4 "consumer cleanup 时服务仍可用"的专项夹具；没有夹具时只能 WARN，不能假装 PASS。

---

## 三、16 个陷阱

> 陷阱是 DS-G 的反面知识。它们不是"条款"，不产生分数；每条给出"为什么是坑 / 证据 / 正确做法 / 对应条款"。

| # | 陷阱 | 为什么是坑 | 证据 | 正确做法 / 对应 |
|---|---|---|---|---|
| T1 | 过度 `isolate` | 服务只在同 realm 可见，别人找不到；preset 又强制 provider 进 realm，容易矫枉过正 | `REPO/vendor/cordis/src/reflect.ts:160-180`；`REPO/packages/preset/agent-preset-registry/src/mount.ts:213` | 只在多实例时 isolate；其余用全局 + `agent.ctx`（G-4/R-7） |
| T2 | 过度 `waterfall` | 监听者一多就无法预测谁 veto；观察型漏 `next()` 会静默吞默认行为 | `REPO/docs/cordis-tutorial/04-events.md:138`；`REPO/docs/cordis-primer.md:31-35` | 单一决策用 `serial`/`bail`；需要包住下游才 waterfall（R-5） |
| T3 | 全局 vs agent 作用域选错 | 全局注册所有 agent 可见；同名直接抛错；变体应走 `agent.ctx` | `REPO/packages/core/tools/src/index.ts:69,162-171`；`REPO/packages/core/system-prompt/src/index.ts:415-422` | 公共→全局；变体→`agent.ctx`；restrict 只在作用域（R-7） |
| T4 | 动态事件名 | 失去类型/`@mode`；进不了生成矩阵；无法审计 | `REPO/docs/event-producer-consumer.md:11`；`REPO/docs/cordis-tutorial/04-events.md:44` | 事件名用字面量；可变部分进 payload（R-4） |
| T5 | 在 effect 里做重活 | effect body 在加载/重挂时同步执行，阻塞 ACTIVE；重挂会重做 | `REPO/vendor/cordis/src/fiber.ts:528,681-710` | effect 只做注册/短同步准备；重活放 `Service.init`/job（G-8） |
| T6 | 用 `emit` 做需要等待的事 | emit 同步、不 await、不收集返回值；async rejection 可能 unhandled | `REPO/vendor/cordis/src/events.ts:203-206`；`REPO/packages/llm/llm/src/index.ts:367-391` | 需要等待用 `parallel`；需要返回值用 `serial`/`bail`（R-10） |
| T7 | 用 `parallel` 做纯观察 | 任一 listener reject 会向派发方抛 `AggregateError`，把观察失败升级成业务失败 | `REPO/vendor/cordis/src/events.ts:191-196` | 观察型广播用 emit + 容错派发；全部完成才算完成才 parallel（R-10） |
| T8 | 模块级 Map/`globalThis.__x` 当缓存 | 无 owner → 跨实例串味、卸载后存活、测试泄漏 | `REPO/docs/defensive-patterns/general.md:104-122`；`REPO/.agents/skills/cordis-styling-nitpicking/SKILL.md:25-29` | 挂服务实例/有失效/上限/disposer（G-7） |
| T9 | import 期副作用/顶层 await | 不可卸载、不可热重载、阻塞所有 importer | `REPO/docs/defensive-patterns/package-surface.md:227-233` | 一切从 apply/Service.init 开始（G-8/C-10 advisory） |
| T10 | 以为"逆序注册"能保证清理顺序 | 异步 disposer 是并发的（`Promise.all`）；服务撤回与兄弟资源关闭有竞态 | `REPO/vendor/cordis/src/fiber.ts:720`；`REPO/docs/cordis-tutorial/02-lifecycle-and-effects.md:94` | 顺序敏感清理放同一 generator effect；provider 最后 yield provide（G-10/R-2） |
| T11 | 把 PENDING 当"还没到时间" | PENDING 无日志、无错误、不占事件循环 | `REPO/docs/cordis-tutorial/06-composition-and-hmr.md:61-63` | 启动审计 PENDING 并打印缺失服务（G-9） |
| T12 | 每次调用重建工具 schema/提示段 | 击穿 provider prefix cache，每步重付 system+tools | `REPO/packages/core/agent-loop/README.md:164` | 稳定声明；易变信息走 runtime context（G-2） |
| T13 | 频繁变更的配置当普通字段 | 改一次配置 → fiber 重挂 → 依赖方级联重启 → 工具/prompt 抖动 | `REPO/docs/cordis-tutorial/05-config.md:70-95`；`REPO/vendor/cordis/src/fiber.ts:783-819` | 标 `.volatile()`，用 `.get()` 读（G-1） |
| T14 | 为"启动顺序" inject 不真正依赖的服务 | epoch 含 `impl.uid`；该服务每次热替换都带着你一起重挂 | `REPO/vendor/cordis/src/fiber.ts:617-628` | 只为真正会调用的能力声明 inject（R-1） |
| T15 | 长期持有 `ctx.get()` 取到的值 | 服务被替换/撤回后手里是僵尸引用 | `REPO/vendor/cordis/src/reflect.ts:247-257` | 每次用时经 `ctx.<service>` 读，或持有服务本身并保持在 fiber 生命周期内（G-6） |
| T16 | 用定时器轮询代替 `ctx.inject()`/事件 | 正确性依赖时序；轻载正常、重载静默失败 | `REPO/docs/defensive-patterns/general.md:19-23` | 用 `ctx.inject()` 或监听 `internal/service`（G-6） |

---

## 四、登记与复审

### 4.1 登记模板

每条 DS-G 实践按以下字段登记（Markdown 或 JSON 均可，建议同仓库 `registry/`）：

```yaml
id: DSG-2026-0001
practice: G-1
title: "volatile config for runtime-tunable fields"
subject:
  repo: "https://github.com/acme/dsh-greet"
  package: "@acme/dsh-greet"
  version: "1.2.3"
  commit: "<40hex>"
anchor:
  scanner: "dsh-plugin-verify@0.1.0"
  dsh: "0.2.2-alpha.2"
  cordis: "4.0.6-alpha.1"
evidence:
  - "src/index.ts:42-58"
  - "benchmarks/volatile-change.md#before-after"
benefit:
  metric: "config change → zero fiber restarts"
  baseline: "ordinary field: 1 restart + 3 dependent reloads"
  method: "count internal/status transitions"
conditions: "field must be at a fixed object path; not nested volatile"
exceptions: "fields that must change structure are not volatile"
registrar: "<name>"
registeredAt: "2026-10-31"
reviewDue: "2027-01-31"
status: "active"          # active | expired | retired | promoted
outcome: null             # 废止 | 继续有效 | 升为 DS-R
```

### 4.2 复审流程

1. **到期前 14 天**：登记人或复审人确认锚是否仍有效（commit/宿主/Cordis）。
2. **复核证据**：重跑检查/基准；收集采用者反馈与反例。
3. **结论三选一**：
   - **废止**：API 移除、实践被证伪、无采用者且无收益证据 → `retired`。
   - **继续有效**：仍有效、证据更新、给出新 `reviewDue` → `active`。
   - **升为 DS-R**：满足 §4.3 → 提交 DS-R 工作组。
4. **留痕**：结论、证据、异议、投票（如有）全部写入登记页；不得删除历史。

### 4.3 升为 DS-R 的技术判据

- **采用者**：至少 2 个独立组织/项目采用并报告收益；或 1 个采用者 + 可复现的基准。
- **可判定**：有稳定的机器判据，或有可复用的 manual rubric（评审人能给出相同结论）。
- **无未决安全问题**：不引入新的权限面/数据外发/绕过审查。
- **工作组共识**：DS-R 工作组 2/3 通过；决策留痕。
- **编号**：升为 DS-R 后保留 G-x 作为历史别名，新编号由工作组分配（R-13 起）。

### 4.4 日落与上诉

- `expired`/`retired` 条目不删除、不改写历史；只加状态与理由。
- 作者/采用者可对"废止"提出上诉，附证据；工作组 14 天内书面答复。
- 任何人可 fork 登记库；fork 必须改名，避免与官方 DS-G 混淆。

---

## 五、与 DS-R 的边界（防止"高级化"）

| 问题 | DS-G 的回答 | DS-R 的回答 |
|---|---|---|
| 这插件能装吗 | 不回答 | 不回答（DS-C 回答） |
| 契约正确吗 | 不回答 | 回答 |
| 用足框架了吗 | 回答（实践登记） | 不回答 |
| 有强制力吗 | 无 | 市场筛选/企业 policy |
| 复审 | 3 个月 | ≤6 个月 |
| 失败后果 | 登记条目标 FAIL/废止，不影响插件 | 阻断 DS-R 声称，不阻断安装 |

**三条禁令**：
1. 不得把 DS-G 叫"高级/进阶/三级最高"。
2. 不得用 DS-G 的条数/覆盖率给插件打分。
3. 不得用 DS-G 替代 DS-C/DS-R 的判定；升为 DS-R 的前提是 DS-C 已通过。

---

## 六、附录 · 证据核验表

| # | 锚点 | 证明什么 | 状态 |
|---|---|---|---|
| 1 | `REPO/docs/cordis-tutorial/05-config.md:70-95` | volatile 语义/`.get()`/固定路径 | 已核验 |
| 2 | `REPO/packages/boot/app-boot/src/config-schema/projector.ts:124-134` | volatile containment | 已核验 |
| 3 | `REPO/packages/core/agent-loop/src/index.ts:296` | `.default().volatile()` 模范 | 已核验 |
| 4 | `REPO/vendor/cordis/src/fiber.ts:783-819` | update/veto | 已核验 |
| 5 | `REPO/packages/core/agent-loop/README.md:164` | KV cache 前缀 | 已核验 |
| 6 | `REPO/docs/tool-catalog.md:9` | schema 不可静态知 | 已核验 |
| 7 | `REPO/packages/core/system-prompt/src/index.ts:78-90,177-189,589-609` | runtime context/refreshContext | 已核验 |
| 8 | `REPO/packages/core/agent-loop/tests/request-cache.e2e.ts` | cache 命中 e2e | 已核验（存在） |
| 9 | `REPO/docs/capability-seams.md:733,741,743,748` | shell/fs/subagents/jobs 缝 | 已核验 |
| 10 | `REPO/docs/user/develop/practice/index.md:50-56` | Provider/Consumer 不互依赖 | 已核验 |
| 11 | `REPO/packages/sandbox/sandbox/src/index.ts:174-193` | 抽象 SandboxProvider | 已核验 |
| 12 | `REPO/packages/jobs/jobs/src/index.ts:57,88` | JobRegistry 语义 | 已核验 |
| 13 | `REPO/AGENTS.md:140` | seam 三角色约定 | 已核验 |
| 14 | `REPO/vendor/cordis/src/context.ts:121-125` | isolate | 已核验 |
| 15 | `REPO/vendor/cordis/src/reflect.ts:160-180` | isolate 查找 | 已核验 |
| 16 | `REPO/packages/boot/app-boot/README.md:138` | group isolate realm | 已核验 |
| 17 | `REPO/packages/bundle/web-app/presets/standard.patch.yml:50,71,88` | 三个隔离域 | 已核验 |
| 18 | `REPO/packages/preset/agent-preset-registry/src/mount.ts:213` | 泄漏硬失败 | 已核验 |
| 19 | `REPO/packages/core/tools/src/batch.ts:50-88` | executeToolBatch | 已核验 |
| 20 | `REPO/packages/core/agent-loop/src/constants.ts:6` | maxParallel 默认 10 | 已核验 |
| 21 | `REPO/vendor/cordis/src/registry.ts:300-302` | ctx.inject | 已核验 |
| 22 | `REPO/vendor/cordis/src/reflect.ts:247-257` | get(strict) | 已核验 |
| 23 | `REPO/docs/defensive-patterns/general.md:19-23,104-122,151-160,200-212` | timing/owner/性能证据/容错 | 已核验 |
| 24 | `REPO/docs/subsystems/attachment.md:176` | singleflight/owner | 已核验 |
| 25 | `REPO/packages/llm/llm/src/index.ts:951,960-1018` | prepareCall/同代能力 | 已核验 |
| 26 | `REPO/packages/boot/hmr/README.md:49,113` | HMR 替换失败语义 | 已核验 |
| 27 | `REPO/vendor/cordis/src/fiber.ts:768-774` | restart | 已核验 |
| 28 | `REPO/docs/cordis-tutorial/06-composition-and-hmr.md:23-59,61-63,65-83` | HMR/PENDING 诊断 | 已核验 |
| 29 | `REPO/vendor/cordis/src/fiber.ts:574-578` | getEffects | 已核验 |
| 30 | `REPO/packages/boot/app-boot/src/index.ts:1074` | PENDING 缺失服务审计 | 已核验 |
| 31 | `REPO/vendor/cordis/src/registry.ts:269-292` | registry 遍历 | 已核验 |
| 32 | `REPO/vendor/cordis/src/events.ts:165-167,334-371` | internal/dispatch/内置事件 | 已核验 |
| 33 | `REPO/vendor/cordis/src/reflect.ts:311-325` | provide disposer 等 dependents | 已核验 |
| 34 | `REPO/.agents/skills/cordis-styling-nitpicking/SKILL.md:25-29,45-55` | 模块级单例/provider 清理 | 已核验 |
| 35 | `REPO/vendor/cordis/src/fiber.ts:720` | 异步 disposer 并发 | 已核验 |
| 36 | `REPO/docs/event-producer-consumer.md:11` | 事件矩阵 | 已核验 |
| 37 | `REPO/docs/cordis-primer.md:31-35` | waterfall 语义 | 已核验 |
| 38 | `REPO/packages/core/tools/src/index.ts:69,162-171` | 重名/restrict | 已核验 |
| 39 | `REPO/packages/core/system-prompt/src/index.ts:415-422` | section 重名 | 已核验 |
| 40 | `REPO/vendor/cordis/src/fiber.ts:528,617-628` | effect 同步执行/epoch 含 uid | 已核验 |
| 41 | `REPO/vendor/cordis/src/events.ts:191-196,203-206` | parallel/emit 失败语义 | 已核验 |
| 42 | `REPO/packages/llm/llm/src/index.ts:367-391` | per-listener 容错 | 已核验 |

---

## 七、下一步建议（按优先级）

1. **先做 G-1/G-2/G-9 的可执行证据**：volatile 改配置不重挂、两次 boot schema 逐字节 diff、PENDING 缺失服务 audit。这三条收益最直接、误报最低，适合做 DS-G 的第一批登记样本。
2. **给 G-10 做 L4 专项夹具**：provider 卸载时 consumer cleanup 仍能调用服务。没有这个夹具，G-10 永远只能 WARN，无法验证"最后 yield provide"的真实收益。
3. **T6 把 3 个月复审、三选一出口、升 DS-R 的 2 个独立采用者门槛写进章程**；同时给 16 个陷阱建立可引用的案例编号（对应 T5 案例库），让"反例"也能被外部验证。

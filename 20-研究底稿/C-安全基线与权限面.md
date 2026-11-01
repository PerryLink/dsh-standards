# C 路｜DSH 插件安全基线与权限面研究

> 研究日期：2026-10-30 ｜ 对象：`<workspace>/deepseek-harness`（`@deepseek-ai/dsh-root` v0.2.2-alpha.2，origin `deepseek-ai/deepseek-harness`）
> 只读研究，未修改仓库任何文件。所有路径均已逐个 `stat` 校验存在。
> 配套输入：`2026-10-30-15-27-13/DSH插件生态调研报告.md`（破限/红队类、免费 Key provider、远程访问类插件、"市场收录不等于安全背书"）

---

## 0. 一句话结论（先给答案）

**DSH 目前没有面向插件的权限面（capability plane）。** 插件一旦被装载，就是与主进程**同 Node 进程、同 UID、同文件系统、同网络命名空间**的受信任代码；仓库里所有的"安全"设施（沙箱、审批、凭据 seam、remote-access）都只约束**模型通过工具发起的动作**，不约束**插件自身的代码行为**。这一点在源码注释里被明确写下，不是推断：

- `packages/fs/fs-sandbox/src/index.ts:10-18`
  > "The fence is a policy check in **TRUSTED code** over a MODEL-CONTROLLED path, **NOT a kernel boundary** … This is containment, not a security boundary."
- `packages/boot/plugin-manager/src/tools.ts:108`
  > "Profile changes persist across sessions; **installed Host code runs outside the workspace sandbox**."
- `packages/extensions/cordis-host-runner/src/sandbox.ts:8-11`（唯一用了 `node:vm` 的地方）
  > "This keeps cooperative packages inspectable and disposable but **is not containment**: host-realm helper functions remain an escape route."
- `SAFETY.md:7,13,15`
  > "…has not undergone a security audit… Sandboxing, approval prompts, and permission controls can reduce risk, but **they do not guarantee isolation**… Do not rely on DeepSeek Harness as the sole security control for untrusted workloads."

**因此对 GB 级的推论是决定性的：** GB 条款只能落在**静态可检的事实**与**声明+背书**上，不能承诺运行时隔离。所谓"分级授权（capability declaration）"在现有机制下**只能做到"声明+审计"，做不到"门控"**（论证见 §4.4）。

---

## 1. 插件可获得的能力 / 权限面（按挂载位置）

### 1.1 阅读方式

DSH 是 Cordis 树。一个插件 `apply(ctx)` 拿到的 `ctx` 是（或可取得）根 Context；`ctx.<key>` 是任意已在上下文中注册的服务。`inject` 只是**等待依赖就绪的加载顺序声明，不是权限**（`docs/cordis-primer.md` "Declare service dependency via `inject`"）。任何一个拿到 `ctx` 的插件还可以：

- `ctx.plugin(OtherPlugin)` —— 在进程内动态挂载任意子插件（`docs/cordis-api/context.md:156`；实例见 `packages/api/session-controller/src/index.ts:213-219`）；
- `ctx.get('任意键')` / `await ctx.get(...)` 取得未列入 `inject` 的服务；
- 直接 `import { spawn } from 'node:child_process'`、`node:fs`、`fetch`、`node:http` —— 完全绕过任何 `ctx.*` seam。

因此下表分两列：**"经 seam（受策略约束）"** 与 **"绕过 seam（裸 Node，无约束）"**。这是本表最重要的一维。

### 1.2 能力面清单

| # | 能力 | ctx 键 / 入口 | Service Definition 源码 | 默认是否挂载（bundle） | 默认限制 | 限制强度 |
|---|---|---|---|---|---|---|
| 1 | **文件系统（读）** | `ctx.fs` | `packages/fs/fs/src/index.ts`；本地实现 `packages/fs/fs-local/src/index.ts`；沙箱实现 `packages/fs/fs-sandbox/src/index.ts` | base 挂 `@deepseek-ai/dsh-fs-sandbox`（非 fs-local） | **读完全不受限**（`fs-sandbox` 注释："Reads pass through untouched: every mode permits reading"） | 无（同进程 `node:fs` 亦可） |
| 2 | **文件系统（写/改/删/移动）** | `ctx.fs.writeText / editText / patchText / deleteFile / moveFile` | 同上；围栏实现 `packages/fs/fs-sandbox/src/index.ts:156-178` `checkedTarget()` | 同上 | 按 `SandboxExecutionPolicy`：`read-only` 全拒；`workspace-write` 需落在 workspace root / 额外根 / 平台 temp；`danger-full-access` 不围栏。默认 mode=`read-only`（`sandbox-policy/src/index.ts:87`）。**无 session 的插件调用回落到部署默认 root = `process.cwd()`** | **软约束**（可信代码里的 if-throw），见 §0 引文 |
| 3 | **文件系统观察策略** | `fs/*` 事件 | `packages/fs/fs-observation-policy/src/`（随 base 挂载） | 是 | 提供"先读后写"新鲜度校验 | 软约束 + 可旁路（卸载后 `write` 无条件覆盖，`docs/subsystems/filesystem.md:5`） |
| 4 | **Shell 执行（bash/pwsh）** | `ctx.shell` | `packages/shell/shell/src/index.ts`；`bash-local`、`pwsh-local`、`bash-sandbox`、`pwsh-sandbox` | base 挂 **sandboxed** 执行器（POSIX→`bash-sandbox`，win32→`pwsh-sandbox`），`bash-local` 不在 base | 模型走的 `tool-bash` 经过 `ctx.sandbox` 包 argv + `ctx.approval` 审批；但**插件直接调用 `ctx.shell` 不受工具层审批约束**，`ctx.sandboxPolicy.resolve()` 只决定 mode | 对**模型**是硬-ish（bwrap/Landlock/Seatbelt/Win ACL）；对**插件**是软约束 |
| 5 | **子进程** | `ctx.subprocess` | `packages/subprocess/subprocess/src/index.ts`；实现 `subprocess-local`、`ssh/subprocess-ssh` | 是（`dsh-subprocess-local`） | `scrubbedParentEnv()` 擦除形似凭据的环境变量：`SENSITIVE_ENV_PATTERN = /KEY\|PASSWORD\|SECRET\|TOKEN/i`（`subprocess/src/index.ts:47`）。**显式 `env` 层在擦洗之后合并**（注释原文），即调用者可重新注入。`DSH_*` 命名空间被剪除 | **启发式软约束**；且只作用于 `ctx.subprocess`，`child_process` 直接绕过 |
| 6 | **持久终端 / PTY** | `ctx.terminals` | `packages/terminal/terminal/src/index.ts`；后端 `packages/terminal/terminal-bash` | **base 不挂**；`sdk-minimal` 与 web 的 `api-terminal-controller` 路径才涉及 | 无 | —（注册即获得 PTY） |
| 7 | **网络：出站 HTTP** | `ctx.web`（provider 注册表） | `packages/web/web/src/index.ts`；`web-fetch-http`、`web-search-deepseek/exa/perplexity`、`web-deepseek-api` | base 挂 `dsh-web` + `web-fetch-http` + 两个搜索 | **无出站域名白名单/黑名单**；CIDR、SSRF 防护、rate limit 均未见 | 无（`fetch`/`node:http` 直接可用） |
| 8 | **网络：入站 HTTP 路由** | `ctx.webServer` | `packages/host/webserver/src/index.ts` | 是（web-app 挂 `dsh-host-webserver`） | "named-route registry … **web-transport plugins register their own routes**"（capability-seams 表） | 无注册审批；任意插件可挂路由接收外部请求 |
| 9 | **Webhook 运行时** | `ctx.webhookRuntime` | `packages/experimental/webhook/src/index.ts`；GitHub 适配器 `packages/experimental/webhook-github/src/` | **不在任何 shipped bundle**（需用户显式 composition） | "**trusted** plugins register independent process-local rules"；`run()` "may execute arbitrary trusted code"，回调结果直接创建 Session | 无基线的自建?) 声明式 remarks：该 seam 本身即是"外部输入→自动开 Session"的高危面 |
| 10 | **凭据（读）** | `ctx.credentials` | `packages/credentials/credentials/src/index.ts`；实现 `credentials-local`（base 挂载） | 是 | **几乎无**：插件只要知道 `CredentialRef`（形如环境变量名）即可 `resolve(ref)` 取明文值；`listRecords()` **枚举全部已存 credential record**（含别家插件的授权 grant）；`readRecord(key)` 可取任意 record 的原始值 | 软约束；磁盘文件是 `0o600` / 目录 `0o700`（`credentials-local/src/index.ts:687,703`），但同进程读取不受文件权限约束 |
| 11 | **凭据（写/改/删）** | `ctx.credentials.set / unset / modifyRecord / deleteRecord` | 同上 | 是 | `modifyRecord` 是唯一写路径（带锁）；**没有调用方身份校验** | 无 |
| 12 | **授权流（OAuth/Custom Flow）** | `ctx.authorization` | `packages/credentials/authorization/src/index.ts` | 是 | 一个 key 一个 flow，重复注册报 `DUPLICATE_FLOW` | 软约束（先占先得，可被插件抢占 registry key） |
| 13 | **DeepSeek 账号 / 平台 token** | `ctx.deepseekAccount` | `packages/credentials/deepseek-account/src/index.ts`；`deepseek-account-platform` | 是 | `resolveToken(url)` 只对**该 provider 允许的 inference origin** 返回 token；`getPlatformSession()` 标 Host-only | 局部诚实的窄约束（origin 检查），但对已进入 ctx 的插件基本不构成障碍 |
| 14 | **模型访问 / LLM adapter 注册** | `ctx.llm` | `packages/llm/llm/src/index.ts`；`llm-deepseek`、`llm-pi-ai`、`llm-replay` | 是（base 挂 `llm` + `llm-pi-ai`（dormant）+ `llm-deepseek-api-key`/`-account` 变体 + `llm-retry`） | 无注册审批。**任何插件可注册 adapter**，从而看到每一次请求的完整 messages/system prompt/工具 schema 与响应流；基站段一并观察到 compact 流程（`ctx.llm` 被 `compaction-basic` 消费） | 无 —— 这是生态里"免费 Key provider"类插件的能力落点 |
| 15 | **DeepSeek wire 扩展（请求级外发）** | `ctx.deepseekLlmApiExtensions` | `packages/llm/deepseek-llm-api-extensions/src/index.ts` | 是 | 插件可注册顶层字段，官方 adapter 合并后随请求发出 | 软约束 |
| 16 | **会话日志默认回传 DeepSeek** | `ctx.sessionLogDeepSeek` | `packages/session/session-log-deepseek/src/index.ts` | 是 | `Config.enabled` **默认 `true`**，每条官方请求最多携带 8 MiB `dsh_session_log`（`index.ts:57-61,198`）；插件可通过 `register()` 的 `SessionLogUploadExclusion` 追加排除项 | 默认开 / 用户可关（Volatile 设置项） |
| 17 | **会话数据（内存 + 持久）** | `ctx.sessions` | `packages/core/session/src/index.ts`；持久化 `packages/session/session-persistence*/`；查询 `packages/session-query/*`（含 sqlite 全文索引） | 是 | **无按插件的隔离**；`session-query-sqlite` 提供跨会话全量检索；`session-reference` 可跨会话取快照（`docs/capability-seams.md` `ctx.sessionReferenceResolver`） | 无 |
| 18 | **工具注册 / 执行拦截** | `ctx.tools` + `tools/*` 瀑布 | `packages/core/tools/src/index.ts` | 是 | 对自己的工具可自选 executor；对他人的调用可通过 `tools/pre-execute → execute → post-execute` 瀑布拦截与改写 | 无注册审批；插件可注册同名/高优先监听器抢占模型可见工具集 |
| 19 | **System prompt / 消息投影改写** | `ctx.systemPrompt`、`session/*` 投影 | `packages/core/system-prompt/src/index.ts`、`packages/session/session-projection/` | 是 | 无 | 无 —— 这是破限/提示注入类插件的能力落点 |
| 20 | **MCP 客户端（外连 MCP server）** | `ctx.mcpResources`（+ `mcp-client` 的 constrained provider） | `packages/mcp/mcp-resources/src/index.ts`、`packages/mcp/mcp-client/src/index.ts` | `mcp-resources` 在 base；**`mcp-client` 需用户按 server 逐条配置**，不随 Bundle 挂 | "MCP servers are **opt-in**"（`docs/subsystems/mcp.md`）；凭据/进程环境由 client config 拥有 | opt-in（用户侧），但插件可用 `ctx.plugin()` 自行挂载一个配置好的 client |
| 21 | **浏览器操控** | `ctx.browserUse` | `packages/browser-use/browser-use/src/index.ts`（Playwright MCP / Chrome DevTools MCP / Stagehand native 三种后端） | 不在 base | 无 | 注册即获得已登录浏览器上下文 |
| 22 | **GUI/桌面控制（Computer Use）** | `ctx.computerUse`、`ctx.cuaAccess` | `packages/computer-use/computer-use/src/`、`packages/experimental/cua/` | 不在 base | `cuaAccess` 只做 consent/cancel UI | 无基线 |
| 23 | **LSP（起 language server / 读诊断）** | `ctx.lsp` | `packages/lsp/lsp/src/index.ts`；`packages/lsp/lsp-stdio/` | 不在 base | "the seam offers **no protocol escape hatch**"（capability-seams 表）——只有 4 个规范化操作 | 结构性窄接口，但 `lsp-stdio` 仍经 `ctx.subprocess` 起进程 |
| 24 | **SSH / 远端执行世界** | `ctx.ssh` → `packages/ssh/{fs-ssh,subprocess-ssh,sandbox-ssh}/` | `packages/ssh/ssh/src/index.ts` | 不在 base | SSH provider 替换后 fs/subprocess/sandbox 整体搬到远端 | 无 |
| 25 | **RPC / Typert Remote（对外暴露方法）** | `ctx.typert` + `ctx.typertGateway` | `packages/typert/registry/src/index.ts`、`packages/api/gateway/src/index.ts` | 是（base 挂三者） | `@Remote` 标记才进 wire **生成契约**；未标记的方法不可被 `ctx.remote` 调用 | 生成期硬边界（真的拦得住），但"是否 @Remote"由插件作者自选 |
| 26 | **远端访问控制（非 owner Peer）** | `ctx.remoteAccess` | `packages/api/remote-access/src/index.ts` | 是（Gateway 强制要求） | 角色制 policy；是全仓唯一面向外部调用方的真实访问控制，**只约束非 owner Peer 的入站 RPC**，不约束插件 | 生效的真实门控，但作用域仅浏览器/远端 Peer |
| 27 | **远端 Peers / 远程helpsitteliste 连接** | `packages/api/remotes/` | `packages/api/remotes/src/index.ts` | web-app 挂 `dsh-api-remotes` | 见上面 i两行 | 生态"远程访问类插件"（dsh-pocket、ds-harness-remote）的依托 |
| 28 | **安装/卸载插件（运行时）** | `ctx.pluginManager`（`installBundle` 等 `@Remote` 方法） | `packages/boot/plugin-manager/src/index.ts`（1357 行）；模型可调用的 `tools.ts` | base 挂 `dsh-plugin-manager`；`dsh-plugin-manager/tools` **默认 `disabled: true`** | `tool-plugin-manager` 每次调用前 `approveEscalation(... 'danger-full-access' ...)`（`tools.ts:104-110`） | 模型路径有审批；**但 `@Remote installBundle` 从 UI 调用不经该审批**（见 §3.4） |
| 29 | **市场索引读取** | `ctx.pluginMarket` | `packages/boot/plugin-market/src/index.ts` | 否（按需） | index URL 必须 http(s)、不可带凭据或 fragment，且须在**已配置源集合内**（`src/types.ts:10-13`） | 真实的窄门控（allowlist），只覆盖"发现"，不覆盖"安装" |
| 30 | **动态 Cordis 包（vm 沙箱）** | `ctx.dynamicCordisRunner` | `packages/extensions/cordis-host-runner/src/sandbox.ts` | web-app 挂 `dsh-cordis-host-runner` + `dsh-tool-cordis/host` | **唯一的 `node:vm` 隔离**：陷阱掉 `require / fetch / 定时器`，把 fs/web/进程导向 ctx 服务 | **协作式，非 containment**（作者自己写明存在 host-realm helper 逃逸） |
| 31 | **PTC / Workflow 执行（跑模型生成的程序）** | `ctx.ptcRuntime`、`ctx.workflowEngine` | `packages/ptc-runtime/ptc-runtime/src/`、`packages/workflow/workflow/src/` | 是（`ptc-runtime-node`、`workflow-ptc`） | 跑重写绑定上的程序，无 own isolation 层 | 软 |
| 32 | **Skill 注册（把文件/权限包注入模型）** | `ctx.skills` | `packages/skill/skill/src/index.ts`；`skill-filesystem`、`skill-office`、`sandbox-windows-acl` 均为 providers | 是 | 无 | 无 —— **注意 `packages/sandbox/sandbox-windows-acl` 本身就是一个 `ctx.skills` provider**，即"安全设施"与"可被恶意插件替换的组件"同构 |
| 33 | **`loop hygiene` guard** | （无 ctx 键） | `packages/guard/repeat-tool-reminder/src/index.ts`、`packages/guard/timeout-policy/src/index.ts` | 是 | 重调用提醒 + 超时 | **与安全无关**（见 §2.4 的常见误解澄清） |
| 34 | **后台任务** | `ctx.jobs` | `packages/jobs/jobs/src/index.ts` | 是 | 无 | 无 |

### 1.3 三条元结论（决定了整个 GB 条款的形状）

1. **同进程 ⇒ 无插件级隔离。** 插件的 JS 与 dsh 自己在同一个 Node `Context` 里执行；没有 per-plugin worker/vm/容器。唯一用 `node:vm` 的 `cordis-host-runner` 只服务于"动态 Cordis 包"，且作者自陈不是 containment。
2. **`ctx.*` seam 不是权限边界。** seam 解决的是"可替换/可组合"，它的假设前提是**调用者可信**（`fs-sandbox` 注释原话）。任何 seam 约束都可以被 `import node:*` 绕过。
3. **宿主网络出站无任何产品级策略。** 全仓未见域名白名单/黑名单、出口代理强制、或针对 `fetch` 的包装层；`ctx.web` 只是一个 provider 注册表。

---

## 2. 已有安全机制：硬隔离 vs 审批/软约束

### 2.1 判定矩阵

| 机制 | 源码 | 作用域 | 判定 | 理由 |
|---|---|---|---|---|
| `SAFETY.md` | `SAFETY.md`（+ `.zh.md`） | 文档 | **免责声明，非机制** | 原文明示"not undergone a security audit"、"do not guarantee isolation" |
| `packages/sandbox`（seam + local 后端） | `packages/sandbox/sandbox/src/index.ts`、`sandbox-local/{index,profiles}.ts`、`sandbox-windows-acl/*` | **子进程**（`ctx.subprocess` 产物的 argv） | **硬隔离（对准模型）** / **对插件无效** | Linux bwrap+Landlock、macOS Seatbelt、Windows ACL restricted token（`docs/subsystems/sandbox.md:5`）；fail-closed（`SandboxUnavailableError`，禁止静默 passthrough）。但只对**模型经工具发出的 argv**；且 `enforcement` 可为 `'partial'`（旧 Landlock ABI、Win ACL 的 hard-link/unconfined-read/AppContainer 缺口） |
| `packages/sandbox/sandbox-policy` | `packages/sandbox/sandbox-policy/src/index.ts` | 部署级默认值 + 每会话解析 | **策略源（软）** | 唯一归属部署默认 mode 与 root，保证 bash 与 fs 不同根——良好的一致性设计，但它只是返回对象 |
| `packages/fs/fs-sandbox` | `packages/fs/fs-sandbox/src/index.ts` | `ctx.fs` 的 5 个写操作 | **软约束（containment）** | 作者自陈"policy check in TRUSTED code … not a kernel boundary"；只覆盖 aiigented 路径 canonicalize+contain；读完全不拦 |
| `packages/interaction/user-approval` | `packages/interaction/user-approval/src/index.ts` | **工具调用**（模型动作） | **审批 / fail-closed 软约束** | `ApprovalOutcome` 封闭且 fail-closed（`unavailable` 一律拒绝）；但**只对工具层生效**，插件调 fs/shell 不进这个 flow |
| `packages/interaction/permission-presets` | `packages/interaction/permission-presets/src/index.ts` | 用户 UI 预设 | **软约束（旋钮打包）** | 把 sandbox mode + approval policy 打包成 `workspace-write(+ask)` / `danger-full-access(+never)`；"the layer is optional and owns no execution policy"（`docs/subsystems/permission-presets.md:5`） |
| `packages/credentials/*` | `packages/credentials/{credentials,credentials-local,authorization,deepseek-account,deepseek-account-platform}/src/` | 凭据存储 | **机密性整理 + 弱隔离** | 文件 `0o600`/目录 `0o700`；"value-free views and write-only storage" 使**远端 UI** 读不到明文（`ctx.credentialsController` "Secret values cross in one direction only"）。**但同进程插件可读**。`resolveToken(url)` 的 origin 检查是诚实的窄约束 |
| `packages/api/remote-access` | `packages/api/remote-access/src/index.ts` | 非 owner Peer 的入站 RPC | **硬门控（在其作用域内真实生效）** | Gateway 在派发非 owner 调用前必问 `decide()`，列表方法经 `allows()` 过滤；失败→`POLICY_FAILED` deny。这是全仓最像"真实访问控制"的一处 |
| `packages/api/gateway` + `typert` | `packages/api/gateway/src/{index,access}.ts`、`packages/typert/registry/src/index.ts` | wire 契约 | **生成期硬边界** | 未标 `@Remote` 的方法进不了生成的 Client 类型与 runtime contributions（"Unmarked methods … cannot be called through `ctx.remote`"）。拦的是"远端能否调用"，不是"本地能否执行" |
| `packages/experimental/webhook`（注意：不在 `packages/webhook`） | `packages/experimental/webhook/src/index.ts`、`experimental/webhook-github/src/` | 外部投递 → 自动建 Session | **认证 + 信任声明** | GitHub 适配器验签（`application/json` 原文验签后解析，202 立即返回）；规则必须是 "trusted" 插件注册，`run()` 可跑任意代码。**无 quarantine：Webhook rule 的注册本身无限流/审批** |
| `packages/fs` / `fs-local` / `fs-observation-policy` | 见上表 #1-#3 | 文件读写 | 软 | 卸载 observation-policy 后写操作变为无条件 |
| `packages/shell` / `shell-local/sandbox` | `packages/shell/shell/src/index.ts` 等 | 命令执行 | 硬（对模型）/ 软（对插件） | base 只挂 sandboxed 执行器，这点值得肯定（`dsh-bash-local` 不入 base） |
| `packages/subprocess` | `packages/subprocess/subprocess/src/index.ts` | 子进程环境变量 | **启发式软约束** | `SENSITIVE_ENV_PATTERN=/KEY\|PASSWORD\|SECRET\|TOKEN/i`；显式 env 在擦洗后合并（可撤销）；`child_process` 直连绕过 |
| `packages/mcp`（client + resources） | `packages/mcp/mcp-client/src/`、`mcp-resources/src/` | 外连 MCP server | **opt-in（用户侧）** | 每个 server 需在 Cordis scope 里显式配一行；未配则无 MCP 工具与 prompt 文本 |
| `packages/guard` | `packages/guard/{repeat-tool-reminder,timeout-policy}/src/index.ts` | 循环卫生 | **与安全无关** | ⚠️ 见 §2.4 |

### 2.2 唯一的"硬隔离"在哪

只有一类：**对被沙箱包裹的子进程的 OS 级围栏**（`ctx.sandbox` 的四个后端）。它满足硬隔离的两个判据：(a) 内核/ACL 层执行；(b) fail-closed（`SandboxUnavailableError`，"Silent unconfined passthrough is never legal"）。但它：

- 只包 argv，不管网络；
- `enforcement` 可为 `partial`；
- **`danger-full-access` 是一条 preset 就能整体关掉的产品功能**，且 jederzeit 可被 `'never'` approval policy 的 headless/CI 组合默认关闭；
- **对插件自己的 `import { spawn }` 完全无用**。

### 2.3 一个容易被写成 GB 条款但会落空的说法

"插件不得越权访问文件系统" —— 在 DSH 里**不可强制**。能强制的只有"插件不得通过 `ctx.fs` 在默认 read-only 下写 workspace 之外的路径"，而这是一个**可被静态检查的行为子集**，且与"`node:fs` 我照样写"并存。

### 2.4 ⚠️ 对任务书的一处事实修正

任务书提到 "`packages/guard`（审批策略）"。经核，`packages/guard` **不是审批包**，它是"loop-hygiene guard family"（`packages/guard/README.md` 首段），只含：

- `repeat-tool-reminder`——模型重复同一 tool call 时提醒；
- `timeout-policy`——给声明了 limit 的 tool call 加超时。

真正的审批策略在：

- `packages/interaction/user-approval`（`ctx.approval` seam、`approval/request` waterfall、`approval/policy` 会话事件、fail-closed outcome）；
- `packages/interaction/permission-presets`（把 sandbox mode + approval policy 打包成面向用户的预设）；
- `packages/sandbox/sandbox/src/escalation.ts`（`approveEscalation`：严格更宽阶梯 + 结构化错误标记，bash/fs 两个 enforcing 家族共用的审批编排）。

这一修正对 GB 条款很重要：**GB 不该写"须使用 dsh-guard"，因为 guard 与安全无关。**

---

## 3. 插件安装与供应链

### 3.1 spec 形态

**`dsh plugin` 是 pnpm 的透传包装。** CLI 帮助原文（`docs/cli-help.md:73`）：

> `args  pnpm arguments, forwarded verbatim (add <pkg>, remove <pkg>, why <pkg>, ...)`

`apps/cli/src/plugin.ts:78-98`：只拦截三个 DSH 自有命令（`allow-version` / `revoke-version` / `version-exemptions`），其余原样交给 `runProfilePnpm` / `runPluginCommand`。因此 **CLI 通道的 spec 面 = pnpm 的全部 spec 面**，包括：

| 形态 | 是否被解析/限制 | 证据 |
|---|---|---|
| npm registry 名（`name`、`name@range`、`name@tag`） | 允许 | `install-spec.ts:84-91`；名字语法 + ≤214 字符 |
| npm alias（`alias@npm:real`） | 允许（pnpm 层，manager 不做额外校验） | CLI 透传 |
| `github:owner/repo`、`gitlab:`、`bitbucket:`、`gist:` 简写 | 允许并记录 host | `install-spec.ts:22,26-28,52-58` |
| `git+https://…`、`git+ssh://…`、`git@host:…`（**任意 host**） | 允许 | `GIT_URL` 正则，`install-spec.ts:23` |
| 托管仓库 URL `https://host/owner/repo[#ref]` | 允许 | `HOSTED_REPOSITORY_URL`，`install-spec.ts:24` |
| HTTP(S) tarball URL（`.tgz` / `.tar.gz`，**任意 host**） | 允许并记录 host | `TARBALL_SPEC`，`install-spec.ts:30` |
| 本地绝对路径（`file:` / `link:` / 裸绝对路径） | 允许；**相对路径被拒**（"a local path must be absolute"） | `install-spec.ts:72-77` |
| `workspace:`、`catalog:`、`jsr:` 等 | 由 pnpm 决定；manager 的 `NON_REGISTRY_VALUE` 正则显式承认这些协议 | `install-spec.ts:95` |

注意：上述 `parseInstallSpec` 的严格形态只作用于 **Web/UI 通道**（`plugin-manager` `installBundle`）。CLI 通道绕过它直给 pnpm。

### 3.2 完整性 / 签名 / 来源：几乎全落到 pnpm

逐项核对结果：

| 检查项 | 结论 |
|---|---|
| 包签名 / Sigstore / provenance attestation | **无**。全仓 `packages/boot/{plugin-manager,plugin-market}/src` 无 `signature`/`attest`/`provenance`/`sigstore` 字样 |
| 显式 integrity 校验 | **无**。仅有对 pnpm 失败信号的**事后分类**：`install-failure.ts:27` 把 `ERR_PNPM_TARBALL_INTEGRITY` / `ERR_PNPM_BAD_TARBALL_SIZE` / `EINTEGRITY` 映射成 `PluginInstallFailureKind = 'integrity'` |
| 依赖 pnpm 的隐式保护 | **有**：`pnpm-lock.yaml` 中的 tarball URL + integrity（注释原文，`index.ts:334`："pnpm verifies lockfile tarball URLs against its default registry…"）。这是唯一的供应链完整性机制，且由 pnpm 提供 |
| 作者/来源白名单 | **无**。任何 registry / git host / tarball host 都可安装 |
| 沙箱/源 allowlist | **仅市场索引**：`plugin-market/src/types.ts:10-13` 要求 index URL 为 http(s)、无凭据、无 fragment，且须属于已配置的 index sources；这不是安装 allowlist，只是发现通道的 allowlist |
| registry 选择 | `plugin-manager` Config `registry` + `fallbackRegistries`，**默认 fallback 是 `https://registry.npmmirror.com/`**（`registry.ts:17`, `index.ts:323`）。私有 registry 永不忘fallback 到公共（`registryPlan` 注释，`registry.ts:44-52`）——这是好的设计，但它保证的是"来源不被意外降级"，不是"来源可信" |
| **构筑脚本**（git 依赖的 `prepare` / npm `postinstall`） | **有一道真实闸门**：pnpm 默认阻止未批准的 build scripts；manager 把待决项写进 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds` 并暴露为 `pendingBuilds`（`build-approval.ts:63-96`）。**默认是拦的**，且带凭据的 git key 被主动排除在 pending list 之外（`carriesCredential`，`build-approval.ts:21-26`）。但**批准粒度是包名、是一次性开关**，批准后该包的任意版本构建脚本都会跑 |
| **版本兼容性** | **有一道真实闸门**：`evaluatePluginCompatibility()`（`packages/boot/app-boot/src/plugin-compatibility.ts:87`）在 import 插件代码**之前**读 manifest，比对 `engines.dsh` 或 `@deepseek-ai/dsh*` peer range；不满足则拒绝安装。可经 `dsh plugin allow-version <pkg@ver> --dsh-version <exact> --accept-risk` 逐版本豁免（`apps/cli/src/plugin.ts:41-58`，并打印"may crash or corrupt data"警告） |
| **平台** | `assertBundlePlatform` / `UnsupportedBundlePlatformError`（app-boot） |
| **安装失败回滚** | `RESTORED_FILES = ['package.json','pnpm-lock.yaml']`，失败/取消/非 bundle 三者都回滚（`index.ts:112,328-333`）；注释坦承 "downloaded files can stay" |

### 3.3 依赖树

- 依赖由 **pnpm 解析并写入 profile 的 `pnpm-lock.yaml`**，没有独立的插件依赖治理。
- **传递依赖：没有任何额外校验。** 只有被 `pnpm add` 命名的**直接** spec 会走 `namedSpecManifest()` → `evaluatePluginCompatibility()` 的 preflight（`operations.ts:344-356`）；注释原文承认 "A spec whose manifest cannot be read **or validated is left to the run itself**"。
- **扁平化依赖树 → Cordis 树**走 `packages/boot/app-boot/src/profile-resolution/*`（1072 行 resolver）与 `bundle-platform.ts` / `plugin-compatibility.ts` / `profile-plugins.ts` / `profile-sanitize.ts`。其中：
  - `profile-plugins.ts:69-83` `readProfilePlugins()` 只读已安装包的 manifest（`bundle: bundleManifest(...)?.dsh?.bundle?.patch !== undefined`），**不 import 插件代码**——正确的 reading-without-executing 设计；
  - `profile-sanitize.ts:18` 提供 profile patch 的备份+重建（灾难恢复，非安全）。
- **激活 ≠ 安装。** 装完之后还须 `dsh.bundle.patch` 声明 + 进 profile 的 bundle 列表（或 patch 行）才会在启动时 mount。但这是一个 **composition 约定，不是安全闸门**：patch YAML 由用户/UI/ `--patch` 覆盖层写，任何能写 profile 目录的主体都能指向任意模块。
- `dsh-official-bundles` 提供 `PROTECTED_PLUGINS` / `OPTIONAL_BUNDLES` / `OFFICIAL_ON_DEMAND_CATALOG`（`plugin-manager/src/index.ts:27`），即官方 bundle 有一层"管理类不可变更"的保护，但那是保护 **dsh 自身不被卸载**，不是保护用户不被第三方插件侵害。

### 3.4 一个具体的通道不对称（建议写进 GB）

| 通道 | 是否强制 `danger-full-access` 审批 | 是否走 `parseInstallSpec` |
|---|---|---|
| CLI `dsh plugin --profile X add …` | **否**（直给 pnpm） | 否 |
| 模型工具 `plugin_manager`（`dsh-plugin-manager/tools`） | **是**，`approveEscalation({ requestedMode: 'danger-full-access', … })` | 是 |
| Web UI → `@Remote installBundle` | **否**（只走 UI 自身的确认按钮，非 `ctx.approval`） | 是 |

即：**最宽松的通道（CLI）恰好是文档里教给用户的那一条**（`docs/cli-help.md:57` 示例 `dsh plugin --profile tui add <package>`），也是生态 README 里让所有用户复制的那一条。

---

## 4. GB 级"基础安全"条款草案

设计原则：**GB 只承诺它能被验证的东西。** 按"可机械验证 / 只能声明+背书 / 必须标注"三分。

### (a) 可机械验证（静态检查或 CI 可判定，建议作为 GB 的强制条文）

判定方法备注：下列每条都能由"读 manifest + 读 AST/正则扫源码 + 读 profile 解析结果"判定，不需要运行插件。

| # | 条款草案 | 机械判定方法 | 依据 |
|---|---|---|---|
| **A1** | **安装 spec 可解析且来源固定**：plugin 的推荐安装命令必须是一个能被 `parseInstallSpec()` 接受的 spec，并显式声明其 `kind`（registry / git / tarball / path）。禁止使用会随 HEAD 漂移的隐式引用 | 直接调用 `packages/boot/plugin-manager/src/install-spec.ts:69` 的 `parseInstallSpec()` 判定；对 `registry` 形态要求有明确 range 或 tag（不得裸名） | `install-spec.ts:15-19,69-92` |
| **A2** | **若采用 registry 形态，必须同时给出可校验的版本约束**（精确版本或可读 tag），且依赖声明落于 `dependencies`（非 `devDependencies`） | manifest JSON 检查 | `versions.ts`、`install-spec.ts:84-91` |
| **A3** | **声明 `engines.dsh`（或 `@deepseek-ai/dsh` peer range），且被当前 runtime 满足** | 调用 `evaluatePluginCompatibility(manifest, {}, runtimeVersion)`（`packages/boot/app-boot/src/plugin-compatibility.ts:87`）返回值必须为 `undefined` | `plugin-compatibility.ts:87-102` |
| **A4** | **声明 `dsh.bundle.patch`，且补丁文件在包内存在** | manifest + 文件存在性 | `profile-plugins.ts:69-83`、`app-boot/README` 的 patch 解析 |
| **A5** | **不读取凭据存储目录，不直连 `credentials-local` 的 backing file** | AST/正则：禁止源码出现指向 `$DSH_HOME` 下凭据文件路径的字面量；禁止 `require('@deepseek-ai/dsh-credentials-local')` 的内部 API；**但不禁止 `ctx.credentials`（见 B3）** | `credentials-local/src/index.ts:687,703` 是 `0o600`/`0o700` |
| **A6** | **不注册全局 shell 后端而不声明**：若插件在 root Context 上 `@deepseek-ai/dsh-shell` 注册 provider（即成为所有随后 bash/pwsh 调用的默认执行器），必须在 manifest 的 `dsh.declares` 里写明 `shell:global` | AST：检测 Service key 注册 + root context 挂载；对照 manifest 声明 | `packages/shell/shell/src/index.ts` seam 语义（base 只挂 sandboxed provider，`base/cordis.patch.yml` 第 ~290 行） |
| **A7** | **不注册凭据 hack seam 的全局 provider 而不声明**：同上模式适用于 `ctx.credentials`、`ctx.sandboxPolicy`、`ctx.sandbox`、`ctx.deepseekAccount` —— 这些都是"换掉即整体改变产品语义"的根级 seam | 同上 | `packages/fs/fs-sandbox` / `packages/credentials/credentials` 的 seam 角色说明 |
| **A8** | **不请求 `--ignore-scripts` 式规避**：`dsh.buildScripts` 声明需要的包名清单；安装器（标准提供的参考安装脚本）必须只把该清单写入 `allowBuilds` | 对照 `build-approval.ts:78-83` 产出的 `pendingBuilds` 与 manifest 声明求差集 | `build-approval.ts:63-96` |
| **A9** | **bundle patch 引用的所有可执行模块路径必须落在插件自身包目录内**（不允许 patch row 指向 node_modules 外的绝对路径、~/、环境变量插值） | 解析 `dsh.bundle.patch` YAML，检查 `name` 字段与路径形态 | `profile-sanitize.ts`、`app-boot` patch composer |
| **A10** | **不引入"运行时自安装"**：插件不得在 `apply()` 里调用 `ctx.pluginManager.installBundle / removeBundle`，除非 manifest 显式声明 `dsh.declares.installsPlugins: true` | AST + manifest | `plugin-manager/src/index.ts` 的 `@Remote installBundle`；`tools.ts:104-110` 之所以要 approveEscalation，正是因为这条有害 |
| **A11** | **不得装载 `dsh-plugin-manager/tools`**（模型自安装工具） | profile patch 检查该 row 的 `disabled` | `base/cordis.patch.yml:16-18` 默认 `disabled: true` |
| **A12** | **静态依赖树闭集可导出**：`pnpm why <pkg>` / lockfile 可被完整导出，且不含未在本标准注册表中的 tarball/git 源（除非该源在 A1 中显式声明） | lockfile 解析 | `install-spec.ts:94-95` `NON_REGISTRY_VALUE` |
| **A13** | **不得注册 invisible `@Remote` 面给自己；对外暴露的 Remote 方法必须在 manifest 声明** | 扫 `@Remote` / `@RemoteScope` 装饰器 vs manifest | `docs/api-gateway.md`："Unmarked methods … cannot be called" |
| **A14** | **不得在无 `Terminator` 的情况下注册 `ctx.webServer` 路由**（若注册路由，必须声明认证方式） | AST | `packages/host/webserver/src/index.ts` 路由注册面 |

### (b) 只能"声明 + 背书"（技术上不可强制，建议 GB 只要求"明示 + 显著披露"，不要求禁止）

技术不可行的根因：**同一 Node 进程、无出口网络策略、无 per-plugin syscall 过滤**。以下每条写一个"必答项 + 不履行即失去 GB 标识"，而不是"禁止"。

| # | 声明项 | 为什么只能声明 | 现有可借力的证据来源 |
|---|---|---|---|
| **B1** | **不上传会话数据**：不读取 `ctx.sessions` / `sessionQuery` 内容并外发 | 无网络出口策略；`ctx.web` 与裸 `fetch` 等价开放 | `packages/session/session-query/*` 提供跨会话全量检索面 |
| **B2** | **不代理第三方 API / 不把用户请求转发到未在 settings 中配置的 endpoint** | 同上；且"第三方 API"无法静态枚举 | `ctx.llm` 的 adapter 注册是最典型的转发点（`llm-pi-ai` 的 provider profile 由用户 settings 供给） |
| **B3** | **不读取/不外传凭据**：不调用 `ctx.credentials.listRecords()` 枚举全部 credential record，不 `resolve()` 与自己无关的 ref | `listRecords()` 是 API 一等方法（`credentials/src/index.ts:203`），无调用方鉴权 | 该文件明确"a surface that cannot list them cannot … find an orphan left by an uninstalled plugin" —— 即 API 天生全量可见 |
| **B4** | **不静默改写 system prompt / 工具 schema / 消息投影** | 这是 Cordis 的合法扩展点（`ctx.systemPrompt`、纯消息投影是官方推荐做法），无法区分恶意与正当 | `docs/architecture.md:128` "Plugins changing existing message content register pure message projections" |
| **B5** | **不注册 LLM adapter 之外挂监听全部模型流量** | `ctx.llm` 注册无审批；这也是"有用插件"（第三模型路由/OpenAI 兼容）的实现方式 | `packages/llm/llm/src/index.ts` |
| **B6** | **不在 Webhook rule 中建立入站自动化**（不注册 `ctx.webhookRuntime` rule 把外部输入转成自动 Session） | webhook 规则本身就是"trusted plugin 注册"模型 | `docs/subsystems/webhook.md`：rule 可跑任意 trusted code 并直接建 Session |
| **B7** | **不替换安全相关 seam 的 provider**（`sandbox`、`sandboxPolicy`、`fs`、`approval`、`remoteAccess`、`cuaAccess`） | 这是官方宣传的"everything is replaceable"特性正面 | `docs/architecture.md:138` "Seams are why one provider swap changes the whole product" |
| **B8** | **不利用 `danger-full-access` / `--add-dir` 把自己的行为放在 workspace 之外** | 用户选择一个 preset 即可整天关闭沙箱 | `interaction/permission-presets` 的 `danger-full-access + never` preset |
| **B9** | **传输与留存的第三方端点披露**（含厂商自有的遥测；注意 `session-log-deepseek` **默认 `enabled: true`**、单请求 ≤8 MiB） | 外发行为不可proof-flow-bound | `packages/session/session-log-deepseek/src/index.ts:57-61,198` |

> 备注：B 类的"背书"应该有可执行的背书主体。基于仓库现状，唯一现实可行的背书链是**来源三方之一**（GitHub 上的 `@deepseek-ai` 组织归属 / npm 官方 registry 的 publisher / 社区 index 的 maintainers）+ **A 类静态结果的签名存档**。**不应允许把 star 数或"市场收录"当作背书** —— 生态报告 §6.4 已指出"市场收录不等于安全背书"与外部目录站的 star 滞后/幽灵条目问题。

### (c) 应强制标注而非禁止（针对生态报告点名的三类）

理由：这三类在技术上与正当插件**完全同构**（它们都是"注册一个 LLM adapter"或"改 system prompt"），禁止会在 GB 层面变成不可执行的空文，且会误伤正当用途（合规的授权安全研究、企业自建网关）。正确做法是**强制标注 + 安装期强提示 + GB 不予受理**。

| 类别 | 生态实例 | 技术落点 | 建议标注要求 |
|---|---|---|---|
| **破限 / 提示注入类** | `YuJunZhiXue/dsh-purge`(13,357★)、`Minglink/dsh-infinite-gen-5`(3,699★)、`yexi-by/dsh-unrestricted`(784★)、多家 `dsh-purge` 分支/镜像 | `ctx.systemPrompt` 段注册、消息投影、`ctx.skills` 注入、`tool-*` 注册 | `dsh.labels: ["prompt-modification"]`；安装前必须显示"本插件会改写模型系统提示/越狱行为"；**不得获得 GB 标识**（可获 GB/T 或 GB/Z，标注类别） |
| **红队 / 安全研究类** | `SeaOf0/dsh-redteam-model`(797★)、`howmp/dsh-pentest`(615★) | 同上 + shell/subprocess 后端 | `dsh.labels: ["red-team"]`；必须声明"仅在用户自有/已授权目标上使用"；必须有 `usage-scope` 声明 |
| **免费 Key / 第三方 provider 类** | `Ebony-Vinyl/dsh-our-free-model`(51,596★)、`ysr666/dsh-vision-router`、`DDDMUC/dsh-free-search`、`cv-superding/dsh-deepseek-web-login`、诸 Codex/Claude 订阅桥 | `ctx.llm` adapter 注册 + `llm-pi-ai` provider profile + `apiKeyEnv` 凭据引用 | `dsh.labels: ["third-party-model-provider"]`；**必须披露**：请求payload 目的地域名、是否留存、是否注入/替换系统提示、是否读会话日志。生态实例 `toby-bridges/api-relay-audit` 证明社区已在自发做这件事 |
| **远程访问 / 暴露面类** | `shaobeichen/dsh-pocket`、`liguobao/ds-harness-remote`、`xmanrui/dsh-im`、各类 IM bridge | `ctx.webServer` 路由、`ctx.remoteAccess` policy、`ctx.connection` 信任边界（`--trusted-host`）、`ctx.webhookRuntime` rule | `dsh.labels: ["network-ingress"]` / `["remote-access"]`；必须声明监听面、认证方式、是否绕过 `--trusted-host` 围栏 |
| **封装式 / Mirror 类**（附加） | 多家 `dsh-purge` "社区维护版/全量镜像" | 同名得上 packages + patch 冲突 | 强制标注 `upstream`/`fork-of`，禁止与上游同名发布而不标 —— 生态报告 §6.4 已记录"上游将删库、下游标注 mirror"与随意改名套壳现象 |

### (d) 分级授权（capability declaration）可行性结论

**问题重述：插件能否声明"我要用 fs 写权限 + 网络"，宿主能否据此门控？**

**答案：声明可以做（今天就可行，成本很低）；门控在 dsh 现有机制下做不到。**

**(d-1) 声明层：可行，且与现有机制顺接**

- `dsh` manifest 字段已是插件契约载体：`dsh.profile` / `dsh.bundle`（`docs/architecture.md:21`），`engines.dsh` 与 peer range（`plugin-compatibility.ts`）。再加一个 `dsh.capabilities: string[]` 或 `dsh.declares` 是同一套 Autorinnen 的自然扩展，**不破坏任何现有流程**（未声明的插件按"未声明"处理即可，向后兼容）。
- 已有的"可被静态读取但不执行代码"的入口正是这种声明的检查点：`readProfilePlugins()`（`profile-plugins.ts:69`）与 `evaluatePluginCompatibility()`（`plugin-compatibility.ts:87`）都只读 manifest，不 import 插件代码。**这意味着 capability 检查可以插在 libboot 期，成本与今天的版本兼容检查同级。**
- 可对齐的词汇表已经存在（`ctx` 键清单就是能力清单）：`fs:read` / `fs:write` / `shell` / `subprocess` / `terminals` / `network:egress` / `network:ingress` / `credentials:*` / `llm:register` / `llm:intercept` / `sessions:read` / `webhook:rule` / `mcp:client` / `browser` / `lsp` / `remote:expose` / `plugin:install`。

**(d-2) 门控层：不可行**

要门控，必须满足"插件无法绕过 %{seamName} 直达资源"。DSH 四条全部不满足：

1. **无 syscall 层过滤。** 插件是同进程 JS，`node:fs` / `node:child_process` / `node:net` / `fetch` 原生可用。要真的门控，必须把每个插件放进 Worker 或子进程（甚至容器），并采用消息式能力代理 —— 这是 `cordis-host-runner` 的 `node:vm` 方案都做不到的（作者自陈 "host-realm helper functions remain an escape route"，`sandbox.ts:8-11`）。
2. **无出口网络策略。** 即使封了 seam，也无法阻止裸 `fetch`。仓库中不存在包装 `${'`fetch`'}` 或统一代理的产品。
3. **seam 的信任模型方向相反。** `fs-sandbox` 注释直言 fence 是"policy check in TRUSTED code"，调用方假定可信；sandbox 包 argv 只约束模型发起的路径，不管插件。
4. **`ctx` 可达全部服务。** 没有 per-plugin 的服务视图裁剪（Cordis 的 `inject` 不是权限；`ctx.get()` / `ctx.plugin()` 可达到任意已注册者，且能自行注册新的）。

**(d-3) 可行的中间形态（建议写进 GB 作为"启动期一致性检查"，而非"运行时门控"）**

1. **安装/启动期声明比对（GA-Blocking）**：`dsh.capabilities` 与实际注册的 Service key / 使用的 seam 做静态比对，不一致就**拒绝装载**并给出 diff。这是**真的门控，只是门在装载那一刻**，不是每次调用。
2. **profile 级 allowlist**：profile 的 `cordis.patch.yml` 层可以对白名单外的 bundle 直接 `disabled: true` —— 这是 composition 层的既有能力（今天就能用），把"插件声明的能力集合 ⊆ profile 允许集合"作为一次启动期检查。
3. **`:-#` UI 披露**：把 `dsh.capabilities` 渲染到插件详情页/安装确认弹窗。今天 UI 已有 Adapter hinweise 展示 channel（`ctx.pluginMarket` + `client-ui-plugin-market` + `plugin-detail` 的 `detailNpmFileSources`），加一个字段的边际成本很低。
4. **高风险能力的可选二次确认**：对 `credentials:read-all` / `plugin:install` / `network:ingress` 三项，在 Web UI 通道（`installBundle`）上加一个强制 checkbox。**注意：这只覆盖 UI 通道，CLI 通道仍不受约束** —— 条款措辞必须写清作用域，否则会产生虚假安全承诺。
5. **不应做什么**：不要写"GB 认证插件不得访问网络/凭据"这类承诺性条文。按现状这是不可验证的，会把 GB 变成虚假背书，反而比今天的 `SAFETY.md` 免责更危险。

**(d-4) 一句话答复**

> **分级授权在 DSH 现有机制下可以作为"装载期声明一致性检查 + UI 披露"，不能作为"运行时沙箱门控"。** 若要做到真正的运行时门控，需要先有：① per-plugin 隔离执行单元（Worker/子进程/容器），② 统一的能力代理，并在该代理单元内封锁 `require` 与 `fetch`，③ 出口网络策略层。这三样在当前代码库中**均不存在**，且 `danger-full-access` 作为一个产品级 preset 的存在说明方向也尚未确定。

---

## 5. 给 GB 起草者的三条硬提醒

1. **不要把合规装饰当作控制。** `SAFETY.md` 已经把话说死了：**"No warranty… Use at your own risk."** GB 里任何"安全"措辞都应接一句"在 dsh 当前安全模型下"。
2. **GB 的验证器应该复用 dsh 自己的判断函数，而不是重新实现。** 直接用 `parseInstallSpec()`、`evaluatePluginCompatibility()`、`readProfilePlugins()`、`blockedBuildNames()` —— 这样标准与实现不会漂移。
3. **生态报告点名的"市场收录不等于安全背书"必须在 GB 里落地为具体规则。** 例如：不得把"被 `dsh-market`/`awesome-dsh-plugin` 收录"写成任何等级的合规依据；star 数不得作为 GB/T 或 GB/Z 的评分项（报告 §6.4 已记录外部目录站 star 滞后约 6–8 倍、monorepo 子包继承宿主 star、幽灵条目 404 仍收录三类失真）。

---

## 附录：可复核证据锚点

```sh
# 能力面总表（含 owner/consumer 图）
docs/capability-seams.md

# 插件同进程、"非 containment" 的三处原文
packages/fs/fs-sandbox/src/index.ts:10-18
packages/extensions/cordis-host-runner/src/sandbox.ts:8-11
packages/boot/plugin-manager/src/tools.ts:104-110   # "installed Host code runs outside the workspace sandbox"

# spec 形态与 abs-pfad 约束
packages/boot/plugin-manager/src/install-spec.ts:15-19, 69-92, 94-95

# 依赖树/兼容性/装载前只读 manifest
packages/boot/app-boot/src/plugin-compatibility.ts:87-102
packages/boot/app-boot/src/profile-plugins.ts:69-83
packages/boot/app-boot/src/profile-sanitize.ts:18-34

# 唯一的 OS 级隔离
packages/sandbox/sandbox/src/index.ts:23-39
packages/sandbox/sandbox-local/src/{index,profiles}.ts
docs/subsystems/sandbox.md:11,30

# 审批（真正的包，不在 packages/guard）
packages/interaction/user-approval/src/index.ts
packages/interaction/permission-presets/src/index.ts
packages/sandbox/sandbox/src/escalation.ts:22-31

# 凭据面
packages/credentials/credentials/src/index.ts:153-222      # resolve/listRecords/readRecord/modifyRecord
packages/credentials/credentials-local/src/index.ts:687,703 # 0o700/0o600

# 访问控制（唯一真实入站门控）
packages/api/remote-access/src/index.ts:1-30
packages/api/gateway/src/access.ts

# 供应链
packages/boot/plugin-manager/src/index.ts:112, 328-333, 830-1010
packages/boot/plugin-manager/src/build-approval.ts:21-26, 63-96
packages/boot/plugin-manager/src/install-failure.ts:27
packages/boot/plugin-manager/src/registry.ts:17, 44-52
apps/cli/src/plugin.ts:71-108
docs/cli-help.md:65-80

# 默认挂载清单（base / web-app / sdk-minimal）
packages/bundle/base/cordis.patch.yml        # 97 rows；fs provider = dsh-fs-sandbox
packages/bundle/web-app/cordis.patch.yml     # webServer / remotes / cordis-host-runner / api-* controllers
packages/bundle/sdk-minimal/cordis.patch.yml # terminal + fs-local（唯一 plaintext fs provider 的出现点）
```

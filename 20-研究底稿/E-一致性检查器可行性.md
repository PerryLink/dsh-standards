# E 路｜DSH 插件三级标准 —— 一致性检查器（Conformance Checker）可行性设计

> 研究对象：本地克隆 `deepseek-harness`（宿主本体，`@deepseek-ai/cordis` vendored 于 `vendor/cordis`，版本 `4.0.6-alpha.1`）
> 本路定位：**只回答"三级标准怎么被机器跑起来"**。三级各自的条款内容见 A/B/C 路，本文不重造概念，只在必须处引用。
> 约束：只读研究，未修改仓库任何文件。

---

## 0. 一句话结论

**可行，而且不需要从零写。**仓库里已经存在四类成熟的可复用件：

| 类型 | 代表 | 对检查器的价值 |
|---|---|---|
| 纯函数校验器 | `evaluatePluginCompatibility`、`parseMarketIndex`、`parseInstallSpec` | L0 静态层直接搬 |
| 参数化门禁 | `applicationEntrypointViolations(root)`、`checkPluginRecordCallers(files)`、`packageProblems(manifestPath)` | L0 AST/清单层的实现模板 |
| 子进程冒烟夹具 | `runLoaderSmoke`（loader-smoke） | L3/L4 的执行壳（隔离 cwd、`DSH_HOME`、EOF、deadline、`expectedExitCode`、双流回收） |
| **共享一致性套件** | `runKvBackendContract(label, create)`（`packages/storage/storage/tests/contract.ts`） | **★ 整个检查器的架构先例** |

真正缺的三件事：（1）一个面向"第三方插件包"的编排入口；（2）把 above 的 monorepo 内部约定拔掉的适配层；（3）一把**标准版本 × 宿主版本**的适配矩阵（宿主 Cordis 仍在 alpha，`vendor/cordis-rc11-upgrade-plan.md` 的存在本身就说明 API 在动）。

一个必须先说的事实修正：**`packages/test-support` 并不是"给插件作者用的 SDK"**。它的 group README 明写 "This support-tier library is for test authors, not product integrations."（同句见 `packages/test-support/README.md:12`、`loader-smoke/README.md` 的 Model Experience 段）。它是仓库内部 testing tier 的资产。可复用，但"复用"的形态是**由我们重新打包发布**，不是让第三方直接 `pnpm add` 现有产物——见 §1.2。

---

## 1. 可复用基建盘点（逐个读源码）

### 1.0 判定口径

我对"能否抽出来给第三方跑"使用三条门槛，逐项打分：

- **T1 依赖可安装**：只依赖发布到 registry 的包。`workspace:*` / `workspace:~` 依赖在 pnpm publish 时会被改写为真实 semver，因此**不必然否决**，但若依赖的是一个从不发布的包（如仅 repo 内的 `experimental/*`），则否决。
- **T2 输入外部化**：核心逻辑是否导出为接受 `root` / `files` / `manifest` 参数的（近）纯函数，而不是在 `main()` 里 `resolve(import.meta.dirname, '..')` 自指 repo 根。
- **T3 输出结构化**：返回 `string[]` / 对象 / 抛带 `path` 的错误，而不是 `console.error + process.exit(1)`。

三档结论：**A = 直接可用 / 近直接可用（改 <20 行）**；**B = 剥掉一层 monorepo walker 或 allowlist 后可用**；**C = 绑定内部约定，不可给第三方跑**。

---

### 1.1 总表

| # | 路径 | 角色 | 输入 | 输出 | T1 | T2 | T3 | 档 |
|---|---|---|---|---|---|---|---|---|
| 1 | `packages/util/plugin-market-index/src/index.ts` | 市场索引 format-1 校验 | `(value: unknown, indexUrl: string)` | `MarketIndex` 或抛 `MarketIndexError{path,reason}` | ✅（deps 仅 semver + dsh-package-manifest） | ✅ | ✅ | **A** |
| 2 | `packages/boot/app-boot/src/plugin-compatibility.ts` | dsh 版本兼容判定 | `(manifest, exemptions, runtimeVersion?)` | `PluginCompatibility \| undefined` | ✅（semver only） | ✅ | ✅ | **A** ★ |
| 3 | `packages/boot/plugin-manager/src/install-spec.ts` | install spec 形态解析 | `(raw: string)` | `ParsedInstallSpec` 或抛 `InvalidInstallSpecError` | ✅（仅 node:os/path） | ✅ | ✅ | **A** |
| 4 | `packages/boot/plugin-market/src/parse.ts` | 索引 body 解码 | `(body: Uint8Array, url: string)` | `IndexParseResult`（discriminated union） | ⚠️（依赖 plugin-market-index + 自身 Typert service） | ✅ | ✅ | **A-** |
| 5 | `scripts/verify-application-entrypoints.ts` | 入口/启动器策略 | `applicationEntrypointViolations(root: string)` | `string[]` | ✅ | ✅ | ✅ | **B**（内层 allowlist 全是 repo 路径） |
| 6 | `scripts/verify-plugin-record-callers.ts` | AST 引用检索 | `checkPluginRecordCallers(files: Map<string,string>)` | `PluginRecordCaller[]` | ✅（typescript） | ✅ | ✅ | **B**（被查符号 + 免检前缀是内部的） |
| 7 | `scripts/verify-package-meta.ts` | 清单/资源/图标发布校验 | `packageProblems(manifestPath, parser)`；外层 `packageMetaProblems(root)` | `string[]` | ⚠️（jsdom） | ⚠️（外层 glob `packages/*/*/package.json`） | ✅ | **B**（内层可直接用于单个第三方包） |
| 8 | `packages/test-support/loader-smoke/src/index.ts` | 子进程 Loader 冒烟 | `runLoaderSmoke(options)` → `{stdout,stderr}`，失败 reject | （见下） | ⚠️（peer 有 `dsh-http-proxy` 等） | ✅ | ✅ | **B** ★ |
| 9 | `packages/test-support/agent-loop-testkit/src/index.ts` | 真实服务挂载 | `mountAgentLoopTestDependencies(ctx, options)` | `Promise<void>` | ❌（9 个 `workspace:*` peer） | ❌（吃 ctx） | ⚠️ | **C**（第三方需装近乎整个 host runtime） |
| 10 | `packages/test-support/tool-testkit/src/index.ts` | 工具夹具执行 | `executeToolFixture(ctx, input)` / `executeModelToolFixture(ctx, input)` | `ToolExecutionResult` | ❌（`dsh-tools` 内部 API） | ❌ | ✅ | **C** |
| 11 | `packages/storage/storage/tests/contract.ts` | **共享一致性套件** | `runKvBackendContract(label, create)` | vitest 断言（无返回值） | ❌（`files` 不含 tests） | ✅ | ❌ | **架构先例**（见 §1.7） |
| 12 | `scripts/run-gates.ts` | 门禁编排 | `gatesForMode(mode)` / `runGates(gates, maxActive, execute, observe, options)` | `GateResult[]`，含 `allowFailure` | ✅ | ✅ | ✅ | **B**（数据流模板可抄） |
| 13 | `packages/boot/app-boot/src/profile-plugins.ts` | profile 依赖清单 | `readProfilePlugins({binName, profileDir, installAnchor})` | `ProfilePluginInventory` | ❌ | ⚠️ | ✅ | **C**（强绑 profile 目录 + pnpm layout） |
| 14 | `apps/cli/src/dump-config-schema.ts` | **导入但不 apply** | `runDumpConfigSchema(profile, patches, ...)` | stdout JSON Schema + `x-cordis.diagnostics` | ❌（需整个 profile） | ❌ | ⚠️ | **概念 A / 实体 C**（★ 通道原型） |
| 15 | `packages/boot/hmr/src/index.ts` | 热重载 | — | 判定协议（见 §1.9） | ❌ | ❌ | ⚠️ | **概念 A / 实体 C** |

---

### 1.2 `packages/test-support` 逐包（重点）

该 group 下 8 个子包：`session-snapshot` / `agent-loop-testkit` / `tool-testkit` / `client-runtime` / `remote-mock` / `loader-smoke` / `llm-mock-server` / `llm-replay`（清单见 `packages/test-support/README.md:24-34`）。

**① `loader-smoke` —— 最有价值的一件（档 B）**

`packages/test-support/loader-smoke/src/index.ts`：

- `runLoaderSmoke(options): Promise<LoaderSmokeResult>`：在隔离临时 cwd 里以真实 bin + 真实 `cordis.yml` 起进程，注入隔离 `DSH_HOME` / `DSH_AGENTS_HOME`，`input: ''` 立刻关闭 stdin，`reject: false` 把 spawn 失败 / deadline / 非零退出折成独立字段，**forced `killSignal: 'SIGKILL'`**，捕获双流，**只删除自己创建的 cwd**（caller 提供的 cwd 保留，便于串多个冒烟共享"世界"）。
- `expectedExitCode`（默认 0）：**显式钉住一个设计的失败面**——"a run that exits any other way, including succeeding, still fails the smoke"。这个语义对我们极其重要：一致性检查里"意外成功"必须算失败。
- `resolveExampleLaunch` 的 `src`/`lib` 双模：`src` 走 tsx + `TSX_TSCONFIG_PATH` 的 paths map；`lib` 走**plain Node + 真实 package `exports`**，即"安装后的消费者路径"。**这正是检查器应有的双模**：dev 时零构建快检，CI/收录时用 `lib` 模式，否则 `--exports` 写错的包根本测不出来（仓库自己在 `builtBinSmokeGate()` 里就是这么干的，`run-gates.ts:900-930`）。
- 已知限制（README 明写）：built 模式需先 `pnpm run build` 且宿主 manifest 必须声明配置里命到的每个包；stdout/stderr 受 execa 默认 100MB `maxBuffer` 约束；deadline 只杀直接子进程，**fixture 自己起的进程树会活过冒烟，需外部清理**。→ 这三条必须原样继承进 L4 的设计约束。

**② `agent-loop-testkit`（档 C）**

`mountAgentLoopTestDependencies(ctx, options)`（`src/index.ts:74-90`）顺序挂载 `LlmRuntime → SessionStore → SessionProjectionRegistry → SystemPrompt → (FsLocal) → (WorkingDirectory) → ToolRuntime → Native|PtcToolExecutor → AgentRegistry`；`mountAgentLoopTestHarness` 再挂 `AgentLoop` 并给出 `create/claim` 驱动器。**刻意不挂 AgentLoop**，把装载顺序留给调用方。第三方可用性差：9 个 `workspace:*` peer 等于要求对方装整套 host。→ 只能作为"我们自己的实现参考"，不能作为发布件。

**③ `tool-testkit`（档 C）**

`executeToolFixture(ctx, input)` 走 `ToolExecutionPipeline` 的 `prepare → dispatch → complete` 三段；`executeModelToolFixture` 绕过 Root Session 日志直接 `ctx.tools.execute({calls:[...]})`。**这是 L4「触发一次工具调用」的最直接原型**，但它依赖 `@deepseek-ai/dsh-tools/pipeline` 这个非发布内部的深路径。

**④ 其余**：`llm-mock-server`（可脚本化的 OpenAI 兼容故障服务器，有独立 `bin`/`cli`）、`llm-replay`（录制流回放，keyless 测试的地基）、`session-snapshot`（session-log 快照 + 协议适配器）、`remote-mock` / `client-runtime`（jsdom 客户端槽位）。→ 对检查器只有间接价值：**L4 若要干跑一轮 agent loop，需要 `llm-mock-server`/`llm-replay` 提供无需密钥的模型端**；这两件的依赖比 agent-loop-testkit 干净，值得优先重打包。

---

### 1.3 `packages/boot/plugin-market` 与 `plugin-market-index`

**市场索引如何被解析/校验（三层，层层都可拦）：**

1. `packages/boot/plugin-market/src/parse.ts:21` `parseIndexBody(body, url)`：严格 UTF-8（`TextDecoder(fatal:true)`）→ JSON.parse → `parseMarketIndex`。任何一层失败返回 `{ok:false, path, reason, message}`，`$` 覆盖 UTF-8/JSON 错误。
2. `packages/util/plugin-market-index/src/index.ts:299` `parseMarketIndex(value, indexUrl)`：**纯函数，零 I/O**，只对 `(value, indexUrl)` 求值，违规则抛 `MarketIndexError(path, reason)`。已覆盖的硬约束（逐条可成为 L0 规则）：
   - `$.format === 1`；`$.plugins` 非空数组；插件名符合 npm 包名正则且 ≤214；**同名去重**；
   - version 必须是**精确 SemVer**（自带正则），**降序排列**，不得重复；`publishTimestamp` 必须是 `[0, 1e11)` 的整数 Unix 秒；
   - `engines.dsh` 必须是合法 SemVer range **且不得是 `workspace:` range**（这条直接对应 A 路的 P0-3）；
   - `source.type` ∈ {npm, git}；git 必须 `https:` + 规范 URL + 40 位小写 hex commit + 至少两段路径 + 不得指向 tarball；
   - icon 是 `data:` 时必须 base64 且 ≤32 KiB，否则必须解析到 https 或同 origin；所有 URL **不得含凭据、query、fragment**；
   - `metadata` 里的 category/label/sortKey **必须引用已声明 id**（`declaredId`），label 不得重复，sortKey 值必须是有限数。
3. `packages/boot/plugin-market/src/parse-thread.ts`（`parseIndexInWorker`）：把上面整段丢进 Worker（Host/浏览器两侧都能跑），带 `lifetime.signal`。

→ **结论：`@deepseek-ai/dsh-plugin-market-index` 是本仓库唯一真正"零内部依赖、纯函数、抛结构化错误"的校验库（档 A），必须作为检查器 L0 的第一批依赖。它同时也是 A 路"索引 VR"条款的现成实现。**

顺带：`marketInstallTarget(name, version)` 已经把"一个精确版本 → 可安装 spec"的构造逻辑写死了（npm = `name@version`；git = `git+https://…#<commit>` + `&path:/…`），L4 沙箱要装指定版本时直接用它，别自己拼。

---

### 1.4 `packages/boot/app-boot`（`plugin-compatibility` / `profile-plugins` / `compatibility-preflight`）

**① `plugin-compatibility.ts`（档 A ★ —— 版本矩阵的地基，全文 117 行，我只摘关键行为）**

`evaluatePluginCompatibility(manifest, exemptions = {}, runtimeVersion = getDshRuntimeVersion())`：

- **纯函数**，不吃文件系统（默认版本的读取在 `getDshRuntimeVersion()`，但那是可覆盖的默认值）。
- 判定顺序：有 own `engines.dsh` → **它单独决定**，忽略 peerDependencies；否则**每一个** `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer 都必须满足。
- Prerelease 参与范围匹配（`semver.satisfies(..., {includePrerelease: true})`）——对 alpha 阶段的 dsh 很关键。
- peer range 为 `workspace:^|~|*` 时**视为等于当前 runtime**；`engines.dsh` 为 `workspace:*` 则**视为不满足**。
- 返回 `{name, version, runtimeVersion, requirements, exempted}`；`exempted` 来自 `name@version → [runtimeVersion]` 的**精确版本豁免表**（对应 `dsh plugin allow-version`）。

→ **这就是 §5.2 版本矩阵的现成内核**：`runtimeVersion` 是参数的，意味着**我们可以在不安装某个宿主的前提下**，对一个 manifest 求出"它对 N 个宿主版本分别是兼容/不兼容"。checker 的 `--host-matrix` 应该直接调它 N 次。注意豁免机制（`--accept-risk`）—— checker 必须把 `exempted === true` 当作**不合规信号**，而不是放行。

**② `profile-plugins.ts`（档 C）** `readProfilePlugins({binName, profileDir, installAnchor})` 读 profile 的 `dependencies` + `dsh.profile.bundles`，逐依赖探测 `{name, version, bundle, enabled}`；`optionalManifest` 用 try/catch 让"装了但元数据不可读"的依赖**仍可见以便修复/移除**。这套"不可读不等于不存在"的韧性值得抄进 checker，但它的输入（profile 目录、pnpm layout、`INSTALL_ANCHOR`）全绑宿主安装形态，**不可给第三方跑**。

**③ `compatibility-preflight.ts`** 展示了"**不碰 Loader instrumentation**"的清单检查：用 `ctx.get('pluginPackages')?.packageOf(specifier, parentURL)` 找包，找不到就退化到 `createRequire(parentURL).resolve.paths(bare)` 的 Node 原生查找；对相对/绝对/文件 URL 则向上走目录找 `package.json`。这套"多形态 specifier → manifest 路径"的解析链，checker 必须几乎照抄（因为第三方的入口可能是 `#resource`、`cordis:*`、相对路径、bare 包名中的任何一种）。注意它有一个显式兜底原则：**"A row this profile cannot resolve is the Loader's import failure to report, not a compatibility decision."** → 翻译成 checker 语义：**解析不出 = `inapplicable` + 记一笔，绝不算通过。**

---

### 1.5 `apps/cli/src/dump-config-schema.ts`（★ L0.5 通道原型）

文件头一段注释价值极高：

> "Schema-dump entry: **inspect the composed profile without applying its plugins**. **Imports and lazy schema builders execute trusted module code.**" / "Plugin imports may execute top-level code, but **collection never applies plugins or evaluates `!!js`**."

它还会把 period 的 stdout 临时重定向到 stderr（`"Trusted module diagnostics must not precede the JSON document on stdout."`），最后输出 `{..., 'x-cordis': {diagnostics, complete}}`，`complete === false` 时 `process.exitCode = 1`。

→ **这定义了介于"纯静态"与"完整装载"之间的第三个通道，我把它命名为 L0.5「导入不 apply」**：
- 能拿到：插件真实导出的 `Config`（Standard Schema）、由此投影出的 JSON Schema、lazy schema builder 的产物。
- **不能假装**：模块顶层代码已经执行了。因此 L0.5 **不是**"不执行代码"的通道，它的安全等级等于 L1，只是不触发 `apply`。**这一点必须写进标准正文，否则会被误当成"可安全地对不可信包执行"的通道。**

---

### 1.6 `scripts/` 下的 `verify-*` 与 Sidecar `*.spec.ts`

- 规模：约 40+ 个 `verify-*` 叶子脚本，绝大多数带同名 `.spec.ts`，由 `run-gates.ts` 的 `doc-sync` / `hygiene` / `check-all` 三个聚合调用。
- **工程范式高度一致，正是可复用性的判别式**：`export function xxxViolations(root: string): string[]`（或 `checkXxx(files: Map<string,string>)`）+ 末尾 `if (import.meta.filename === resolve(process.argv[1] ?? '')) main()`。即**"把 repo 根/文件语料作为参数注入，规则本身与仓库布局解耦"**。
  - ✅ 可复用代表：`verify-application-entrypoints.ts:181`（`root` 参数化 + 三条互不耦合的检查函数）、`verify-plugin-record-callers.ts:160`（`files: ReadonlyMap<string,string>` 注入语料）。
  - ❌ 不可复用代表：`verify-package-meta.ts:266` 的 `packageMetaProblems` 硬 glob `packages/*/*/package.json`（**但它的内层 `packageProblems(manifestPath, parser)` 完全可用于任意单个包**，正是我们要给第三方跑的粒度）；`verify-plugin-record-callers.ts:182` 的 `checkDeclaredPluginRecordWrites(repoRoot, ...)` 依赖 repo 的 tsconfig Host/Client face。
- **`verify-plugin-record-callers.ts` 的 AST 手法是本路最值得抄的一段**（`findPluginRecordReferences` + `unescaped`）：它显式对抗"绕过文本扫描"的写法——`\u0061` / `\x61` / `\u{61}` / `\141` 转义、行连续符、模板字面量、命名空间成员、解构别名、同名字面量字符串全部计入，注释不计。注释里还明写了一个**自失效保险**：

  > `checkPluginRecordCallers` 里如果 owning file 不再导出被查函数，就 `throw new Error('... no longer exports ... update this gate with the move or rename.')`；语料里若缺少 experimental 或 release 包源码，也抛错——**"because the gate would then pass by checking the wrong files"**。

  → **这一条应当被提升为一致性检查器的强制元规则（meta-rule）：任何一条检查必须在"它依赖的前提消失"时 fail loud，而不是静默通过。** 这是防止整个检查器随宿主演进而悄悄失效的最重要机制，详见 §5.1。

- **`scripts/cordis-*.spec.ts` 是本路的"操作手册"**（这些不是产品测试，而是 Cordis 行为契约的规格+acterisation test）：

| 文件 | 提供了哪个检查层的行为契约 |
|---|---|
| `cordis-core-lifecycle.spec.ts`（188 行） | **L3 重挂层**：并发 `update` 的合并语义（`applied === [0,1,3]`、`disposed === [0,1]`）、被取代激活失败后的清理、`dispose`/`restart` 时 isolated provider 的依赖态存活顺序（`['consumer','provider']`）、`internal/update` 的 stale publish 抑制、`restart` 后 config identity 保持 |
| `cordis-config-access.spec.ts`（92 行） | **L1/L3 配置层**：`fiber.rawConfig` 与 `fiber.effectiveConfig` 的 identity 稳定性、`resolveConfig` 的失败路径（`ValidationError`）、registry wrapper 上 `target === fiber` 的规范 fiber 判定 |
| `cordis-loader-resolve.spec.ts`（104 行） | L4：**Footer Loader 在临时工程里的 import/subpath/self-reference 解析**，含 `.cordis/resolve.mjs` 落地位置断言 |
| `cordis-core-api.spec.ts` / `cordis-timer.spec.ts` / `cordis-yaml.ts` / `cordis-walk.ts` | 辅助，非直接用途 |

  注意 `cordis-core-lifecycle.spec.ts` 抬头写着 "**Cordis rc.11 updates**"——证明这些规格**就是跟着 Cordis 版本走的**。这直接支持 §5.2 的"检查项必须带宿主版本适用范围"。

---

### 1.7 ★ 埋在 `tests/` 里的**共享一致性套件**先例（架构蓝本）

`packages/storage/storage/tests/contract.ts`（257 行）：

```ts
/** One conformance run: a fresh backend plus a way to reopen the same medium (crash simulation). */
export interface KvBackendContractHarness {
  backend: StorageBackend
  reopen(): Promise<StorageBackend>
}
export function runKvBackendContract(label: string, create: () => Promise<KvBackendContractHarness>) {
  describe(`kv backend contract: ${label}`, () => { /* 逐条断言 src/backend.ts 的每一条款 */ })
}
```

被 `packages/storage/storage-json/tests/json-backend.spec.ts:7` 与 `packages/storage/storage-sqlite/tests/sqlite-backend.spec.ts:9` 以相对路径 `../../storage/tests/contract.ts` 引入，各自传入自己 medium 的工厂。第二处同样形态：`packages/session/session-persistence/tests/contract.ts`（被 jsonl/zstd spec 引用）。

**这就是检查器应有的形状**：`runXxxContract(label, harnessFactory)`——标准条款实现一次，由**被测方提供被测对象的构造方式**。放到插件场景就是：

```ts
runPluginConformance(label, { mount, reimport, emit })   // 作者提供的装载/重导/冒烟钩子
```

**唯一障碍**：查看 `packages/storage/storage/package.json` 的 `files` 只有 `locale/*.json` + `lib/**`，`tests/contract.ts` **没有发布**。→ 若要对外提供一致性套件，**必须新增 subpath export**（如 `"./conformance": "./tests/contract.ts"`）或将套件迁到一个专门发布的包里。这是本路的一个具体、可执行的落地动作。

---

### 1.8 `run-gates.ts` 编排器（档 B —— 抄它的**数据流**，别抄它的调度）

- 状态机：`Gate {id,label,displayCommand,command,args,needs?,after?,env?,quick?,allowFailure?,streamOutput?}` + `GateResult {gate,status:'passed'|'failed'|'skipped',durationMs,output:GateOutputChunk[],exitCode,signalCode,error?,aborted?}`。
- `gatesForMode(mode)` 支持 19 个聚合（`ci-primary` / `check-all` / `hygiene` / `doc-sync` / `node-compat` …），由根 `package.json` 的 `check:*` 脚本调用。
- `validateGateGraph` 先验：重复 id、未知依赖、依赖成环（`findDependencyCycle`）。
- **一条必须照抄的判据**（`run-gates.ts:1392`）：`status = exitCode===0 && signalCode===null && spawnError===undefined ? 'passed' : 'failed'`——**三者都要满足**。以及 `aborted` 门(K): 被 abort 的 gate **即使子进程捕获信号后退出 0 也不能记为 passed**（"must not be reported as passed, even if the child trapped the signal and exited zero"）。
- `allowFailure` = 非阻断诊断通道（ADVISORY  [$][L] 的直接类比）。
- 进程树治理（逐 platform 的 `taskkill /T /F`、`process.kill(-pid)`、descendant 采样、zombie 排除、`pipeDrain` 10s 强杀stream）——**L4 子进程冒烟必须复用这套治理**，否则第三方 fixture 起的子进程会挂死 CI。

→ 我们要抄的是：`Gate/GateResult` 的数据形状、`allowFailure`、`aborted` 语义、先验式图校验。**不必抄**它的并发调度（第三方单包检查是顺序的、秒级的）。

---

### 1.9 `packages/boot/hmr`（1133 行）——"重载成功"是怎么判定的

`hg` `hmr/index.ts` 的 `reload` 循环（`~L674-745`）给出了一套**可逐条映射为一致性检查项的重载协议**：

```
1. 快照：runtime.fibers → [{fiber, entry, config: entry.options.config ?? fiber.rawConfig, moduleNamespace}]
2. evict all versioned ESM/CJS caches for accepted urls      ← 对应我们的"必须先能重现冷空气装载"
3. for each generation: loader.import(filename) → loader.unwrapExports(moduleNamespace) → importRemaining(...)
   —— 任一失败：handleError + rollback() + rethrow
4. registry.delete(plugin) ；await Promise.all(fibers.map(f => f.await()))
   —— 失败：logger.warn('failed to dispose plugin at %C', path)  ← "卸载必须以 await 收敛为准"，不是回调就算完
5. reload：parent.registry.plugin(implementation, previousFiber.config, getOuterStack)
   + 维护 identity（entry.fiber = wrapper，注释："identity checks compare .ctx.fiber"）
   + await Promise.all(activated.map(fiber => fiber.await()))    ← 重挂以 await 判定成功
   —— 失败：logger.warn('failed to reload plugin at %C') + rethrow → 触发 rollback 后再 reload 旧插件恢复
6. await loader.await()；replacements.updateEntries(loader)
7. emit('hmr/reload', reloads)；files.refresh(accepted)；stashed.clear()
```

另有 `reconcileProfile`（`~L930`）：`const running = [...ctx.loader.entries()].filter(entry => entry.fiber?.state === FiberState.ACTIVE)`，再由 `recomposeProfile(..., {requiredIds, running})` **判定激活失败**；"Entries this recomposition stops start again, and fail it when they cannot."

→ **可提炼为 L3 的判定表达式**（这是本路的硬结论之一）：

> **重挂成功 := `await newFiber` 不抛 ∧ `newFiber.state === ACTIVE` ∧ `getEffects()` 标签多重集 == 首次装载 ∧ 父 Context 的 `reflect.store` 键集 == 首次装载 ∧ `registry.size` 一致。**

并继承两条行为要求：**（a）卸载必须 `await`，不能只调 dispose 就走；（b）失败必须 rollback 到旧实现并再次 await，把"降级到旧代码"作为已知态而不是崩溃。**

---

### 1.10 Cordis 观测 API 仪器表（checker 的"万用表"）

全部来自 `vendor/cordis/src/*.ts`，我已逐个确认其存在与语义：

| API | 位置 | 用于 |
|---|---|---|
| `FiberState` (`PENDING,LOADING,ACTIVE,FAILED,DISPOSED,UNLOADING`) | `fiber.ts:147` **`const enum`** | L1/L3 状态断言（⚠ 见 §5.1） |
| `fiber.getEffects(): EffectMeta[]` | `fiber.ts:574` | L2 卸载基线、L3 幂等差异；标签形如 `ctx.on("evt")` / `ctx.provide("svc")` |
| `EffectMeta {label, children}` | `fiber.ts:~100` | 嵌套 effect 的结构化比较（**比单纯计数强得多**） |
| `fiber.state` / `fiber._getState()`（私有） | `fiber.ts:192/580` | `uid===null→DISPOSED`、`_error→FAILED`、否则 ACTIVE/PENDING |
| `fiber.await(): Promise<this>` | `fiber.ts:~765` | **聚合所有 inertia 后 settle，并 rethrow `_error`** ← L1/L3 的标准"等装载/等卸载"手段 |
| `fiber.dispose / restart / update(config, noSave)` | `fiber.ts:194/~780/~790` | L2 / L3 / L3-配置 |
| `fiber.rawConfig / effectiveConfig / resolveConfig(cfg)` | `fiber.ts:190/…` | 配置 identity 检查（含 `ValidationError`） |
| `ctx.registry.values(): Iterable<Plugin.Runtime>` | `registry.ts:275` | **遍历所有 fiber**：`for (const rt of ctx.registry.values()) for (const f of rt.fibers)` |
| `ctx.registry.size` / `keys()` / `entries()` / `get(plugin)` / `delete(plugin)` | `registry.ts:212-267` | 装载前后差分基线 |
| `ctx.reflect.store: Dict<Impl, symbol>` | `reflect.ts:222` | **服务注册表基线**（L2"服务是否注销"的唯一可靠来源） |
| `ctx.reflect._getImpl(name, strict)` | `reflect.ts:251` | 判定某服务名当前是否可解（区分遗留仍在 vs 已注销） |
| internal 事件：`internal/status`、`internal/service`、`internal/listener`、`internal/dispatch`、`internal/config`、`internal/update`、`internal/commit`、`internal/plugin` | `events.ts:337-370` | **旁路观测**：不修改被测插件即可记录"谁注册了什么/发了什么"（注意 `internal/dispatch` 只对非 `internal/` 名字触发） |
| `Context.is(value)` | `context.ts:56`（global Symbol brand，跨 realm/多份 cordis 安全） | 判定"导出的东西是不是一个 Context"（防多副本） |
| `ValidationError`（aggregated issues + path） | `fiber.ts:20` | 配置不符合 `Config` 的结构化错误 |
| `ctx.plugin(...)` 返回 `Fiber & PromiseLike<Fiber>` | `registry.ts:185` | **`await ctx.plugin(entry)` 就是"装载并等 ACTIVE"** |

额外：`packages/extensions/tool-cordis`（README "Read-only runtime API discovery"）已提供 **`cordisInspect` provider + `cordis_inspect_list` / `cordis_inspect_query` 工具**，其 Config provider 已经会给每个 Loader entry 输出一个 status（`schema` / `absent` / `unsupported` / `tree` / `inactive`）——**这是一份现成的"每条目格式化状态"，可以直接作为 L0/L1 的输入信号之一**，不必自己重新发明状态机。

---

### 1.11 仓库测试运行方式（第三方不必复制）

- 根 scripts：`test = pnpm run build:native-system && vitest run`（依赖 `vitest.config.ts`）；`typecheck`（`--scope typecheck`）、`lint`（oxlint）、`duplication`（jscpd）、`check:all = tsx scripts/run-gates.ts check-all`、`check:ci = … ci-primary` 等；另有 `vitest.e2e.config.ts`（built-bin 冒烟）、`vitest.snapshot.config.ts`（`DSH_EXAMPLE_MODE=lib`）、`vitest.expected.config.ts`、`vitest.web.*`。
- `Makefile` 只是 `build/clean/web/desktop/dev-*` 的短名包装，**显式声明 "The package.json scripts they call stay the source of truth"**。
- 环境开关：`DSH_EXAMPLE_MODE=src|lib`、`DSH_GATE_CONCURRENCY`、`DSH_GATE_FAIL_FAST`、`DSH_GATE_VERBOSE`、`DSH_COVERAGE_*`、`DSH_REQUIRE_BUILT_CLI_SMOKE`。

→ **第三方 CI 不应也不需要复现这套矩阵**。他们要跑的只有 `dsh-plugin-verify` 一条命令。这套矩阵的意义是告诉我们：**"`lib` 模式 + built artifacts + `--expectedExitCode`"才是收录侧该用的那一档**（证据：`snapshotGate()/expectedOutputGate()/builtBinSmokeGate()` 全都设 `DSH_EXAMPLE_MODE: 'lib'`）。

---

## 2. 检查器分层草案（怎么跑）

### 2.0 分工原则

- **A/B/C 路负责"标准说什么"，本路负责"怎么跑"。** 本文不新增"插件必须 X"的条款，只把已有/将要有的条款分配到可执行的层。
- 三层标准 → 五层执行的映射不是一对一的，而是**正交的两个轴**：`tier ∈ {强制, 推荐, 指导}` 决定**失败后果**（exit 1 / warn / info），`layer ∈ {L0…L4}` 决定**执行成本与所需权限**。同一条条款若能在便宜层 mechanical 判定，就别放进贵层。
- **每一层的输出都必须是"找到（evidence）/ 没找到 / 不适用（inapplicable）"三态**，不许把"不适用"当"通过"（继承 `compatibility-preflight.ts` 的原则）。

层序与单调性：**越靠前的层越便宜、越不能执行代码；越靠后的层越贵、信号越强但在不可信对象面前越危险。** 后面的层以前面的层为前提：L0 不过就不必跑 L1。

---

### 2.1 L0 · 静态层（不执行任何插件代码）

**手段**：读 `package.json` / 索引条目 / 源码文本 + `ts.createSourceFile` 做 AST 遍历。不 `import`。

| 项 | 实现手段（现成资产） | 成本 | 误报 | 信号 |
|---|---|---|---|---|
| L0-1 清单必填字段与形态 | 自写 JSON Schema + 复用 `packageProblems()` 的 `targetsOf/published/` 解析辅助 | 低 | 极低 | 高 |
| L0-2 `engines.dsh` / `dsh-*` peer 兼容性 | **`evaluatePluginCompatibility(manifest, {}, runtimeVersion)`**（可传任意 host 版本 → 矩阵） | 低 | 低 | 高 |
| L0-3 入口可解析性（`exports["."]` targets 指向真实存在的文件） | `packageProblems` 的 substitution/target 匹配；node 的 `import.meta.resolve` 只读探针 | 低 | 低 | 高 |
| L0-4 install spec 合法性（安装串是否能被 pnpm 接受） | **`parseInstallSpec(raw)`** | 低 | 低 | 中 |
| L0-5 市场索引条目合法性 | **`parseMarketIndex(value, indexUrl)`**（含 git commit / SemVer 精确性 / 图标 / 凭据 URL 等） | 低 | 低 | 对索引高；对插件本体中 |
| L0-6 元数据完整性（`en.json` 基线、icon 资源、`files` 是否包含被 published 的资源） | `packageProblems(manifestPath, parser)` | 中 | 低 | 中 |
| L0-7 危险 AST 形状（module-scope `setInterval`/`process.on`/`fs.watch` 且无对应 effect 包装、顶层 await、模块级可变单例） | 抄 `verify-plugin-record-callers.ts` 的 `unescaped()` + `ts.createSourceFile`  visit 手法；顶层 await 直接抄 `verify-no-top-level-await` | 中 | **中偏高** | 中 |
| L0-8 供应链静态面（有无 `postinstall`、依赖 license 集合、是否含可疑 install 脚本） | 自写（与 C 路条款咬合，此处只出 evidence，不做价值判断） | 中 | 中 | 中偏高 |

**L0 的定位：唯一的"不可信也能跑"的层。** 全部 distrust 输入都从这里进。

---

### 2.2 L0.5 · 导入但不 apply（半执行通道）

**手段**：`import(entry)` 取导出，**不调用 `ctx.plugin()`**。拿到 `Config`（Standard Schema）、`inject`、`name`、导出的 shape。

- 原型：`apps/cli/src/dump-config-schema.ts` + `fiber.resolveConfig(runtime, cfg)`（`ValidationError` 带 path）。
- **执行的 код**：模块顶层 statements 会跑。**不可用于对不可信包。** 这点必须写进 toolbar UI 与文档。
- 可判：`Config` 是否存在且能接受空配置对象；`inject` 声明的服务名集合；导出是否为 `Context` 接受的形状（function / class / `{apply}`）；是否有 top-level throw / 副作用。
- 成本 低 · 误报 低 · 信号 中。
- **`ctx.reflect.bind` / `Context.is` 可用于在这一层做多副本 cordis 检测**（README 明写 brand 是 global symbol，跨 realm 有效）——两个不同 cordis 副本会导致后续 L1 全线误判，必须在 L0.5 拦掉。

---

### 2.3 L1 · 装载层（受控 Context 里真的跑一次）

标准装载序列（↦ 直接来自 `cordis-*.spec.ts` 的既有写法）：

```ts
const ctx = new Context()
// 0) 基线快照
const before = snapshot(ctx)            // registry.size / reflect.store keys / by-events hooks / handle counts
// 1) 装载
const fiber = await ctx.plugin(entry, config)   // Fiber & PromiseLike<Fiber>：await 即等 ACTIVE
assert(fiber.state === FiberState.ACTIVE)       // ⚠ const enum，见 §5.1
await fiber.await()                             // 双重保险：await 会 rethrow fiber._error
// 2) 装载后快照
const after = snapshot(ctx)
// 3) 差分既是 L1 的证据，也是 L2 的基线（before 必须是 checker 自己取的，不许作者提供）
```

| 项 | 手段 | 成本 | 误报 | 信号 |
|---|---|---|---|---|
| L1-1 能装载且到 ACTIVE | `await ctx.plugin(entry)` + `state`/`await()` | 低 | 低 | **高** |
| L1-2 未抛错但静默停在 PENDING（`inject` 声明的依赖未提供） | 装载后 `state === PENDING` 却无 rejection → 报 warn | 低 | 中 | 中 |
| L1-3 提供了服务 | `after.reflectKeys − before.reflectKeys` 非空（对照声明的 capability） | 低 | 低 | **高** |
| L1-4 effect 拓扑登记 | `fiber.getEffects()` 的 label+children 树 | 低 | 低 | 高 |
| L1-5 **声明 vs 实测交叉校验** | L0/L0.5 静态读到的"`inject` 的服务名 / 声明的工具 / 声明的事件"必须在 L1 观测到的 effect 标签与 `reflect.store` 里出现 | 中 | 低 | **高（反造假核心，见 §5.3）** |
| L1-6 配置 schema 真实有效 | `fiber.resolveConfig({})` 与 `resolveConfig(默认样例)`；捕获 `ValidationError` | 低 | 低 | 中偏高 |

**L1 的 Ω limit**：它证明"能装载"，不证明"有用"，也不证明"卸载干净"。

---

### 2.4 L2 · 卸载层（dispose 后比对基线）

```ts
const base = snapshot(ctx)                  // 插件存在时的形态
await fiber.dispose()                       // 必须 await（hmr 的做法：await Promise.all(fibers.map(f=>f.await()))）
await ctx.root.fiber.await?.() ?? idle()
assert(fiber.getEffects().length === 0)     // primary evidence
assert(Reflect.ownKeys(ctx.reflect.store) deepEquals before.reflectKeys)   // 服务是否真的注销
assert(ctx.registry.size === before.registrySize)                          // 没有残留 plugin runtime
assert(snapshot(ctx) deepEquals before)     // 统一回归测试：整体等于装载前基线
```

| 项 | 手段 | 成本 | 误报 | 信号 |
|---|---|---|---|---|
| L2-1 `getEffects()` 归零 | `fiber.getEffects()` | 低 | 低 | **高** |
| L2-2 服务注销 | `ctx.reflect.store` 键集 + `_getImpl(name,false)` 逐个确认 | 中 | **中**（隔离 scope / 同名服务被别的插件占据会产生噪声） | **高** |
| L2-3 事件监听清零 | `fiber._hooks` 空集；**fallback**：`internal/listener` 旁路计数，或用 `ctx._hooks` 的挂号数差分 | 中 | 中 | 高（但 `_hooks` 是下划线私有面，必须包在适配层里，见 §5.1） |
| L2-4 fiber 离开 registry | `registry.size` 回到基线且 `runtime.fibers` 不含该 fiber | 低 | 低 | 高 |
| L2-5 句柄/计时器泄漏 | Node `process.getActiveResourcesInfo()` 前后差；可选 `--experimental-test-snapshots` 或 `vi.useFakeTimers` | 高 | **高**（宿主自身与其它包会贡献噪声） | 中 → **建议仅作为 ADVISORY 且默认关闭** |
| L2-6 子进程/线程清理 | 复用 `run-gates.ts` 的 descendant 采样 + tree kill 手法 | 高 | 高 | 中偏高 → 建议仅在沙箱 L4 里做 |

**L2 是本设计性价比最高的一层**：成本集中在一次性实现的 `snapshot()`，之后每个插件只要几毫秒。建议 **L2-1..L2-4 全部进"强制"层**。

---

### 2.5 L3 · 重挂层（restart 幂等 / 冷重挂）

| 项 | 手段 | 成本 | 误报 | 信号 |
|---|---|---|---|---|
| L3-1 `restart()` 幂等（同一 Context） | `await fiber.restart()`；`getEffects()` 标签树**深比较**（label + children 结构）与首装相同 | 低 | 低 | **高** |
| L3-2 `update(cfg)` 多次后收敛 | 抄 `cordis-core-lifecycle.spec.ts` 的发号 indeed `[0,1,3]` 语义；断言 `effectiveConfig` 收敛于最后一次有效 update | 中 | 中 | 中 |
| L3-3 **完全重挂**（registry.delete → 重新 `ctx.plugin`） | 断言"第二轮 after 快照 == 第一轮 after 快照" | 中 | 低 | **高**（打到"状态残留在闭包"） |
| L3-4 **跨 Context 重挂** | 换一个新 `new Context()` 再装一次，比较两轮快照 → 打到"模块级/全局变量状态残留" | 中偏高（若要求真正干净，必须**换进程**，否则 ESM 缓存不重置；可借鉴 hmr 的 `evict` 或 `loader-smoke` 的 `lib` 模式子进程） | 中 | **高**（唯一能打到 ESM 单例污染的项） |
| L3-5 卸载后再重挂仍然 ACTIVE（冷启动可重复性） | dispose → plugin → await → state | 低 | 低 | 高 |

**建议**：L3-1 / L3-3 / L3-5 进"强制"；L3-2 进"推荐"（它的语义仍在随 Cordis rc 变动）；L3-4 进"推荐"，且**只在 L4 沙箱通道里以换进程方式提供**（同进程版本的 L3-4 只能算"推荐-弱"）。

---

### 2.6 L4 · 冒烟层（可选，按插件能力分级启用）

**前提：仅在已通过 L0–L3 之后，且在可执行沙箱内运行。** 不可信对象不应在本地 `__dirname` 里直跑 L4。

| 项 | 手段 | 成本 | 误报 | 信号 |
|---|---|---|---|---|
| L4-1 一次工具注册 + 一次工具调用 | 抄 `tool-testkit.executeToolFixture / executeModelToolFixture` 的 `prepare→dispatch→complete` 流水 | 中 | 中 | 高（对 tools 类插件） |
| L4-2 一次自声明事件往返 | `ctx.emit(declaredEvent, fixturePayload)` 后断言监听器被调用且 vos effects 未增长 | 低 | 低 | 中 |
| L4-3 真实 Loader 子进程启动 + 干净退出 | **`runLoaderSmoke`**：隔离 cwd、`DSH_HOME`、`input:''` 关 stdin、`expectedExitCode`、**双模 `src`/`lib`**（收录侧一律 `lib`） | **高** | 中（依赖整棵 profile 的可装载性） | **高** |
| L4-4 一轮 keyless agent turn | `agent-loop-testkit` + `llm-mock-server`/`llm-replay` | 高 | 高 | 中（仅当插件是 provider/agent 类才有意义） |

**L4 的 degradation**：若插件在 manifest 里声明了 `capabilities`，则只启用对应子项；未声明任何 capability → L4 整体 `inapplicable`。

---

### 2.7 成本 / 误报 / 信号总矩阵

| 层/项 | 成本 | 误报率 | 信号强度 | 建议 tier |
|---|---|---|---|---|
| L0-1 清单字段 | 低 | 极低 | 高 | 强制 |
| L0-2 版本兼容矩阵 | 低 | 低 | 高 | 强制 |
| L0-3 入口可解析 | 低 | 低 | 高 | 强制 |
| L0-4 install spec | 低 | 低 | 中 | 推荐 |
| L0-5 索引条目 | 低 | 低 | 高(索引)/中(插件) | 强制（对索引维护者） |
| L0-6 元数据完整性 | 中 | 低 | 中 | 推荐 |
| L0-7 危险 AST 形状 | 中 | **中高** | 中 | 指导 / 仅 advisory |
| L0-8 供应链静态面 | 中 | 中 | 中偏高 | 推荐（与 C 路咬合） |
| L0.5 Config/inject 提取 | 低 | 低 | 中 | 推荐 |
| L1-1 装载到 ACTIVE | 低 | 低 | **高** | 强制 |
| L1-2 静默 PENDING | 低 | 中 | 中 | 推荐 |
| L1-3 提供声明的服务 | 低 | 低 | **高** | 强制 |
| L1-4 effect 拓扑 | 低 | 低 | 高 | 强制 |
| L1-5 **声明 vs 实测交叉** | 中 | 低 | **高** | 强制 |
| L1-6 配置 schema | 低 | 低 | 中偏高 | 推荐 |
| L2-1 getEffects 归零 | 低 | 低 | **高** | 强制 |
| L2-2 服务注销 | 中 | 中 | **高** | 强制 |
| L2-3 事件监听清零 | 中 | 中 | 高 | 推荐（`_hooks` 是私有面） |
| L2-4 离开 registry | 低 | 低 | 高 | 强制 |
| L2-5 句柄泄漏 | 高 | **高** | 中 | 指导 / 默认关 |
| L2-6 子进程清理 | 高 | 高 | 中偏高 | 仅在 L4 沙箱 |
| L3-1 restart 幂等 | 低 | 低 | **高** | 强制 |
| L3-2 update 收敛 | 中 | 中 | 中 | 推荐 |
| L3-3 完全重挂 | 中 | 低 | **高** | 强制 |
| L3-4 跨 Context 重挂 | 中高 | 中 | **高** | 推荐（沙箱内升级为强制） |
| L3-5 卸载后重挂 | 低 | 低 | 高 | 强制 |
| L4-1 工具调用 | 中 | 中 | 高 | 推荐（capability-gated） |
| L4-2 事件往返 | 低 | 低 | 中 | 推荐 |
| L4-3 子进程 Loader 冒烟 | **高** | 中 | **高** | 推荐（收录侧强制） |
| L4-4 agent turn | 高 | 高 | 中 | 指导 |

**判读**：真正能进"强制"且不需要 offload 的，集中在 **L0-1/2/3 + L1-1/3/4/5 + L2-1/2/4 + L3-1/3/5**。这 13 项就是 MVP 范围，其余要么降级要么 gate。

---

### 2.8 必须人工评审的项（及理由）

这些项**不可机械化**，或机械化的误报率高于其价值。把" 추정 mechanical 替代品"也列出，避免 reviewer 凭感觉。

| # | 人工评审项 | 为什么不能机器判 | 可用的半自动替代品（只降低工作量，不作结论） |
|---|---|---|---|
| H-1 | **语义诚实性**：插件是否真的做了它声称的事 | 停机问题的变体；行为等价不可判定 | L1-5 声明vs实测交叉 + 抽审 3 个真实用例 |
| H-2 | ** capability 声明的必要性**：申请的权限是否超过实际所需 | C 路已证：无 capability 授予机制（见其 §2.4） | AST 统计实际使用的 host service/event 名称集，与声明做差集报告 |
| H-3 | 配置默认值是否**安全**（默认值是否会导致删数据/外发） | 副作用语义 | 静态扫默认值字面量 + 标红危险 API 调用点，人工判 |
| H-4 | 错误处理质量（吞异常 vs 上报） | 二者语法上不可分（`try{...}catch{}` 与 `try{...}catch(e){log(e)}`） | AST 报出"空 catch / 未 rethrow / 未 log"的候选点，人工判每个是否合理 |
| H-5 | 许可证兼容性 | 法律判断，非技术判断 | SPDX 表达式解析 + 依赖树 license 集合（机械产出清单） |
| H-6 | i18n 质量（译文是否真译、术语一致） | 语义 + 语言判断 | locale 字典 parity 检查（仓库已有 `scripts/locale-dictionary-parity.spec.ts` / `shipped-locales.spec.ts`） |
| H-7 | 提示注入 / 不可信内容进入 model context 的面 | 数据流可达性在动态语言里不可判定 | 标出所有接受外部字符串并拼进 prompt 的调用点 |
| H-8 | 外部资源（浏览器/SSH/数据库/临时目录）的释放 | L2-5/L2-6 误报率过高 | 句柄差分报告 + 人工 |
| H-9 | Bundle patch 意图（是否该劫持 bundle） | 意图 | 静态列出 patch 触碰的条目，人工判必要性 |
| H-10 | semver **该不该** bump major | 语义 | 公共 API 面差分报告（`gen-cordis-catalog` 的 fail-closed 分区思想可复用） |
| H-11 | 图标/命名是否误导用户以为是官方或另一个包 | 视觉 + 意图 | 包名/作者字段一致性 + 图标二进制相似度（只出候选） |
| H-12 | 是否为他人包的抄袭/镜像分叉 | 法律 + 意图 | A 路 P0-4 建议的 canonical 上游声明字段 + 源码相似度候选 |

**元规则**：人工评审**不能替代**任何一项 tier=强制的自动化项；反过来，自动化项全绿**也不能免除** H-1 / H-2 / H-3 三项的抽审。

---

## 3. 落地形态

### 3.1 npm 包

```
@dsh-community/dsh-plugin-verify        （建议名，非官方 namespace）
├── bin/dsh-plugin-verify.js            单文件 CLI（node18+，ESM）
├── dist/rules/*.js                      按层分组的规则，每条带 metadata
├── dist/snapshot.js                     ★ 核心：Context 基线快照器（L1/L2/L3 共用）
├── dist/adapters/cordis-<range>.js      ★ 宿主适配层（见 §5.1/5.2）
└── dist/report/{text,json,sarif}.js
```

**包的内容 philosophy**：不含任何插件运行时；`peerDependencies: { '@deepseek-ai/cordis': '^4.0.0 || ^5.0.0' }`，由**调用方环境**提供实际的 Cordis（这样 checker 不替作者决定宿主版本）。

**规则 metadata 形状**（每条规则必须自描述，这是 §5.2 版本矩阵的基础）：

```ts
interface Rule {
  id: 'L2/dispose-effects-empty'
  layer: 'L0' | 'L0.5' | 'L1' | 'L2' | 'L3' | 'L4'
  tier: 'mandatory' | 'recommended' | 'guidance'
  since: '1.0'                       // 标准版本
  removedIn?: string
  hosts: string                      // semver range on dsh runtime, e.g. '>=0.2.2 <0.3.0'
  cordis: string                     // semver range on @deepseek-ai/cordis
  cost: 'low' | 'medium' | 'high'
  signal: 'high' | 'medium' | 'low'
  requiresSandbox: boolean
  humanReview?: string               // 指向 H-1…H-12 中的项
}
```

### 3.2 CLI

```bash
# 作者本地：零配置，尽可能跑
npx dsh-plugin-verify                       # 默认 --layer=L0..L3 --tier=mandatory
npx dsh-plugin-verify --layer=L0            # 只用静态层（不可信包也安全）
npx dsh-plugin-verify --entry=./lib/index.js --host=0.2.2-alpha.2
npx dsh-plugin-verify --matrix              # 对所有已知宿主版本求兼容矩阵（复用 evaluatePluginCompatibility）
npx dsh-plugin-verify --format=sarif -o report.sarif
npx dsh-plugin-verify --baseline=.dsh-verify.json   # 带豁免的基线（每条豁免须带 reason + expires）
npx dsh-plugin-verify doctor                # 输出本环境能力清单 + 哪些规则因宿主版本不适用（diagnostics）
```

**退出码**（继承 `run-gates` 的三条判据精神，且**不允许"跳过 = 通过"**）：

| code | 含义 |
|---|---|
| `0` | 通过：所选 tier 内 `error` 数为 0 |
| `1` | 不通过：至少一条 `mandatory` 违规 |
| `2` | **检查器失效**：宿主版本无适配层 / 必需 API 缺失 / 目标无法导入 / 适用规则数低于阈值。**显式失败，不允许静默通过** |
| `3` | 用法/参数错误 |

`--tier` 默认 `mandatory`；`--tier=recommended|all` 时 warn 也计入 `1`。`--strict=false` 才允许 warn 不影响退出码。

### 3.3 输出格式

**① 人读（text）**——对齐现有 verify-* 风格（`路径: 行号 证据 — 理由`）：

```
dsh-plugin-verify 1.4.0   std=DSH-PLUGIN-STD 1.1
host dsh 0.2.2-alpha.2 · cordis 4.0.6-alpha.1 · node 24.9.0 · mode lib

L0  static             9/9    0.08s
L0.5 import-only       3/3    0.11s
L1  load               4/4    0.34s   effects=7  services=+2
L2  unload             4/4    0.19s
L3  remount            3/3    0.61s
L4  smoke              2/2    4.20s   (sandbox, capability-gated)

RECOMMENDED
  L2-3 事件监听清零                 attrs: 2 listeners still registered on dispose
        src/index.ts:88  ctx.on('session/update', …)        — no matching effect
GUIDANCE
  L0-7 模块级可变单例               src/state.ts:4

mandatory 16/16 · recommended 4/5 · guidance 1 note · waived 0
```

**② JSON（`--format=json`）**——机器消费，含可复现戳 before anything else：

```jsonc
{
  "schema": "https://dsh.dev/schemas/plugin-verify/1.json",
  "checker": { "version": "1.4.0", "standard": "DSH-PLUGIN-STD@1.1" },
  "host": { "dsh": "0.2.2-alpha.2", "cordis": "4.0.6-alpha.1", "node": "24.9.0", "mode": "lib" },
  "subject": { "name": "@acme/dsh-plugin-foo", "version": "1.2.0",
               "lockfileHash": "sha256:…", "tarball": "sha512-…" },
  "summary": { "mandatory": {"total":16,"passed":16,"failed":0},
               "recommended": {"total":5,"passed":4,"failed":0,"warned":1},
               "notApplicable": 3, "exitCode": 0 },
  "findings": [
    { "id": "L2-3", "tier": "recommended", "severity": "warning",
      "rule": "listener-baseline-restored",
      "message": "2 listeners still registered after dispose",
      "evidence": [{ "path": "src/index.ts", "line": 88, "snippet": "ctx.on('session/update', …)" }],
      "waived": false }
  ],
  "waivers": [ { "rule": "L0-6/icon", "reason": "…", "expires": "2027-01-01", "ack": "human" } ]
}
```

**③ SARIF（`--format=sarif`）**——`results[]` 每条 `ruleId = "L2/L2-3"`，`level` 由 tier 映射（error/warning/note），`locations` 带 `physicalLocation` → GitHub Code Scanning 直接渲染为 PR 内联注释。这是让"报告出现在 diff 上"的最短路径。

### 3.4 GitHub Action

```yaml
# .github/workflows/plugin-verify.yml
name: DSH plugin conformance
on: [pull_request, push]
jobs:
  verify:
    runs-on: ubuntu-latest
    permissions: { contents: read, security-events: write, pull-requests: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24.9' }
      - run: npm ci && npm run build          # L1–L4 需要真实 lib/（对应 DSH_EXAMPLE_MODE=lib）
      - name: Verify (untrusted → static only)
        uses: dsh-community/plugin-verify-action@v1
        with: { layer: 'L0', tier: 'mandatory' }
      - name: Verify (trusted → full, sandbox)
        if: github.event.pull_request.head.repo.full_name == github.repository
        uses: dsh-community/plugin-verify-action@v1
        with: { layer: 'L0..L4', tier: 'mandatory,recommended', sandbox: 'true', upload-sarif: 'true' }
      - if: always()
        uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: report.sarif }
```

**关键设计：fork PR 与自家 PR 必须走不同通道。** fork PR 只允许 L0（不可信静态层）；完整 L1–L4 只在同仓库分支或人工触发后跑。这与仓库既有 CI 的分層策略（`ci-static` vs `ci-primary` vs `ci-consumers`）同构。

### 3.5 PR 里怎么呈现

1. **Check + 内联注释**：SARIF → Code Scanning，违规直接出现在 diff 行上。
2. **PR 摘要评论**：折叠 table（按层分组 / tier 徽标 / 耗时 / 未适用规则数）。
3. **徽章**：README 里用动态 badge（endpoint 指向每次 CI 上传的 summary JSON），**徽章文案必须带宿主版本**，例如 `conformance · DSH-PLUGIN-STD 1.1 · dsh ≥0.2.2 <0.3`。**过期徽章（宿主 minor 变了但没重跑）应该显示为灰色 `stale`，而不是继续绿**——这是防止"一次过检永久有效"的关键（见 §5.3）。
4. **Job Summary**：`GITHUB_STEP_SUMMARY` 里写 markdown 表格，含 `notApplicable` 统计（让人一眼看到"有几条因宿主版本没跑到"）。

---

## 4. 市场收录侧怎么消费

收录侧有两条**互斥且互补**的通道，分界线是"是否执行插件代码"。

### 4.1 通道 M1 —— 只读 manifest（不执行任何代码）

**适用于：所有条目，无条件、每次索引抓取都要跑。**

输入：`npm registry` metadata + tarball 的 `package.json`（**不解包执行**）+ 索引条目本体。

跑的项：L0 全部 + L0-2 的**宿主矩阵**（对每个已知 dsh 宿主版本求一次 `evaluatePluginCompatibility`）。

产出：把 Result 写成索引条目的一个字段（建议 `opensx`，如 `conformance: {standard, checked:{host, at, checker}, tier: 'M1', hostMatrix: {...}}`），并在 UI 上显示：

- `compatible with dsh <range>`（机器准，因为有 `evaluatePluginCompatibility`）
- `✓ static conformance M1`（可点开看 JSON）
- `last verified <ISO date> · checker 1.4.0`

**M1 的意义**：它零风险、可在每次索引抓取时为**全部几千条目**重跑，因此它是唯一能解决 A 路 P0-1（topic 噪音）/P0-2（幽灵条目）/P0-3（版本漂移）的通道。`parseMarketIndex` 已经把大部分 M1 规则实现了，成本极低。

**注意：M1 不能回答"它是不是一个能用的插件"，只回答"它的清单是否自洽且可达"。** UI 文案不能暗示更多。

### 4.2 通道 M2 —— 可执行沙箱冒烟

**适用于：申请收录的新条目 + 新版本；每次跑都有沙箱资源成本，因此需限流/排队。**

形态：拿到 tarball → 在一个有网络/文件系统边界的容器里 `pnpm i` → 跑 L0..L4 → 丢掉容器。

- 沙箱约束必须至少满足 C 路 §2.2 的结论：**同进程插件不存在硬隔离（"非 containment"）**，因此 L1–L3 必须在独立容器/微 VM 里跑，而不是在被收录服务进程里跑。
- 用 `marketInstallTarget(name, version)` 装**精确版本**（npm → `name@version`；git → `git+https://…#<commit>`），保证 reproducible。
- L4 一律用 `lib` 模式子进程（`runLoaderSmoke` 的双模语义），`expectedExitCode` 显式钉死。
- **继承三条已知限制**：built 模式需宿主 manifest 声明配置里命到的每个包；输出受 `maxBuffer` 约束；**deadline 只杀直接子进程，fixture 起的进程树需要外部 tree-kill（直接复用 `run-gates.ts` 的 descendant 采样 + `taskkill /T /F` / `process.kill(-pid)` 实现）**。

产出：

| 结果 | 索引中的表现 | 用户可见 |
|---|---|---|
| M1 通过 + M2 全绿 | `verified: full` | "已在 dsh x.y.z 上通过装载/卸载/重挂/冒烟" |
| M1 通过 + M2 部分（L4 不适用） | `verified: load`（常见） | "已验证可装载与干净卸载；未做端到端冒烟" |
| M1 通过 + M2 未跑（如不想代表作者执行代码） | `verified: static` | "仅静态验证，未执行代码" |
| M1 不通过 | **拒绝收录** 或降为 `unverified` 标记 | 显著披露 |

### 4.3 两通道的降级关系

- M2 是 M1 的**充分不必要**增强，M1 是硬地板。
- M2 失败**不是**安全结论——它只说明"在我们的参考环境里没跑起来"，可能是依赖缺失。UI 必须写明"未通过 ≠ 恶意"。
- **所有 M2 的结果都必须带 `host.{dsh,cordis,node}` 三元组并可被第三方独立复跑**（tarball hash + checker version + 三条版本 + mode）。**不能让"收录侧跑过"变成一个不可验证的权威断言。**

---

## 5. 风险与退化路径

### 5.1 宿主版本迭代导致检查项失效（Cordis 尚在 alpha —— 这是本方案最大风险）

**实证风险一：`FiberState` 是 `const enum`。**

`vendor/cordis/src/fiber.ts:147` 是 `export const enum FiberState { PENDING, LOADING, ACTIVE, FAILED, DISPOSED, UNLOADING }`。仓库内部的 `cordis-core-lifecycle.spec.ts` 是以**值**方式 `expect(fiber.state).toBe(FiberState.ACTIVE)` 使用的，这在仓库自己的编译链下能工作；但**跨包 + transpile-only（esbuild/tsx/swc `isolatedModules`）链下，`const enum` 成员访问存在被消解为 `undefined` 的经典风险**。

→ **强制缓解措施（不得省略）**：
1. 检查器**不直接 import `FiberState`**，而是在自己的适配层里声明一份字面量镜像 enum；
2. 配一条 **自锁规则**：启动时断言 `FiberState.ACTIVE === 2 && fiber.state` 在受控装载后等于镜像值；不等 → **exit 2 + 明确报错 "host API surface has drifted"**，而不是得到一堆假绿；
3. 这条自锁规则本身要实现为 §1.6 里学到的 **`fail loud` 元规则**（照抄 `verify-plugin-record-callers.ts:163` 的做法）。

**实证风险二：检查项依赖的下划线私有面。**

`fiber._hooks`、`ctx.reflect._getImpl`、`fiber._release`、`Reflect.ownKeys(ctx.reflect.store)` 都不是 SemVer-guranteed 的公共 API。Cordis `4.0.6-alpha.1` + 仓库里存在 `vendor/cordis-rc11-upgrade-plan.md` → **kernel 面还在动**。

→ 缓解：**所有对此类面的访问必须收敛到 `adapters/cordis-<range>.js` 单一文件**（这是 §3.1 里 `adapters/` 的用途）。理想上应说服上游把 checker 需要的稳定观测面（effect 树的服务 AUTHORIZED 视图、service registry 键集旁路）正式 export 为一个 `@deepseek-ai/cordis/*` 子路径——**这是本路向上游提的第一条 API 诉求**。

**实证风险三：宿主侧已经存在"生成面 drift 门禁"的先例，可直接借用。**

`scripts/gen-cordis-catalog.ts` 已经实现了全套"生成 cordis 目录 + `--check` 逐字节比对 + fail-closed 分区（`SERVICE_PAGE` 里"发现了但未登记"和"登记了但未发现"都报硬错）"，产出物之一是 `packages/extensions/tool-cordis/src/api-catalog.ts`。

→ **建议**：`dsh-plugin-verify doctor --emit-host-surface` 复用同一投影，产出一份 machine-readable 的**宿主能力清单**（哪些 service/event/plugin API 存在、签名摘要）。检查器启动时比对内置清单：缺什么就自动把依赖它的规则标 `notApplicable` 并计入 §3.3 的 `summary.notApplicable`。

**统一的退化策略（三选一，由 `--on-host-drift` 控制，默认 reject）：**

| 策略 | 行为 | 何时用 |
|---|---|---|
| `reject`（默认） | 适用规则占比低于阈值 → **exit 2**，不签发任何结论 | 收录侧、CI |
| `partial` | 正常输出报告，但结论降级为 `partial`，徽章显示 `partial (dsh x.y.z)` | 作者本地试新 alpha |
| `pin` | 拒绝运行，提示 `--checker=<version>`，用与该宿主匹配的历史 checker 版本 | Cordis 大版本跃迁期间 |

### 5.2 版本化：标准版本 × 宿主版本矩阵

**双版本号，缺一不可：**

- **标准版本** `DSH-PLUGIN-STD <S>`（`如 1.0 / 1.1`）：决定**条款集合**。新条款增 `since`，废除条款填 `removedIn`。同一份标准下新增 tier=强制的条款必须走 minor 或 major。
- **检查器版本** `checker <C>`：决定**实现对不对**（bug 修复不改变标准版本）。
- **宿主版本** `dsh <H>` + `cordis <K>`：决定**哪些条款本次真的跑了**（每条规则的 `hosts` / `cordis` range）。

三者关系：**`(S, C, H, K)` 四元组唯一决定一份可复现的结论。** 报告里必须全部记录（见 §3.3 JSON 的 `checker` + `host` 两节）。

**矩阵本体**。复用 `evaluatePluginCompatibility(manifest, {}, runtimeVersion)` 对多个 `runtimeVersion` 求值，产出：

```
PLUGIN @acme/foo 1.2.0                 engines.dsh = ">=0.2.0 <0.3.0"
┌──────────────┬──────────┬────────────┬─────────────┐
│ dsh runtime  │ compat   │ checker    │ std checked │
├──────────────┼──────────┼────────────┼─────────────┤
│ 0.2.2-alpha.2│ OK       │ 1.4.0      │ 1.1          │ ← 参考版本 / badge 依据
│ 0.3.0-rc.1   │ OK       │ 1.5.0-rc.1 │ 1.1          │
│ 0.4.0        │ UNMET    │ —          │ —            │ ← 需要作者更新 engines.dsh
└──────────────┴──────────┴────────────┴─────────────┘
```

三条执行约定：

1. **宿主 minor bump → 徽章自动 stale**，必须重跑（因为 Cordis 仍在 alpha，minor 也可能动 fiber 语义——`cordis-core-lifecycle.spec.ts` 抬头就是按 rc 版本组织的，这是实证依据）。
2. **检查器自身也要被 M1/M2 通道验证**：给每个新发布的 checker 版本，在参考宿主上跑一遍它自己的 fixture 集（一层漏 soil fiducial corpus：一个"完美插件"、一个"卸载不干净"、一个"重挂泄漏"、一个"索引非法"），确保它不是自己绿了别人也绿。
3. **`exempted === true` 必须写在报告里且触发 `recommended` 级 warn**：宿主允许用户 `--accept-risk` 精确版本豁免，但那样的一致性结论不能是"绿"的。

### 5.3 如何避免"为了过检而写假代码"

原则：**任何可以靠"写一行假代码"通过的规则，都不该存在。** 具体八条：

1. **禁止"文本存在性"规则**。不检查"README 是否含某短语"、"是否 export 某个名字"、"是否有某个注释/pragma"。这类规则在 AST 层面 100% 可 spoof，且鼓励作者在插件里塞无意义代码。
2. **所有 executed 检查必须由 checker 自己构造 Context，不接受作者提供的 Context/fixture。** 基线 `before` 快照只能由检查器在装载前取。这样"先偷偷 dispose 干净再交出来"不成立。
3. **★ 声明 vs 实测交叉（L1-5）**。静态层读到的每一条自我声明（`inject` 服务名、claim 的工具、claim 的事件、`capabilities`），都必须在运行时 Observatory 里被**真的观测到**（effect 标签里出现对应 `ctx.on("…")` / `reflect.store` 里出现对应键）。**声明了却没观测到 = 违规**（而不是"没观测到就不管"）。这条把"写 README 骗"和"写假 export 骗"同时堵住。
4. **L3-3 / L3-4 必须走"完全重挂"与"换 Context/换进程"**，而不是作者友好的 `restart()`。这是唯一能暴露"状态藏在模块级变量/ESM 单例里"的手段。一个只在同一个 Context 里 restart 的检查器，会被 `const cache = new Map()` 这种写法完全骗过去。
5. **effect 树的**结构**比较而非计数**。只比数量的话，作者可以在 dispose 后再塞一个同数量的假 effect；比 `label + children` 结构的深比较则成本高得多。
6. **结果必须可复现且带四元组戳**（§5.2）。任何人都应能用同一份 tarball hash + 四条版本号重跑并得到一致结论。这让"我在自己的机器上绿了"不再是一个论据。
7. **waiver 必须带 `reason` + `expires` + `ack: human`**，且到期自动失效。没有"永久豁免"。
8. **抽审 + 过期**：即使全绿，A/B/C 路的 H-1/H-2/H-3 三项仍需人工抽审；且一次性结论不永久有效（宿主 minor bump 或标准 minor bump 后自动 stale）。**把过检设计成"每个版本都要重考"，而不是"拿到一次证书"。**

反向也要诚实：**检查器不能制造虚假安全感**。UI 文案必须写明 M1/M2 分别证明了什么（"清单自洽且可达" / "在参考宿主上能装载且能干净卸载"，**不是**"这个插件功能正确、无害、不会被滥用"）。

### 5.4 其余风险清单

| 风险 | 说明 | 缓解 |
|---|---|---|
| ESM 缓存污染伪阴/伪阳 | 同进程重挂不清 ESM 缓存，作者模块的顶层状态会跨 Instance 存活 | L3-4 强制换进程（`runLoaderSmoke` 子进程）或借鉴 `hmr` 的 `evict` |
| 多份 cordis 副本 | `ctx.plugin` 装载的插件用的是另一个副本 → 所有 status/effect 断言失效 | L0.5 用 `Context.is()` brand 检测（global symbol，跨 realm 有效） |
| 未经 verify 的依赖更新 | 插件作者 update 一个传递依赖后行为改变 | 报告记录 lockfile hash；收录侧对 `git` 源强制 pin 40-hex commit（已有） |
| Fork PR 的沙箱逃逸 | fork PR 触发 L1–L4 会在 CI runner 上执行第三方代码 | §3.4 的 fork/self 分流；完整层只在同仓库或人工 approve 后跑 |
| 100MB `maxBuffer` 与进程树泄漏 | 直接继承 `loader-smoke` README 的三条已知限制 | 照抄 `run-gates.ts` 的 tree-kill 治理；给 L4 单独设 smaller maxBuffer 与 hard deadline |
| `files` 不含 `tests/` 导致套件不可分发 | `dsh-storage` 的 `files` 只有 `lib/**`，`contract.ts` 不随包发布 | 新增 subpath export 或独立发布 conformance 包（§1.7） |
| 检查器自己成为一个供应链攻击面 | 它会被几万次 CI 执行 | 最小化依赖；pin + SLSA/ provenance；本身就是 M1/M2 的第一个消费者 |
| 过度-bound "指导"导致作者疲劳 | 30 项全 default-on 会让人 `--strict=false` 一把梭 | MVP 只开 §2.7 里那 13 项强制；其余默认 gate-by-capability 或显式 opt-in |

---

## 6. 建议推进顺序（可执行的最短路径）

1. **先把 §1.1 表格里 5 个档 A 的现成件粘起来**，做 L0-only 的 `dsh-plugin-verify --layer=L0`。这一步零插件执行、零风险、当天可跑，立刻能解决 A 路 P0-1/2/3。依赖只有 `plugin-market-index` + `plugin-compatibility` 的**纯函数副本** + `install-spec`。
2. **抄 `applicationEntrypointViolations(root)` / `checkPluginRecordCallers(files)` 的参数化范式**，把角色 IO 规则写成 L0-7 AST 层；同时把它们的 **`fail loud` 自失效保险**设为元规则。
3. **实现 §2.4 的 `snapshot(ctx)` 单次之气**（registry.size + reflect.store keys + `_hooks` + handle info），这是 L1/L2/L3 全部的公共底座。
4. **照 `runKvBackendContract(label, create)` 的形状导出 `runPluginConformance(label, harness)`**，同时把原套件的分发问题解决掉（见 §1.7 的 `files` 问题）。**这一步决定了这事是"我们在检查别人"还是"生态拥有一套共享一致性套件"**——后者才是标准应有的形态。
5. **做宿主适配层 + 自锁规则**（§5.1），然后才碰 L1–L3。
6. **L4 沙箱最后做**，且严格 capability-gated + fork/self 分流。
7. **向 `@deepseek-ai/cordis` 上游提 API 诉求**：一个稳定的 conformance 观测子路径（effect 树视图 + service registry 键集旁路 + 非 const-enum 的 state 取值），把五年内的维护成本降一个数量级。

---

## 附录：证据锚点（便于复核）

| 结论 | 位置 |
|---|---|
| test-support 是 support-tier、"for test authors, not product integrations" | `packages/test-support/README.md:12`；`loader-smoke/README.md` |
| `runLoaderSmoke` 隔离语义 / expectedExitCode / 三条已知限制 | `packages/test-support/loader-smoke/src/index.ts:213-259`；README "What can go wrong" & "Known Limitations" |
| `src`/`lib` 双模 + `DSH_EXAMPLE_MODE` | `loader-smoke/src/index.ts:110-131`；`run-gates.ts:900-930`（`builtBinSmokeGate` 设 `DSH_EXAMPLE_MODE: 'lib'`） |
| `mountAgentLoopTestDependencies` 及 9 个 workspace peer | `test-support/agent-loop-testkit/src/index.ts:74-90`；`package.json:29-57` |
| 市场索引 pure validator 与全部硬约束 | `packages/util/plugin-market-index/src/index.ts:299-330` |
| 索引 body 解码三层 | `packages/boot/plugin-market/src/parse.ts:21-43` |
| 纯函数版本兼容 + 任意 runtimeVersion + 豁免表 | `packages/boot/app-boot/src/plugin-compatibility.ts:87-117` |
| profile 篇章读取 + "不可读不可 months 且不 hidden" | `packages/boot/app-boot/src/profile-plugins.ts:43-78` |
| "cannot resolve = Loader 的失败，不是 compat 结论" | `packages/boot/app-boot/src/compatibility-preflight.ts`（导言 + `manifestOf` 注释） |
| 导入但不 apply / 不 evaluate `!!js` | `apps/cli/src/dump-config-schema.ts:1-48` |
| 参数化门禁范式（可复用代表） | `scripts/verify-application-entrypoints.ts:181`；`scripts/verify-plugin-record-callers.ts:160` |
| AST 反绕过手法 + **`fail loud` 元规则原文** | `scripts/verify-plugin-record-callers.ts:70-79`（`unescaped`）、`:162-169`（两处 throw） |
| gate 通过三判据 + 被 abort 不得记为 passed | `scripts/run-gates.ts:1392`；`:1139-1155` |
| 进程树治理（POSIX group kill / taskkill /T /F / zombie 排除 / pipeDrain） | `scripts/run-gates.ts:1213-1400` |
| Cordis 行为契约（L3 语义依据，抬头写明 "rc.11"） | `scripts/cordis-core-lifecycle.spec.ts:1-188`；`cordis-config-access.spec.ts:1-92`；`cordis-loader-resolve.spec.ts:1-104` |
| **共享一致性套件先例** | `packages/storage/storage/tests/contract.ts`（`runKvBackendContract`，`KvBackendContractHarness`）；消费方 `storage-json/tests/json-backend.spec.ts:7`、`storage-sqlite/tests/sqlite-backend.spec.ts:9`；第二处 `packages/session/session-persistence/tests/contract.ts` |
| 套房未随包发布（`files` 只含 lib） | `packages/storage/storage/package.json:26-31` |
| hmr 重载成功协议（含 await 收敛、identity、rollback） | `packages/boot/hmr/src/index.ts:674-745`；`reconcileProfile` 的 `running` 过滤 `entry.fiber?.state === FiberState.ACTIVE` |
| `FiberState` 为 `const enum` | `vendor/cordis/src/fiber.ts:147` |
| `getEffects()` / `EffectMeta` / `await()` / `_getState()` | `vendor/cordis/src/fiber.ts:574 / ~100 / ~765 / 580` |
| `registry.values()` 遍历 fiber、`size`、`store` | `vendor/cordis/src/registry.ts:275, 212, 222` |
| `reflect.store`、`_getImpl`、`notify` 走 `registry.values()` | `vendor/cordis/src/reflect.ts:222, 251, 335-336` |
| effect 标签格式 `ctx.on("…")` / `ctx.provide("…")` | `vendor/cordis/src/events.ts:305`；`reflect.ts:326` |
| internal 事件全表 | `vendor/cordis/src/events.ts:337-370` |
| `Context.is` 跨 realm brand | `vendor/cordis/src/context.ts:56` |
| Cordis 版本（alpha）与 upgrade plan 存在 | `vendor/cordis/package.json:4`（`4.0.6-alpha.1`）；`vendor/cordis-rc11-upgrade-plan.md` |
| 宿主 API surface drift 的现有门禁（fail-closed 分区 + `--check`） | `scripts/gen-cordis-catalog.ts:1-15`（含 `OUT_RUNTIME_API = packages/extensions/tool-cordis/src/api-catalog.ts`）；`SERVICE_PAGE` fail-closed 注释 |
| 运行时 readiness discovery（per-entry Config status） | `packages/extensions/tool-cordis/README.md` "Use this package"（`schema`/`absent`/`unsupported`/`tree`/`inactive`） |
| 测试运行方式 | 根 `package.json` scripts（`check:all` / `check:ci` / `test`）；`Makefile`（声明 package.json 为 source of truth） |

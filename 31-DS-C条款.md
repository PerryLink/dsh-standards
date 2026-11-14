# 31 · DS-C 基线级条款（定稿候选）

> **v1 历史命名**：v2 以 `89-三套标准命名决定.md` 为准（DSH-ENTRY / DSH-FLOW / DSH-BOOST）；本文件保留旧码作历史，不在新文档引用。

> **版本**：v1.0.0-rc.3（T1 定稿候选；2026-11-07 增补 C-15～C-22 安全扩展；2026-11-14 rc3 锚与 REPO 行号复核）
> **日期**：2026-11-07（rc3 复核 2026-11-14）
> **依据**：`01-项目纲领.md`、`03-可行性与条款草案.md`、`10-输入/源码取证索引.md`、`00-索引.md`、`20-研究底稿/B-Cordis契约可判定性矩阵.md`、`20-研究底稿/C-安全基线与权限面.md`、`20-研究底稿/E-一致性检查器可行性.md`，以及 `deepseek-harness` 源码实测（**rc3 commit `38a6a5c965aa99ab525161efb7cc5cf1fe62fced`，2026-11-13，DSH `0.2.2-rc.3`**；2026-10-30 的 `ce7073d5…` / `0.2.2-alpha.2` 一组见 §1.5 历史锚）与 2026-11-07 安全审计（宿主 `0.2.2-rc.1`；**security scope 证据仅到 rc.1，rc3 未复跑**）。
> **覆盖条款**：C-1 ～ C-22（22 条编号）。C-1～C-14 是基线/入口面；C-15～C-22 是 2026-11-07 新增的 **security scope** 扩展，默认 DS-C package/listing 判定不变。C-10/C-18/C-19/C-20/C-22 为 advisory；C-3 仅 listing profile；C-21 是 security 强制项但 **WARN-only、不阻断**（listing 同）。
> **已知未完成项**：
> 1. 检查器已实现（T2）：16 tests；10 个 GitHub 样本 + 4 个 npm bundle 的 L0；L1–L3 13/14 真实包（`41`/`81`）。本文件仍只定义检查项 ID、判定方式与覆盖门。
> 2. C-3 的 listing 模式依赖市场索引与 placement；真实 3 个 format-1 快照（3,823/3,993/4,092）已用宿主 `parseMarketIndex` 验证 0 解析错误；T3 的 schema 补丁仍是提案。package 模式下 C-3 为 NA。
> 3. C-11/C-12/C-13 依赖的 `dsh.capabilities`、`dsh.labels`、`dsh.upstream` 是本标准新增字段，宿主本 commit **不读取**；检查器可读，宿主采纳前缺失按 WARN 处理。
> 4. 红队类、隐藏的破限行为无法机械识别；C-13 只判"声明一致性"，不判"行为真实性"。
> 5. 跨进程冷重挂（L3-4）不在 DS-C 内；同进程重挂无法重置 ESM 缓存。
> 6. Q3/Q4/Q5 为建议答案，待发起人/工作组拍板。
> 7. **C-15～C-22 只降低风险，不证明无恶意**：每条的 PASS 只代表"本次声明的静态/元数据覆盖内未见该类线索"；同进程插件仍可 `import node:fs`、裸 `fetch`、运行时读远程代码。C-14 是 entry scope 专属，不在本文 §2 展开（定义见 `31-DSH-ENTRY入门规范.md` §2.1–2.2）。

---

## 一、总则

### 1.1 这份文件回答什么

DS-C 基线级只回答一个问题：**这个插件能装、能跑、不破坏宿主吗？**

它不回答"设计是否优雅""是否安全""是否更快"。DS-C 是**条款集合**，不是分数、不是排名、不是"高级/初级"的标签（D4）。通过 DS-C 只表示：在给定 `(repo, commit, scanner, dsh, cordis)` 锚点上，本文件 §2 的强制条款均被检查且通过。

### 1.2 适用范围与形态

覆盖对象：能被 `dsh plugin add` 安装、并挂进 Cordis 插件树的包，含 `plugin` 与 `bundle` 两种 `dsh.kind`。

| `dsh.kind` | DS-C 是否适用 | 说明 |
|---|---|---|
| `plugin` | 适用 | 有可装载入口；C-4～C-9 可跑 |
| `bundle` | 部分适用 | 有 `dsh.bundle.patch`；可同时带 `dsh.client`（按打包/声明面评）；C-1/C-3/C-11/C-13 适用，C-4～C-9 输出 NA |
| `preset` | 不适用 | 组合层，不是可安装包；输出 NA |
| `client` | 不适用 | 纯客户端形态（`dsh.client`）；输出 NA |
| `skill` | 不适用 | 纯 skill 包；输出 NA |
| `theme` | 不适用 | 纯主题包；输出 NA |
| `mcp-config` | 不适用 | 纯 MCP server 配置；输出 NA |
| `unknown` | 不适用 | 无法归类；输出 NA + 人工复核建议 |

`dsh.kind` 缺失时按以下顺序推断，并在报告中写 `kindInferred: true`：有 `dsh.bundle.patch` → `bundle`（可同时带 `dsh.client`，按 bundle 评打包/声明面）；否则有 `dsh.client` → `client`；否则有可装载入口 → `plugin`；否则 `unknown`。**推断结果不得覆盖作者显式声明；推断与声明冲突时以声明为准并记 WARN。**

### 1.3 两种评估上下文

同一条款在不同上下文下的可判性不同，报告必须写明 `mode`：

- **package 模式**：输入是一个本地包目录或 tarball。能读 manifest、源码、入口；能执行 L1～L3。**不能**知道这个包将以什么 install spec 被安装。
- **listing 模式**：输入是一个市场索引条目（format-1 JSON）+ 固定来源。能判 C-3 的安装串与来源固定性；不一定能执行包。

C-3 是 **listing 属性**：package 模式下 C-3 整体输出 `NA`（reason: install spec not supplied），C-3.3/C-3.4 的静态证据以 advisory 附在报告里；listing 模式才判 PASS/FAIL。因此 DS-C 有两个 profile：

- `package`（作者本地）：11 条强制 = C-1、C-2、C-4～C-9、C-11～C-13；C-3 为 NA。
- `listing`（市场门禁）：12 条强制 = 上述 11 条 + C-3。

两个 profile 的徽章必须分别写 `DS-C (package)` / `DS-C (listing)`，不得混写。

**security scope（新增，opt-in）**：`dsh-standards check <package-dir> --scope security` 单独评估 C-15～C-22，报告写 `security.status`（`pass` / `warn` / `fail` / `incomplete`）。该 scope 自 **1.6.0** 发布，1.6.x 当前支持；1.5.x 及更早会把 `security` 当未知 scope 并 exit 3。它**不并入**上面两个 profile 的强制集合，也**不改变** `DS-C` 徽章；C-15/C-16/C-17 的 FAIL 只影响 security 结论与 `--scope security` 的 exit code，C-21 只 WARN、不阻断。security scope 不能写成"安全/已审计"，也不能替代人工评审。默认 `--scope ds-c` 下这 8 项只在 `security` 块里以 advisory 模式运行（FAIL 封顶 WARN），不进 `checks[]`，不改变 DS-C 结论。

### 1.4 三值、NA 与覆盖度（禁止假绿）

| 结果 | 含义 | 对结论的影响 |
|---|---|---|
| `PASS` | 在本次覆盖范围内，证据证明条款满足 | 计入通过 |
| `WARN` | 可判定但不满足全部子项、使用了替代声明、或存在已知例外 | **不计为 PASS**；必须披露原因 |
| `FAIL` | 有证据证明条款不满足 | 结论失败，exit 1 |
| `NA` | 对象形态或评估上下文不覆盖该条款 | **不是 PASS**；单列 |
| `ERROR` | 检查器自身失效（依赖缺失、解析崩溃、夹具不可用） | exit 2；不得当作通过 |

每个检查项还必须带 `coverage`：

- `full`：该项全部子检查都跑了；
- `partial`：只跑了一部分（必须写 `notRun` 列表）；
- `not-run`：完全没跑（必须写原因）。

**覆盖门（硬规则）**：只有**该 profile（§1.3）对应的**全部强制条款均为 `coverage: full` 且没有 `FAIL`，才允许输出 `status: pass` 与 `level: DS-C`。任何强制条款 `not-run`/`partial`/`ERROR` → `status: incomplete`，exit 2；任何 `FAIL` → `status: fail`，exit 1。**"跳过即通过"在本标准里是禁止的。**

### 1.5 版本锚

DS-C 的符合性绑定五元锚，缺一不可：

```json
{
  "repo": "deepseek-ai/deepseek-harness",
  "commit": "38a6a5c965aa99ab525161efb7cc5cf1fe62fced",
  "scanner": "dsh-plugin-verify@<semver>",
  "dsh": "0.2.2-rc.3",
  "cordis": "4.1.0"
}
```

本 commit 的三个版本轴必须分开记录，不能合并成一个"DSH 版本"：

| 轴 | rc3 实测 | 证据 |
|---|---|---|
| Harness 根包版本 | `0.2.2-rc.3` | `REPO/package.json` 的 `version`；`getDshRuntimeVersion()` 实际读的是 `packages/boot/app-boot/package.json`（rc3 同为 `0.2.2-rc.3`，见 `REPO/packages/boot/app-boot/src/plugin-compatibility.ts:44-49`） |
| vendored Cordis 包版本 | `4.1.0` | `REPO/vendor/cordis/package.json` 的 `version` |
| Cordis 上游基线 | `4.0.0-rc.11` | `REPO/vendor/README.md:15` |
| Node 引擎线（附加轴，不是五元锚之一） | `>=24.9.0` | `REPO/package.json` 的 `engines.node` |

**历史锚（2026-10-30，`0.2.2-alpha.2`）**：commit `ce7073d51254c26cd63b22a60835b8f948deb447`、dsh `0.2.2-alpha.2`、cordis `4.0.6-alpha.1`。这一组只用于阅读 2026-10-30～11-01 产出的旧结果（`40-checker/results/**`），**不得**再用作当前符合性绑定。

**任何条款在 `cordis` 轴跨 minor 后必须重跑适配层**；rc3 的 cordis 由 `4.0.6-alpha.1` 变为 `4.1.0` 仅是 vendored 包版本号变化（rc3 审计实测该目录源码与 alpha.2 逐字节相同），不构成 minor 跨版，但仍要求以新锚重跑后才可引用。徽章必须带 `reviewedAt` 与 `expiresAt`。宿主 minor bump 后旧徽章标记 `stale`，不得继续展示为有效。

### 1.6 本标准不做什么

- **不做安全审计**：`ctx.*` 的 seam 不是权限边界。三处源码自陈：`fs-sandbox` 的 fence 是 "policy check in TRUSTED code … NOT a kernel boundary"（`REPO/packages/fs/fs-sandbox/src/index.ts:10-16`）；`plugin-manager/tools.ts:109` 明写 "installed Host code runs outside the workspace sandbox"；`cordis-host-runner/sandbox.ts:7` 明写 "is not containment"。
- **不做运行时沙箱/门控**：同进程插件可 `import node:fs` / 裸 `fetch` 绕过一切 seam（`20/C` §4(d-2)）。C-11/C-12 只做**装载期声明一致性 + 披露**。
- **不证明"无恶意"**：C-15～C-22 是风险线索与阻断项，不是恶意软件判定。静态检查只能发现已知形态；运行时拼路径、远程取代码、反射调用都不可判。任何 PASS 都不得写成"安全""已审计""无风险"。
- **不排名、不打分、不设 star/下载量门槛**。
- **不把"市场收录"当安全背书**。

### 1.7 六项格式

每条条款固定六项：**要求（祈使句）/ 判定方式 / 三值期望 / 已知反例 / 证据锚点 / 建议分级**。另附**正面示例**与必要的**边界说明**；正面示例不是条款，只是"该怎么做"的最小写法。

### 1.8 证据规则

- `REPO` 的 `<path>:<line>` 指 `deepseek-harness` 在 §1.5 commit 下的文件与行号；行号为**起始行**，允许 ±N 漂移，检查器必须 pin commit 并重新核验。
- 生态数字与实例只引 `10-输入/生态调研报告.md`（§8 的硬约束），不重新联网抓取。
- 无法证实的断言写「待证」，不得编造。

---

## 二、DS-C 条款

### C-1 清单与入口可解析

**要求（祈使句）**：插件包必须提供可解析的 `package.json`，声明非空 `name`、精确 SemVer `version` 与可解析入口；若声明 `dsh.bundle.patch`，补丁文件必须位于包内；`license` 应当声明；入口的导出形态必须是 Loader 接受的一种，不得混用函数插件与默认导出服务类。

**判定方式**：L0 静态（DSC-01），复用 E 路 L0-1 / L0-3；导出形态可退化为 L0.5 导入但不 apply。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-1.1 | `package.json` 可 JSON 解析；`name` 匹配 npm 包名；`version` 是精确 SemVer（不是 range/tag） | 不满足 → FAIL |
| C-1.2 | `exports["."]` 或 `main` 存在；解析后的目标文件在包内且真实存在 | 缺失/越界 → FAIL |
| C-1.3 | 函数插件导出 `apply`（可带 `name`/`inject`/`Config`）；服务插件默认导出 class；不得在四个命名导出旁再加默认导出 | 明显混用 → FAIL；AST 判不定 → WARN |
| C-1.4 | `dsh.bundle.patch` 为字符串或字符串数组；每个路径是包内相对路径、无 `..`、文件存在；patch 行的 `name` 不得是绝对路径/`~`/环境变量插值 | 缺失/越界 → FAIL |
| C-1.5 | `license` 是字符串（建议 SPDX 标识） | 缺失/不可识别 → WARN |
| C-1.6 | `private: true` 且来源是 registry | WARN（可安装但不可发布） |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | C-1.1～C-1.4 全部满足；C-1.5 满足；无 C-1.6 警告 |
| WARN | C-1.1～C-1.4 满足，但 license 缺失/不识别、`private:true`、或 C-1.3 的导出形态无法静态确定 |
| FAIL | 任一条 C-1.1～C-1.4 不满足 |
| NA | `dsh.kind` 为 client/skill/theme/mcp-config/preset |

**已知反例**：
- 构造反例：`exports["."] = "./lib/index.js"` 但 `files` 未包含 `lib/`，发布后包可安装、入口不存在。
- 构造反例：`version: "latest"` 或 `"^1.2.3"`，清单可读但不是精确版本。
- 生态实例：`Tencent/WeKnora` 的目录条目无安装命令证据（`10-输入/生态调研报告.md:171`），说明"清单/入口"在目录侧经常没有可核验的锚点；C-1 只能判包内事实，判不了目录条目的完整性。

**证据锚点**：
- `REPO/packages/util/package-manifest/src/types.ts:8-29`：`DshPackageManifest` 要求 `name`、`version`；`dsh` 字段（`:28`）只定义 `manifestVersion`/`bundle`/`profile`/`client`（`DshManifest` 声明 `:32-41`）。
- `REPO/packages/util/plugin-market-index/src/index.ts:29`：npm 包名正则；`:271-292`：市场条目必须有 `name` 与 `versions`；`:303-320`：`parseMarketIndex` 入口。
- `REPO/docs/defensive-patterns/package-surface.md:7-20`：Loader 只接受"函数插件四件套"或"默认导出服务类"，两者不得混用。
- `REPO/packages/boot/app-boot/src/profile-plugins.ts:65-83`：`readProfilePlugins()` 只读已安装 manifest，不执行代码。

**正面示例**：

```json
{
  "name": "@acme/dsh-greet",
  "version": "1.2.3",
  "license": "MIT",
  "type": "module",
  "exports": { ".": "./lib/index.js" },
  "files": ["lib", "locale"],
  "engines": { "dsh": ">=0.2.2-0 <0.3.0" },
  "peerDependencies": { "@deepseek-ai/cordis": ">=4.1.0 <5" },
  "dsh": { "manifestVersion": 1, "kind": "plugin" }
}
```

**建议分级**：DS-C 强制。C-1.5（license）只到 WARN，避免把长尾插件一刀切掉。

**边界说明**：C-1 只判"身份可解析、入口存在、形态可装载"，不判"这个身份是否真实/是否镜像"；后者归 C-13 与 DS-R 的 R-12。

---

### C-2 版本约束声明且兼容

**要求（祈使句）**：插件必须声明与运行时兼容的 dsh 版本约束：首选 `engines.dsh`；没有 `engines.dsh` 时至少声明一个 `@deepseek-ai/dsh*` peer 范围；不得以"缺失声明"冒充兼容。

**判定方式**：L0 静态（DSC-02），复用 `evaluatePluginCompatibility(manifest, {}, runtimeVersion)`。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-2.1 | `engines.dsh` 存在且是合法 SemVer range；或至少一个 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer 范围 | 两者皆无 → FAIL |
| C-2.2 | 当前 `runtimeVersion` 满足声明（`includePrerelease: true`） | 不满足 → FAIL |
| C-2.3 | `engines.dsh` 不得是 `workspace:` 前缀；peer 中的 `workspace:^/~/*` 按宿主规则等价于当前 runtime | 违反 → FAIL |
| C-2.4 | 同时有 `engines.dsh` 与 dsh peers 且二者结论冲突 | WARN（宿主以 `engines.dsh` 单独裁决） |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | `engines.dsh` 存在、合法、被当前 runtime 满足；**或**无 `engines.dsh` 但至少一个 dsh peer 范围合法且被满足（peer 替代声明，**较弱**；rc3 宿主的 `unmetRequirements` 把 peer 当等价门，检查器同判 PASS，见下） |
| WARN | C-2.4：`engines.dsh` 与 dsh peers 的结论冲突（宿主以 `engines.dsh` 单独裁决） |
| FAIL | 两者皆无；`engines.dsh` 非法/空/不满足；peer 不满足 |
| NA | `dsh.kind` 非 plugin/bundle |

**实现对齐（1.6.11）**：`40-checker/src/manifest.mjs` 的 C-2 分支与 `40-checker/test/c2-exports.test.mjs` 的 peer-only 用例都产出 C-2.1/C-2.2 PASS（`DSC-02 = PASS`），与本表一致；报告须在 reason/peer 说明里注明「peer 替代声明，较弱」。

**已知反例**：
- `dsh-purge-plus` 适配到 `0.2.1-rc.2`，宿主（2026-10 当时）已到 `0.2.2-alpha.2`，装上去就坏（`01-项目纲领.md:34` P0-3；`10-输入/生态调研报告.md:91`）。rc3 下宿主是 `0.2.2-rc.3`，同类漂移仍成立。
- 宿主 `plugin-compatibility.ts:62` 在"既无 `engines.dsh` 又无 `peerDependencies`"时 `return {}`，即**无声明 = 兼容**；这是本条款要堵的洞。
- 构造反例：`engines.dsh: ">=0.2.1-rc.2"` 在 prerelease 语义下可能满足，但插件实际用了 0.2.2 才有的 API；版本声明正确不等于行为正确，C-4 只补一半。

**证据锚点**：
- `REPO/packages/boot/app-boot/src/plugin-compatibility.ts:55-74`：`unmetRequirements`；`:62` 无 peer 即返回空对象；`:69-71` 只看 `@deepseek-ai/dsh*` peer；`:87-102` `evaluatePluginCompatibility(manifest, exemptions, runtimeVersion)`。
- `REPO/packages/boot/app-boot/src/plugin-compatibility.ts:110-117`：`pluginCompatibilityWarning` 给出精确版本豁免通道（`--accept-risk` / `allow-version`）。
- `REPO/vendor/README.md:15`：Cordis 上游基线 `4.0.0-rc.11`；`REPO/vendor/cordis/package.json` 的 `4.1.0` 是 Harness 发布版本，不是上游基线。

**正面示例**：

```json
{ "engines": { "dsh": ">=0.2.2-0 <0.3.0" } }
```

或（无 `engines.dsh` 时）：

```json
{ "peerDependencies": { "@deepseek-ai/dsh-tools": ">=0.2.2-0 <0.3.0" } }
```

**建议分级**：DS-C 强制。**本条款比宿主更严**：宿主允许"无声明即兼容"，DS-C 不允许；这是有意为之，因为无声明的插件无法被五元锚约束。

**边界说明**：`--accept-risk` / `allow-version` 是用户的显式风险接受，不是 DS-C 的 PASS；报告必须把 `exempted: true` 单独列出，不得计为通过。

---

### C-3 安装来源可解析、可固定、可追溯

**要求（祈使句）**：安装来源必须可解析且可固定：registry 形态必须给出精确版本或可校验 tag；git 形态必须固定 40 位 commit；tarball/path 必须显式声明；不得使用随 HEAD 漂移的隐式引用；非 registry 依赖必须固定可追溯（git commit / 固定 tarball URL / 包内 path），不得用浮动 branch；安装期构建脚本必须可枚举。

**判定方式**：L0（DSC-03），listing 模式复用 `parseInstallSpec` + `parseMarketIndex`；package 模式只跑 C-3.3/C-3.4。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-3.1 | 推荐 install spec 能被 `parseInstallSpec()` 接受；显式声明 `kind`（registry/git/tarball/path） | 解析失败 → FAIL |
| C-3.2 | registry 形态：精确版本或可校验 tag，不得裸名；git 形态：`#<40hex>` commit | 漂移引用 → FAIL |
| C-3.3 | `dependencies`/`peerDependencies` 中的非 registry 值（git/url/file/link）必须固定可追溯：git 带 commit、tarball 是 URL、path 在包内；不得用浮动 branch/tag | 未固定/越界 → FAIL；无法解析 → WARN |
| C-3.4 | `scripts.preinstall/install/postinstall/prepare` 存在时，必须有可枚举的构建脚本声明（字段名由 T4 定稿；当前可核对 profile 的 `allowBuilds`） | 有脚本无声明 → WARN（profile 未知）；policy 明确拒绝 → FAIL |
| C-3.5 | listing 模式：条目通过 `parseMarketIndex`（精确 SemVer、40hex commit、无 `workspace:` range、图标/凭据 URL 规则） | 解析失败 → FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | listing 模式：C-3.1～C-3.5 全部满足 |
| WARN | listing 模式：C-3.4 有脚本但 profile policy 不可见；C-3.3 解析不确定。package 模式下 C-3 整体 NA，C-3.3/C-3.4 的 advisory 单独列，不改变 NA |
| FAIL | listing 模式：spec 不可解析/未固定；非 registry 依赖未固定或越界；policy 明确拒绝的构建脚本；条目解析失败 |
| NA | package 模式（install spec 是 listing 属性，未提供；reason 必须写明）；或 `dsh.kind` 非 plugin/bundle |

**已知反例**：
- `tabbit-browser/dsh-plugin` 已 404，仍被 3 个目录收录（`01-项目纲领.md:33` P0-2；`10-输入/生态调研报告.md:264`）——来源不可固定/不可追溯的典型。
- `Tencent/WeKnora` 条目无安装命令证据（`10-输入/生态调研报告.md:171`）。
- `dsh-purge` 四个并行主体 13,357 / 3,441 / 2,701 / 541★（`10-输入/生态调研报告.md:36-59`）——同名/近名分叉，安装串必须能区分主体。
- CLI 把 `args` 原样转给 pnpm（`REPO/apps/cli/src/plugin.ts:92-98`），spec 面很宽；没有本条款，pnpm 接受什么就装什么。

**证据锚点**：
- `REPO/packages/boot/plugin-manager/src/install-spec.ts:70-93`：`parseInstallSpec` 的四种形态与拒绝规则；`:131` `NON_REGISTRY_VALUE`。
- `REPO/packages/boot/plugin-manager/src/build-approval.ts:78-83`：`blockedBuildNames` 从 pnpm 输出提取构建脚本；`:63-72` `recordPendingBuilds` 写入 `allowBuilds`。
- `REPO/packages/util/plugin-market-index/src/index.ts:194-209`：`source` 只接受 npm/git，git 必须 40hex；`:211-220` `engines.dsh` 不得 `workspace:`；`:243-256` 精确 SemVer；`:303-320` 总校验。
- `REPO/apps/cli/src/plugin.ts:92-98`：参数转发给 pnpm。

**正面示例**（listing 模式）：

```json
{
  "name": "@acme/dsh-greet",
  "versions": [{
    "version": "1.2.3",
    "publishTimestamp": 1760000000,
    "source": { "type": "npm" },
    "engines": { "dsh": ">=0.2.2-0 <0.3.0" }
  }]
}
```

**建议分级**：DS-C 强制，但**分 profile**：listing 模式在 T3 接入；package 模式下 C-3 为 NA，C-3.3/C-3.4 只作 advisory。MVP 13 项不含 L0-4/L0-5，因此 T2 的 MVP 不能声称完成 **listing profile** 的 C-3；package profile 不依赖 C-3。

**边界说明**：C-3 不判"这个包是不是恶意"，只判"来源是否被钉住、是否可追溯"。签名/provenance 本 commit 不存在（`10-输入/源码取证索引.md:102`），不写成条款。

---

### C-4 可装载并进入 ACTIVE

**要求（祈使句）**：插件入口必须在受控 Cordis Context 中装载并进入 ACTIVE；不得停留在 PENDING 或被静默吞掉异常；装载超时必须判失败，不得无限等待。

**判定方式**：L1 装载（DSC-04），复用 E 路 L1-1。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-4.1 | 在 `new Context()` 中 `await ctx.plugin(entry, config)`，夹具按 `inject` 提供桩服务 | 导入/构造抛错 → FAIL |
| C-4.2 | `fiber.state === ACTIVE`（`FiberState.ACTIVE`，数值 2）且 `await fiber.await()` 不抛 | 非 ACTIVE → FAIL |
| C-4.3 | 装载 deadline（建议 10s）内未稳定 | 超时 → FAIL |
| C-4.4 | 夹具无法提供某个声明的 inject 服务 | `coverage: blocked` + WARN，**不得 PASS** |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | 在 deadline 内 ACTIVE，`await()` 不抛，夹具覆盖了全部声明 inject |
| WARN | PENDING 且原因是夹具缺少某个声明服务（blocked）；或 ACTIVE 但伴随弃用警告 |
| FAIL | 抛错；`FAILED`；PENDING 但所有声明服务都可用；超时 |
| NA | `dsh.kind` 非 plugin；或 `--no-exec` |

**已知反例**：
- 插件 `inject` 了一个没人提供的服务 → PENDING，打印 nothing，无错误（`REPO/docs/cordis-tutorial/06-composition-and-hmr.md:63`；`REPO/docs/cordis-tutorial/03-services.md:72`）。
- `dsh-purge-plus` 适配到 `0.2.1-rc.2`，宿主（2026-10 当时）已到 `0.2.2-alpha.2`：版本漂移使"装载前兼容性判定"不可靠（`10-输入/生态调研报告.md:91`；`01-项目纲领.md:34`）。rc3 下同类漂移仍成立。
- 构造反例：入口 `import` 一个未声明的 peer，抛出 `ERR_MODULE_NOT_FOUND`；C-4.1 直接 FAIL。

**证据锚点**：
- `REPO/vendor/cordis/src/fiber.ts:147-154`：`FiberState` 六个状态；**const enum**，跨包 transpile-only 下取值有失效风险，检查器必须做运行时自检。
- `REPO/vendor/cordis/src/fiber.ts:603-646`：`_checkImpl` / `_refresh` / `_setEpoch`；`:693-701` 启动异常只 `logger.error` 并置 `FAILED`，不冒泡。
- `REPO/vendor/cordis/src/fiber.ts:754-760`：`await()` 会重抛 `_error`。
- `REPO/vendor/cordis/src/registry.ts:316-336`：`ctx.plugin()` 建 Fiber 并返回 thenable。

**正面示例**：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'greet'
export const inject = ['tools']

export function apply(ctx: Context) {
  // 只做注册，不在此处做重活
}
```

**建议分级**：DS-C 强制。这是"能跑"的核心。

**边界说明**：C-4 证明"能装载"，不证明"有用"，也不证明"卸载干净"（E 路 §2.3 的 Ω limit）。PENDING 是合法状态，但在 DS-C 的"能跑"语义下，**声明了依赖却拿不到**必须 FAIL；**夹具给不出依赖**只能 WARN + blocked，不能算插件失败。

**夹具归因与隔离（T2 必须遵守）**：
1. L1/L2/L3 必须在隔离的临时 `DSH_HOME` 与子进程中运行，不得读写开发者真实 profile（`10-输入/源码取证索引.md:121` 的 `runLoaderSmoke` 是现成蓝本：隔离 cwd/`DSH_HOME`、关 stdin、deadline+SIGKILL）。
2. 检查器必须把"插件自身抛错"与"夹具桩不完整/宿主缺失"分开；无法归因到插件时，报 `ERROR`（exit 2）或 `blocked` WARN，**不得判 FAIL**。
3. 夹具桩必须满足被注入服务的公开契约；桩不完整导致的 `TypeError` 不得算插件失败。

---

### C-5 声明的 provide 必须真实注册

**要求（祈使句）**：插件声明 `provide` 的服务必须在装载后由该 fiber 真实注册；不得只写声明不注册，也不得让别的 fiber 代为注册。

**判定方式**：L1 装载（DSC-05），复用 E 路 L1-3。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-5.1 | 从插件导出/静态字段收集 `provide`（字符串或字符串数组） | 无声明 → NA |
| C-5.2 | ACTIVE 后 `ctx.reflect.store` 中每个名字有实现：本 fiber 直接所有 → PASS；子 fiber 间接 → WARN；他人 fiber 或缺失 → FAIL | 见左 |
| C-5.3 | 注册必须走 `ctx.provide` / `Service` 构造器（二者都是 effect） | 直接写 `reflect.store` → FAIL（并触发 C-6） |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | 所有声明 provide 都由本 fiber 注册 |
| WARN | 声明是动态的（数组来自配置/变量），无法静态枚举；或由子 fiber 间接注册 |
| FAIL | 声明了但未注册；或实现属于别的 fiber |
| NA | 没有声明 provide |

**已知反例**：
- 构造反例：`export const provide = ['greet']`，但 `apply` 里从未 `ctx.provide('greet', ...)`。函数插件的 `provide` 只是元数据，Cordis **不会**自动注册（`REPO/vendor/cordis/src/registry.ts:107-108` 注释："read by `Service` and by loaders"）。
- 构造反例：`Service` 子类在构造器里 `super(ctx, 'greet')`，但插件入口默认导出错了类，注册的是另一个名字。

**证据锚点**：
- `REPO/vendor/cordis/src/registry.ts:100-111`：`Plugin.Base` 的 `provide` 字段与注释。
- `REPO/vendor/cordis/src/service.ts:42-57`：`Service` 构造器调用 `ctx.reflect.provide(name, self, check)`，注册自动成为 effect。
- `REPO/vendor/cordis/src/reflect.ts:291-327`：`provide()` 的内部实现、重复注册抛错、disposer 等 dependents。

**正面示例**：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'greet'
export const provide = ['greet']

export function apply(ctx: Context) {
  ctx.provide('greet', { hello: (name: string) => `Hello, ${name}!` })
}
```

**建议分级**：DS-C 强制。声明与实测不一致是"反造假核心"的一半（另一半是 C-9）。

**边界说明**：`provide` 是公开 ctx 服务名；内部服务/命名空间服务不应写进 `provide`。C-5 只判声明的子集，不判"有没有少报"（少报归 C-9 的 WARN）。

---

### C-6 注册型副作用必须由 fiber 承载

**要求（祈使句）**：所有注册型副作用必须由 fiber 的 effect 承载；不得直接写 Cordis 私有注册面（`ctx.events._hooks`、`ctx.reflect.store`、`ctx.registry._internal`、`fiber._disposables`）；对 Cordis 不管理的资源（定时器、watcher、子进程、socket、临时文件），必须用 `ctx.effect()` 包裹并返回 disposer。

**判定方式**：L0 静态 + L1 effect 拓扑（DSC-06），复用 E 路 L1-4 与 L2-1 的部分证据。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-6.1 | 源码不得对 `_hooks`/`reflect.store`/`registry._internal`/`_disposables` 做写操作 | 写操作 → FAIL |
| C-6.2 | 声明的 provide / `ctx.on` 在 `fiber.getEffects()` 中有对应 label；不得全是 `anonymous` | 直接注册缺失 → FAIL；子 fiber 间接注册 → WARN；全匿名 → WARN |
| C-6.3 | 已知资源分配器（`setInterval`/`setTimeout`（长延时）/`watch`/`spawn`/`createServer`/`new WebSocket`）出现在 `ctx.effect` 外 | WARN（advisory；误报可能） |
| C-6.4 | 卸载后 effect 归零 | 由 C-7 判；C-6 只引用 |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | C-6.1 无写私有面；C-6.2 覆盖声明；C-6.3 无命中 |
| WARN | C-6.3 命中（可能误报）；C-6.2 全匿名或子 fiber 间接注册；注册是动态的 |
| FAIL | C-6.1 写私有面；C-6.2 直接注册但 effect 树里没有 |
| NA | 没有任何注册（纯函数插件） |

**已知反例**：
- 裸 `setInterval` 不在任何 fiber 的 `_disposables` 里；`_unload()` 只 await 已登记的 disposer，Cordis 根本不知道它存在（`REPO/vendor/cordis/src/fiber.ts:720`；`20/B` X-2）。
- 直接 `ctx.events._hooks[name].push(...)` 绕过 `ctx.on` 的 effect 包装，卸载后监听器仍在（`REPO/vendor/cordis/src/events.ts:263-270` 才是正确注册路径）。

**证据锚点**：
- `REPO/vendor/cordis/src/fiber.ts:421-567`：`effect()` 接受函数/Promise/生成器，非法形状抛 `TypeError('Invalid effect')`。
- `REPO/vendor/cordis/src/fiber.ts:574-578`：`getEffects()` 只返回已登记 effect 的元数据。
- `REPO/vendor/cordis/src/fiber.ts:720`：`_unload()` 对 `_disposables.clear()` 做 `Promise.all`，未登记的资源不在其中。
- `REPO/vendor/cordis/src/events.ts:263-270`：`ctx.on` 的注册本身包在 `ctx.fiber.effect` 里。
- `REPO/vendor/cordis/src/reflect.ts:291-327`：`ctx.provide` 本身是 effect。

**正面示例**：

```ts
export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => { /* ... */ }, 1_000)
    return () => clearInterval(timer)
  }, 'greet.heartbeat')
}
```

**建议分级**：DS-C 强制（C-6.1/C-6.2）；C-6.3 为 advisory（高误报，依 §3.7）。

**边界说明**：**C-6 不能证明"该登记的都登记了"**。`getEffects()` 只覆盖已登记的 effect；一个裸定时器/未 `kill()` 的子进程/未 `close()` 的 socket，差分断言全绿它照样泄漏（X-2）。C-6 判"已知注册面 + 可观测 effect"，不判"绝对无泄漏"；后者是 L4/advisory 与人工评审。

---

### C-7 卸载后可观测残留归零

**要求（祈使句）**：`dispose()` 后插件不得留下可观测残留：`fiber.getEffects()` 必须为空；插件拥有的服务必须从 `ctx.reflect.store` 移除；`registry` 中不再有该插件 runtime 的该 fiber；事件监听必须回到装载前基线。

**判定方式**：L2 卸载（DSC-07），复用 E 路 L2-1 / L2-2 / L2-4。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-7.1 | `await fiber.dispose()`；`fiber.getEffects().length === 0` | 非零 → FAIL |
| C-7.2 | `ctx.reflect.store` 的键集回到装载前基线；插件拥有的每个服务实现被移除 | 残留 → FAIL |
| C-7.3 | `ctx.registry.size` 回到基线；`runtime.fibers` 不含该 fiber | 残留 → FAIL |
| C-7.4 | 事件监听回到基线（可选；`_hooks` 是私有面，必须包在适配层） | 不可测 → WARN；残留 → FAIL |
| C-7.5 | `dispose()` 必须 await 到 quiescence，不得只发请求 | 未 quiesce → FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | C-7.1～C-7.3 全部满足；C-7.4 满足或被明确标为不可测 |
| WARN | C-7.4 因私有面适配不可用而无法测；基线受夹具内其他插件噪声影响（必须给差分证据） |
| FAIL | effect 非零；服务残留；runtime.fibers 残留；dispose 未 quiesce |
| NA | C-4 未到 ACTIVE（blocked；不得 PASS） |

**已知反例**：
- 已登记 effect 的 disposer 抛错：`_unload` 逐个 catch 并 `logger.error`，**不会**让 `getEffects()` 归零失败（因为 `_disposables.clear()` 已清空）——但资源可能没释放；C-7.1 的 PASS 不代表清理成功，必须同时看 disposer 错误日志（`fiber.ts:720-730`）。
- 裸 `setInterval` 泄漏在 `getEffects()` 里不留痕（X-2）。
- 服务 `provide` 的 disposer 会等 dependents 释放后再删 store（`reflect.ts:311-325`）；如果依赖方卡住，C-7.2 会超时，这是真实信号，不是噪声。

**证据锚点**：
- `REPO/vendor/cordis/src/fiber.ts:712-746`：`_unload()`；`:720` 逆序清空并 `Promise.all`；`:716-718` 等 dependents 释放。
- `REPO/vendor/cordis/src/fiber.ts:574-578`：`getEffects()`。
- `REPO/vendor/cordis/src/reflect.ts:311-325`：provide disposer 删 store、notify、等 dependents。
- `REPO/vendor/cordis/src/registry.ts:212-214`：`registry.size`。

**正面示例**（测试夹具）：

```ts
const before = snapshot(ctx)          // registry.size / reflect keys / hooks
const fiber = await ctx.plugin(entry)
await fiber.dispose()
await ctx.root.fiber.await()
assert.equal(fiber.getEffects().length, 0)
assert.deepEqual(keys(ctx.reflect.store), before.reflectKeys)
assert.equal(ctx.registry.size, before.registrySize)
```

> **rc3 有效（future-only 注）**：`ctx.root` 与 `await ctx.root.fiber.await()` 在 DSH `0.2.2-rc.3`（vendored cordis `4.1.0`）里仍然存在——`Context.root` / `Service.resolveConfig` 均未移除，本示例**不是 rc3 错误**。下一版（rc3 之后的 `v0.2.2-rc.2` 指南 `cordis-root-and-intercept-metadata`）才会改为 `ctx[Context.root]` / `resolveIntercept`；届时再迁移，现在不要提前改。

**建议分级**：DS-C 强制。这是"不破坏宿主"的唯一机械证据。

**边界说明**：C-7 的 PASS **不证明**"没有未登记资源泄漏"。报告必须写 `leakScope: registered-only`，不得把 C-7 PASS 宣传成"无泄漏"。

---

### C-8 重挂幂等、冷重装可重复

**要求（祈使句）**：`restart()` 必须可重复且不累积；`dispose()` 后重新 `ctx.plugin()` 必须再次 ACTIVE；两轮装载后的 `registry`/`reflect`/effect 快照必须一致。

**判定方式**：L3 重挂（DSC-08），复用 E 路 L3-1 / L3-3 / L3-5。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-8.1 | 连续 `restart()` 两次；每次 state 回 ACTIVE；effect 标签树深比较一致（归一化生成 id） | 漂移 → FAIL |
| C-8.2 | 重挂必须真的推进 revision/epoch；不得被 `internal/update` 监听者静默否决 | 未推进 → FAIL（X-12） |
| C-8.3 | `registry.delete(entry)` → 重新 `ctx.plugin(entry)`；两轮 after 快照一致 | 不一致 → FAIL |
| C-8.4 | `dispose()` → 重新 `ctx.plugin(entry)`；再次 ACTIVE | 失败 → FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | C-8.1～C-8.4 全部满足 |
| WARN | 标签含生成 id（归一化后一致）；revision/epoch 只能通过私有适配层观测；同进程冷重装无法重置 ESM 缓存 |
| FAIL | restart 抛错；非 ACTIVE；effect 数量增长；快照不一致；冷重装失败 |
| NA | C-4 未到 ACTIVE |

**已知反例**：
- 模块级 `Map` / `globalThis.__cache` 跨重挂累积（`REPO/docs/defensive-patterns/general.md:104-122`；`20/F` T8）。
- `update()` 走 `internal/update` waterfall，监听者可以 veto 重启（`fiber.ts:805-812`）；X-12 明确"只比 registry.size 会把'没重挂'看成'幂等'"。C-8.2 必须断言 revision/epoch 推进，不能只看 size。
- 同进程冷重装不会重置 ESM 模块缓存；真正的"跨进程干净"是 L3-4，不在 MVP。

**证据锚点**：
- `REPO/vendor/cordis/src/fiber.ts:768-774`：`restart()` 递增 `_revision` → `_refresh` → `await()`。
- `REPO/vendor/cordis/src/fiber.ts:783-819`：`update()` 与 veto；`:805-812` "a listener may veto the restart"。
- `REPO/vendor/cordis/src/fiber.ts:754-760`：`await()` 重抛启动错误。
- `REPO/vendor/cordis/src/registry.ts:258-267`：`delete()` 移除 runtime 并 dispose fiber。
- `REPO/docs/cordis-tutorial/06-composition-and-hmr.md:23-59`：HMR 的卸载→重装语义。

**正面示例**（测试夹具）：

```ts
const f1 = await ctx.plugin(entry)
const s1 = snapshot(ctx)
await f1.restart(); await f1.restart()
assert.deepEqual(normalize(snapshot(ctx)), normalize(s1))
await ctx.registry.delete(entry)
const f2 = await ctx.plugin(entry)
assert.deepEqual(normalize(snapshot(ctx)), normalize(s1))
```

**建议分级**：DS-C 强制。热重载/配置编辑是宿主的基本操作，重挂不幂等 = 基本不可用。

**边界说明**：C-8 不覆盖"换进程完全重挂"（L3-4）。同进程版本只能打"闭包/模块级状态残留"的一部分，打不到 ESM 单例污染；这一项在 L4 沙箱里以换进程方式提供，属 DS-R/收录侧。

---

### C-9 声明 vs 实测交叉校验

**要求（祈使句）**：静态声明必须与 L1 实测一致：声明 `provide` 的必须真实注册；声明 `inject` 的必须真实被读取；不得用声明冒充能力；实测多出的公开服务必须标 WARN。

**判定方式**：L1-5（DSC-09），复用 E 路 L1-5；静态侧复用 L0/L0.5 的导出与 AST。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-9.1 | 声明 provide ⊆ 实测（本 fiber 所有） | 缺一 → FAIL |
| C-9.2 | 实测公开服务 ⊆ 声明 provide | 多出 → WARN（可能是内部/命名空间服务） |
| C-9.3 | 声明 inject ⊆ 源码中 `ctx.<service>` 读集合 | 多声明 → WARN（会导致不必要的级联重启，T14） |
| C-9.4 | 工具/事件声明与实测（可选；完整版归 DS-R 的 R-4/R-7） | 不做 → 记 not-run |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | C-9.1 满足；C-9.2 无多出；C-9.3 无多声明 |
| WARN | C-9.2 多出；C-9.3 多声明；声明是动态的 |
| FAIL | 声明的 provide 未注册（C-5 同一证据）；声明了某个"能力"但实测完全没有 |
| NA | 没有任何声明 |

**已知反例**：
- 假 `provide` 声明（C-5 构造反例）。
- 为了"启动顺序" inject 一个并不真正依赖的服务：该服务每次热替换都会带着插件一起重挂（`REPO/vendor/cordis/src/fiber.ts:617-628`；`20/F` T14）。
- 只声明 `inject` 却从不读该服务：运行没问题，但依赖变化会无谓重启；C-9.3 记 WARN。

**证据锚点**：
- `REPO/vendor/cordis/src/registry.ts:100-111`：`Plugin.Base` 的 `provide`/`inject` 字段。
- `REPO/vendor/cordis/src/reflect.ts:291-327`：provide 的真实注册与注销。
- `REPO/vendor/cordis/src/fiber.ts:617-628`：`_refresh()` 的 epoch 含 `impl.uid`，依赖替换会驱动重挂。
- `REPO/vendor/cordis/src/registry.ts:71-88`：`Inject.resolve` 的数组/对象/原型归一化。

**正面示例**：

```ts
export const name = 'greet'
export const inject = ['tools']       // 只在真正调用 ctx.tools 时声明
export const provide = ['greet']      // 并在 apply 里 ctx.provide('greet', ...)
```

**建议分级**：DS-C 强制。C-9 是"反造假核心"：没有它，作者可以写一份漂亮的声明而代码完全不兑现。

**边界说明**：C-9 只交叉"声明 vs 实测"，不判"声明是否合理"（能力必要性是 DS-R/人工评审）。多声明是 WARN 不是 FAIL，因为"多声明"不会让宿主坏，只会让重挂变多。

---

### C-10 无 import 期副作用（ADVISORY，不进强制判定）

**要求（祈使句）**：入口模块不应有 import 期副作用；不得有顶层 `await`；裸全局修改、定时器、watcher 应被 `ctx.effect()` 包裹。

**判定方式**：L0-7 AST（DSC-10），**仅 advisory**。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-10.1 | 入口模块（及入口的本地相对 `import` 闭包）中的顶层 `AwaitExpression` | 命中 → advisory WARN |
| C-10.2 | 同上：顶层 `process.on` / `process.env.X=` / 裸 `setInterval` / 立即 `void main()` | 命中 → advisory WARN |
| C-10.3 | 入口的本地相对 `import` 闭包（`./`、`../`，解析 `.js/.mjs/.cjs/.ts/.tsx/.jsx`） | 展开分析；入口/闭包 import 了包（非相对路径）或本地模块解析不到时，在 details 记 `C-10.3 not-run`（仅 coverage 说明，不改变 PASS/WARN） |
| C-10.4 | 入口/闭包顶层 fs 写操作（`writeFileSync`/`appendFileSync`/`mkdirSync`/`rmSync`/`unlinkSync` 等）或子进程调用（`execSync`/`execFileSync`/`spawnSync`/`execFile`/`spawn` 等） | 命中 → advisory WARN |

> **实现方式**：DSC-10 已从行首正则升级为真 AST（`acorn.parse`，vendor 到 `40-checker/vendor/acorn.mjs`，MIT）。只遍历入口模块及其**本地相对** `import` 闭包；函数体、箭头函数体、class 方法体里的调用不算，但顶层 `if`/`try`/循环体属于 import 期执行，照常判定。
>
> C-10.3 是 **coverage note**，不是 WARN 触发器：入口（或闭包内）import 包、或相对 import 解析不到时，在 details 里记一条 `C-10.3 not-run`；DSC-10 的 PASS/WARN 仍只由 C-10.1/C-10.2/C-10.4 是否命中决定。
>
> `acorn` 解析失败（例如源文件包含 acorn 不支持的 TypeScript 语法）时，DSC-10 记 `ERROR`/`not-run`，并在 details 给出文件与行号；不静默 PASS。
>
> C-10.4 只扫 fs **写**；只读 `openSync` 不算写。成员调用 `fs.writeFileSync(...)` 与裸调用 `writeFileSync(...)` 同等判定。

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | 无 C-10.1/C-10.2/C-10.4 命中；C-10.3 的 not-run 说明不改变结果 |
| WARN | 任一 C-10.1/C-10.2/C-10.4 命中 |
| ERROR | 入口/闭包 AST 解析失败（含 TS 语法）→ coverage=not-run |
| FAIL | **永不**。C-10 是 advisory，不产生 FAIL，不影响 exit code |
| NA | 没有扫描到任何源文件 |

**已知反例**：
- 旧实现用行首正则扫"顶层 await"，会在模板字符串里的 `await` 上假阳性：`REPO/packages/workflow/workflow-ptc/src/host.ts:27`（X-3）。AST 实现不再受模板字符串与注释干扰。
- 跨包副作用（`import 'some-package'` 后由包自己执行 `process.on`）仍不可判；记为 `C-10.3 not-run`，不冒充已分析。
- TypeScript 源码（类型注解、装饰器等）超出 acorn 语法范围；当前记 `ERROR`/`not-run`，这是已知边界，不当作 PASS。

**证据锚点**：
- `40-checker/vendor/acorn.mjs`：vendored acorn 8.19.0（MIT，见 `40-checker/vendor/LICENSE`）。
- `40-checker/src/declarations.mjs`：最小递归 walker、module-scope 过滤、本地 import 闭包解析与 C-10.3 coverage note。
- `REPO/docs/defensive-patterns/package-surface.md:227-233`："Package modules do not await at module scope… a module-scope wait makes every importer's evaluation wait."
- `REPO/scripts/verify-no-top-level-await.ts:29`：机械 gate 的实现；`REPO/scripts/run-gates.ts:423` 注册为 `no-top-level-await`。
- `REPO/docs/defensive-patterns/general.md:104-122`：模块级共享状态的 owner 规则。

**正面示例**：

```ts
// 顶层只做类型/常量/纯函数
export const name = 'greet'
export function apply(ctx: Context) {
  // 一切副作用从 apply / Service.init 开始
}
```

**建议分级**：**DS-C advisory**（不计入强制判定）。依硬约束 §3.7"高误报项一律 advisory"与 20/B 的 X-3，C-10 不得作为 FAIL 条件。这是对 `03` 草案的**有意收窄**，见 §6.1。

**边界说明**：C-10 的 WARN 不是"插件不合格"，只是"有 import 期副作用线索，建议人工看"。若未来 AST 误报率降到可接受，可重新评估是否升级；当前不升级。

---

### C-11 权限面声明（capabilities）

**要求（祈使句）**：插件必须在 `dsh.capabilities` 中声明其使用的宿主能力；声明必须来自本标准闭集；高风险能力不得漏报；不得启用 `@deepseek-ai/dsh-plugin-manager/tools`，不得调用 `installBundle`/`removeBundle` 而不声明 `plugin:install`；对外 `@Remote` 方法必须声明 `remote:expose`；挂 `ctx.webServer`/`ctx.webhookRuntime` 必须声明 `network:ingress`。

**判定方式**：L0 静态（DSC-11）：manifest + AST；L1 只用 `reflect.store` 做交叉证据。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-11.1 | `dsh.capabilities` 是字符串数组，每个 ID 在 §8.1 判定闭集或保留表内 | 非法 ID → FAIL；保留 ID → 接受（不 FAIL），C-11.5 记 NA；字段缺失 → WARN |
| C-11.2 | **字段存在时**，高信号触发必须申报（映射见下表） | 字段存在且漏报 → FAIL；字段缺失 → 不评估，C-11 整体 WARN（过渡期） |
| C-11.3 | bundle patch 不得启用 `@deepseek-ai/dsh-plugin-manager/tools` | 启用 → FAIL |
| C-11.4 | 源码/配置中 `danger-full-access` 的 AST 字符串字面量；注释、等值比较、文档字符串不算（见下） | 真实授权/命令上下文或未知上下文 → WARN |
| C-11.5 | 声明了但静态未观测到对应触发 | WARN（**不等于未使用/过度声明**：`node:fs` 的读/写调用已作为观测证据；动态调用仍不在触发面内）。**NA（not-run）**：无源码、该能力无静态观测面（`credentials:provider`）、**保留 ID**（本版不判定）、或**扫描截断**（`coverage=partial`，reason 记 `source scan truncated …`）——截断是覆盖缺口，不是过度声明 |

**C-11.2 触发映射**：

| 静态触发 | 必须声明的 capability |
|---|---|
| `ctx.webServer` / `ctx.webhookRuntime` | `network:ingress` |
| `installBundle` / `removeBundle` | `plugin:install` |
| `ctx.llm` 注册 adapter | `llm:adapter` |
| `ctx.systemPrompt` 注册 section/context/投影 | `system-prompt:write` |
| `ctx.tools.register` | `tools:register` |
| `@Remote` / `@RemoteScope` | `remote:expose` |
| `ctx.credentials.listRecords` | `credentials:list` |
| `ctx.sessions` / `sessionQuery` | `sessions:read` |
| `ctx.shell` / `ctx.bash` | `shell` |
| `ctx.subprocess` | `subprocess` |
| `ctx.fs` 读方法 / 写方法 | `fs:read` / `fs:write` |
| `ctx.web` / 裸 `fetch` | `network:egress` |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | C-11.1 字段存在/合法；C-11.2 无漏报；C-11.3 未启用；C-11.4 无命中 |
| WARN | 字段缺失（过渡期，C-11.2 不评估）；C-11.4 命中；C-11.5 静态未观测（不等于过度声明）；触发信号不确定（动态调用）。C-11.5 的「无源码/无观测面/扫描截断」记 NA，不记 WARN |
| ERROR | AST 解析失败导致 C-11.4 not-run（coverage=not-run，不冒充 PASS） |
| FAIL | 非法 ID；字段存在但 C-11.2 漏报；C-11.3 启用 |
| NA | `dsh.kind` 非 plugin/bundle |

**已知反例**：
- `@deepseek-ai/dsh-plugin-manager/tools` 在 base 层默认 `disabled: true`（`REPO/packages/bundle/base/cordis.patch.yml:16-18`）；某个 bundle 把它打开，等于把"模型自安装"能力放给所有会话。
- `plugin_manager` 工具的风险提示自己写着 "installed Host code runs outside the workspace sandbox"（`REPO/packages/boot/plugin-manager/src/tools.ts:109`）；`installBundle` 在 `plugin-manager/src/index.ts:969`，工具入口在 `tools.ts:150`。
- `@Remote` 未标注的方法"cannot be called"，但标注了就进入 Client 面（`REPO/docs/api-gateway.md:9`）；一个插件可能无意中把内部方法暴露出去。

**证据锚点**：
- `REPO/packages/util/package-manifest/src/types.ts:32-41`：`dsh` 字段当前只有 `manifestVersion`/`bundle`/`profile`/`client`，**没有** `capabilities`/`labels`/`upstream`。本条款字段是标准扩展，宿主本 commit 不读取。
- `REPO/packages/boot/plugin-manager/src/tools.ts:109,150`：安装工具的风险与 `installBundle` 调用。
- `REPO/packages/boot/plugin-manager/src/index.ts:969`：`installBundle` 的公开方法。
- `REPO/packages/bundle/base/cordis.patch.yml:16-18`：`tool-plugin-manager` 默认 disabled。
- `REPO/docs/api-gateway.md:9`：`@Remote`/`@RemoteScope` 的暴露语义。
- `REPO/packages/boot/app-boot/src/profile-plugins.ts:65-83`：只读 manifest 的天然检查点。

**正面示例**：

```json
{
  "dsh": {
    "manifestVersion": 1,
    "kind": "plugin",
    "capabilities": ["tools:register", "network:egress"]
  }
}
```

**建议分级**：DS-C 强制（C-11.1～C-11.3）；C-11.4/C-11.5 为 WARN；C-11.5 在无源码、该能力无静态观测面、**或扫描截断**时记 NA（not-run），不记 WARN（扫描截断时 `coverage=partial`，与 `60-权限与标注规范.md:101` 一致）。

**边界说明**：`dsh.capabilities` **不是权限门控**。宿主不读它，也没有运行时沙箱；它只是"装载期声明 + UI 披露"。一个插件完全可以声明 `[]` 然后裸 `import node:fs`，C-11 抓不到。这是 D5 的已知边界，必须在徽章文案里写明"非安全审计"。

**C-11.4 字符串边界（与 C-12.4 同一判定）**：只统计**值恰为** `danger-full-access` 的 AST 字符串字面量（含模板字符串的静态部分）。注释不在 AST 里；等值比较（`==`/`===`/`!=`/`!==` 任一侧）不算。`console.log/info/warn/error/debug` 的参数、对象属性 key 为 `desc`/`description`/`message`/`reason`/`help`/`label`/`title`/`comment` 的字符串视为**文档字符串**，不 WARN。`.set(...)`/`.resolve(...)` 参数、对象属性 key 为 `mode`/`sandboxPolicy`/`sandbox_permissions`（含嵌套对象）、spawn 类调用的 args 数组元素、`case "danger-full-access":` 以及未知上下文视为真实授权/命令字符串，WARN（未知默认保守）。AST 解析失败时 C-11.4 记 `ERROR`/`not-run`，不冒充 PASS。

**过渡规则**：本 commit 宿主不读 `dsh.capabilities`，因此字段**缺失**只记 WARN，C-11.2 不评估；一旦字段存在，漏报高信号能力就是 FAIL。这条规则防止把"标准刚发布"变成"所有存量插件立刻不合格"，同时保证已声明者不能造假。宿主采纳该字段后，过渡规则失效。

---

### C-12 凭据与全局 seam 的声明一致性

**要求（祈使句）**：不得绕过 `ctx.credentials` 直接读取 `$DSH_HOME/.credentials.yaml` 或 `credentials-local` 内部 API；凭据 provider 必须声明 `credentials:provider`；不得在未声明时注册全局 `shell`/`credentials`/`sandboxPolicy`/`sandbox`/`deepseekAccount` provider；调用 `listRecords()` 必须声明 `credentials:list`。

**判定方式**：L0 静态（DSC-12）：manifest + AST（字符串字面量上下文判定）。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-12.1 | 源码出现 `.credentials.yaml`、`CREDENTIALS_FILENAME`、`credentials-local` 内部导入、`$DSH_HOME` 凭据路径字面量 | 命中且无 `credentials:provider` → FAIL；有声明 → PASS |
| C-12.2 | 调用 `ctx.credentials.listRecords()`：字段存在但未声明 `credentials:list` → FAIL；字段缺失 → WARN（过渡） | 见左 |
| C-12.3 | 检测到全局 seam provider 注册（`shell`/`credentials`/`sandboxPolicy`/`sandbox`/`deepseekAccount`）但声明不明确 | WARN（advisory；AST 归属判断可能误报） |
| C-12.4 | 源码/配置中出现值为 `danger-full-access` / `--add-dir` 的 AST 字符串字面量；注释、等值比较、文档字符串不算（见下） | 真实授权/命令上下文或未知上下文 → WARN |
| C-12.5 | 动态 `import()` / 字符串拼接绕过 | 不可判 → not-run |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | C-12.1 无命中或已声明 provider；C-12.2 已声明；C-12.3 无命中；C-12.4 无命中 |
| WARN | 字段缺失时 C-12.2 命中；C-12.3 命中但归属不明；C-12.4 命中真实授权/命令或未知上下文；C-12.5 not-run |
| ERROR | AST 解析失败导致 C-12.4 not-run（coverage=not-run，不冒充 PASS） |
| FAIL | C-12.1 命中且未声明；字段存在时 C-12.2 命中且未声明 |
| NA | 没有凭据/全局 shell 面 |

**已知反例**：
- `credentials-local` 的文件名常量是 `.credentials.yaml`（`REPO/packages/credentials/credentials-local/src/index.ts:61`），写入用 `0o600`/`0o700`（`:687,703`）；直接读这个文件就是绕过 `ctx.credentials`。
- `listRecords()` 是 API 一等方法（`REPO/packages/credentials/credentials/src/index.ts:234`）；它能列出全部 record，调用方没有额外鉴权（`20/C` B3）。
- 全局 shell provider 的替换会改变所有随后 bash/pwsh 调用的执行器（`20/C` A6/A7）；这是"换一个 provider 改变整个产品"的根级 seam。

**证据锚点**：
- `REPO/packages/credentials/credentials-local/src/index.ts:2-6`：文件头声明 backing file 路径；`:61` `CREDENTIALS_FILENAME`；`:687,703` 权限模式。
- `REPO/packages/credentials/credentials/src/index.ts:234`：`listRecords()` 抽象方法。
- `REPO/packages/boot/plugin-manager/src/tools.ts:109`：安装的 Host code 在 workspace sandbox 之外。
- `REPO/packages/fs/fs-sandbox/src/index.ts:10-16`："NOT a kernel boundary"。

**正面示例**：

```ts
export function apply(ctx: Context) {
  // 通过 seam 读，不直接读 backing file
  const token = await ctx.credentials.resolve('acme/api-key')
}
```

**建议分级**：DS-C 强制（C-12.1/C-12.2）；C-12.3/C-12.4 为 WARN。

**边界说明**：C-12 是**声明一致性检查，不是安全审计**。它不判"插件有没有把 token 发出去"，也不判"provider 实现是否安全"；这些超出 D5。过渡规则：`dsh.capabilities` 字段缺失时，C-12.2 只记 WARN；字段存在时，`listRecords()` 未声明 `credentials:list` 才是 FAIL。C-12.1 的直接读 backing file 不享受过渡：它本身就是明确绕过。

**C-12.4 文档字符串 / 命令字符串边界**（C-11.4 使用同一判定，只查 `danger-full-access`）：只统计**值恰为** `danger-full-access` 或 `--add-dir` 的 AST 字符串字面量（含模板字符串静态部分）。注释与 AST 无关地自动排除；等值比较（`==`/`===`/`!=`/`!==` 任一侧）不算。以下视为**文档字符串**，不 WARN：`console.log/info/warn/error/debug` 的参数；对象属性 key 为 `desc`/`description`/`message`/`reason`/`help`/`label`/`title`/`comment` 的值；只用于日志拼接的模板字符串。以下视为**真实授权/命令字符串**，WARN：`.set(...)`/`.resolve(...)` 的参数；对象属性 key 为 `mode`/`sandboxPolicy`/`sandbox_permissions`（含嵌套对象）；spawn 类调用（`spawn`/`spawnSync`/`exec`/`execSync`/`execFile`/`execFileSync`）的 args 数组元素；`case "danger-full-access":`。**未知上下文默认 WARN**，保持保守。AST 解析失败（如 TS 语法）时 C-12.4 记 `ERROR`/`not-run`。

---

### C-13 高风险类别强制标注

**要求（祈使句）**：高风险类别插件必须携带对应的 `dsh.labels`；标签是声明，不得当作官方/安全背书；镜像/分叉必须声明 `dsh.upstream` 并带 `mirror` 标签；不得使用 `official`/`verified`/`certified`/`secure`/`audited` 等误导标签。

**判定方式**：L0 静态（DSC-13）：manifest 字段 + 触发能力映射。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-13.1 | `dsh.labels` 是字符串数组，每个 ID 在 §8.2 闭集内 | 非法 → FAIL |
| C-13.2 | 触发 → 标签：`system-prompt:write` → `prompt-modification`；`llm:adapter` + `network:egress` → `third-party-model-provider`；`network:ingress` → `remote-access`；`dsh.upstream` → `mirror` | 漏标 → FAIL |
| C-13.3 | `dsh.upstream` 是合法 https URL，且不等于自身 repository | 缺失/自指 → FAIL |
| C-13.4 | 出现 `official`/`verified`/`certified`/`secure`/`audited` | FAIL |
| C-13.5 | `red-team` 标签只能自声明；带此标签时应有 `dsh.usageScope`（T4 字段） | 缺失 → WARN；未声明红队 → 不可判（not-run） |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | `dsh.capabilities` 存在且无触发，或所有触发都有标签；C-13.3 满足；C-13.4 无命中 |
| WARN | `dsh.capabilities` 缺失 → C-13.2 不可评估（只查 C-13.4）；触发信号不确定；`red-team` 缺 `usageScope`；镜像只能从描述文本怀疑 |
| FAIL | 触发能力已声明但缺标签；非法/禁用语标签；`dsh.upstream` 缺失或自指 |
| NA | `dsh.kind` 非 plugin/bundle |

**已知反例**：
- `dsh-purge` 四个并行主体（13,357 / 3,441 / 2,701 / 541★），其中一个明确是"全量镜像"（`10-输入/生态调研报告.md:36-59`）——镜像不标注，用户无从分辨。
- `Ebony-Vinyl/dsh-our-free-model` 51,596★，免登录免 Key 的第三方 provider（`10-输入/生态调研报告.md:36`）——第三方端点/留存/是否改系统提示都必须披露。
- 红队类：`SeaOf0/dsh-redteam-model` 797★、`howmp/dsh-pentest` 615★（`20/C` §4(c)）——与正当插件同构，禁不住，只能标注。
- `tabbit-browser/dsh-plugin` 已 404 仍被收录（`10-输入/生态调研报告.md:264`）——生命周期/状态字段缺失的典型（R-11/R-12 管）。

**证据锚点**：
- `REPO/packages/util/package-manifest/src/types.ts:32-41`：`dsh` 没有 `labels`/`upstream` 字段；本条款字段是标准扩展。
- `10-输入/生态调研报告.md:36-59,171,264`：生态实例与数字（唯一来源）。
- `20-研究底稿/C-安全基线与权限面.md:242-252`：三类分法与标注建议。
- `REPO/packages/util/plugin-market-index/src/index.ts:295-296`：format-1 会"ignore and drop"未定义成员；新增字段不会破坏旧解析器，但旧解析器读不到。

**正面示例**：

```json
{
  "dsh": {
    "manifestVersion": 1,
    "kind": "plugin",
    "capabilities": ["llm:adapter", "network:egress"],
    "labels": ["third-party-model-provider"],
    "disclosure": {
      "endpoints": ["https://api.example.com"],
      "retention": "none",
      "systemPrompt": "unchanged"
    }
  }
}
```

**建议分级**：DS-C 强制（C-13.1～C-13.4）；C-13.5 为 WARN。

**边界说明**：C-13 **只判"声明一致性"**。一个插件可以既不上报 `system-prompt:write` 也不打 `prompt-modification`，C-13 完全看不到；检测隐藏行为超出 D5，属人工评审/市场复核。报告必须写 `labelScope: declared-only`。**过渡规则**：`dsh.capabilities` 缺失时，C-13.2 的触发映射不可评估，C-13 整体只记 WARN（仍会查 C-13.4 的禁用语标签）；`dsh.capabilities` 存在但漏标，才 FAIL。正面示例里的 `dsh.disclosure` 子字段名由 T4 定稿，DS-C 不据此判 FAIL；DS-C 只判 `labels` 与 `upstream` 的存在/一致性。

---

> **C-14 的位置**：C-14（运行证据：plugin L1 / bundle G0–G3）是 `--scope entry` 专属，定义见 `31-DSH-ENTRY入门规范.md` §2.1–2.2；它不是 DS-C package/listing 门的一部分，故不在本节展开。

> **scope 说明**：C-15～C-22 在默认 `--scope ds-c` 下仍会运行，但只在 `security` 块里、标 `security.scope=advisory`，FAIL 封顶 WARN，不改变 DS-C 结论；下面写的 PASS/WARN/FAIL 是 `--scope security` 下的判定。

### C-15 生命周期脚本

> **判定**：**blocking**（仅 `--scope security`；默认 DS-C 不评估）。安装脚本在 `dsh plugin add` 时以当前用户权限执行，安装完成后不可见；manifest 命令串与**被引用的包内脚本正文**是安装前可见面，但运行时取码与依赖的 install 脚本仍不可见。

**要求（祈使句）**：`preinstall` / `install` / `postinstall` / `prepare` 的命令串与被引用的包内脚本必须可枚举、可审计（`prepack`/`postpack` 不在 v1 扫描面）；命令串或脚本正文不得出现"下载后立即执行"、解码执行、内联 shell/PowerShell、引用缺失脚本，也不得引用 `$HOME`/`~`/`/etc` 或读取凭据路径。

**判定方式**：L0 静态（DSC-15）。读 `package.json#scripts` 的命令串，并**定点读被引用的包内脚本正文**（1.6.1 起；`node <file>` / `sh <file>` / 直接路径 / `npm run <name>` 递归，最多两层）：只读包内普通文件、不跟符号链接、不越包根、上限 **512 KB**；二进制、超限、符号链接、不可读记 `WARN`（not inspected），不冒充已读。正文按危险形态匹配（`curl|wget` 接 shell、`base64 -d`、`eval`/`new Function`/`vm`、`node -e`/`sh -c`、读凭据路径、下载后执行、动态 `child_process`）；`prepare` 命中降为 WARN。**不执行** `npm install` / `npm pack`，checker 侧 `npm pack` 已带 `--ignore-scripts`。`prepack`/`postpack` 不在 v1 扫描面。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-15.1 | 危险命令形态：`curl`/`wget` 管道到 shell、`base64 -d`、`node -e`、`sh -c`、`powershell -enc`、`$HOME`/`~`/`/etc`；或被引用脚本正文出现下载后执行、解码执行、`eval`/`vm`、读凭据路径、动态 `child_process` | 命中 → FAIL；`prepare` → WARN |
| C-15.2 | 普通生命周期脚本：`node scripts/x.mjs`、`tsc`、`vitest`、`npm run build`；正文已读且未见危险形态仍记 WARN；无脚本 → PASS | 命中 → WARN（`prepare` 同） |
| C-15.3 | 引用缺失脚本：`node <file>` 目标不存在、`npm run <name>` 未定义 | 命中 → FAIL；`prepare` → WARN |
| C-15.4 | `prepack`/`postpack`（打包期脚本） | v1 不扫 → `not-run` 说明 |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | 没有生命周期脚本 |
| WARN | 普通安装期脚本（C-15.2，正文干净也仍是 WARN）；`prepare` 的危险/缺失形态；被引用脚本超 512 KB/二进制/符号链接/不可读（未能审计）；profile 的 `allowBuilds` 不可见 |
| FAIL | C-15.1 或 C-15.3 命中（含被引用脚本正文的危险形态） |
| NA | `dsh.kind` 非 plugin/bundle |

**误报与抑制**：构建脚本很普遍（审计样本 31/53 个包有脚本），故只对**命令串或已读脚本文本里的危险形态** FAIL；`node scripts/build.mjs` 即使正文干净也只 WARN（安装期脚本本身仍是风险）。`prepare` 是 scaffold 为 git 安装保留的常见字段，危险/缺失形态只 WARN，不 FAIL。白名单不适用：正文按已知危险形态匹配，未知/运行时取码看不到，普通脚本只能 WARN，不能升 PASS。Windows 下 `cmd /c` 与 `powershell -Command` 同等处理。

**与 DSC 的对应**：`DSC-15`。它扩展现有 `C-3.4`：C-3.4 只看"有脚本无声明"，C-15 读命令串与包内被引用脚本正文并按形态判 FAIL/WARN，且只在 security scope 可 FAIL。

**边界说明**：1.6.1 起 v1 读命令串 + 包内被引用脚本正文（≤512 KB、不跟符号链接、不越包根），**不执行**；脚本仍可在运行时从网络取代码，或经依赖的 install 脚本执行；超限/二进制/符号链接跳过只记 WARN。`prepack`/`postpack`（打包期）不在 v1 扫描面。C-15 的 PASS 只表示"本次命令串与已读正文内没有已见危险形态"，不是"安装安全"。

---

### C-16 动态执行

> **判定**：**blocking**（仅 `--scope security`）。动态执行默认不可审计；本项没有"声明后放行"的例外，非 vendor 命中即 FAIL；1.6.6 起 vendor 文件内的 `eval`/`new Function` 仅降为 WARN（不是 PASS，可用 `--strict-vendor` 恢复 FAIL）。

**要求（祈使句）**：服务端入口闭包不得使用 `eval`、`new Function`（空参探针除外）、`vm.runIn*`/`vm.Script`/`vm.createContext`、`module._compile`、`process.binding`；不得直接 `require`/`import` `child_process` 绕过 `ctx.subprocess`。

**判定方式**：L0 静态（DSC-16）。只扫服务端入口及其**本地相对 import 闭包**；`lib/client.js`/浏览器 bundle 不扫（避免把打包器探针当插件行为）；`new Function("")` / `new Function()` 空参探针豁免。1.6.1 对裸 `child_process` 只 WARN；1.6.2 起对静态可判为下载后执行/解码执行的危险命令升级 FAIL；1.6.6 起 vendor/第三方文件内的 `eval`/`new Function` 降为 WARN（detail 记 `C-16.1` + `vendor: true` + 理由），默认可用 `--strict-vendor`（别名 `--no-vendor-exempt`）恢复 FAIL。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-16.1 | 闭包内 `eval`、`new Function(非空)`、`module._compile`、`process.binding`；1.6.2 起含静态可判的危险子进程命令（下载后执行/解码执行）；1.6.6 起 vendor 文件内的 `eval`/`new Function` 单独降级 | 非 vendor → FAIL；vendor → WARN（`vendor: true`；`--strict-vendor` 恢复 FAIL） |
| C-16.2 | 闭包内 `vm.runIn*`、`vm.Script`、`vm.createContext` | 命中 → FAIL |
| C-16.3 | 闭包内 `require('child_process')` / `import('node:child_process')` 等裸子进程入口；空参 `new Function("")`/`lib/client.js` 豁免 | 裸入口 → WARN（1.6.1 危险子进程命令也只 WARN；1.6.2 起改判 C-16.1 FAIL）；空参/client → 不计负 |
| C-16.4 | 字符串拼接 `import()`、`Function(atob(...))`、运行时从远程取代码；package import/解析失败 | 静态不可判 → `not-run`/`partial`，不冒充 PASS |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | C-16.1/C-16.2/C-16.3 均无命中；C-16.4 的 package import/unresolved 只写 `coverage: partial`，不改 PASS |
| WARN | 仅 C-16.3 命中（裸 `child_process`）；或仅 vendor 文件内的 C-16.1 命中（不进入 `security.blocking`；`--strict-vendor` 下仍 FAIL） |
| FAIL | 非 vendor 文件的 C-16.1 或 C-16.2 任一命中；或任意文件的 base64 混淆执行（vendor 也不豁免） |
| NA | 没有可扫描的源文件；或 `dsh.kind` 非 plugin/bundle |

**误报与抑制**：打包进 bundle 的 ajv 会用 `new Function("")` 探 `allowsEval`（`dsh-budget/lib/client.js`、`dsh-library/lib/index.js`），空参豁免；浏览器 bundle 不扫。Babel/TS 解析失败记 `ERROR`/`not-run`，不判 PASS；AST 只认真实调用，不把 `typeof eval` 当执行。

**vendor/第三方源码（1.6.6，`DSC-16` 专用）**：只有 `eval()` / `new Function()` 可降级，且文件须满足下列之一：路径含 `node_modules/`、`vendor/`、`third_party/`、`deps/`；有打包器 `//#region node_modules/...` 区间（按命中行所在区间判定库名）；有 `schemastery`/`ajv`/`lodash` 库指纹或库形文件名；或同目录（`src/` 外）有上述强证据。`package.json` 的 `dependencies`/`devDependencies` 含该库只作佐证，**单独不足以豁免**（防止以声明依赖换取 `eval` 放行）。`vm.*`、`module._compile`、`process.binding`、危险子进程命令、base64+eval 一律不豁免；降级结果为 WARN（永不 PASS），`--strict-vendor` 恢复 FAIL。该识别是启发式、可伪造，不构成"第三方代码安全"的证明。

**与 DSC 的对应**：`DSC-16`。扩展 `C-11.2` 触发表：C-11.2 只认 `ctx.*`、裸 `fetch` 等文本，不认 `eval`/`vm`/node 内置模块；C-10.4 只覆盖 import 期 fs/子进程，不覆盖 eval。动态执行没有声明放行（checker 不读取 `code:dynamic` 之类的字段）。

**边界说明**：动态执行的判定高度依赖静态形态；`globalThis['ev'+'al']`、`require('vm')`、WebAssembly、远程代码加载都可绕过。PASS 不是"没有动态执行"，只是"本次闭包内没有可见形态"。

---

### C-17 敏感文件

> **判定**：**blocking**（仅 `--scope security`）。系统凭据文件没有宿主 seam 可授权，读到即越权；`.env` 与 env 枚举只到 WARN。

**要求（祈使句）**：不得直接读取 `~/.ssh`、`id_rsa`、`~/.aws`、`.npmrc`、`.netrc`、`.pypi`、`tokens*`、`$DSH_HOME`/`~/.dsh` 下的 credentials 文件或 `credentials-local` 内部实现；凭据必须经 `ctx.credentials.resolve()` / `credentialRef()` 读取；不得为外发而枚举 `process.env`。

**判定方式**：L0 静态（DSC-17）。对**读/列 API** 的实参回溯：`readFile*`、`openSync`、`readJson`、`createReadStream`、`readdir*`；字符串字面量、正则字面量（如 `/^\.?credentials/`）、`path.join` 常量折叠、模板静态段、同函数赋值链可判；`os.homedir()` / `process.env.HOME|USERPROFILE|DSH_HOME|XDG_CONFIG_HOME` 派生路径按同函数污点近似（派生路径 + 同函数出站可 FAIL）。`Object.keys(process.env)` 单独枚举不作判定（PASS）；只有与同闭包出站组合才记 WARN。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-17.1 | 读 API 实参指向 `~/.ssh`（整个目录）、`id_rsa`、`.aws`（整个目录）、`.npmrc`、`.netrc`、`.pypi`、`tokens*`、`$DSH_HOME`/`~/.dsh` credentials | 命中 → FAIL；经 `ctx.credentials.resolve` → 豁免 |
| C-17.2 | `.env`（排除 `.example`/`.sample`/`.template`/`.dist`）；`Object.keys(process.env)` + 同闭包出站 | 命中 → WARN |
| C-17.3 | AST 解析失败 | `coverage: partial` + ERROR/not-run，不冒充 PASS |
| C-17.4 | `readdir`/`readdirSync` + 前缀/正则（如 `/^\.?credentials/`），或完全动态路径 | 列举 `$DSH_HOME`/`~/.dsh` → WARN；同函数有凭据样名字/派生路径 + 网络出站 → FAIL；完全动态（运行时拼接/编码/子进程读）→ `not-run`/partial |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | 无 C-17.1/C-17.2 命中；凭据读取都经 seam |
| WARN | 仅 C-17.2 命中 |
| FAIL | C-17.1 命中 |
| NA | 没有可扫描源文件 |

**误报与抑制**：`.env` 是合法开发形态（审计样本 `dsh-github-bot/src` 5 文件、`dsh-clinic/lib` 4 文件），故只 WARN，不 FAIL；`.env.example`/`.sample`/`.template`/`.dist` 不计。`~/.aws/config`（非凭据）与 `~/.ssh/known_hosts`（公钥）按路径仍可能 FAIL，需人工确认——v1 不做逐文件语义区分。`readdir` + 正则前缀匹配（如 `/^\.?credentials/`）**部分可判**：S1b 起，同函数内有凭据样名字/`$DSH_HOME` 派生路径并伴随网络出站会 FAIL（s2 样本已 FAIL），仅有目录列举或弱线索只 WARN；完全动态（运行时拼接、编码、子进程读）仍看不到，靠人工/运行时。不得因"没看到字面量"判 PASS，也不得把 WARN 写成"未读"。**证据只记文件:行与 API，不复制被读内容或 token 值。**

**与 DSC 的对应**：`DSC-17`。扩展现有 `C-12.1`：C-12.1 只看四个字面量（多处需靠近 `readFile`，±6 行窗口启发），可被 `readdir` + 前缀匹配绕过；C-17 改为读/列 API 实参回溯 + 同函数赋值链/出站污点，`readdir` 类样本可判一部分，但仍是静态。

**边界说明**：同用户进程本来就能读这些文件；C-17 判的是"插件代码有没有直接读"，不是"文件是否真的不可读"。完全动态路径、运行时拼接、编码/子进程读仍可绕过；`readdir` 的 FAIL 需要"凭据样线索 + 同函数出站"同时成立，单独列举只 WARN。经 `ctx.credentials` 读也可能把值外发，C-18 只能看调网点，不能证明数据流。

---

### C-18 外联端点

> **判定**：**advisory**（仅 `--scope security`）。端点是披露问题；C-18 自身**永不 FAIL**，报告标 `advisory: true`，不改变 verdict；未声明 `network:egress` 仍由 `C-11.2` 判 FAIL。

**要求（祈使句）**：出站调用必须使用常量 allowlist、https、精确 hostname；不得把模型/用户输入直接拼进 URL；不得访问 webhook/paste/ngrok/onion 等高风险端点；第三方端点必须披露到 `dsh.disclosure.endpoints`。

**判定方式**：L0 静态（DSC-18）。只解析**调网点**：`fetch`、`http(s).request`、`axios`、`WebSocket`、`ctx.web` 的首个参数；不扫包内所有 URL 字面量（审计校准：45 包 388 个 URL 字面量/39 host，扫字面量噪声过大）。`disclosure.endpoints` 存在时做差集；字段缺失不 WARN（未声明不等于已披露）。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-18.1 | 解析调网点实参：常量 URL、`new URL`、模板静态段、变量回溯一层；可疑形态（非 https、userinfo、公网裸 IP、webhook/paste/ngrok/onion、punycode） | 解析不到 → `not-run`；可疑 → WARN（loopback/`localhost`/`127.0.0.1` 豁免） |
| C-18.2 | `dsh.disclosure.endpoints` 存在时，调网点 host 不在披露列表 | 差集非空 → WARN |
| C-18.3 | 运行时拼 URL、重定向、DNS、`Function` 生成的 URL | 静态不可判 → `not-run` |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | 无调网点；或全部 https + 非可疑 + 已披露 |
| WARN | C-18.1/C-18.2 命中；`not-run` 的不可判项单独列出 |
| FAIL | **永不**（未声明 `network:egress` 由 C-11.2 判 FAIL） |
| NA | 没有出站面 |

**误报与抑制**：只扫调网点，不扫 README/测试/错误信息里的 URL；本地 bridge、OAuth 回调的 loopback 豁免。私网地址（10/8、192.168/16）当前不判可疑（本地模型/代理常用），只登记 norm/host。`dsh.disclosure` 字段名仍由 T4 定稿，字段缺失不判负。重定向目标、DNS 解析、运行时拼接都不可见；`not-run` 不等于安全。

**与 DSC 的对应**：`DSC-18`。扩展 `C-11.2`（能力声明）与 `C-12.7`（披露形状）：C-11.2 判"有没有声明 egress"，C-18 判"声明之后端点长什么样"。

**边界说明**：宿主没有出口策略，`web_fetch` 可访问私网；allowlist 只是插件自律。C-18 的 PASS 不能证明"没有外发"，只能证明"可见调网点都在 allowlist/披露内"。

---

### C-19 混淆与二进制

> **判定**：**advisory**（仅 `--scope security`）。编码与二进制本身无善恶；本项只登记不可审计的产物，**不判恶、不 FAIL**。

**要求（祈使句）**：不得以混淆文本、大块 base64、高熵 blob 或无可读源码的二进制作为唯一发布形态；wasm/native 依赖必须附源码、构建方法与 sha256；压缩产物应带 sourcemap 或可复现构建说明。

**判定方式**：L0（DSC-19）。`inventoryFiles()` 遍历包内所有扩展名（不读内容），对 `.wasm`/`.node`/`.so`/`.dll`/`.dylib`/`.exe` 记 sha256；文本按行/块统计。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-19.1 | 文本不透明线索：单行 >20,000 字符且无 sourcemap；连续 base64 ≥4,000 字符；熵 >7.5 且文件 >4 KB | 命中 → WARN |
| C-19.2 | 二进制清单：`.wasm`/`.node`/`.so`/`.dll`/`.dylib`/`.exe`，逐文件 sha256 | 命中 → WARN，`details` 记路径/大小/sha256 |
| C-19.3 | 文件清单被预算截断 | `coverage: partial` + `not-run` 说明，不冒充已扫完 |
| C-19.4 | 只登记，不判恶；有源码/sha256/构建说明只降低人工成本，不改 PASS/FAIL | 永不 FAIL |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | 无 C-19.1～C-19.3 命中 |
| WARN | 任一命中；`details` 列出路径、类型、sha256、原因 |
| FAIL | **永不** |
| NA | 没有可清点文件 |

**误报与抑制**：合法 wasm/native 很常见（sqlite、图像编解码、native addon），minified bundle 也常见；阈值取审计样本的 5 倍余量（45 包 466 文件，最长行 3,818；≥500 的 base64 段为 0）。只登记不判恶；`details` 不得渲染成"恶意"。不反编译、不执行、不联网查 hash。

**与 DSC 的对应**：`DSC-19`。新增项；C-10 只看 import 期副作用，不扫二进制/编码。它与 C-22 互补：C-19 给"不可读"，C-22 给"来源字段是否存在"。

**边界说明**：混淆可以合法（代码保护），也可以恶意（隐藏载荷）；静态只量形态。PASS 不代表"没有隐藏代码"，WARN 也不代表"有恶意"。

---

### C-20 提示词注入

> **判定**：**advisory**（仅 `--scope security`）。语义不可判、误报高；v1 只给静态线索，运行时 hook 留 v2。**永不 FAIL**。

**要求（祈使句）**：外部文本（工具结果、网页、文件、会话）不得直接进入 system prompt 或拼成指令；必须用固定 untrusted 前缀 + 每次随机边界 + JSON 转义包裹；工具名/描述必须静态可审查，不得由外部内容生成。

**判定方式**：L0 静态 AST（DSC-20 v1）。只看 `ctx.systemPrompt.section/context/variable` 的实参；外部性判断限于函数参数、`fetch`/`request`/工具结果（同函数 2 跳内）；指令样字面量按 AST 上下文判定；`rules/guards/defend/detect/policy/patterns` 路径文件整文件跳过。**不检测包裹是否真的存在**，那需要运行时 hook。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-20.1 | `systemPrompt` 注册/投影的实参来自函数参数、`fetch`、工具返回值或外部文件（同函数 2 跳内） | 命中 → WARN |
| C-20.2 | 指令样字面量：`ignore/disregard/forget ... previous/prior/above`、`you are now`、`do not tell/reveal`、`system prompt`、`act as` | 指令上下文 → WARN；`.test`/`.match`/`.includes`/`RegExp`/文档字符串 → 排除 |
| C-20.3 | 外部文本是否有 untrusted 前缀/随机边界/JSON 转义 | v1 **不判** → `not-run`（需人工/v2 运行时） |
| C-20.4 | 运行时 system 段装配 hook | 未安装 → `not-run` |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | 无 C-20.1/C-20.2 命中；报告标 `static-only`（包裹与运行时未判） |
| WARN | C-20.1 或 C-20.2 命中 |
| FAIL | **永不** |
| NA | 没有可扫描源文件 |

**误报与抑制**：`dsh-defend/lib/index.js:381` 正是防护规则，纯文本扫会误杀防御插件；因此按路径整文件跳过规则/防护文件，并在 AST 里排除 `.test`/`.match`/`.includes`/`RegExp`/文档字符串。v1 的指令模式只覆盖英文；中文指令（"忽略之前""你现在是"）当前不判，不能因此认为没有注入。外部文本"无边界"本身不等于注入，v1 不做该判定。

**与 DSC 的对应**：`DSC-20`。与 `C-13.2` 互补：C-13.2 只判"有没有打 `prompt-modification` 标签"，不检测注入内容；C-20 看内容线索，但仍不判"是否真的污染了模型"。

**边界说明**：提示词注入本质是语义问题；静态分不清"检测规则"与"注入指令"，也看不到运行时拼接。真正的边界是运行时把外部输出标 untrusted、禁止进入指令层，并由宿主执行。C-20 的 PASS 不能证明"没有注入"。

---

### C-21 供应链

> **判定**：**WARN-only，不阻断（security scope 强制项；listing scope 同）**。C-21 在任何 scope 都**永不 FAIL**，只报 WARN；因此不会进 `security.blocking[]` 或 `buckets.blocking`，也不会产生 exit 1。security scope 下 C-21 未跑（check 级 not-run/NA/ERROR）会让 `security.status=incomplete`；名字/scope/元数据线索只报 WARN。来源可固定性由 C-3 判。

**要求（祈使句）**：依赖名不得与种子包近似到可冒充；scope 不得用同形字（`@deepseek-aii`、`0`/`O`、`l`/`1`）；非 registry 依赖必须钉 commit（C-3.3）；依赖带 install 脚本或传递依赖无 registry 元数据时必须 `not-run`，不得假绿；无 lockfile 不判缺陷，lockfile 一致性不在 v1 判定内。

**判定方式**：L0 静态（DSC-21）。读 `dependencies`/`devDependencies`/`peerDependencies`/`optionalDependencies`；与 19 个种子名（`@deepseek-ai/dsh-*`、`cordis`、`@cordisjs/core`、`schemastery`、`cosmokit`）做编辑距离；transitive 元数据与 lockfile 一致性不在 v1 判定内。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-21.1 | 依赖名与种子名编辑距离 ≤1 且非精确匹配 | WARN（listing 下仍 WARN，不单独 FAIL） |
| C-21.2 | scope 同形字/近似 scope（`@deepseek-aii`、`@deepseek-ai-*`、`0`/`O`、`l`/`1`） | listing/package 均 WARN（不 FAIL；只有未跑才 incomplete） |
| C-21.3 | 依赖带 install 脚本，或传递依赖无 registry 元数据 | `not-run`（列出依赖），不判 PASS |
| C-21.4 | lockfile 一致性（v1 不判；后续增强） | 记 `not-run`，不计负 |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | 无近似/同形字 |
| WARN | C-21.1、C-21.2（listing/package 均 WARN） |
| FAIL | **永不**（未固定来源走 C-3.3；名字线索只 WARN） |
| NA | 没有依赖；或没有可读 manifest |

**误报与抑制**：`schemastery`/`cosmokit` 是真实包，白名单；git/本地 flow 的名字可能合法，只 WARN。4/53 个包无 lockfile，故无 lockfile 不判缺陷；lockfile 一致性不在 v1。编辑距离 ≤1 会有合法近似名，故只 WARN；同形字/近似 scope 也只 WARN，不 FAIL。传递依赖必须联网查 registry，离线时 `not-run`。

**与 DSC 的对应**：`DSC-21`。扩展 `C-3.3`/`C-3.4`：C-3 判"来源是否钉住、可否追溯"，C-21 判"名字是否冒充、元数据是否足以判断"。

**边界说明**：typosquat 是概率信号；注册者可以合法使用近似名。C-21 的 PASS 不能证明"依赖未被投毒"；lockfile 一致也不证明 tarball 未被替换（那是 C-22）。

---

### C-22 来源与完整性

> **判定**：**advisory**（仅 `--scope security`）。v1 只读 manifest 里的来源/完整性字段是否存在；**不验签、不比对 digest、不联网**。永不 FAIL、永不进强制。

**要求（祈使句）**：发布应带 `dist.integrity`、`dsh.attestation` 或 `dsh.signature` 字段，并用文档说明其含义；不得把"字段存在"写成"来源可信/已验签"。

**判定方式**：L0（DSC-22）。读 `package.json#dist.integrity` 与 `dsh.attestation`/`dsh.signature`；不执行签名验证，不请求 registry。

| 子项 | 检查 | 结果 |
|---|---|---|
| C-22.1 | `dist.integrity` 存在且非空 | 存在 → `integrity-only`（PASS + 说明） |
| C-22.2 | `dsh.attestation` / `dsh.signature` 字段存在 | 存在 → `self-declared`（PASS + 说明） |
| C-22.3 | attestation subject digest 与 tarball 比对、Ed25519 验签、`--registry-metadata` | v1 `not-run`；v2 才接 |
| C-22.4 | 没有任何来源/完整性输入 | `NA`/`not-run`，不得写成 PASS |

**三值期望**：

| 值 | 条件 |
|---|---|
| PASS | C-22.1 或 C-22.2 命中，且 details 明确写 `integrity-only`/`self-declared`（advisory，不改变 verdict） |
| WARN | **v1 不产生**（没有验签/比对，就没有"失败"证据） |
| FAIL | **永不** |
| NA | 没有任何来源/完整性字段 |

**误报与抑制**：字段存在是自证，不是验证；`dist.integrity` 只说明发布者写了摘要，不说明 tarball 与 registry 一致。签名公钥自证、attestation 未验签都只能记 `self-declared`。无输入时 `not-run` 必须显式列出，不得静默当通过。

**与 DSC 的对应**：`DSC-22`。C-3 判"来源是否可固定/可追溯"，C-22 判"来源/完整性字段是否出现"；两者都不判"可信"。

**边界说明**：来源与完整性是流程证据，不是代码审计。签名有效只证明"某把钥匙签了这段摘要"；钥匙是否属于发布者、构建是否可复现、代码是否有恶意，都不在本项内。v1 的 PASS 含量很低，报告必须同时展示 `self-declared` 限定词。

---

## 三、CLI 检查项与覆盖门

### 3.1 检查项目录

| 检查项 | 条款 | 层 | 是否在 E 路 MVP 13 项 | 复用资产 | 说明 |
|---|---|---|---|---|---|
| `DSC-01` | C-1 | L0 | 是（L0-1 + L0-3） | `packageProblems` 在 `scripts/verify-package-meta.ts:115`，是 monorepo 脚本、不在可发布包里；T2 需剥一层或自写 JSON/AST + `parseMarketIndex` 的包名正则 | 入口存在性、导出形态 |
| `DSC-02` | C-2 | L0 | 是（L0-2） | `evaluatePluginCompatibility(manifest, {}, runtimeVersion)` | `runtimeVersion` 是参数，天然版本矩阵 |
| `DSC-03` | C-3 | L0 | **否**（L0-4/L0-5） | `parseInstallSpec`、`parseMarketIndex` | 只判 listing profile；package profile 为 NA + 供应链 advisory |
| `DSC-04` | C-4 | L1 | 是（L1-1） | `new Context()` + `ctx.plugin()` | 需夹具；缺失依赖 → blocked/WARN |
| `DSC-05` | C-5 | L1 | 是（L1-3） | `ctx.reflect.store` 差分 | 服务归属 |
| `DSC-06` | C-6 | L0+L1 | 是（L1-4；L0 私有面扫描不在 MVP） | `fiber.getEffects()` + AST | C-6.3 advisory |
| `DSC-07` | C-7 | L2 | 是（L2-1/2/4） | `getEffects()`/`reflect.store`/`registry.size` | 基线差分 |
| `DSC-08` | C-8 | L3 | 是（L3-1/3/5） | `restart()`/`registry.delete()` | 必须断言 revision 推进 |
| `DSC-09` | C-9 | L1 | 是（L1-5） | 静态声明 + L1 实测 | 反造假核心 |
| `DSC-10` | C-10 | L0 | **否**（L0-7 不在 MVP 13 项） | AST | **advisory**，不影响 exit |
| `DSC-11` | C-11 | L0 | **否** | 自写 manifest schema + AST | 新字段；建议 T2 phase 1.5 补 |
| `DSC-12` | C-12 | L0 | **否** | 自写 AST/文本扫描 | 新字段；建议 T2 phase 1.5 补 |
| `DSC-13` | C-13 | L0 | **否** | 自写 manifest schema | 新字段；建议 T2 phase 1.5 补 |
| `DSC-15` | C-15 | L0 | 否（security scope） | `package.json#scripts` + 包内被引用脚本正文（≤512 KB） | 生命周期脚本；blocking |
| `DSC-16` | C-16 | L0 | 否（security scope） | AST 闭包 + 子进程入口 | 动态执行；blocking |
| `DSC-17` | C-17 | L0 | 否（security scope） | AST 实参回溯 + 同函数赋值链/出站 + 敏感路径表 | 敏感文件；blocking |
| `DSC-18` | C-18 | L0 | 否（security scope） | 调网点 AST + 披露差集 | 外联端点；advisory，永不 FAIL |
| `DSC-19` | C-19 | L0 | 否（security scope） | `inventoryFiles()` + 行/块统计 | 混淆/二进制；advisory |
| `DSC-20` | C-20 | L0 | 否（security scope） | AST + FLOW 运行时 hook（v2） | 提示词注入；advisory |
| `DSC-21` | C-21 | L0 | 否（security scope） | 依赖名/scope + registry 元数据 | 供应链；**WARN-only、不阻断**（强制项，未跑才 incomplete） |
| `DSC-22` | C-22 | L0 | 否（security scope） | 读 `dist.integrity`/`dsh.attestation`/`dsh.signature` 字段 | 来源/完整性；advisory，v1 不验签 |

### 3.2 MVP 覆盖缺口（必须写进 T2 报告）

E 路的 MVP 13 项（L0-1/2/3 + L1-1/3/4/5 + L2-1/2/4 + L3-1/3/5）只覆盖 C-1、C-2、C-4、C-5、C-6、C-7、C-8、C-9 共 **8 条**；MVP 未实现 C-3、C-10、C-11、C-12、C-13（C-10 是 advisory；C-3 在 package profile 本就 NA，只在 listing profile 需要）。

因此 T2 必须提供五种结论模式：

- `--scope mvp`：只对已实现的 13 个检查项出结论；报告 `level: null`、`subset: "MVP-13"`；exit 0/1；**不得**输出 "DS-C PASS"。
- `--claim ds-c --profile package`（默认，作者本地）：要求 11 条强制（C-1、C-2、C-4～C-9、C-11～C-13）全部 `coverage: full`；C-3 为 `NA`（不是 not-run）；缺任何一条 → `status: incomplete`、exit 2。
- `--claim ds-c --profile listing`（市场门禁）：要求 12 条强制（上述 11 条 + C-3）全部 `coverage: full`；缺任何一条 → `status: incomplete`、exit 2；**不得**发徽章。
- `--claim ds-c --profile both`：等价于 listing（12 条），并要求 package 侧可执行项也跑过。
- `--scope security`（独立，opt-in，1.6.0+）：`checks[]` 变成 22 项，评估 C-15～C-22。其中 C-15/C-16/C-17 可 FAIL；C-21 是强制项（未跑 → `incomplete`），但 **WARN-only、永不阻断（listing 同）**；C-18/C-19/C-20/C-22 为 advisory。security 的结论写 `security.status`，**不并入** DS-C 的 11/12 条强制，也不得把 `security.status=pass` 写成 `DS-C PASS` 或"安全"。

这是"禁止跳过即通过"的具体落点：NA 是**显式不适用**（C-3 在 package 模式），not-run 是**该跑没跑**；两者不能混。security scope 未启用时，8 项在 `security` 块里以 advisory 模式运行（FAIL 封顶 WARN），`security.scope=advisory`，不进 `checks[]`，不改变 DS-C 结论。

### 3.3 报告 schema（最小契约）

```json
{
  "schema": "dsh-conformance/1",
  "standard": { "id": "DS-C", "version": "1.0.0" },
  "anchor": {
    "repo": "deepseek-ai/deepseek-harness",
    "commit": "38a6a5c965aa99ab525161efb7cc5cf1fe62fced",
    "scanner": "dsh-plugin-verify@0.1.0",
    "dsh": "0.2.2-rc.3",
    "cordis": "4.1.0"
  },
  "subject": { "mode": "package", "profile": "package", "kind": "plugin", "name": "@acme/dsh-greet", "version": "1.2.3" },
  "checks": [
    {
      "id": "DSC-01",
      "clause": "C-1",
      "layer": "L0",
      "result": "PASS",
      "coverage": "full",
      "notRun": [],
      "reason": "",
      "evidence": ["package.json:1", "lib/index.js:1"]
    }
  ],
  "coverage": { "mandatory": 11, "full": 7, "partial": 0, "notRun": 3, "na": 1, "error": 0 },
  "conclusion": { "level": null, "status": "incomplete", "profile": "package", "exitCode": 2, "reason": "DSC-11/12/13 not implemented" }
}
```

### 3.4 exit code 契约

| exit | 含义 | 触发条件 |
|---|---|---|
| 0 | 评估完成，无 FAIL | 该 profile 对应的强制项全部 `coverage: full`（或显式 NA），结果为 PASS/WARN；或 `--scope mvp` 无 FAIL |
| 1 | 评估完成，有 FAIL | 任一强制项 `FAIL` |
| 2 | 检查器失效/评估不完整 | 任一强制项 `ERROR`/`not-run`/`partial`；夹具不可用；内部崩溃 |
| 3 | 调用错误 | 参数/路径/配置无效，检查未开始 |

**禁止**：把 `ERROR`/`not-run` 映射成 0；把 `NA` 当成 `PASS`；把"该 profile 不适用的 NA"当成"跳过的 not-run"；把插件自身装载失败（FAIL）映射成 2。规则：**检查器基础设施失败 = 2；插件缺陷 = 1**。

---

## 四、C 路 A1–A14 的覆盖映射

`03` §三(a) 列了 14 条"可机械验证的安全基线"。本节不新增条款编号，把它们合并进 C-1/C-2/C-3/C-11/C-12，映射如下：

| C 路 | 内容 | 本文件落点 | 判定强度 |
|---|---|---|---|
| A1 | 安装 spec 可解析且来源固定 | C-3.1 | FAIL |
| A2 | registry 形态必须有版本约束 | C-3.2（listing）/ C-2.1 | FAIL |
| A3 | `engines.dsh` 或 dsh peer 且被满足 | C-2.1/C-2.2 | FAIL |
| A4 | `dsh.bundle.patch` 文件在包内 | C-1.4 | FAIL |
| A5 | 不读凭据 backing file | C-12.1 | FAIL |
| A6 | 全局 shell provider 须声明 | C-12.3 | WARN |
| A7 | 全局 credentials/sandbox provider 须声明 | C-12.3 | WARN |
| A8 | 构建脚本白名单对齐 | C-3.4 | WARN/FAIL（profile 可见时） |
| A9 | patch 不引用包外路径 | C-1.4 | FAIL |
| A10 | 不调用 `installBundle` 除非声明 | C-11.2/C-11.3 | FAIL |
| A11 | 不装载 `plugin-manager/tools` | C-11.3 | FAIL |
| A12 | 依赖树的非 registry 源固定可追溯 | C-3.3 | FAIL/WARN |
| A13 | 对外 `@Remote` 须声明 | C-11.2 | FAIL |
| A14 | `webServer` 路由须声明认证 | C-11.2 | FAIL |

**结论**：14 条全部有落点；A6/A7/A8 因 AST 归属/profile 可见性只能到 WARN，不伪装成 FAIL。

---

## 五、Q3 / Q4 / Q5 建议答案

### 5.1 Q3：谁托管 DS-C 自动检查、谁托管 DS-R 共识评审

**建议**：

- **DS-C 检查器**：放在一个中立开源仓库（例如 `dsh-community/dsh-plugin-verify`），Apache-2.0/MIT 双许可；GitHub Action 自动跑，不需要任何授权。维护者 3 人轮换，任期 6 个月，决策留痕（issue + PR + 发布记录）。任何人可 fork 并自跑；fork 的结果只要锚一致，应与官方结果一致。
- **DS-R 工作组**：3–5 人，任期 6 个月，最多连任一次；成员来自至少 3 个不同组织/项目；决策 2/3 通过；会议记录与投票公开；工作组可被 fork（异议者可以带着条款与证据另立，不垄断"DS-R"字样，但必须改名以免混淆）。
- **DS-G**：个人/小团队署名登记，3 个月复审；不设投票门槛，但允许任何人提异议。
- **分权红线**：任何组织不得同时"写标准 + 发徽章 + 运营唯一市场"（`03` §五.7）。DS-C 工具、DS-R 工作组、市场收录门禁必须是三个可分离的主体；至少有一个可替代实现。
- **利益披露**：维护者若同时是某插件作者/市场运营者，必须在评审页披露；涉及自家插件时回避投票。

### 5.2 Q4：monorepo 多包如何评级

**建议：按包评，不按仓库评。**

- **评级单元** = `package name + version + package path`，不是 repo，也不是 star。
- 徽章文案 = `@acme/dsh-greet@1.2.3 · DS-C · <commit> · <date>`；不出现"某某仓库是 DS-C"。
- monorepo 根目录不评级；根 `package.json` 只作为构建上下文。若根本身也是可安装包，按它自己的包评。
- 兄弟包不继承等级：A 包 DS-C 不代表 B 包 DS-C；B 包 FAIL 不连坐 A 包。
- 共享代码包（不单独安装）→ `NA`，理由 "internal package, not installable"。
- 市场条目必须能定位到包：format-1 的 `repository.directory` 已支持（`REPO/packages/util/plugin-market-index/src/index.ts:187-192`）；T3 的 schema 补丁应要求 monorepo 条目带 `directory`。
- 同一版本号在不同包路径下是不同主体；五元锚里加 `packagePath` 作为 `subject` 的子字段。

### 5.3 Q5：skill-only / 主题 / 客户端形态怎么处理

**建议：`dsh.kind` 标注 + 输出"不适用"，不强行套三级。**

- `dsh.kind` 闭集见 §1.2；只在 manifest 里声明，不由目录站猜。
- 只有 `kind: plugin` 能拿完整 DS-C；`kind: bundle` 只拿"打包/声明"部分（C-1/C-3/C-11/C-13），C-4～C-9 输出 `NA`，徽章写 `DS-C (bundle, packaging-only)`，不得简写为 `DS-C`。
- `client`（`dsh.client`）、`skill`、`theme`、`mcp-config`、`preset` → `NA`，理由写清楚；不设"准 DS-C"。
- 纯 skill 包若同时是一个可装载插件（有入口、`apply` 注册 skills），按 `plugin` 评；若只有 `SKILL.md`/资源，按 `skill` 输出 NA。
- `kind` 缺失 → 按 §1.2 推断；推断不确定 → `NA + manual`，不强行评级。
- 目录站可以把 NA 的条目单独展示，但不能给它们挂 DS-C 徽章。

---

## 六、与 00/01/03 的差异与修订建议

> 以下只提建议，**未修改** `00`/`01`/`02`/`03`（硬约束 §3.5）。

### 6.1 C-10 降为 advisory（必须改）

`03` §二把 C-10"无 import 期副作用"放在 DS-C 强制表里；但硬约束 §3.7 明确"高误报项（危险 AST 形状）一律 advisory"，`20/B` 的 X-3 也说明跨文件副作用不可判。两者冲突。本文件按硬约束处理：**C-10 保留编号，但不作为 FAIL 条件，不影响 exit code**。建议 `03` 在 C-10 行加注"advisory，依 §3.7 与 X-3 降级"。

### 6.2 C-6 收窄为"注册面归属"，不是"绝对无泄漏"

`03` 的 C-6 写"注册走 `ctx.effect()`/`ctx.on()`，返回 disposer"，容易被读成"能证明没有泄漏"。按 X-2，未登记的资源不可见。本文件把 C-6 收窄为：不得写私有注册面；已声明的 provide/on 必须在 effect 树中；资源分配器静态线索只到 WARN。建议 `03` 同步加一句"不证明未登记资源无泄漏"。

### 6.3 C-3 移到 listing 模式，并并入供应链

`03` 把 C-3 写成"安装 spec 可解析且来源固定"，但没有说明 package 模式拿不到 install spec。本文件拆成 C-3.1～C-3.5，并明确 **package 模式 C-3 为 NA**（只附 C-3.3/C-3.4 advisory），listing 模式才判 PASS/FAIL。建议 `03` 的 C-3 行补"listing 模式判定；package 模式 NA"。

### 6.4 C-11/C-12/C-13 的字段是标准扩展，不是宿主现状

`03` §三(c) 直接写 `dsh.labels`，但 `packages/util/package-manifest/src/types.ts:32-41` 没有这个字段，宿主也不读。本文件保留字段，但把"缺失"定为 WARN（过渡期），并在徽章文案里写明"声明，不是门控"。建议 `03` 的 §三(a)/(c) 加"字段为本标准提案，宿主采纳前只读不门控"。

### 6.5 MVP 13 项覆盖不了 13 条 DS-C

`03` §四说"MVP 只需 13 项"，但那是**检查项**，不是**条款**。本文件 §3.2 算出 MVP 只覆盖 8 条条款。建议 `03` 在 §四补一句"MVP 13 项不得声称完成 DS-C；package profile 需 11 条强制全覆盖，listing profile 需 12 条（含 C-3），C-10 作为 advisory 另跑"。

### 6.6 版本轴措辞

`03` §七.1 写"Cordis 4.0.0-rc.11"；`01` §十一只说"宿主仍在 rc"，没有区分三个轴。rc3 实测：根包 `0.2.2-rc.3`、vendored manifest `4.1.0`、`vendor/README.md:15` 记录的上游基线 `4.0.0-rc.11`。三个轴不是同一个东西。建议 `01`/`03` 改用 §1.5 的三轴写法，避免把上游基线当现值。

### 6.7 两处研究底稿的行号/资产漂移

- `03` §四说 `parseMarketIndex` 是"191 行规则"；rc3 的 `packages/util/plugin-market-index/src/index.ts` 是 334 行，`parseMarketIndex` 在 `:303-320`。建议改为"334 行模块，核心校验 :303-320"。
- `20/E` 提到的 `packageProblems()` 在 `scripts/verify-package-meta.ts:115`，是 monorepo 的 `verify-*` 脚本，不在 `packages/` 的可发布包里。T2 不能直接 import；需要剥一层（复制规则）或自写等价校验。建议 E 路把该资产标为"B 档：剥一层"。

### 6.8 C-1 的 license 只到 WARN

`03` 的 C-1 写"含 name/version/license/入口"，但宿主 manifest 类型不要求 license（`types.ts:8-29`）。把 license 设成 FAIL 会误杀大量长尾。本文件把它降到 WARN；建议 `03` 同步。

---

## 七、附录 A · 证据核验表

> 行号为 rc3 commit（`38a6a5c9`）实测：2026-11-14 按 rc3 重取了已知漂移的锚（`plugin-manager/src/index.ts`、`tools.ts`、`cordis-host-runner/sandbox.ts`、`package-manifest/src/types.ts`、`vendor/README.md`、`install-spec.ts`），并顺带复取了 `plugin-market-index/src/index.ts` 的行号；其余条目在 rc3 上抽检仍命中、未逐条复跑。标"输入"的生态数字来自 `10-输入/生态调研报告.md`，按 §8 不重新联网核验。

| # | 锚点 | 证明什么 | 状态 |
|---|---|---|---|
| 1 | `REPO/packages/util/package-manifest/src/types.ts:8-29` | manifest 必填 name/version；dsh 字段范围 | 已核验 |
| 2 | `REPO/packages/util/package-manifest/src/types.ts:32-41` | **没有** capabilities/labels/upstream | 已核验（缺失） |
| 3 | `REPO/packages/util/plugin-market-index/src/index.ts:29,271-292,303-320` | 包名/条目/索引校验 | 已核验 |
| 4 | `REPO/packages/util/plugin-market-index/src/index.ts:194-220,243-256` | source/engines/精确 SemVer | 已核验 |
| 5 | `REPO/packages/util/plugin-market-index/src/index.ts:295` | 未定义成员被 ignore/drop | 已核验 |
| 6 | `REPO/packages/boot/app-boot/src/plugin-compatibility.ts:55-74,87-102` | 版本兼容裁决 | 已核验 |
| 7 | 同上 `:62` | 无 peer 声明即 `return {}` | 已核验 |
| 8 | `REPO/packages/boot/plugin-manager/src/install-spec.ts:70-93` | `parseInstallSpec` | 已核验 |
| 9 | `REPO/packages/boot/plugin-manager/src/build-approval.ts:63-83` | `blockedBuildNames`/`pendingBuilds` | 已核验 |
| 10 | `REPO/apps/cli/src/plugin.ts:92-98` | args 原样转 pnpm | 已核验 |
| 11 | `REPO/vendor/cordis/src/fiber.ts:147-154` | FiberState 六态；const enum | 已核验 |
| 12 | `REPO/vendor/cordis/src/fiber.ts:421-567` | effect 契约/逆序释放 | 已核验 |
| 13 | `REPO/vendor/cordis/src/fiber.ts:574-578` | `getEffects()` | 已核验 |
| 14 | `REPO/vendor/cordis/src/fiber.ts:603-646` | `_checkImpl`/`_refresh`/`_setEpoch` | 已核验 |
| 15 | `REPO/vendor/cordis/src/fiber.ts:693-701` | 启动异常置 FAILED，不冒泡 | 已核验 |
| 16 | `REPO/vendor/cordis/src/fiber.ts:712-746` | `_unload`/并发 disposer | 已核验 |
| 17 | `REPO/vendor/cordis/src/fiber.ts:754-774` | `await()`/`restart()` | 已核验 |
| 18 | `REPO/vendor/cordis/src/fiber.ts:783-819` | `update()`/veto | 已核验 |
| 19 | `REPO/vendor/cordis/src/reflect.ts:152,163-180` | 无 inject 的错误语义 | 已核验 |
| 20 | `REPO/vendor/cordis/src/reflect.ts:291-327` | `provide()`/disposer | 已核验 |
| 21 | `REPO/vendor/cordis/src/registry.ts:100-111` | `Plugin.Base` 的 provide/inject | 已核验 |
| 22 | `REPO/vendor/cordis/src/registry.ts:316-336` | `ctx.plugin()`/Inject.resolve | 已核验 |
| 23 | `REPO/vendor/cordis/src/registry.ts:258-267` | `delete()` | 已核验 |
| 24 | `REPO/vendor/cordis/src/events.ts:203-206,246-261,263-270` | emit/waterfall/on 的 effect | 已核验 |
| 25 | `REPO/vendor/cordis/src/service.ts:42-57` | Service 构造器注册 | 已核验 |
| 26 | `REPO/vendor/cordis/src/context.ts:121-125` | `isolate` | 已核验 |
| 27 | `REPO/packages/core/tools/src/index.ts:69,162-171` | 重名/作用域限制错误 | 已核验 |
| 28 | `REPO/packages/core/tools/src/events.ts:10-13,32-36` | signal 契约 | 已核验 |
| 29 | `REPO/packages/core/tools/src/batch.ts:50-88` | `executeToolBatch` | 已核验 |
| 30 | `REPO/packages/llm/llm/src/index.ts:367-391,408-417` | per-listener 容错/adapter effect | 已核验 |
| 31 | `REPO/packages/core/system-prompt/src/index.ts:589-609` | `refreshContext` 复用 assembly | 已核验 |
| 32 | `REPO/packages/boot/app-boot/src/index.ts:1074` | PENDING 缺失服务审计 | 已核验 |
| 33 | `REPO/packages/boot/hmr/README.md:49,113` | 替换失败停旧插件 | 已核验 |
| 34 | `REPO/packages/boot/app-boot/README.md:138` | group 的 isolate realm | 已核验 |
| 35 | `REPO/packages/bundle/web-app/presets/standard.patch.yml:50,71,88` | 三个 group 隔离域 | 已核验 |
| 36 | `REPO/packages/preset/agent-preset-registry/src/mount.ts:213` | preset 服务泄漏硬失败 | 已核验 |
| 37 | `REPO/packages/credentials/credentials-local/src/index.ts:61,687,703` | backing file/权限 | 已核验 |
| 38 | `REPO/packages/credentials/credentials/src/index.ts:234` | `listRecords()` | 已核验 |
| 39 | `REPO/packages/boot/plugin-manager/src/tools.ts:109,150` | sandbox 之外/installBundle | 已核验 |
| 40 | `REPO/packages/boot/plugin-manager/src/index.ts:969` | `installBundle` | 已核验 |
| 41 | `REPO/packages/bundle/base/cordis.patch.yml:16-18` | plugin-manager/tools 默认 disabled | 已核验 |
| 42 | `REPO/docs/api-gateway.md:9` | `@Remote` 暴露语义 | 已核验 |
| 43 | `REPO/packages/fs/fs-sandbox/src/index.ts:10-16` | NOT a kernel boundary | 已核验 |
| 44 | `REPO/packages/extensions/cordis-host-runner/src/sandbox.ts:7` | is not containment | 已核验 |
| 45 | `REPO/docs/defensive-patterns/package-surface.md:7-20,227-233` | Loader 导出形态/顶层 await | 已核验 |
| 46 | `REPO/docs/cordis-tutorial/02-lifecycle-and-effects.md:9-27,84-94` | effect/清理顺序 | 已核验 |
| 47 | `REPO/docs/cordis-tutorial/03-services.md:52-72` | inject 与 PENDING | 已核验 |
| 48 | `REPO/docs/cordis-tutorial/04-events.md:12-21,138` | 事件声明/waterfall next | 已核验 |
| 49 | `REPO/docs/cordis-tutorial/05-config.md:34-36,51,70-95` | Config/默认值/volatile | 已核验 |
| 50 | `REPO/docs/cordis-tutorial/06-composition-and-hmr.md:23-59,61-63` | HMR/PENDING 诊断 | 已核验 |
| 51 | `REPO/docs/cordis-primer.md:19-35` | dispatch mode/waterfall 语义 | 已核验 |
| 52 | `REPO/scripts/verify-no-top-level-await.ts:29` | AST gate | 已核验 |
| 53 | `REPO/AGENTS.md:133,136,140` | 注册即 effect/waterfall/缝三层 | 已核验 |
| 54 | `REPO/docs/capability-seams.md:733,741,743,748` | shell/fs/subagents/jobs 缝 | 已核验 |
| 55 | `REPO/packages/core/agent-loop/README.md:164` | KV cache 前缀 | 已核验 |
| 56 | `REPO/docs/tool-catalog.md:8` | schema 不可静态知 | 已核验 |
| 57 | `REPO/packages/boot/app-boot/src/config-schema/projector.ts:124-134` | volatile containment | 已核验 |
| 58 | `REPO/packages/core/agent-loop/src/index.ts:292,296` | inject/volatile 模范 | 已核验 |
| 59 | `10-输入/生态调研报告.md:36-59,91,171,264` | 生态实例/数字 | 输入（未重抓） |
| 60 | `20/B` §X-1～X-12 | 12 项判不了 | 输入（研究结论） |

---

## 八、附录 B · 字段与词汇

### 8.1 `dsh.capabilities` 最小闭集（15 项判定 + 16 项保留）

| ID | 触发信号（静态可判） | 说明 |
|---|---|---|
| `fs:read` | `ctx.fs` 读方法（`readText`/`streamText`/`readBytes`/`readByteRange`/`listDir`/`stat`/`lstat`）；直接 `node:fs` 读调用仅作 C-11.5 观测证据 | 读文件（含绕过 `ctx.fs` 的直接 `node:fs`） |
| `fs:write` | `ctx.fs` 写方法（`writeText`/`editText`/`patchText`/`deleteFile`/`moveFile`）；直接 `node:fs` 写调用仅作 C-11.5 观测证据 | 写文件（含绕过 `ctx.fs` 的直接 `node:fs`） |
| `shell` | `ctx.shell`/`ctx.bash` | 执行 shell |
| `subprocess` | `ctx.subprocess` | 子进程/PTY |
| `network:egress` | `ctx.web`/裸 `fetch` | 出站网络 |
| `network:ingress` | `ctx.webServer`/`ctx.webhookRuntime` | 入站路由/webhook |
| `credentials:read` | `ctx.credentials.resolve` | 读单个凭据 |
| `credentials:list` | `ctx.credentials.listRecords` | 枚举全部凭据 |
| `credentials:provider` | 实现 credentials seam / 读 backing file | 凭据提供方 |
| `llm:adapter` | `ctx.llm` 注册 adapter | 模型 adapter |
| `sessions:read` | `ctx.sessions`/`sessionQuery` | 读会话内容 |
| `system-prompt:write` | `ctx.systemPrompt` 注册 section/context/投影 | 改系统提示 |
| `tools:register` | `ctx.tools.register` | 注册工具 |
| `remote:expose` | `@Remote`/`@RemoteScope` | 对外 Remote 方法 |
| `plugin:install` | `ctx.pluginManager.installBundle/removeBundle` | 自安装/卸载插件 |

**保留 ID（本版不参与判定，允许声明）**：以下 ID 在 DSH 0.2.2-rc.3 宿主里有对应 seam，但本版的静态触发映射 / FAIL 策略未定。C-11.1 **接受**保留 ID（不记非法），C-11.5 对它们记 **NA（not-run）** 而不是 WARN；C-11.2 的 FAIL 面**不扩大**——保留 ID 不能替代任何判定闭集里的 ID（例如声明 `computer:control` 不等于声明 `shell`）。保留表的增删是标准的破坏性变更；把某项升入判定闭集，必须同时补 C-11.2 触发映射、观测面与测试。

| 保留 ID | rc3 宿主 seam（`super(ctx, '<name>')`） | 说明 |
|---|---|---|
| `mcp:client` | `mcpManager`（客户端侧） | MCP 客户端连接 |
| `mcp:manage` | `mcpManager`（注册/管理） | 管理 MCP server 配置 |
| `mcp:resources` | `mcpResources` | MCP 资源访问 |
| `browser` | `browserUse`（粗粒度保留名） | 浏览器自动化 |
| `browser:control` | `browserUse` | 浏览器控制（细化名） |
| `computer:control` | `computerUse`、`cuaAccess` | 桌面 / computer-use 控制 |
| `ssh:connect` | `ssh` | SSH 连接 |
| `terminal:control` | `terminals`、`webTerminals`、`terminalController` | 终端控制 |
| `sandbox:override` | `sandbox`、`sandboxPolicy` | 放宽 / 改写沙箱策略 |
| `approval:override` | `approval` | 审批 / 放行覆盖 |
| `authorization:delegate` | `authorization` | 授权委托 |
| `remote-access:use` | `remoteAccess` | 宿主远程访问 |
| `session-log:egress` | `sessionLogDeepSeek` | 会话日志外发 |
| `webhook:rule` | Webhook 规则面 | 保留（原有） |
| `theme:ui` | 主题 / UI 面 | 保留（原有） |
| `client:ui` | Client UI 面 | 保留（原有） |

### 8.2 `dsh.labels` 最小闭集（5 项）

| ID | 含义 | 触发 |
|---|---|---|
| `prompt-modification` | 破限/提示注入/改系统提示 | `system-prompt:write` |
| `red-team` | 红队/安全研究 | 仅自声明；无机械触发 |
| `third-party-model-provider` | 免费 Key/第三方模型 provider | `llm:adapter` + `network:egress` |
| `remote-access` | 远程访问/暴露面 | `network:ingress` |
| `mirror` | 镜像/套壳/分叉 | `dsh.upstream` 存在 |

禁用标签（出现即 FAIL）：`official`、`verified`、`certified`、`secure`、`audited`。

### 8.3 `dsh.kind` 闭集

`plugin` / `bundle` / `preset` / `client` / `skill` / `theme` / `mcp-config` / `unknown`。

### 8.4 新增字段的兼容性

宿主当前会忽略 `package.json` 里未定义的 `dsh.*` 字段（`types.ts:32-41` 只声明四个）；市场 format-1 解析器会"ignore and drop"未定义成员（`index.ts:295`）。因此新增字段**不会破坏旧解析器**，但旧解析器读不到——这正是 T3 要给 schema 打补丁的原因。

---

## 九、附录 C · X-1～X-12 为什么不能进 DS-C

| X | 看似可判的点 | 为什么不能进 DS-C | 本标准怎么处理 |
|---|---|---|---|
| X-1 | 漏写 `inject` 能否靠冒烟发现 | 依赖就绪时 `ctx.foo` 正常返回；只有整条链都找不到才抛（`reflect.ts:172-176`） | 不进 C-4；C-9.3 只做静态 WARN，DS-R R-1 才要求 |
| X-2 | 只看 `getEffects()` 判泄漏 | 未登记资源 Cordis 不知道（`fiber.ts:720`） | C-6/C-7 明写 `leakScope: registered-only`；句柄泄漏 advisory |
| X-3 | 扫顶层语句判 import 期副作用 | 跨包传播、acorn 无法解析 TS/JSX；旧正则假阳性（`host.ts:27`） | C-10 全条 advisory，不 FAIL；本地相对 import 闭包展开，包/解析失败只记 not-run |
| X-4 | "进程没崩"判配置大声失败 | 异常被 `_reload` catch，只置 FAILED（`fiber.ts:693-701`） | C-4/C-7 断言 `state === FAILED`，不断言"没崩" |
| X-5 | 跑一次判 waterfall 是否调 next | 只覆盖走过的那条路径（`events.ts:253`） | R-5 静态 + 人工；不进 DS-C |
| X-6 | `@mode` 与分发点交叉校验 | 只对字面量事件名有效；动态名不可判 | R-4 只判字面量；动态名 WARN |
| X-7 | capability seam 三层角色 | 角色分类是 `gen-doc-graphs.ts` 的启发式（`capability-seams.md:762`） | R-6 只判"定义包是否静态依赖实现包"；角色人工 |
| X-8 | 工具 schema 稳定性 | schema 不可静态知（`tool-catalog.md:9`）；只能 boot 后 diff | G-2 用 L4 快照，不进 DS-C |
| X-9 | 插件 id 稳定性 | 包内没有 id；Loader 行 id 在组合层（`registry.ts:322`） | R-11/R-12 只在 listing 模式判；包内 NA |
| X-10 | `AbortSignal` 是否贯穿到底 | 等价于路径覆盖；没有静态特征 | R-8 只判"接受并复检"结构 + L4 取消注入；不进 DS-C |
| X-11 | 日志都走 `ctx.logger` | `no-console` 只证明没用 console，不证明该记的记了 | R-9 只判 no-console；覆盖率人工 |
| X-12 | 重挂幂等只看 `registry.size` | `update()` 可被 veto，表现为"幂等"其实没重挂（`fiber.ts:783-819`） | C-8.2 必须断言 revision/epoch 推进 |

**元规则**：X-1～X-12 永远不能成为 DS-C 的 FAIL 条件；它们只能出现在 DS-R 的 WARN/人工评审、DS-G 的实践说明、或检查器的 advisory 区。

**C-15～C-22 与 X 规则的关系**：C-15～C-22 是 **security scope** 的独立条款，不是 DS-C 的 package/listing 强制项。security scope 的 FAIL 不能撤销 DS-C PASS，DS-C PASS 也不能拿来证明 security 通过；X-1～X-12 仍是"DS-C 不能 FAIL"的点。两套结论必须并列展示、各自带 scope 与证据锚。

---

## 十、下一步建议（按优先级）

1. **T2 先把 `DSC-01/02/04/05/06/07/08/09` 跑通，并补 `DSC-11/12/13` 三个便宜的 L0 检查**。不补这三项，T2 只能输出 `MVP-13 / level: null`，不能发 DS-C 徽章；补上后 **package profile** 的 11 条强制可全覆盖，可发 `DS-C (package)`；**listing profile** 仍需 T3 的 C-3，届时用 `DS-C (listing)` 区分。
2. **T3 给 format-1 schema 打补丁**：新增 `level`/`status`/`upstream`/`mirrorOf` 字段；M1 通道先跑 C-1/C-2/C-3/C-10/C-11/C-12/C-13，M2 再跑 C-4～C-9。M1 必须对现有 format-1 索引向后兼容（未知字段 drop，不报错）。
3. **T4 定稿 `dsh.capabilities` / `dsh.labels` 的字段名、安装期提示文案与免责声明**，并回填本文件 §8 的闭集；同时把"非官方、非安全审计、非背书 + 复核日期"写进徽章模板。T6 再把 Q3 的工作组与分权红线章程化。

# A 路：DSH 插件生态痛点取证 + 现存质量门禁盘点

> 任务：为「DSH 插件三级标准（GB 强制性 / GB/T 推荐性 / GB/Z 指导性技术文件）」提供第一路输入。
> 数据源：① 上一轮生态调研报告 `<user-home>/WorkBuddy/2026-10-30-15-27-13/DSH插件生态调研报告.md`；
> ② 本地克隆的完整官方仓库 `<workspace>/deepseek-harness`（只读，未做任何修改）。
> 本文件的所有仓库路径均相对于 `deepseek-harness/` 根；行号取自本次检出的快照。

---

## 0. 一句话前提

官方仓库的 48 个 `verify-*` 脚本、`doc-sync`、`hygiene`、`AGENTS.md` 体系，全部是 **deepseek-harness 自身 monorepo 的开发者规约**，
面向第三方插件作者的**可执行门禁**目前只有三条：`engines.dsh` 兼容检查、安装 spec 语法校验、market index format-1 结构校验。
其余一切（身份判定、收录口径、活体性、派生关系、合规分级、命名、分发形态）都处于**零强制**状态——这正是三级标准要填的空间。

---

# 一、必须由标准解决的生态痛点（按严重度排序）

严重度定义：**P0** = 不立标准则生态不可信/不可用；**P1** = 严重损害发现效率与用户体验；**P2** = 长期治理与供应链风险。

## P0-1　topic 噪音与蹭标签：没有任何机器可判定的「是 DSH 插件」硬标准

**报告证据**（报告 §二、§五、§一）
- `dsh-plugin` topic 共 **24,574** 个仓库，其中 `stars>5` 仅 **2,686**、`stars>10` 仅 **1,650** —— 可用率约 11%。
- 已排除的高星误报：morluto/rea **409,231★**（README 中 dsh 仅出现 1 次、无安装命令，纯蹭 topic）、
  farion1231/cc-switch **150,193★**（"支持 DSH" ≠ DSH 插件）、nexu-io/open-design **104,935★**（同上）、
  ruvnet/ruflo **80,194★**（泛 harness，与 DSH 无关）、reactive-resume **45,087★**（README 中 dsh 出现 0 次）、
  nocobase / 1Panel / unsloth / MediaCrawler 一批 **2.4 万–7.8 万★**（topic 滥用）。
- 撞名干扰：USArmyResearchLab/Dshell **5,503★**（token 撞名）、DsHidMini / DSharpPlus / DNC-DShop **1–1.8k★**（同名缩写）。
- 报告自述判定靠人工：对高星与可疑项**逐个抓取 raw README**，用 `dsh plugin … add` / `plugin_manager` / `install_bundle` /
  `@deepseek-ai/dsh` 四类模式做**人工**安装证据判定。

**为什么官方覆盖不了**：`CONTRIBUTING.md:15` 给出的官方唯一发现机制就是"给你的 GitHub 项目打 `dsh-plugin` topic"——
一个字符串标签，无结构、无校验、无撤销。仓库侧没有任何"插件身份"schema。

## P0-2　幽灵条目（404）：收录侧零活体性校验，宿主侧只在用户点安装时才探测

**报告证据**（报告 §六.4）
- "存在幽灵条目（`tabbit-browser/dsh-plugin` **已 404 但目录仍收录**）"。
- 三个目录主体各自收录：`dsh-market/dsh-market`（快照 **7,723** 条）、`2BingLing/dsh-market`（自称 **16,360**）、
  `bradeGithub/DSH-Plugins-Marketplace`（topic 全自动索引，**2h 增量**）；npm `dsh-plugin-catalog`（**3,917** 条，日更）；
  `PerryLink/dsh-catalog`（**109** 条）。没有任何一方负责剔除死链。

**官方侧最接近的机制**：`packages/boot/plugin-manager/src/installBundle` 在 pnpm 之前对 **GitHub 仓库** 做一次
`git ls-remote` 预检（`githubConnectionTimeoutMs` 默认 5000ms，仅网络失败/超时阻断安装）——
但它 **只作用于 GitHub**、**只在用户已经点了安装之后**，市场收录与列表展示环节完全没有可达性检查。

## P0-3　版本漂移：`engines.dsh` 可省略即静默放行，且有一条 `--accept-risk` 逃生通道

**报告证据**（报告 §三.1）
- `JeffKeeping/dsh-purge-plus`（**541★**）"dsh-purge 非官方分支（**适配 0.2.1-rc.2**）"。
- 运行时本身是预发布：`npx @deepseek-ai/dsh`（latest **0.2.1-rc.x**）。
- `Minglink/dsh-infinite-gen-5`（**3,699★**）"逆向/破限系列 **v5**（v4 在市场，**v5 未收录**）"——同一插件两个版本分散在不同可见性层级。
- 报告 §六.4 明确"外部目录站 star 普遍滞后（dsh-TUI 滞后约 8 倍、dsh-deep-whale 约 6 倍）"，star 与版本一样会漂移。

**官方机制的三个缺口**（详见 §二.8 `plugin-compatibility.ts`）
1. `engines.dsh` 与 `@deepseek-ai/dsh*` peer **都可以不写**：`unmetRequirements()` 在两者都缺席时直接 `return {}`，
   `evaluatePluginCompatibility()` 返回 `undefined`，即**静默放行**，不报警、不记录。
2. 存在显式豁免：`apps/cli/src/plugin.ts:41-55` 的 `dsh plugin allow-version <pkg@ver> --dsh-version <exact> --accept-risk`，
   以及 `revoke-version` / `version-exemptions`。标准若不定义"谁可以豁免、豁免要不要上报"，这个口子会侵蚀整个兼容体系。
3. 兼容性只在**安装时与宿主启动时**计算；market index 里的 `engines.dsh` 只是索引作者填的字符串，
   `docs/user/guide/plugin-market.md` 原话："**DSH checks the file format but not those claims**."

## P0-4　同一插件的多个分叉/镜像：无 canonical 上游声明字段

**报告证据**（报告 §三.1）
- `dsh-purge` 四主体：`YuJunZhiXue/dsh-purge` **13,357★**（"破甲"提示词注入）、`kingcharleslzy-ai/dsh-purge` **3,441★**（社区维护版，兼容/诊断/回滚）、
  `mmparko/dsh-purge` **2,701★**（**全量镜像**，上游将删库）、`JeffKeeping/dsh-purge-plus` **541★**（非官方分支）。
- 派生链：`PC2005-cloud/dsh-pet` **4,941★** → `MerZlin/dsh-pet-indesktop` **2,826★`（桌面内移植版）；
  `Scorp1o117/dsh-motion-ui` **42★** 是 `KardDev/dsh-plugins` **711★** 的上游。
- 市场三方：`dsh-market/dsh-market` **9,752★** / `2BingLing/dsh-market` **184★** / `bradeGithub/DSH-Plugins-Marketplace` **196★**。

**官方侧的确认**：`packages/util/plugin-market-index/src/types.ts:35-41`
```ts
/** Where a plugin's source code is published; display only, never an install source. */
export interface MarketRepository { url: string; directory?: string }
```
即 format-1 **有 repository 字段但明确定性为 display-only**，且 `MarketPlugin` 没有 `upstream` / `forkOf` / `mirrorOf` /
`supersedes` 任何派生语义字段，也没有 `deprecated` 字段（`MarketVersion` 只有 `version` / `publishTimestamp` / `source` / `engines`，见 types.ts:66-74）。
（对比：npm 侧的 `deprecated` 其实已被读取——`packages/boot/plugin-manager/src/versions.ts:78`——但没有被纳入 index format。）

## P0-5　破限/红队类插件的合规风险：官方明确不背书，生态内无任何分级标记

**报告证据**（报告 §三.1、§六.5）
- `YuJunZhiXue/dsh-purge` **13,357★** "破甲提示词注入插件"；`Minglink/dsh-infinite-gen-5` **3,699★** "逆向/破限系列 v5"；
  `yexi-by/dsh-unrestricted` **784★** "提示词破限（红队类，合规自审）"；`SeaOf0/dsh-redteam-model` **797★** "授权安全研究模式预设"；
  `howmp/dsh-pentest` **615★** 渗透测试。
- 报告 §六.5 合规提示原文："破限/红队类插件（dsh-purge、dsh-infinite-gen、dsh-unrestricted、dsh-redteam-model 等）
  安装前请自行合规审阅；**市场收录不等于安全背书**。"

**官方侧的对应物**：`SAFETY.md`（27 行）只声明宿主自身是 "experimental developer-preview software … has not undergone a security audit"，
并笼统提示"Review plugins, configuration, and proposed commands before allowing them to run"。
它既不是插件分级标准，也不产生任何机器可读的合规标记。

## P1-6　客户端形态与插件形态的边界模糊

**报告证据**（报告 §三.1、§三.3 注）
- 明确标"边界"的条目：`kelai141/dsh-mobile-apk` **967★**（安卓壳 APK，WebView+Termux）、`ZSeven-W/dsh-ios` **352★**（iOS 原生客户端）、
  `turtle2209/Bigfish` **325★**（第三方桌面端+萌宠）、`deepseek-ai/dsh-libreoffice-kit` **204★**（官方组织但自述 internal）、
  `ZSeven-W/openpencil` **6,966★**（DSH 适配条目）。
- 客户端形态（报告单列"非插件"）：`anywhere-labs/dsh-desktop` **34,097★**、`dataelement/dsh-desktop` **17,000★**、
  `dsh-tauri/deepseek-harness-desktop` **3,367★**、`DSH-APP/DSHA` **2,631★**、`ccch1mneyyy/dsh-go` **979★**、
  `jingyunstudio/jingyun-dsh` **924★**、`yyh-001/DSH-X` **766★**、`myYangyunfan/dsh_desktop` **738★**、`Clarklevis1995/dsh-mobile` **679★**。

**官方侧的边界定义只有一条且是内部的**：`docs/user/develop/basic/publish.md:16`
"A bundle is what you author and distribute; a profile is what a user boots … **Nothing is both.**"
——只区分 bundle / profile，**不区分插件 / 客户端 / 桌面端 / 皮肤 / 库**。

## P1-7　安装命令形态不一（npm / git / path / tgz），且 git 安装带真实摩擦

**报告证据**（报告 §三.1、§三.2）
- npm 包：`@tt-a1i/archify-dsh`、`@picgo/dsh-plugin`、`@zilliz/memsearch-dsh`、`@cloudbase/dsh-plugin` 等；裸名 `add dsh-deja`、`add cc-safety-net`、`add dsh-tongflow`、`add brooks-lint`。
- git：`add github:superdesigndev/treg`（6,498★）。
- path 安装：`chuspeeism/dashi-taskboard`（3,388★）、`first-fluke/oh-my-agent`（1,352★）。
- tgz：`loopx-project/loopx`（6,398★）"dsh-loopx-plugin（tgz）"。
- 无安装命令证据：`Tencent/WeKnora`（35,968★，"dsh×10 但无安装命令"）、`shanliuling/dsh-image-gen`（~940★，"证据中等：无 dsh topic"）。

**官方侧的四种形态是真实存在的**（`packages/boot/plugin-manager/src/install-spec.ts:15-19`：`registry` / `path` / `tarball` / `git`），
但**四者不是平权**的：`docs/user/develop/basic/publish.md:161-186` 明确写出 git 安装的构建脚本陷阱——
pnpm ≥10 拒绝执行 git 依赖的 `prepare`，用户必须手工把包键写进 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds`；
文档还把它定性为 "**permission to execute the package's code on your machine at install time**, outside any sandbox"。
tgz 与本地 path 同样要求绝对路径（`install-spec.ts:73-77`：相对路径直接抛 `InvalidInstallSpecError`）。

## P1-8　目录口径不一致：2,686 / 7,723 / 16,360 / 3,917 / 109 五个数字互不对齐

**报告证据**（报告 §二、§六）
| 口径 | 数字 | 来源 |
|---|---|---|
| topic `dsh-plugin` stars>5 | **2,686**（枚举覆盖约 77%，2,079 唯一） | GitHub Search API |
| topic `dsh-plugin` stars>10 | **1,650** | GitHub Search API |
| dsh-market 目录快照 | **7,723** | awesome-dsh-plugin.com/plugins.json |
| ↳ 其中 stars>5 / stars>10 | **1,560 / 970** | 同上 |
| 2BingLing 中文市场自称收录 | **16,360** | 自述 |
| npm `dsh-plugin-catalog` format-1 索引 | **3,917**（日更） | jsdelivr |
| PerryLink/dsh-catalog `data/packages.json` | **109** | 家族目录数据源 |
| `dsh- in:name` GitHub 命中 | **55,519**（分词 token 匹配，含 `xxx-dsh-yyy` 误报） | GitHub Search |

另有两个污染因子：目录站 star 滞后（dsh-TUI 滞后约 8 倍、dsh-deep-whale 约 6 倍）；
monorepo 子包继承宿主 star（`tt-a1i/archify` **91,610★** 的条目被记为 **89,901★**）。
**根因**：官方"**DSH ships no index source**"（`docs/user/guide/plugin-market.md` §Turn on），
没有一个权威基数，各目录自行定义"什么算一条"。

## P1-9　元数据缺失/不一致，且官方的元数据规范只约束自家包

**报告证据**：Tencent/WeKnora 35,968★「dsh×10 但无安装命令」、shanliuling/dsh-image-gen ~940★「无 dsh topic」、
`strukto-ai/mirage`「topic-hunter 排除，但市场收录 `@struktoai/mirage-dsh`，按市场口径可算」、
`deepseek-ai/dsh-libreoffice-kit`「自述 internal」。

**官方侧**：`docs/cookbook/adding-a-package.md` §5 给出了完整的显示元数据规范（locale/en.json 的 `meta.title`/`meta.description`、
icon ≤256 KiB、SVG/PNG/JPEG/WebP、`meta.detail` 路径规则、first-party 必须提供 ja/es/fr/de/ru/pt 六种语言），
并配 `pnpm run verify-package-meta` / `pnpm run check:i18n` 两个可执行检查——**但这两个脚本只在仓库内跑**（见 §二.24）。

## P2-10　生命周期状态只能用 emoji 文本表达

**报告证据**（报告 §三.1 PerryLink 家族、§四.1）
`🧊FROZEN`（dsh-claude-move、dsh-defend、dsh-draw、dsh-budget）、`🚫RETIRED`（dsh-background-agents、dsh-session-pin），
以及 `mmparko/dsh-purge` 标注 mirror「上游将删库」。
这些状态**只存在于 README 的人类文本里**；format-1 的 `MarketVersion` 无 `deprecated` / `lifecycle` 字段，
`MarketInstallationStatus` 也只有 `not-installed | installed | update-available | different-version | provided`
（`packages/boot/plugin-market/src/types.ts:50`），不含"已废弃/已退役/建议迁移到 X"。

## P2-11　供应链：第三方无 license 要求，git 安装可执行任意代码

- 官方只强制**自家** `@deepseek-ai/dsh*` 包为 MIT（`scripts/verify-dsh-package-licenses.ts`，正则 `/^@deepseek-ai\/dsh(?:-|$)/`），第三方包零要求。
- format-1 的 git source 强制 40 位 hex commit pin（`types.ts:52-57`）—— 这是官方**唯一**的供应链硬约束，
  但只覆盖"走 market index 的 git 类型"；README 里手写的 `add github:you/repo` 不带 pin，
  `docs/user/develop/basic/publish.md:181` 自己都建议"pin a commit so a later push cannot silently change what runs"（建议，非强制）。

---

# 二、官方仓库现存质量门禁盘点

> 逐项给出：检查什么 / 强制还是建议 / 作用在哪一层 / 第三方插件作者能否复用。
> 层次标记：**[作者本地]** / **[CI]** / **[宿主启动]** / **[安装时]** / **[市场收录]**。

## A. 规约文档层

### A1　`CONTRIBUTING.md`（23 行）
- **检查什么**：**没有任何检查项**。全文唯一的生态要求是 `CONTRIBUTING.md:15`
  "Associate your GitHub project with the `dsh-plugin` topic to help others discover your plugin."
  并明确 "we cannot accept external pull requests" —— 第三方**不能**向官方仓库贡献代码，只能自建仓库。
- **强制/建议**：建议（无可执行门禁、无校验）。
- **层次**：**[市场收录]**（发现机制的入口）。
- **第三方可复用**：仅"打 topic"这一条动作，且无机器可校验的落地形态（正是 P0-1 的根因）。

### A2　根 `AGENTS.md`（187 行）+ `CLAUDE.md`（0 行，符号链接）
- **检查什么**：官方 monorepo 贡献规约，覆盖：包名必须 `@deepseek-ai/dsh-<name>`、`vendor/` 私有、
  workspace 依赖用 `workspace:*` / `workspace:~`、全 ESM、`ctx.effect()` 注册、类型化事件需 `@mode`、
  禁止新增 `as unknown`、JSDoc 必带 `@param`/`@returns`（由 `verify-export-jsdoc` 执行）、
  每个外部可感知的破坏性变更必须立刻写 upgrade guide、CI 覆盖率门禁为 `test:coverage`（`packages/*/*/src` 逐文件 100%）、
  提交前 `git diff --cached --check` 校验文件结尾唯一换行、术语禁令（禁 `prove` + `nance`）、PR 标签 taxonomy 等。
- **强制/建议**：**强制**（对官方 PR；靠 CI gate + lefthook 执行，`lefthook.yml`）。
- **层次**：**[作者本地] + [CI]**。
- **第三方可复用**：**否**——但**可作为 GB/T 的范本**（尤其"规则自包含 + 链接到 home 文档""每个规则配一个 verify-* 脚本"这一方法论）。
- 注：`AGENTS.md:183` 明示 `CLAUDE.md` 是 `AGENTS.md` 的符号链接，`packages/CLAUDE.md` 同理；`vendor/CLAUDE.md` 亦为链接。

### A3　子树 `AGENTS.md`（共 14 处）
`packages/AGENTS.md`（29 行）、`docs/AGENTS.md`、`scripts/AGENTS.md`、`vendor/AGENTS.md`、`packages/client/AGENTS.md`、
`packages/web/AGENTS.md`、`packages/experimental/AGENTS.md`、`packages/schedule/AGENTS.md`、`native/system/AGENTS.md`、
`snapshots/AGENTS.md`、`website/AGENTS.md`、`benchmarks/AGENTS.md`、`.github/AGENTS.md`、`.agents/notes/AGENTS.md`。
- **检查什么**：子树专属规则。要点：
  - `packages/AGENTS.md`：服务包 default-export 服务类、函数插件 named-export `name`/`inject`/`Config`/`apply`（混用会导致 Loader 丢弃函数插件命名空间）；
    可选服务必须 `ctx.get(name)`；产品可见插件必须有非 unit 的 REAL-composition 测试；共享状态必须有 owner（禁模块级单例/`globalThis`）；
    README 必须含 `## Known Limitations and Deferred Work`。
  - `docs/AGENTS.md`：**文档标准**——"one home per fact"分层表（root AGENTS / 子树 AGENTS / architecture.md / subsystems / Agent Notes / cookbook / user/ / 包 README / 生成式参考各自"该写什么、不该写什么"）、
    `verify-md-wrap` 一段一物理行、` ```ts ` 块必须能编译（`doc-typecheck`）、字数上限（root AGENTS ≤2080、architecture ≤2400、子树 AGENTS ≤600、`docs/AGENTS.md` ≤1430）。
  - `scripts/AGENTS.md`：门禁脚本必须 shell-free 调 pnpm、路径归一为 `/`、防语料被清空或收窄、每种 admitted/excluded 形式都要有测试。
- **强制/建议**：强制（内部）。**层次**：**[作者本地] + [CI]**。**第三方可复用**：否（全部绑定仓库结构）。

## B. 面向第三方作者的文档层

### B1　`docs/user/develop/`（10 篇 × 中英双语）
`basic/index.md`（144 行，Your first plugin）、`basic/config.md`（106）、`basic/tool.md`（52）、`basic/publish.md`（191）、
`framework/index.md`（137）、`framework/service.md`（148）、`framework/events.md`（143）、
`practice/index.md`（155，三角色能力设计）、`practice/llm-adapter.md`（189）、`practice/dynamic-cordis.md`（15）。
- **检查什么**（教学性，非校验）：插件 = 导出 `apply` 的模块（函数/对象/类三形态）、`inject` 声明依赖、
  `ctx.effect()` 提供 disposer、bundle manifest `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`、
  profile manifest `dsh.profile.bundles` 有序列表、**四层加载顺序**（bundle 层 → profile patch → home patch → `--patch` 覆盖）、
  **`engines.dsh` SemVer 范围**（`publish.md:66`："Installation and profile startup refuse a bundle whose range the running DSH does not satisfy"）、
  **`prepare` 脚本 + `allowBuilds`** 的 git 安装陷阱。
- **强制/建议**：**混合**——文档本身是建议；其中 `engines.dsh`、`dsh.bundle`、绝对路径、平台声明由代码**强制**。
- **层次**：**[作者本地]**（教学）+ 被强制项落到 **[安装时]** / **[宿主启动]**。
- **第三方可复用**：**是**（纯文档，是当前唯一面向外部作者的官方教材）；但**不产出"合格/不合格"结论**，无法充当标准符合性判定依据。

### B2　`docs/user/guide/plugin-market.md`（Plugin indexes）
- **检查什么**：index = 一个 UTF-8 JSON，默认 ≤ **128 MiB**，2xx 且无重定向；
  URL 必须 `http:`/`https:` 且无用户名密码与 `#` fragment；图标可 inline（`data:`）或相对 URL（跨源必须 https）；
  给出最小 format-1 示例（npm 插件 + git monorepo 插件）。
  并给出两条**免责**原话：① "**DSH ships no index source**"；② "DSH checks the file format **but not those claims**"（title/description/icon/author/source 全由索引作者决定）。
- **强制/建议**：结构**强制**（由 `parseMarketIndex` 执行）；内容真伪**不校验**。
- **层次**：**[市场收录]**（用户添加 index 源时 + 每次读取时）。
- **第三方可复用**：**是**——这是当前唯一面向 index 发布者的正式规范。

### B3　`docs/cookbook/`（9 篇）
`adding-a-package.md`（含 §5 插件显示元数据规范 + §6 Verify 步骤）、`adding-a-plugin-preview.md`、`adding-a-tool.md`、
`adding-an-llm-adapter.md`、`adding-a-remote-api.md`、`adding-a-settings-card.md`、`adding-a-vendored-package.md`、
`adding-a-session-format-version.md`、`maintaining-dsh-code-review.md`、`responding-to-pr-review-on-a-stack.md`、
`reviewing-persistence-type-changes.md`、`extension-cookbook.md`。
- **检查什么**：`adding-a-package.md` §5 是**最接近"插件元数据标准"的现存文本**：
  `locale/en.json` 的 `meta.title`/`meta.description`（英文用 sentence case）、`exports` 需暴露 `./package.json` 与 `./locale/*.json`、
  `files` 需含 `locale/*.json`、图标 `icon` 相对 manifest 目录且不得逃逸（绝对路径/URL/越界/外指 symlink 一律拒绝）、
  格式限 SVG/PNG/JPEG/WebP ≤ **256 KiB**、`meta.detail` 必须位于子目录（根目录文档被拒，因为邻近图片不会随包发布）、
  回退链（title: locale → `package.json.name` → 完整 Cordis 插件名）。
  配套验证：`pnpm run verify-package-meta`、`pnpm run check:i18n`。
- **强制/建议**：**强制**（对仓库内包，CI 执行）。
- **层次**：**[作者本地] + [CI]**。
- **第三方可复用**：**规范可读、脚本不可复用**（`verify-package-meta.ts` 从 `import.meta.dirname/..` 解析仓库根，glob `packages/*/*`）。

## C. 运行时代码门禁（宿主启动 / 安装 / 市场读取）

### C1　`packages/boot/app-boot/src/plugin-compatibility.ts`（117 行）★核心
- **检查什么**：不 import 插件代码，只读 `package.json`。
  `engines.dsh` **优先且独断**（有则忽略 peerDependencies）；否则检查每个 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer；
  `semver.satisfies(..., { includePrerelease: true })`；`workspace:^/~/*` 视为当前运行时版本。
  **豁免表**：`exemptions[name@version] = [runtimeVersion, ...]`，必须**精确匹配**。
  输出 `pluginCompatibilityWarning()`："Running it may cause crashes or data loss."
- **缺口（对应 P0-3）**：`unmetRequirements()` 在 `engines` 无 `dsh` 且无 `peerDependencies` 时直接 `return {}` → 返回 `undefined` → **静默放行**。
- **强制/建议**：**强制**（硬阻断），但 `apps/cli/src/plugin.ts:41-55` 提供 `allow-version --accept-risk` 人工豁免口。
- **层次**：**[安装时] + [宿主启动]**（`compatibility-preflight.ts` 在合成入口调用它）。
- **第三方可复用**：**部分可**——`evaluatePluginCompatibility` 是纯函数且随 `app-boot` 发布，但**未作为公共 SDK 文档化**，无 CLI 入口。

### C2　`packages/boot/app-boot/src/compatibility-preflight.ts`
- **检查什么**：DSH 自己拥有的合成入口处的兼容检查，含 patch 应用与 `entryListSchema`（`@deepseek-ai/cordis-plugin-include`）校验。
- **层次**：**[宿主启动]**。**第三方可复用**：否（内部插件）。

### C3　`packages/boot/app-boot/src/profile-plugins.ts`（133 行）
- **检查什么**：pnpm 操作后 reconcile `dsh.profile.bundles`；判定 `bundle`（有无 `dsh.bundle.patch`）/ `enabled`；
  新 bundle 自动激活前调 `assertBundlePlatform()`；`addedPlainDependencies` 供上层告警（装了无 bundle 声明的普通包）。
- **强制/建议**：强制。**层次**：**[安装时]**。**第三方可复用**：否。

### C4　`packages/boot/app-boot/src/bundle-platform.ts`（`assertBundlePlatform`）
- **检查什么**：`dsh.bundle.platforms` 与 `process.platform`；不支持的 Host 返回 `unsupported-platform`，bundle 仍可见、可取消选择。
- **层次**：**[安装时] + 启用时]**。**第三方可复用**：逻辑可借鉴（声明式平台声明），无独立入口。

### C5　`packages/boot/app-boot/src/startup-diagnostics.ts`
- **检查什么**：启动失败时抓取**无配置**的快照（每条 entry 的 id/module/version/state/source/missing + service 缺失的 provider 观测）。
- **性质**：**诊断，不是门禁**（不阻止失败）。**层次**：**[宿主启动]**。

### C6　`packages/boot/plugin-manager/src/install-spec.ts`（123 行）★核心
- **检查什么**：安装 spec 的**语法**校验，4 种形态：
  `registry`（npm 名正则 `^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$`，长度 ≤214，可带 `@range`）、
  `path`（**必须绝对路径**，否则 `InvalidInstallSpecError: a local path must be absolute`）、
  `tarball`（`.tgz`/`.tar.gz`）、`git`（`github:`/`gitlab:`/`bitbucket:`/`gist:` 简写、`git+`/`git@` URL、hosted repo URL）。
  另 `HTTP_USER_INFO` 正则剥离 http(s) URL 里的凭据（防 token 泄漏到日志）。
- **强制/建议**：**强制**。**层次**：**[安装时]**。**第三方可复用**：逻辑清晰可直接抄为 GB 条款；无 CLI。

### C7　`packages/boot/plugin-manager/src/registry.ts`（98 行）
- **检查什么**：registry 计划编排——私有 registry **永不回落**到公共源；仅当 pnpm 自身 registry 确认为公共（npmjs 或已配置 fallback）时才参与回落；
  `attributeFailure()` 判定失败归因于 `registry` / `spec-host` / `other`。
- **层次**：**[安装时]**。**第三方可复用**：否（策略文档可借鉴）。

### C8　`packages/boot/plugin-manager/src/versions.ts`（80 行）
- **检查什么**：`pnpm view` 读取 `versions`/`time`/`dist-tags`，筛出高于已装版本的已发布版本（semver.gt，降序），
  再逐版本读 `name/version/engines/peerDependencies/deprecated/dsh`，判定 `bundle`（`dsh.bundle` 存在）与 `deprecated`。
- **层次**：**[安装时]**（升级路径）。**第三方可复用**：否。

### C9　`packages/boot/plugin-manager/src/official-install-target.ts`（58 行）
- **检查什么**：**仅官方 bundle**——源安装时校验 workspace 完整性（`packages/*/*/package.json` 唯一匹配、manifest 非 private、
  声明 `dsh.bundle`、built runtime 存在、bundle patch 文件存在），否则抛错"永不回落到 registry"。
- **层次**：**[安装时]**。**第三方可复用**：**否，且这条恰好说明官方/第三方待遇不对等**。

### C10　`packages/boot/plugin-manager` 其他
- `github-connection.ts` + `installBundle` 的 **`git ls-remote` 预检**（`githubConnectionTimeoutMs` 默认 5000ms，禁用 credential helper，
  仅网络失败/超时阻断，报 `failedAt: 'spec-host'`）—— 官方唯一的网络可达性预检，但**只对 GitHub、只在点安装之后**（对应 P0-2 缺口）。
- `build-approval.ts`（pnpm `allowBuilds` 构建脚本审批）、`patch.ts`、`operations.ts`、`diagnostic.ts`、`failure.ts`、
  `install-failure.ts`、`git-transport.ts`、`run-tree.ts`、`tools.ts`。
- 宿主侧权限：`plugin_manager` 工具每个动作都需要 `danger-full-access` 或逐次审批。

### C11　`packages/boot/plugin-market/src/index-url.ts`（43 行）
- **检查什么**：index URL 必须是 http(s)、**不得含 username/password/`#`fragment**；错误码 `plugin-market/invalid-index-url`。
- **强制/建议**：强制。**层次**：**[市场收录]**（用户添加源时 + 每次使用前）。**第三方可复用**：规则可抄（3 条），无独立库。

### C12　`packages/boot/plugin-market/src/parse.ts`（43 行）
- **检查什么**：严格 UTF-8（`TextDecoder('utf-8', { fatal: true })`）→ `JSON.parse` → `parseMarketIndex(value, url)`；
  返回首个违规的 JSON path + reason。运行在 Worker 里（不受宿主阻塞）。
- **强制/建议**：强制。**层次**：**[市场收录]**（每次读取）。**第三方可复用**：调用的是已发布的 `plugin-market-index` 库（见 C13）。

### C13　`packages/util/plugin-market-index`（format-1 schema）★唯一真正开放复用的校验库
- **package.json**：`@deepseek-ai/dsh-plugin-market-index`，version `0.2.2-alpha.2`，`"publishConfig": { "access": "public" }`，**license MIT**，非 private。
- **检查什么**（`src/types.ts` 170 行）：
  - `MarketIndex`：`format: 1` + `title` + `metadata`（categories/labels/sortKeys 声明）+ `plugins`；**格式未定义的成员被丢弃**。
  - `MarketVersion`：`version` 精确 SemVer 且插件内唯一、`publishTimestamp`（Unix 秒）、`source`、`engines`。
  - `MarketSource`：`npm`（可带 registry）或 `git`（`url` 必须规范 https 且无凭据/query/fragment、**`commit` 必须 40 位小写 hex**、可带 `path`）。
  - `MarketPlugin`：`name`（npm 包名，索引内唯一）、`title`/`description`（`LocalizedText`，需 en 兜底）、`icon`、`author`、`homepage`、`repository`、`metadata`。
  - 版本列表**必须非空且按 SemVer 降序**。
- **强制/建议**：强制（索引读不进来就直接报 `plugin-market/invalid-index`）。
- **层次**：**[市场收录]**。
- **第三方可复用**：**是** —— 已发布到 npm，可 `import { parseMarketIndex }`。**但只校验 index 文件本身，不校验被收录的插件包。**

### C14　`apps/plugin-market-generator`（参考索引生成器）
- **检查什么/做什么**：从一行一个包名或 git URL 的纯文本生成 index；npm 包只收录**非 deprecated、非 private、且声明 `dsh.bundle`** 的版本；
  git 仓在默认分支找 bundle 包，读 `vX.Y.Z` / `X.Y.Z` / `<name>@X.Y.Z` tag；"only downloads and reads files; it never installs packages or runs their code"；
  缓存 `.plugin-market-cache`。
- **层次**：**[市场收录]**。**第三方可复用**：**半可**——必须从 DSH checkout 运行 `pnpm --filter @deepseek-ai/dsh-plugin-market-generator start`，不是独立 CLI。

### C15　`packages/experimental/plugin-market-bundle` + `packages/client/ui-plugin-market`
- **检查什么**：Discover tab 宿主服务与 Web UI。**Shipped profiles 默认关闭**（实验性 bundle）。
- **性质**：**[市场收录]** 的**弱**环节——官方自己没有默认开启任何索引源。

## D. `scripts/` 下的 verify-* 与其他静态门禁（48 个 verify-*，359 个脚本文件）

### D1　`scripts/run-gates.ts` —— 门禁编排
- `pnpm run doc-sync` → `tsx scripts/run-gates.ts doc-sync` → `docSyncLeafGates()`（run-gates.ts:819-880）
- `pnpm run test:docs` → `doc-quick` → `docQuickLeafGates()`（quick:true 子集）
- `pnpm run hygiene` → `hygieneLeafGates()`（run-gates.ts:798-817）+ `verify-cordis-config` + `verify-runtime-closure`
- `pnpm run check:ci*` → `ciSharedStaticGates()`（run-gates.ts:384-401）等

### D2　`doc-sync` 具体包含（约 40 个叶子）
`doc-typecheck`、`docs-site-build`（VitePress，兼作死链检查）、`verify-doc-graphs`、`cli-help`、`verify-md-links`、
`verify-type-equiv`、`verify-cordis-catalog`、`verify-cordis-inspect-catalog`、`verify-workflow-guest`、`verify-mermaid`、
`verify-translation-pairing`、`verify-md-wrap`、`verify-client-catalog`、`verify-export-jsdoc`、`verify-tool-catalog`、
`verify-config-catalog`、`verify-plugin-packages`、`verify-dependency-catalog`、`verify-persistence-catalog`、
`verify-persistence-changes`、`verify-persistence-releases`、`verify-persistence-formats`、`verify-session-format-catalog`、
`verify-public-repository-links`、`verify-repository-references`、`verify-concrete-terms`、`verify-doc-refs`、
`verify-subsystem-pages`、`verify-package-paths`、`verify-tsconfig-paths`、`verify-config-source-ownership`、
`verify-package-readme-summaries`、`verify-package-readme-model-experience`、`verify-agent-note-classification`、
`verify-agent-note-format`、`verify-archived-agent-notes`、`verify-skill-invocation-metadata`、`verify-translation-prompt`、
`verify-doc-budgets`、`verify-upgrade-guides`、`doc-standard-tests`、`docs-site-projection`。

### D3　`hygiene` 具体包含（约 14 个叶子）
`rescope-vendor:check`、`publint`、`constraints`（`check-workspace-constraints`）、`verify-default-product-isolation`、
`verify-product-use`、`verify-official-bundle-catalog`、`verify-provider-data`、`verify-package-dependencies`、
`verify-application-entrypoints`、`verify-dsh-package-licenses`、`verify-node-next-types` + `sharedHygieneGates()`。

### D4　与插件生态最相关的几个 verify-* 逐项
| 脚本 | 检查什么 | 强制 | 层次 | 第三方可复用 |
|---|---|---|---|---|
| `verify-package-meta.ts` | 源 locale 元数据、官方 SVG artwork、Node 资源导出（`./package.json`、`./locale/*.json`）、发布文件覆盖 | 强制 | [作者本地]+[CI] | **否**（仓库根相对 glob） |
| `verify-dsh-package-licenses.ts` | `@deepseek-ai/dsh*` 包必须 **MIT** | 强制 | [CI] | **否**，且**不覆盖第三方**（正则写死 scope） |
| `check-workspace-constraints.ts` | workspace/包/依赖约束一致 | 强制 | [CI] | 否 |
| `verify-package-dependencies.ts` | 包依赖声明合规 | 强制 | [CI] | 否 |
| `verify-official-bundle-catalog.ts` | 官方 on-demand catalog 元数据（含 `assertBundlePlatform`） | 强制 | [CI] | 否 |
| `verify-cordis-config.ts` | Raw/Web `cordis.yml` 的 bare plugin 必须出现在 resolver manifest 的 `dependencies` | 强制 | [CI] | 否 |
| `verify-version-sync.ts` | 版本同步（跨 manifest 一致性） | 强制 | [CI] | 否 |
| `verify-upgrade-guides.ts` | 每个破坏性变更必须有 upgrade guide | 强制 | [CI] | 否 |
| `verify-public-repository-links.ts` | 公开仓库链接 | 强制 | [CI] | 否 |
| `verify-repository-references.ts` | 拒绝含十六进制字母的 commit id、拒绝不允许的组织 URL | 强制 | [CI] | 否 |
| `verify-npm-install-layout.ts` | npm 安装布局 | 强制 | [CI] | 否 |
| `verify-runtime-closure.ts` / `verify-default-product-isolation.ts` / `verify-product-use.ts` / `verify-application-entrypoints.ts` | 运行时闭包、默认产品隔离、产品包分类、应用入口 | 强制 | [CI] | 否 |
| `verify-export-jsdoc.ts` | 每个导出必须有 JSDoc、`@param`/`@returns` | 强制 | [CI] | 否（但规则可直接作为 GB/T 条目） |
| `verify-md-wrap.ts` / `verify-md-links.ts` / `verify-doc-budgets.ts` / `verify-concrete-terms.ts` / `verify-doc-refs.ts` | 文档格式与预算 | 强制 | [CI] | 否 |
| `verify-plugin-record-callers.ts` / `plugin-record-catalog.ts` | 插件记录调用点 | 强制 | [CI] | 否 |
| `verify-skill-invocation-metadata.ts` | skill 调用元数据 | 强制 | [CI] | 否 |

### D5　其他相关脚本
`gen-official-bundle-catalog.ts`（生成官方 catalog，含 `assertBundlePlatform` 校验）、
`gen-plugin-packages.ts` / `gen-*-catalog.ts` 系列（client/config/cordis/tool/dependency/persistence/session-format）、
`check-vendor-manifest.sh`、`scripts/AGENTS.md`（门禁脚本自身的元规则）。

**D 层总判定**：**全部 [作者本地] + [CI]，第三方一律不可复用**——硬编码仓库根相对路径、workspace glob `packages/*/*`、
依赖 `tsx` + 仓库 tsconfig `paths`、依赖构建产物 `lib/`。

## E. 门禁总览矩阵

| # | 机制 | 检查对象 | 强制 | 层次 | 第三方复用 |
|---|---|---|---|---|---|
| A1 | `CONTRIBUTING.md` | 打 topic | 建议 | 市场收录 | 动作可，无校验 |
| A2 | 根 `AGENTS.md` | 官方贡献规约 | 强制 | 本地+CI | 否（可作范本） |
| A3 | 14 处子树 `AGENTS.md` | 子树规约/文档标准 | 强制 | 本地+CI | 否（可作范本） |
| B1 | `docs/user/develop/`（10 篇） | 插件写法教学 | 建议+部分强制 | 本地 / 安装 / 启动 | **是**（文档） |
| B2 | `docs/user/guide/plugin-market.md` | index 发布规范 | 结构强制 | 市场收录 | **是** |
| B3 | `docs/cookbook/adding-a-package.md` §5 | 显示元数据/locale/icon | 强制 | 本地+CI | 规范可，脚本否 |
| C1 | `plugin-compatibility.ts` | `engines.dsh` / dsh peer | 强制（可豁免） | 安装+启动 | 部分是纯函数 |
| C2 | `compatibility-preflight.ts` | 合成入口兼容 + patch schema | 强制 | 启动 | 否 |
| C3 | `profile-plugins.ts` | bundles reconcile | 强制 | 安装 | 否 |
| C4 | `bundle-platform.ts` | `dsh.bundle.platforms` | 强制 | 安装+启用 | 规则可抄 |
| C5 | `startup-diagnostics.ts` | 启动失败快照 | 诊断（不阻断） | 启动 | 否 |
| C6 | `install-spec.ts` | 4 类 spec 语法 + 凭据剥离 | 强制 | 安装 | 规则可抄 |
| C7 | `registry.ts` | registry 回落策略 | 强制 | 安装 | 否 |
| C8 | `versions.ts` | 已发布版本/deprecated/bundle | 强制 | 安装（升级） | 否 |
| C9 | `official-install-target.ts` | **仅官方** bundle 完整性 | 强制 | 安装 | 否 |
| C10 | `git ls-remote` 预检 | GitHub 可达性（仅 GitHub、仅安装时） | 强制 | 安装 | 否 |
| C11 | `index-url.ts` | index URL 合法性 | 强制 | 市场收录 | 规则可抄 |
| C12 | `parse.ts` | UTF-8 + JSON + format-1 | 强制 | 市场收录 | 间接（经 C13） |
| C13 | `@deepseek-ai/dsh-plugin-market-index` | **format-1 schema**（含 git 40-hex commit pin） | 强制 | 市场收录 | **是（已发布 npm）** |
| C14 | `apps/plugin-market-generator` | index 生成（排除 deprecated/private/无 bundle） | 建议 | 市场收录 | 半可（需 checkout） |
| C15 | `experimental/plugin-market-bundle` | Discover tab | 建议（默认关） | 市场收录 | 否 |
| D | 48 个 `verify-*` + `doc-sync` + `hygiene` | 仓库内静态/文档/依赖/许可 | 强制 | 本地+CI | **否** |

---

# 三、官方机制覆盖不了的空白（= 三级标准要填的）

每条给出：空白 → 现有机制的边界 → 建议的标准级别。

| # | 空白 | 现有机制的边界（证据） | 建议级别 |
|---|---|---|---|
| **G1** | **插件身份判定**：无机器可判定的"这是 DSH 插件"硬标准 | `CONTRIBUTING.md:15` 只有"打 topic"；报告里判定全靠人工读 README（24,574 → 2,686 可用率 ~11%） | **GB 强制性**：身份判定规则 + 可机器校验的最小声明集 |
| **G2** | **元数据最小集与真伪**：结构校验了，语义没校验 | `plugin-market.md`："DSH checks the file format but not those claims"；WeKnora 35,968★ 无安装命令、dsh-image-gen 无 topic 仍被收录 | **GB 强制性**（必填字段 + 可解析性）+ **GB/T**（质量分级） |
| **G3** | **目录/索引互操作与计数口径**：五个数字（2,686 / 7,723 / 16,360 / 3,917 / 109）互不对齐 | "**DSH ships no index source**"；无官方收录流程；format-1 只是文件交换格式，不是目录治理规范 | **GB 强制性**（format-1 为唯一互操作格式）+ **GB/T**（计数口径、去重规则、star 滞后校正） |
| **G4** | **活体性 / 幽灵条目**：`tabbit-browser/dsh-plugin` 已 404 仍被收录 | 宿主仅对 GitHub 在**点安装之后**做 5s `git ls-remote`；收录与展示侧零 liveness 校验 | **GB 强制性**：条目可达性要求 + 定期巡检 + 死链降级/下架规则 |
| **G5** | **版本与兼容声明**：`engines.dsh` 可省略即静默放行 | `plugin-compatibility.ts:62` 无 peer 直接 `return {}`；`allow-version --accept-risk` 可人工豁免；市场侧不校验 engines 真实性；dsh-purge-plus 适配 0.2.1-rc.2、infinite-gen v5 未收录 | **GB 强制性**：必声明 `engines.dsh` + 兼容矩阵展示；**GB/Z**：预发布版本适配指引 |
| **G6** | **派生 / 分叉 / 镜像的 canonical 声明**：dsh-purge 四主体、dsh-pet → indesktop、三个市场并行 | `MarketRepository` 明确定性 "display only, never an install source"；无 upstream/forkOf/mirrorOf/supersedes/deprecated 字段 | **GB 强制性**：唯一标识 + 派生关系声明；**GB/T**：镜像/分叉命名与标注 |
| **G7** | **形态分类**：插件 / 客户端 / 桌面端 / 皮肤 / 库 边界模糊 | `publish.md:16` 只有 "bundle vs profile … Nothing is both"；报告里 12+ 个客户端条目只能人工标"边界" | **GB/T 推荐性**：形态分类与命名规范 |
| **G8** | **合规与风险分级**：破限/红队类（dsh-purge 13,357★、infinite-gen 3,699★、unrestricted 784★、redteam-model 797★、pentest 615★）无任何机器可读分级 | `SAFETY.md` 是宿主免责声明；报告："市场收录不等于安全背书" | **GB 强制性**：风险等级必标 + 安装前强提示；**GB/Z**：红队/破限类合规自审与标注指引 |
| **G9** | **分发形态与供应链**：git 安装的 `prepare` 脚本可在安装时执行任意代码；pin 只覆盖 format-1 git source | `publish.md:181`：allowBuilds = "permission to execute the package's code at install time"，仅**建议** pin commit；format-1 `git.commit` 40-hex 是唯一硬约束 | **GB 强制性**：优先发布预构建 npm 包、git 源必须 pin；**GB/T**：`prepare` 脚本规范 |
| **G10** | **许可与作者身份**：第三方包无 license 要求、无作者身份/签名校验 | `verify-dsh-package-licenses.ts` 正则写死 `/^@deepseek-ai\/dsh(?:-|$)/`，只管自家 | **GB 强制性**：license 必填且可解析；**GB/T**：作者身份与来源声明 |
| **G11** | **第三方可执行的自检工具链**：48 个 verify-* + doc-sync + hygiene 全部仓库内不可复用 | `scripts/AGENTS.md`、run-gates.ts 均绑定仓库根与 workspace；唯一发布的校验库 `plugin-market-index` 只校验 index 不校验插件包 | **GB/T**：参考实现与 CLI 工具规范（标准必须配可复用工具，否则无法落地） |
| **G12** | **命名与前缀**：`dsh- in:name` 命中 55,519（含 `xxx-dsh-yyy` 误报）；Dshell / DsHidMini / DSharpPlus / DNC-DShop 撞名 | `CONTRIBUTING.md` 无命名规范；`AGENTS.md` 的 `@deepseek-ai/dsh-<name>` 只约束官方包 | **GB/T 推荐性**：命名与前缀规范、撞名处置 |
| **G13** | **生命周期状态机器可读**：🧊FROZEN / 🚫RETIRED 只存在于 README 文本 | `MarketVersion` 仅 version/publishTimestamp/source/engines；`MarketInstallationStatus` 不含废弃/退役/迁移建议 | **GB/T 推荐性**：生命周期状态字段与迁移指向 |

---

# 四、可直接作为标准条款蓝本的现存资产（复用优先级）

1. **可直接引用为规范文本**（第三方今天就能照做）
   - `packages/util/plugin-market-index/src/types.ts` —— format-1 schema（含 git 40-hex commit pin、版本降序唯一、icon 解析规则）。
   - `docs/user/guide/plugin-market.md` —— index 发布规范（128 MiB、https、无凭据、相对图标）。
   - `docs/cookbook/adding-a-package.md` §5 —— 显示元数据/locale/icon/detail 规范。
   - `docs/user/develop/basic/publish.md:66` —— `engines.dsh` 语义；`:161-186` —— 分发形态与 `prepare` 陷阱。
   - `packages/boot/plugin-manager/src/install-spec.ts:15-19` —— 4 类安装 spec 与绝对路径规则。

2. **需要重实现才能给第三方用**（逻辑正确但绑定仓库）
   - `plugin-compatibility.ts` 的 `evaluatePluginCompatibility`（纯函数，可抽成 CLI / npm 包）。
   - `install-spec.ts` 的 `parseInstallSpec`（纯函数）。
   - `index-url.ts` 的 `normalizeIndexUrl`（3 条规则）。
   - `bundle-platform.ts` 的 `assertBundlePlatform`。

3. **只能作方法论范本，不能直接搬**
   - 根/子树 `AGENTS.md` 体系 —— 值得抄的是"**每条规则自包含 + 链接到 home 文档 + 配一个可执行 verify-* 脚本**"这一闭环方法论，
     以及 `docs/AGENTS.md` 的 "one home per fact" 分层与字数预算机制。
   - `scripts/run-gates.ts` 的门禁聚合方式（`doc-sync` / `hygiene` / `ci-*` 分组 + `quick` 子集）。
   - `scripts/AGENTS.md` 对门禁脚本自身的要求（shell-free、路径归一、防语料收窄、每种 admitted/excluded 形式都要测）。

---

# 五、给后续两路的交接要点

- **给「标准条款设计」路**：G1–G13 中，**G1 / G2 / G3 / G4 / G5 / G6 / G8 / G9 / G10 应进 GB 强制性**；
  **G7 / G11 / G12 / G13 应进 GB/T**；**G5 的预发布适配、G8 的红队合规自审应配 GB/Z**。
- **给「标准落地/工具」路**：第三方今天唯一能直接 `import` 的官方校验库只有 `@deepseek-ai/dsh-plugin-market-index`（v0.2.2-alpha.2，MIT，public）。
  若要让 GB/T 级条款可执行，必须新产出至少一个**独立 npm CLI**（同时校验插件包 manifest 与 index 文件），
  否则标准只有文档没有门禁——这正是当前生态 2,686/7,723/16,360 三口径并存的技术根因。
- **待确认（不在 A 路范围）**：`dsh-purge-plus` 适配 `0.2.1-rc.2` 的具体 `engines.dsh` 写法、`dsh-plugin-catalog` 3,917 条的字段完整度，
  需要联网或本地抓取才能取证；本路严格未联网、未修改仓库。

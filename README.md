# dsh-standards

> **非官方、非认证、非安全审计。** 这是 DSH 插件规范与实践草稿（canonical: dsh-standards），不代表 DeepSeek 官方背书。
> `"DeepSeek Harness"` 是 DeepSeek 的商标；本项目只使用 `DSH` 缩写。
>
> ⚠️ **修改必须说明**：复制或修改本仓文本时，必须在显著位置给出 Change Notice（来源 commit、改了哪个章节、改了什么、为什么、日期）。见 [`MODIFICATION-POLICY.md`](MODIFICATION-POLICY.md)。

一个项目，三层采用深度：

| 层 | 规范/实践 | 当前状态 |
|---|---|---|
| 1 | **DSH-ENTRY 入门规范** | 18/18 `recognized`；base-only 10/18 verified（8 clean + 2 gate-reject）；real web profile 18/18 verified（16 clean + 2 gate-reject）；client 15/15 loaded；18/18 clean 未达成 |
| 2 | **DSH-FLOW 顺畅规范** | draft；fixture 上 J1/J2/J4/J6 **12 PASS**；J3/J7 fixture runtime；J5/J8 static preflight；10 个真实包 **78 PASS / 4 FAIL / 2 blocked / 66 not-run** |
| 3 | **DSH-BOOST 加速实践** | draft；LEV-1–8 **8/8 measured**（loader / context / provider-capture / synthetic timer；非生产基线） |

## 先看什么

- [START-HERE](START-HERE.md) — 新会话先读的一页入口
- [51-新会话操作手册](51-新会话操作手册.md) — 仓库地图、命令、权限、常见坑
- [00-索引](00-索引.md) — 全包路由
- [31-DSH-ENTRY 入门规范](31-DSH-ENTRY入门规范.md) — 内部条款
- [99-DSH-ENTRY 兼容性画像（对外版）](99-DSH-ENTRY兼容性画像-对外版.md) — 4–6 页对外版
- [32-DSH-FLOW 顺畅规范](32-DSH-FLOW顺畅规范.md) — J1–J8
- [33-DSH-BOOST 加速实践](33-DSH-BOOST加速实践.md) — 8 条 LEV
- [34-三层分级模型（GB/GB-T/GB-Z 类比）](34-三层分级模型-GB-GBT-GBZ类比.md) — 为什么是三层、怎么读
- [35-三层开发建议与验收清单](35-三层开发建议与验收清单.md) — 作者最短路径 / 评审清单
- [36-插件全生命周期与工具链](36-插件全生命周期与工具链.md) — 从脚手架到退役
- [37-PerryLink 插件生态三层对照](37-PerryLink插件生态-三层对照与升级清单.md) — 我的仓怎么升级
- [38-三层标准 RFC](38-RFC-三层标准-待商议问题.md) — 内测群商议的 8 个问题
- [39-五工具定位与贡献](39-五工具定位与贡献.md) — guide/doctor/cert/portal/catalog 的角色
- [40-五工具全面转向方案](40-五工具全面转向方案.md) — 以三层为主轴的迁移计划
- [42-标准体系缺口](42-标准体系缺口-认证检验认可.md) — 认证/检验/认可/监督还差什么
- [43-缺口总账与 AI 可执行方案](43-缺口总账与AI可执行方案.md) — **全部缺口、AI/Human/模板/删除裁决、90 天 P0–P3**
- [44-角色治理与贡献机制](44-角色治理与贡献机制.md) — **角色阶梯、DCO+DCT（CLA 式）、COI、申诉、AI 职员**
- [45-三用途落地](45-三用途落地-官方市场开发者.md) — **官方前沿探索 / 市场参考 / 开发者指南**
- [P0-P2 执行状态](P0-P2-STATUS.md) — 逐项 DONE / PARTIAL / REPLACED
- [46-剩余事项与执行建议](46-剩余事项与执行建议.md) — 还差什么、先做什么、什么不做
- [47-配套插件发布记录](47-配套插件发布记录-2026-11-02.md) — guide/doctor/kit/upgrade/cert-mcp 的 npm + Release
- [48-配套包命名研究](48-配套包命名研究-2026-11-02.md) — dsh-* 占用情况与命名备选
- [49-配套包改名迁移记录](49-配套包改名迁移记录-2026-11-02.md) — clinic / scaffold / primer / codemod 的新旧仓映射、指针与 deprecate
- [50-新会话交接提示词](50-新会话交接提示词.md) — 无上下文新会话的启动提示词（不依赖旧会话）
- [scheme/](scheme/SCHEME-v1.md) — A–E / A–D 评价方案与 rubric
- [evidence/](evidence/README.md) — 追加式证据链与复跑说明
- [97-采纳可行性评估](97-采纳可行性评估.md) — 官方路径、缺口、90 天
- [98-内测群与官方沟通包](98-内测群与官方沟通包.md) — 对外话术

## 快速命令

```bash
cd 40-checker
node --test test/*.test.mjs

# 只做结构识别（不声明运行）
node bin/dsh-plugin-verify.mjs <plugin-dir> --scope entry --entry-claim static

# 声明运行（bundle 需要 host）
node bin/dsh-plugin-verify.mjs <bundle-dir> --scope entry \
  --host /path/to/@deepseek-ai/dsh-app-boot/lib/index.js

# 三层自检（ENTRY 自动；FLOW/BOOST 证据文件）
node bin/dsh-levels.mjs audit <dir> --format json

# J1 安装/卸载旅程
node scripts/journey-runtime.mjs --package <dir> --json

# 治理/贡献/评价记录检查
node scripts/governance-check.mjs
node scripts/attestation-check.mjs
node scripts/claim-check.mjs
node scripts/dco-check.mjs --range HEAD~1..HEAD
node ../publish/verify.mjs --id DSH-ATT-2026-001

# LEV-7 有界并行基准
cd ../examples/boost
node lev7-bench.mjs 64 20
```

## 当前硬数据

- 18 包 entry static：**18/18 recognized，0 clean**；
- 18 包 DS-C static：**0 PASS / 9 WARN / 9 FAIL**；
- 18 包 base-only runtime：**18/18 有原始 JSON；10/18 G3 verified，8 partial，0 error**；host gate 后 **8 clean + 2 reject + 8 partial**；
- client runtime：**15/15 `client-module-loaded`**（真实 Chromium）；web-app **4/4 loaded**；
- 不可用：**0 plugin code FAIL；2 host-gate reject（telemetry/verification）**；
- 检查器：**73/73 tests**（含治理/DCO/评价记录/声明/验真/链/漂移测试）；
- J1：**6 PASS + 1 WARN**；LEV-3：volatile **0/20** vs control **20/20** remount；LEV-6：稳定 prefix **100%** vs 易变 **0%**；LEV-7：**8.24×**（合成，非生产基线）。

## 给插件开发者：什么时候用哪个工具

| 阶段 | 命令 | 工具 | 产出 |
|---|---|---|---|
| 开始 | `dsh-dev new` / `dsh-start new` | dsh-plugin-start | 可安装骨架 |
| 静态预检 | `dsh-dev check` / `dsh-ready` | dsh-plugin-ready | static report（host `not-run`） |
| 宿主契约 | `dsh-clinic --only R,K,X` | dsh-plugin-doctor/clinic | 宿主契约 |
| 隔离安装 | `dsh-test-drive` | dsh-test-drive | C3 证据 |
| 市场提交 | `entry-validate --host-evidence` | 本仓 40-checker | C1–C8 + C3 |
| 工具管理 | `dsh-tools list/doctor/install` | dsh-plugin-tools | 版本/安装指引 |

完整图见 [docs/DEVELOPER-JOURNEY.md](docs/DEVELOPER-JOURNEY.md)；工具家族见 [dsh-plugin-devtools](https://github.com/PerryLink/dsh-plugin-devtools)。旧名项目见 [RENAMES.md](RENAMES.md)。

## 治理与贡献

- 角色与权限：`governance/roles.json`；一页说明：`GOVERNANCE.md`
- 贡献：DCO 1.1 + DCT v1（`dsh-ct/1`，许可而非版权转让）；见 `CONTRIBUTING.md`
- 标志：`governance/mark-policy.md`（自动授予、可撤销、必须带免责声明）
- 申诉：`governance/appeals.md`；AI 只受理/计时/复核，人类终裁
- 三用途采用包：`adoption/{official,market,developer}/`（按 `45` 落地）

## 边界

- 不收费、不卖等级、不卖排名；
- 不做认证/安全审计；
- 不把 static 写成 runtime；
- 不把 10/18 base-only 写成 18/18 web/生产；不把 `client-module-loaded` 写成 UI/认证；
- 不声称官方推荐/采纳；
- 不声称认证/认可/安全审计；A–D 是质量等级，不是 ENTRY/FLOW/BOOST。

## 许可

- 文本/规范/文档/翻译：**CC BY 4.0**（`LICENSE-CC-BY`）；**修改必须按 `MODIFICATION-POLICY.md` 给出 Change Notice**；
- 代码/脚本/schema：**Apache-2.0**（`LICENSE-APACHE`，含专利授权与防御终止）；
- 标志/badge：单独规则，见 `governance/mark-policy.md`，不随上述许可授权；
- 贡献：DCO 1.1 + DCT v1，不要求版权转让。

## 目录

```text
00-99*.md         规范/研究/画像/沟通包
40-checker/       检查器、J1 旅程、bundle smoke、样本框、结果
governance/       角色/贡献条款/标志/申诉/COI/决策日志 + 机器检查
adoption/         official / market / developer 三套采用包
spec/             levels.json + clauses.json + schemas（evidence / report / attestation）
examples/boost/   LEV-7 参考实现与基准
publish/          labels 示例 + 评价记录 JSON
```

## 先行项目

`dsh-plugin-standard`（lanbaolu）是同生态的先行项目；本项目与其无隶属关系，引用/对比时将标注来源。许可见 `LICENSE`（文本 CC BY 4.0 / 代码 Apache-2.0）；修改必须说明。

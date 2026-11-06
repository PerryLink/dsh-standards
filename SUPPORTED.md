# SUPPORTED.md — 支持矩阵（host × Node × checker）

> **本文件由结果生成，禁止手写。**
> 唯一允许的输入：① `40-checker/results/**/*.json` 的 `anchor.*` / `generatedAt` / `subject` / `coverage`；② `.github/workflows/*.yml` 的 matrix 与钉住的宿主版本；③ `gh api repos/PerryLink/dsh-standards/actions/runs` 的 run 元数据。三者对不上的格子不许填。
> **TODO: generate** —— 生成器尚未实现（gap-audit `G6` → `P1-3`）。`BEGIN GENERATED` 与 `END GENERATED` 之间是 **2026-11-06 的手工种子**：每一格都能用 §2 的锚复算，没有一格来自记忆、印象或「应该没问题」。生成器落地后，手改此段即视为伪造证据，CI 用生成结果逐字比对。

**今天 0 格是 `runtime`。** 这不是漏填：241 条带 `anchor.dsh=0.2.2-alpha.2` 的结果里，`anchor.scanner` 有 239 条是 `dsh-plugin-verify@0.1.0`（另 2 条为空），而 1.0.0 于 2026-11-03 才发布——**没有任何一条 runtime 结果能记到 1.1.x / 1.2.1 / 1.2.2 名下**。本表要暴露的正是这件事：PASS 目前不可移植。

## 0 值域（只允许这五个值）

| 值 | 含义 | 判定门槛 |
|---|---|---|
| `runtime` | 该 host × Node × checker 三元组有**可归属**的真实宿主 boot/measure 结果 | 结果 JSON 的 `anchor.dsh` 等于该 host，且结果能记到该 checker 版本名下（`checkerVersion` 字段，或结果 commit 就是该版本的 tag commit） |
| `partial` | 三元组至少一轴有证据，但有一轴缺 | 宿主 runtime 证据存在但由**别的**检查器版本产出；或该 host × Node 只跑过检查器自测 / 纯静态 |
| `not-run` | 组合可跑，但从未跑 | 没有结果文件，或结果文件的 `anchor` 对不上 |
| `blocked` | 尝试过，被外部条件挡住 | 必须写明条件（宿主装不上 / 沙箱不可用 / CI 红 / 平台未测） |
| `NA` | 宿主自己声明不支持该 Node 线 | `engines.node` 排除该版本，跑也没有意义 |

`stale` 不是格子值，是**作废规则**：锚一变，该格退回 `not-run`（见 §4）。

## 1 矩阵

平台限定 **Linux**（`ubuntu-latest` / WSL2 Ubuntu 24.04）；Windows 见 §3 第 5 条。Node 两列是**宿主引擎线**：`22.19`、`24.9` 是下限，实际量到 `v22.23.4`（Windows 作业日志，CI `setup-node: 22`）与 `v24.22.1`（本地 / entry18 运行环境）——精确小版本未逐版跑。

<!-- BEGIN GENERATED:supported -->
| host | Node | checker 1.1.x | checker 1.2.1 | checker 1.2.2 |
|---|---|---|---|---|
| `0.2.1-rc.5` | 22.19 | `not-run`<br>A4 | `not-run`<br>A4 | `not-run`<br>A4 |
| `0.2.1-rc.5` | 24.9 | `not-run`<br>A5 | `not-run`<br>A5 | `not-run`<br>A5 |
| `0.2.2-alpha.2` | 22.19 | `NA`<br>A9 | `NA`<br>A9 | `NA`<br>A9 |
| `0.2.2-alpha.2` | 24.9 | `partial`<br>A1·A2 | `partial`<br>A1·A8 | `partial`<br>A1·A8 |
| `0.2.2-rc.1` | 22.19 | `NA`<br>A9 | `NA`<br>A9 | `NA`<br>A9 |
| `0.2.2-rc.1` | 24.9 | `not-run`<br>A7 | `not-run`<br>A7 | `not-run`<br>A7 |
<!-- END GENERATED:supported -->

### 1.1 逐行依据

| 行 | 已有的证据 | 缺的那一轴 | 下一步 |
|---|---|---|---|
| `0.2.1-rc.5` / 22.19 | 检查器自测在 Node 22 绿（1.1.x 时代双 OS 绿、1.2.2 时代 ubuntu 绿，A4） | 宿主从未在 Node 22 上 boot | 在 Node 22 装 `0.2.1-rc.5`，跑一条 entry18/webruntime 样本 |
| `0.2.1-rc.5` / 24.9 | 本机 0.2.1-rc.5 + node v24.22.1 的采集环境存在（A5），但结果锚是 `alpha.2` | 1.1.x/1.2.x 无该 host 的 runtime 重跑 | 同上，把锚钉成 `0.2.1-rc.5` 再跑 |
| `0.2.2-alpha.2` / 22.19 | 无（宿主引擎排除） | — | 不跑；若上游放宽 `engines.node` 再看 |
| `0.2.2-alpha.2` / 24.9 | 18/18 ENTRY shard 与 15/15 client 在 alpha.2 + node 24 上真实跑过（A1、A2），但产出方是 1.0 前的检查器 | 1.1.x/1.2.x 的 runtime 重跑；1.2.1 起 FLOW 旧证据被改判（A8） | 用 1.2.2 + `--flow-evidence` 在 alpha.2 上重跑，得 `sandbox-attested` 才有 FLOW runtime |
| `0.2.2-rc.1` / 22.19 | 无（宿主 `engines.node >=24.9.0`，A7） | — | 不跑 |
| `0.2.2-rc.1` / 24.9 | 宿主源码是 `dsh-root 0.2.2-rc.1`（A7），但没有可 boot 的 rc.1 安装包；398 条结果里 `anchor.dsh=0.2.2-rc.1` 为 **0 条** | 全部 | 先修默认锚（§5），装 rc.1 后跑一次 ENTRY + FLOW |

## 2 证据锚

| 锚 | 类型 | 值 | 证明什么 | 复核 |
|---|---|---|---|---|
| A1 | CI run + 结果文件 | entry18-runtime 工作流；宿主钉 `@deepseek-ai/dsh@0.2.2-alpha.2`（workflow L58/L69）、`node-version: 24`（L55）；run [`41219602842`](https://github.com/PerryLink/dsh-standards/actions/runs/41219602842)（2026-10-31，success，19/19 作业）；结果 `40-checker/results/entry/18/fullbase/summary.json` | alpha.2 + node 24 上 18/18 shard 真 boot：10 verified（8 admit + 2 gate-reject）、8 partial、0 failed | `python3 -c "import json;d=json.load(open('40-checker/results/entry/18/fullbase/summary.json'));print(d['targetDshVersion'],d['count'],d['status'])"` |
| A2 | CI run + 结果文件 | web-runtime 工作流；`DSH_VERSION: 0.2.2-alpha.2`（workflow L188）、`node-version: 24`（L184）；run [`41218358951`](https://github.com/PerryLink/dsh-standards/actions/runs/41218358951)（success；前一跑 41217382935 failure）；结果 `40-checker/results/webruntime/REPORT.md` 与各 `<id>/probe.json` | 15/15 client-bearing 包 `client-module-loaded`、4/4 web-app 加载；**不**声称 UI-rendered | `head -12 40-checker/results/webruntime/REPORT.md` |
| A3 | 结果文件（静态） | `40-checker/results/entry/18/*.json` 等的 `anchor`：`{repo: deepseek-ai/deepseek-harness, commit: ce7073d5…, scanner: dsh-plugin-verify@0.1.0, dsh: 0.2.2-alpha.2, cordis: 4.0.6-alpha.1}` | 静态结果锚在 alpha.2；`anchor.runtime` 只在跑 runtime 子检查时落值，且 34/398 条写的是占位符 `<dsh-checkout>/vendor/cordis/lib/index.js`——**钉不住宿主构建** | `grep -o '"dsh": "[^"]*"' 40-checker/results/entry/18/ci-diet.json` |
| A4 | CI run | cross-platform 工作流：`node-version: 22`、ubuntu + windows、`node --test test/*.test.mjs`。run [`42177690479`](https://github.com/PerryLink/dsh-standards/actions/runs/42177690479)（v1.2.2）：ubuntu **success**、windows **failure**（159 tests / 154 pass / 2 fail / 3 skipped，失败项为 `flow-collect` 的两条，`flow-evidence.test.mjs:280,317`）；1.2.1 的 run 42173635450、1.2.0 的 run 42169481664 同样 failure；1.1.x 时代 41866400694、41869228199 双 OS success | Node 22 线上检查器自测的绿/红；**不含宿主 boot** | `TOK=…; curl -s -H "Authorization: Bearer $TOK" …/actions/runs/42177690479/jobs` |
| A5 | 结果文件（环境） | `40-checker/results/triage/triage.json` → `environment.localDshVersion=0.2.1-rc.5`、`node=v24.22.1`、`anchorDshVersion=0.2.2-alpha.2`；带 `generatedAt` 的 56 个 JSON 只落在 2026-10-31 / 2026-11-01 两天 | 0.2.1-rc.5 只作为**本机宿主**出现，采集目标仍是 alpha.2；产出方早于 1.0.0 | `python3 -c "import json;print(json.load(open('40-checker/results/triage/triage.json'))['environment'])"` |
| A6 | CI run | publish 工作流（`node-version: '24'`，发布前 `npm test`）：run [`42177690951`](https://github.com/PerryLink/dsh-standards/actions/runs/42177690951)（v1.2.2 push，success） | 1.2.2 的 159 条自测在 Node 24 上绿（Linux） | 同上，查 `actions/runs/42177690951/jobs` |
| A7 | 源码（宿主） | `/home/yy/deepseek-harness/package.json`：`@deepseek-ai/dsh-root 0.2.2-rc.1`，`engines.node: ">=24.9.0"` | 真实宿主是 rc.1，且 rc.1 不接受 Node 22；但无任何一致性结果锚在 rc.1 | `python3 -c "import json;print(json.load(open('/home/yy/deepseek-harness/package.json'))['engines'])"` |
| A8 | 结果文件（已失效） | `40-checker/results/flow/real/*.json`：schema `dsh-flow-runtime/1`，10 个包（`index.json` 除外）：J1 `pass` 7、J2 `pass` 7、J4 `pass` 8、J6 `pass` 1，仅 `ci-diet` 四态全 `pass`；`generatedAt` 2026-11-01 | 1.2.1 起 v1 链路 `deprecated` → 这些 FLOW pass 全部退回 `not-run`（见 `CHANGELOG-RULES.md`） | `python3 -c "import json;print(json.load(open('40-checker/results/flow/real/ci-diet.json'))['verdicts'])"` |
| A9 | 源码（规范） + A7 | `35-三层开发建议与验收清单.md:125`：Node `>=24.9.0`「自 0.2.2-alpha.2 起；0.2.1-rc.5 仍是 `^22.19` 或 `>=24`」；A7 的 rc.1 声明一致 | 0.2.2 线的 Node 22 格为 `NA`；0.2.1-rc.5 的 Node 22 格仍成立 | `sed -n '125p' 35-三层开发建议与验收清单.md` |

行号均按 `cc378b2`（2026-11-06 HEAD）。`40-checker/src/cli.mjs`、`report.mjs` 正被其他改动波及，行号可能漂移——复核请按符号名 grep，别背行号。

全库锚分布（2026-11-06 实测，398 个 JSON）：`anchor.dsh` = `0.2.2-alpha.2` **241** 条、无锚 **157** 条、`0.2.2-rc.1` **0** 条、`0.2.1-rc.5` **0** 条；`anchor.scanner` = `dsh-plugin-verify@0.1.0` **239** 条。

## 3 not-run 条件（单列）

一条结果落在下列任一条件，就只能写 `not-run` / `blocked`，不得写 `runtime`、也不得用「已识别」代替：

1. **缺宿主包**：没有可 `boot()` 的 `@deepseek-ai/dsh@<该版本>`（rc.1 本机未装 → rc.1 行全 `not-run`）。
2. **无 web-app**：包只有 `dsh.client` 而无 web profile → G4 只静态、G5 不测；client runtime 不得写成 runtime。
3. **client-only / 单半边**：缺 `exports["./client"]` 或只有 shell，host 侧 boot 通过也只算 ENTRY。
4. **沙箱不可用**：`unshare -Urn` / `prlimit` 不生效 → `sandbox-degraded`，1.2.1 起**永不** runtime（`40-checker/src/flow-evidence.mjs:189`、`40-checker/scripts/level-audit.mjs:254`）。
5. **平台未测**：Windows 的 Node 22 自测红（A4，2/159 失败）→ Windows 上的任何行列都不出结论；本表只覆盖 Linux。
6. **检查器版本不可归属**：结果缺 `checkerVersion`（`anchor.scanner` 硬编码 `0.1.0`）→ 任何结果都不能记到 1.1.x/1.2.1/1.2.2 名下。这是 §1「0 格 runtime」的唯一原因。
7. **锚过期**：`expiresAt` 已过（`40-checker/scripts/stale-check.mjs` 的 `effective()`）→ 旧 PASS 必须重跑，不能复用。

## 4 锚变即 stale

锚是一个元组，不是单个字段：

```
(repo, commit, checkerVersion, dsh, cordis, nodeMajor, ciRunUrl)
```

**任一维变化，该格立即作废**：退回 `not-run`，在审计日志里记 `stale`，重跑前不得引用旧值。具体触发：

- 宿主 `dsh` 预发布位变化（`0.2.2-alpha.2` → `0.2.2-rc.1`）——本次审计的核心事实；
- 检查器次版本变化（`1.2.1` → `1.2.2`），或判定语义变化（以 `CHANGELOG-RULES.md` 的「是否须重跑=是」为准）；
- Node 大版本变化（22 → 24）；
- `cordis` 变化（当前锚 `4.0.6-alpha.1`）；
- 同一 `(repo, dsh)` 的 commit 变化。
- 90 天复审到期（`MAINTAINERS.md` §Bus factor 的 90-day review）。

与 `stale-check.mjs` 的分工：它查 attestation 的 `expiresAt`；本表查**锚元组**。两者都只允许「重跑」，不允许「续期」。

## 5 默认 runtime 锚的取法

**现状（源码事实）**：`40-checker/src/manifest.mjs` 的 `DEFAULT_RUNTIME_VERSION = '0.2.2-alpha.2'`（`cc378b2` 时在 :15）是唯一默认值来源；`cli.mjs` 的 `--runtime-version` 帮助文本与 `runtimeVersion` 初值都取它。不跑 runtime 时 `anchor.runtime` 为 `null`（398 条里 207 条 null、34 条写占位符 `<dsh-checkout>/…`）。

**已知后果**：真实宿主是 `0.2.2-rc.1`（A7），默认锚却是 `alpha.2`。gap-audit 实测（`FINAL-PLAN.md` §C2，2026-11-06）：**默认锚产生 56 条隐藏 detail FAIL，显式 `--runtime-version 0.2.2-rc.1` 后只剩 2 条**。差值是锚造成的，不是插件造成的。这就是本表 rc.1 行全 `not-run` 的原因：不显式指定锚，rc.1 的 FAIL 数是假的。

**取法（应改，`P0-1`）**：

1. 默认值改为**读宿主实际版本**：`dsh --version`，或 `<app-boot>/package.json` 的 `version`；读不到才回退到常量。
2. 报告写 `anchor.runtimeSource ∈ {host, cli, default}` 与 `anchor.suspect`：`host` 与 `anchor.dsh` 不一致 → `suspect: true`。
3. `suspect` 不改变结论，但 detail 数必须单列，并且**不得**把 suspect 下的 detail FAIL 计入聚合。
4. 验收：同包连跑两次，只改 `anchor.suspect` 与 detail 数，结论与 exit code 不变。

## 6 生成契约（TODO: generate）

- **输入**：`40-checker/results/**/*.json`；`spec/levels.json` 的 evidence 枚举（`not-run, recognized, static, runtime, measured, blocked, failed, stale`）；`.github/workflows/*.yml` 的 `node-version` 与钉住的宿主版本；`gh api …/actions/runs`（run id / conclusion / head_sha / created_at）。
- **输出**：只替换 `<!-- BEGIN GENERATED:supported -->` 与 `<!-- END GENERATED:supported -->` 之间的矩阵。
- **结果 JSON 还缺的字段**（缺了就只能生成 `not-run`）：`checkerVersion`、`nodeVersion`、`ciRunUrl`、`runtimeSource`。`anchor.scanner` 现在写死 `dsh-plugin-verify@0.1.0`，必须补真实包版本。
- **CI 校验**：重跑生成器，与提交内容逐字比对；不一致 → fail（防手改）。生成器同时校验每个 `runtime` 格必须能定位到 `results/` 里的文件与一条 CI run。
- **TODO: generate** 的三个具体缺口：① 生成器脚本；② 结果 JSON 的四个字段；③ `SUPPORTED.md` 的历史轮次快照（每次锚变留一份，才能证 `stale`）。

## 7 治理现状（一句话，别读成背书）

`MAINTAINERS.md` §Bus factor 的 `BUS_FACTOR=1` 是现状；过渡方案（建议，未落地）是 Stage 0.5 邀 1 名外部 shadow reviewer（无 merge 权、评审报告公开）、COI 命中时由其终裁、招到人之前全量强制 `selfAssessed:true`——在它落地前，本表只声称「结果可复算」，**不声称**外部独立评审或任何认证。

## 8 已知局限

- 0 格 `runtime`：所有 runtime 证据的产出方都早于 1.0.0（A1/A2/A8），无法归属到本表的三列。
- Node 只量到 `v22.23.4` / `v24.22.1`，`22.19`、`24.9` 是引擎线而非实测版本。
- 仅 Linux；Windows 的 Node 22 自测红（A4），未修前不下结论。
- 宿主 rc.1 从未被跑过（0/398），且默认锚会自动把它算成 alpha.2（§5）——**先修锚，再看矩阵**。
- `1.1.0`、`1.0.4`–`1.0.7` 从未发布到 npm；`1.1.1` 有 tag 但 npm 发布失败（run 41855336115）。「1.1.x」列因此只能用 `1.1.2` 代表。

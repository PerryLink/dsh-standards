# SUPPORTED.md — 支持矩阵（host × Node × checker）

> **本文件由结果生成，禁止手写。**
> 唯一允许的输入：① `40-checker/results/**/*.json` 的 `anchor.*` / `generatedAt` / `subject` / `coverage`；② `.github/workflows/*.yml` 的 matrix 与钉住的宿主版本；③ `gh api repos/PerryLink/dsh-standards/actions/runs` 的 run 元数据。三者对不上的格子不许填。
> **TODO: generate** —— 生成器尚未实现（gap-audit `G6` → `P1-3`）。`BEGIN GENERATED` 与 `END GENERATED` 之间是 **2026-11-06 的手工种子**：每一格都能用 §2 的锚复算，没有一格来自记忆、印象或「应该没问题」。生成器落地后，手改此段即视为伪造证据，CI 用生成结果逐字比对。

**今天仍是 0 格 `runtime`，但 rc3 有了可归属、可复现的 `partial` 证据。** 398 条旧静态结果保持原样（**asOf 2026-11-14 14:40 复算**：`anchor.dsh=0.2.2-alpha.2` **241** 条、无锚 **157** 条；A12 记录的 243/155 是 05:23 前口径，差 2，以本段命令为准；`anchor.dsh` 为 `0.2.2-rc.1`/`rc.2`/`rc.3` 的各 **0** 条）。2026-11-14 14:40 新落库 **67 条 rc3 runtime raw JSON**（ENTRY 19 + web 48；raw schema 无 `anchor` 字段，逐条 `dshVersion=0.2.2-rc.3`），见 **A13（第一跑，含 1 error）**：ENTRY 18/18 行（10 verified / 7 partial / 1 error）、web 17/18 行（14/15 client-bearing 加载，1 个私有 fixture 无法安装）。2026-11-14 15:30 重跑并落库 **67 条 r2 raw JSON**（ENTRY 19 + web 48），见 **A14**：ENTRY 18/18 = **17 executed + 1 blocked**（10 verified / 7 partial / 0 failed / 0 error / 1 blocked），web 18 行 = **14 measured client + 3 measured shell-only + 1 blocked**（14/14 measured client rows `client-module-loaded`、4/4 webapp），两次 run 均 **run-level success**。r2 起 rc3 runtime 是**确定性**的「17 执行 + 1 外部 blocked」，不再是 r1 的 1 error。归因：r1 由 1.6.11-era tree（`e73b77f9`）产出、提交在 v1.6.12 发布 commit 上；r2 直接跑在 v1.6.12 之后的 main 提交 `943e67e4`（package.json 仍 1.6.12）上。两者在 `checker 1.6.12` 列都记 **`partial`**（不是 `runtime`：`YuJunZhiXue__dsh-purge` 这个 client 行外部不可得，web 15/15 不可能达成；且旧 398 条静态结果仍全在 alpha.2 锚）。

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

平台以 **Linux** 为主（`ubuntu-latest` / WSL2 Ubuntu 24.04）；2026-11-06 新增 **Windows 11 + Node 22** 行（A10）；2026-11-07 新增 **checker 1.4.1 列**与 **Windows 11 + Node `v24.22.1`** 行（A11，纯静态 check，非 runtime）；2026-11-14 按 rc3 复核追加 **`0.2.2-rc.2` / `0.2.2-rc.3`** 两行（A12 时点全 `not-run`；14:40 起 rc.3/24.9 行在新增的 1.6.12 列记 `partial`，A13）——2026-11-14 14:40 起新增 1.6.12 列，rc.3/24.9 行有可归属但未满覆盖的 runtime 证据（A13），15:30 的 r2 重跑把它变成确定性「17 executed + 1 外部 blocked」但覆盖仍非 15/15，故结论不变（A14）。其余 checker 列仍是旧的。Node 两列是**宿主引擎线**：`22.19`、`24.9` 是下限，实际量到 `v22.23.4`（Windows 作业日志，CI `setup-node: 22`）与 `v24.22.1`（本地 / entry18 运行环境）——精确小版本未逐版跑。 2026-11-14 追加 **`checker 1.6.12` 列**：rc.3 行有已落库的 runtime 证据（A13 第一跑含 1 error；A14 r2 确定性 17 executed + 1 外部 blocked），但 web 15/15 因外部 blocked 不可能达成，故只记 `partial`（A13·A14）；其余行该列 `not-run`。

<!-- BEGIN GENERATED:supported -->
| platform | host | Node | checker 1.1.x | checker 1.2.1 | checker 1.2.2 | checker 1.3.0 | checker 1.4.1 | checker 1.6.12 |
|---|---|---|---|---|---|---|---|---|
| Linux | `0.2.1-rc.5` | 22.19 | `not-run`<br>A4 | `not-run`<br>A4 | `not-run`<br>A4 | `not-run`<br>A4 | `not-run` | `not-run` |
| Linux | `0.2.1-rc.5` | 24.9 | `not-run`<br>A5 | `not-run`<br>A5 | `not-run`<br>A5 | `partial`<br>N1 | `not-run` | `not-run` |
| Linux | `0.2.2-alpha.2` | 22.19 | `NA`<br>A9 | `NA`<br>A9 | `NA`<br>A9 | `NA`<br>A9 | `NA`<br>A9 | `not-run` |
| Linux | `0.2.2-alpha.2` | 24.9 | `partial`<br>A1·A2 | `partial`<br>A1·A8 | `partial`<br>A1·A8 | `partial`<br>A1·A8 | `not-run` | `not-run` |
| Linux | `0.2.2-rc.1` | 22.19 | `NA`<br>A9 | `NA`<br>A9 | `NA`<br>A9 | `NA`<br>A9 | `NA`<br>A9 | `not-run` |
| Linux | `0.2.2-rc.1` | 24.9 | `not-run`<br>A7 | `not-run`<br>A7 | `not-run`<br>A7 | `not-run`<br>A7 | `not-run`<br>A7 | `not-run` |
| Windows 11 | `0.2.1-rc.5` | 22.19 | `partial`<br>A10 | `not-run`<br>A10 | `not-run`<br>A10 | `not-run`<br>A10 | `not-run` | `not-run` |
| Windows 11 | `0.2.1-rc.5` | 24.9 | `not-run` | `not-run` | `not-run` | `not-run` | `partial`<br>A11 | `not-run` |
| Linux | `0.2.2-rc.2` | 22.19 | `NA`<br>A9 | `NA`<br>A9 | `NA`<br>A9 | `NA`<br>A9 | `NA`<br>A9 | `not-run` |
| Linux | `0.2.2-rc.2` | 24.9 | `not-run`<br>A12 | `not-run`<br>A12 | `not-run`<br>A12 | `not-run`<br>A12 | `not-run`<br>A12 | `not-run` |
| Linux | `0.2.2-rc.3` | 22.19 | `NA`<br>A9 | `NA`<br>A9 | `NA`<br>A9 | `NA`<br>A9 | `NA`<br>A9 | `NA`<br>A9 |
| Linux | `0.2.2-rc.3` | 24.9 | `not-run`<br>A12 | `not-run`<br>A12 | `not-run`<br>A12 | `not-run`<br>A12 | `not-run`<br>A12 | `partial`<br>A13·A14 |
<!-- END GENERATED:supported -->

**1.3.0 列怎么读**：只有本机 Linux + Node `v24.22.1` 的 `npm test` 自测（N1）与静态检查，**没有** 1.3.0 的宿主 boot 结果，所以 1.3.0 列无 `runtime`。`partial` 只表示「自测 / 静态轴有证据」。1.3.0 未在 Node 22 或 Windows 上跑过 → `not-run`。

**1.4.1 列怎么读**：只有 Windows 11 + Node `v24.22.1` 上三包（`dsh-fast`、`dsh-plugin-radar`、`@perrylink/dsh-domain-pilot`）的**静态 `check`** 实测（A11）→ 该格 `partial`；Linux 各格 `not-run`（1.4.1 无宿主 boot；F4b 的静态合并用的是 1.4.0，不能记到 1.4.1 名下）。全列无 `runtime`。

**1.6.12 列怎么读**：只有 Linux × `0.2.2-rc.3` × Node `24.9` 格是 `partial`（A13·A14）。第一跑 **A13** 落成 `40-checker/results/entry/18/fullbase-rc3-20261114/`（18 行，1 行为私有 fixture clone 失败 → run 红）与 `40-checker/results/webruntime-rc3-20261114/`（17/18 行测到，14/15 client-bearing 加载，分母门禁因此红）。r2 重跑 **A14** 落成 `…-r2/` 两个新目录：**r2 起 rc3 runtime 是确定性的「17 执行 + 1 外部 blocked」，不再是 18 行里的 1 error**——ENTRY 18/18 = 17 executed + 1 blocked（`summary.json` 的 `blocked:1` / `coverage.executed:17`），web 18 行 = 14 measured client + 3 measured shell-only + 1 blocked（denominator 断言：rows 18 / client 14 / skipped 4 / webapp 4 / blocked 1，全绿），两次 run 均 run-level success。归因：r1 提交在 v1.6.12 发布 commit 上、run 由 1.6.11-era 树执行；r2 直接跑在 v1.6.12 之后的 main 提交 `943e67e4`。但因为 blocked 行让 web 15/15 在构造上不可能达成，按 §0 仍只记 `partial`，**不升 `runtime`**。

**Windows 行怎么读**（2026-11-07 实测，A11）：1.1.x 的 Windows + Node 22 自测绿（A4）→ `partial`；1.2.x 自测红、1.3.0 未在 Windows 跑 → `not-run`。1.4.1 行用 **Windows node `v24.22.1`** 实跑三包（`check` 默认 / `--no-exec` / `--json` / `--allow-host-probe`）：结果与同机 WSL2 Ubuntu 24.04 同包**逐字一致**（路径归一后 JSON 全等；`checked=12/14`；FAIL 0/1/0；默认锚 `0.2.2-alpha.2`、source=default/suspect=true；probe 得 host `0.2.1-rc.5`、source=host/hostVersionSource=probe），故 Windows/24.9 的 1.4.1 格记 `partial`——**纯静态，不是 runtime**。Windows 没有 `unshare -Urn` / `prlimit` → `sandbox-degraded`；`flow collect --sandbox` 更早一步卡在 `npm pack`（Node 不能无 shell spawn `npm.cmd`，exit 127），故 Windows 的 runtime 路径仍 `not-run`。`check --format json` 是用法错误（exit 3，JSON 用 `--json`）；裸 `dsh-standards <dir> --format json` 的 `dsh --version` 探测在 Windows 上失败（同样因 `.cmd` spawn）→ anchor 退 `fallback`（1.4.1 时代记录；1.6.x 只产 `cli`/`host`/`default`）。**WSL2 的 Linux 沙箱可用**（W1：`unshare` / `prlimit` 均通过），但「平台可用」不等于某个 host × Node × checker 组合已跑。

实测命令（`NODE`/`CHK` 用 Windows 形式；三包把最后一个参数换掉即可）：

```bash
NODE='/mnt/c/Program Files/nodejs/node.exe'
CHK='D:\_wintmp_g2\chk-head\bin\dsh-standards.mjs'   # HEAD 31900e1 的 git archive 副本
"$NODE" "$CHK" check 'D:\Projects\dsh\plugins\dsh-fast'                            # 默认 static + no-exec
"$NODE" "$CHK" check 'D:\Projects\dsh\plugins\dsh-fast' --no-exec
"$NODE" "$CHK" check 'D:\Projects\dsh\plugins\dsh-fast' --json                     # 默认锚 alpha.2/default/suspect
"$NODE" "$CHK" check 'D:\Projects\dsh\plugins\dsh-fast' --allow-host-probe --json  # host 0.2.1-rc.5/probe
"$NODE" "$CHK" check 'D:\Projects\dsh\plugins\dsh-fast' --format json              # exit 3：改用 --json
"$NODE" "$CHK" 'D:\Projects\dsh\plugins\dsh-fast' --format json                    # 裸检查器：Windows → fallback（1.4.1 时代）
"$NODE" 'D:\_wintmp_g2\chk-head\40-checker\bin\dsh-flow-collect.mjs' \
  --package 'D:\_wintmp_g2\radar\package' --sandbox --out 'D:\_wintmp_g2\flow.json' # exit 3 / npm pack 127
```


### 1.1 逐行依据

| 行 | 已有的证据 | 缺的那一轴 | 下一步 |
|---|---|---|---|
| `0.2.1-rc.5` / 22.19 | 检查器自测在 Node 22 绿（1.1.x 时代双 OS 绿、1.2.2 时代 ubuntu 绿，A4） | 宿主从未在 Node 22 上 boot | 在 Node 22 装 `0.2.1-rc.5`，跑一条 entry18/webruntime 样本 |
| `0.2.1-rc.5` / 24.9 | 本机 0.2.1-rc.5 + node v24.22.1 的采集环境存在（A5），但结果锚是 `alpha.2` | 1.1.x/1.2.x 无该 host 的 runtime 重跑 | 同上，把锚钉成 `0.2.1-rc.5` 再跑 |
| `0.2.2-alpha.2` / 22.19 | 无（宿主引擎排除） | — | 不跑；若上游放宽 `engines.node` 再看 |
| `0.2.2-alpha.2` / 24.9 | 18/18 ENTRY shard 与 15/15 client 在 alpha.2 + node 24 上真实跑过（A1、A2），但产出方是 1.0 前的检查器 | 1.1.x/1.2.x 的 runtime 重跑；1.2.1 起 FLOW 旧证据被改判（A8） | 用 1.2.2 + `--flow-evidence` 在 alpha.2 上重跑，得 `sandbox-attested` 才有 FLOW runtime |
| `0.2.2-rc.1` / 22.19 | 无（宿主 `engines.node >=24.9.0`，A7） | — | 不跑 |
| `0.2.2-rc.1` / 24.9 | 2026-11-06 时宿主源码是 `dsh-root 0.2.2-rc.1`（A7 历史），当时没有可 boot 的 rc.1 安装包；398 条结果里 `anchor.dsh=0.2.2-rc.1` 为 **0 条** | 全部 | 不单独补跑：rc.1 已被 rc.3 取代，并入 rc.3 重跑 |
| `0.2.2-rc.2` / 22.19 | 无（0.2.2 线 `engines.node >=24.9.0`，A9） | — | 不跑 |
| `0.2.2-rc.2` / 24.9 | rc.2 tag 存在（`ddac9676`），但 rc.2 不是 npm `next`（next=rc.3）；结果里 rc.2 锚 **0 条** | 全部 | 不单独重跑，并入 rc.3 |
| `0.2.2-rc.3` / 22.19 | 无（宿主 `engines.node >=24.9.0`，A9） | — | 不跑 |
| `0.2.2-rc.3` / 24.9 | 宿主已是 rc.3（2026-11-14 实测 `dsh --version`=0.2.2-rc.3）。rc.3 runtime 证据已**落库两轮**：A13 第一跑 entry18 [`43560480242`](https://github.com/PerryLink/dsh-standards/actions/runs/43560480242) 18/18 行（10 verified / 7 partial / 1 error，`fullbase-rc3-20261114/`）、web-runtime [`43560484422`](https://github.com/PerryLink/dsh-standards/actions/runs/43560484422) 17/18 行（14/15 client-bearing，`webruntime-rc3-20261114/`），两 run 均因 `YuJunZhiXue/dsh-purge` 上游仓库被删而红；A14 r2 重跑 entry18 [`43570668837`](https://github.com/PerryLink/dsh-standards/actions/runs/43570668837) 18/18 行 = 17 executed + 1 **blocked**（10 verified / 7 partial / 0 failed / 0 error / 1 blocked）**run success**、web-runtime [`43570671265`](https://github.com/PerryLink/dsh-standards/actions/runs/43570671265) 18 行 = 14 measured client + 3 measured shell-only + 1 blocked **run success**（`…-r2/`）。blocked 行不是 rc3 不兼容：repo 404（2026-11-14）、无公开 fork、npm 仅占位 `0.0.0-stage`。 | 17 executed ENTRY shard / 17 executed web 包（18 行预算里 1 行外部 blocked，不计入 executed 分母） | ENTRY 17 executed + 1 blocked 已确定性落库；web 的 15th client 行外部不可得，15/15 在构造上不可能 → 该列保持 `partial`；若上游镜像/fork 出现（或 ENTRY 样本替换）再评估升级 `runtime` |
| 1.3.0 / Linux / 24.9 | 本机 `npm test` 自测全绿（N1）；`check` 的默认静态与 host 三态已有测试 | 1.3.0 的宿主 boot | 用 1.3.0 在 alpha.2 或 rc.1 上跑一次 ENTRY，结果锚必须写 `scanner=1.3.0` |
| 1.3.0 / Windows / 22.19 | 无（1.3.0 未在 Windows 跑；1.2.2 自测红，A10） | 自测 + 宿主 boot | 先在 Windows 跑 `npm test`；绿之前不谈宿主 boot |
| 1.4.1 / Windows / 24.9 | 三包静态 `check` 与同机 WSL2 逐字一致（A11）；默认锚 default、probe 得宿主 0.2.1-rc.5 | 宿主 boot / 插件执行；`flow sandbox` 在 `npm pack` 前即失败 | 先修 Windows 上 `npm.cmd` / `dsh.cmd` 的 spawn（`shell:true`），再谈 runtime |

## 2 证据锚

| 锚 | 类型 | 值 | 证明什么 | 复核 |
|---|---|---|---|---|
| A1 | CI run + 结果文件（历史） | entry18-runtime 工作流；**alpha.2 时代**宿主钉 `@deepseek-ai/dsh@0.2.2-alpha.2`（旧 workflow L58/L69；该 workflow 已于 2026-11-14 改钉 rc.3）、`node-version: 24`（L55）；run [`41219602842`](https://github.com/PerryLink/dsh-standards/actions/runs/41219602842)（2026-10-31，success，19/19 作业）；结果 `40-checker/results/entry/18/fullbase/summary.json` | alpha.2 + node 24 上 18/18 shard 真 boot：10 verified（8 admit + 2 gate-reject）、8 partial、0 failed | `python3 -c "import json;d=json.load(open('40-checker/results/entry/18/fullbase/summary.json'));print(d['targetDshVersion'],d['count'],d['status'])"` |
| A2 | CI run + 结果文件（历史） | web-runtime 工作流；**alpha.2 时代** `DSH_VERSION: 0.2.2-alpha.2`（旧 workflow L188；已于 2026-11-14 改钉 rc.3）、`node-version: 24`（L184）；run [`41218358951`](https://github.com/PerryLink/dsh-standards/actions/runs/41218358951)（success；前一跑 41217382935 failure）；结果 `40-checker/results/webruntime/REPORT.md` 与各 `<id>/probe.json` | 15/15 client-bearing 包 `client-module-loaded`、4/4 web-app 加载；**不**声称 UI-rendered | `head -12 40-checker/results/webruntime/REPORT.md` |
| A3 | 结果文件（静态） | `40-checker/results/entry/18/*.json` 等的 `anchor`：`{repo: deepseek-ai/deepseek-harness, commit: ce7073d5…, scanner: dsh-plugin-verify@0.1.0, dsh: 0.2.2-alpha.2, cordis: 4.0.6-alpha.1}` | 静态结果锚在 alpha.2；`anchor.runtime` 只在跑 runtime 子检查时落值，且 34/398 条写的是占位符 `<dsh-checkout>/vendor/cordis/lib/index.js`——**钉不住宿主构建** | `grep -o '"dsh": "[^"]*"' 40-checker/results/entry/18/ci-diet.json` |
| A4 | CI run | cross-platform 工作流：`node-version: 22`、ubuntu + windows、`node --test test/*.test.mjs`。run [`42177690479`](https://github.com/PerryLink/dsh-standards/actions/runs/42177690479)（v1.2.2）：ubuntu **success**、windows **failure**（159 tests / 154 pass / 2 fail / 3 skipped，失败项为 `flow-collect` 的两条，`flow-evidence.test.mjs:280,317`）；1.2.1 的 run 42173635450、1.2.0 的 run 42169481664 同样 failure；1.1.x 时代 41866400694、41869228199 双 OS success | Node 22 线上检查器自测的绿/红；**不含宿主 boot** | `TOK=…; curl -s -H "Authorization: Bearer $TOK" …/actions/runs/42177690479/jobs` |
| A5 | 结果文件（环境） | `40-checker/results/triage/triage.json` → `environment.localDshVersion=0.2.1-rc.5`、`node=v24.22.1`、`anchorDshVersion=0.2.2-alpha.2`；带 `generatedAt` 的 56 个 JSON 只落在 2026-10-31 / 2026-11-01 两天 | 0.2.1-rc.5 只作为**本机宿主**出现，采集目标仍是 alpha.2；产出方早于 1.0.0 | `python3 -c "import json;print(json.load(open('40-checker/results/triage/triage.json'))['environment'])"` |
| A6 | CI run | publish 工作流（`node-version: '24'`，发布前 `npm test`）：run [`42177690951`](https://github.com/PerryLink/dsh-standards/actions/runs/42177690951)（v1.2.2 push，success） | 1.2.2 的 159 条自测在 Node 24 上绿（Linux） | 同上，查 `actions/runs/42177690951/jobs` |
| A7 | 源码（宿主） | `/home/yy/deepseek-harness/package.json`：`@deepseek-ai/dsh-root 0.2.2-rc.3`，`engines.node: ">=24.9.0"`（**2026-11-14 复核**；rc.1 是 2026-11-06 的历史值） | 真实宿主是 rc.3，且 0.2.2 线不接受 Node 22；但无任何一致性结果锚在 rc.3 | `python3 -c "import json;print(json.load(open('/home/yy/deepseek-harness/package.json'))['engines'])"` |
| A8 | 结果文件（已失效） | `40-checker/results/flow/real/*.json`：schema `dsh-flow-runtime/1`，10 个包（`index.json` 除外）：J1 `pass` 7、J2 `pass` 7、J4 `pass` 8、J6 `pass` 1，仅 `ci-diet` 四态全 `pass`；`generatedAt` 2026-11-01 | 1.2.1 起 v1 链路 `deprecated` → 这些 FLOW pass 全部退回 `not-run`（见 `CHANGELOG-RULES.md`） | `python3 -c "import json;print(json.load(open('40-checker/results/flow/real/ci-diet.json'))['verdicts'])"` |
| A9 | 源码（规范） + A7 | `35-三层开发建议与验收清单.md:131`（rc3 复核后的 §7.1 Node 行）：Node `>=24.9.0`「自 0.2.2-alpha.2 起；0.2.1-rc.5 仍是 `^22.19 \|\| >=24`」；A7 的 rc.3 声明一致 | 0.2.2 线的 Node 22 格为 `NA`；0.2.1-rc.5 的 Node 22 格仍成立 | `sed -n '131p' 35-三层开发建议与验收清单.md` |
| A10 | CI run（Windows） | A4 的 Windows 作业：1.1.x 双 OS 自测绿（41866400694、41869228199）、1.2.2 红（run 42177690479，159 tests / 154 pass / 2 fail / 3 skipped）；`node-version: 22`，实际 `v22.23.4` | Windows + Node 22 的检查器自测绿/红；**不含宿主 boot**。Windows 无 `unshare` / `prlimit` → sandbox degraded | `gh api repos/PerryLink/dsh-standards/actions/runs/42177690479/jobs` |
| A11 | 本机实测（Windows 11，checker 1.4.1） | 2026-11-07，Windows 11 `10.0.26200.9818` + Windows node `v24.22.1`（`C:\Program Files\nodejs\node.exe`）；`cmd.exe /c "dsh --version"` = `0.2.1-rc.5`。checker `1.4.1`（checker 0.1.0），从 **HEAD `31900e1`** 的 `git archive` 副本运行（共享工作树当时有并行未提交改动，未采用）。三包：`dsh-fast@0.2.27`（本地仓）、`dsh-plugin-radar@0.4.12`（`npm pack`）、`@perrylink/dsh-domain-pilot@0.0.0`（`packs/domain-pilot`，bundle）。`check` 默认、`--no-exec`、`--json`、`--allow-host-probe --json` 与同机 WSL2 Ubuntu 24.04 + node `v24.22.1` **逐字一致**（路径归一后 JSON 全等）：三包 `checked=12/14`，FAIL 0/1/0（FAIL 均为 DSC-02 C-2.2：`@deepseek-ai/dsh-llm` 的 `^0.1.0-rc.6` 不满足锚——默认 0.2.2-alpha.2、probe 0.2.1-rc.5），默认锚 `0.2.2-alpha.2`（source=default, suspect=true），probe 得 `anchor.dsh=0.2.1-rc.5`（runtimeSource=host, hostVersionSource=probe）。`check --format json` = 用法错误 exit 3（用 `--json`）；裸 `dsh-standards <dir> --format json` 在 Windows 探测失败 → `runtimeSource=fallback`（`spawnSync('dsh.cmd')` → EINVAL；**1.4.1 时代记录**；1.6.x 的 `runtimeSource` 只产 `cli`/`host`/`default`，见 `spec/schemas/conformance.schema.json`）。`buildSandboxPlan({})` = `sandbox-degraded`（`unshare-missing`、`prlimit-missing`）；`flow collect --sandbox` 在 `npm pack` 处 exit 127（`npm.cmd` 不能被无 shell spawn），未进入沙箱执行。 | Windows 的静态 `check` 有真实数据（`partial`）；**runtime / sandbox 仍 `not-run`**，不声称任何 Windows runtime | `"$NODE" "$CHK" check 'D:\…' [--no-exec] [--json] [--allow-host-probe]`；`"$NODE" "$CHK" 'D:\…' --format json`；`"$NODE" …\dsh-flow-collect.mjs --package 'D:\…' --sandbox` |
| A12 | 结果文件（锚分布，2026-11-14 05:23 时点；**历史**） | 2026-11-14 rc3 runtime 已手动跑：entry18 run `43560480242` 17/18、web-runtime run `43560484422` 17/18（唯一失败为 fixture 仓库 clone 无认证）；**当时** artifacts 已上传但尚未落成已提交结果（后续 A13 已落库）。398 个已提交结果 JSON：`anchor.dsh=0.2.2-alpha.2` **243** 条、无锚 **155** 条、`0.2.2-rc.1`/`rc.2`/`rc.3` 各 **0** 条；`anchor.scanner=dsh-plugin-verify@0.1.0` **241** 条（另 2 条空）。同期 `.github/workflows/{entry18-runtime,web-runtime,web-smoke,lev6-capture}.yml`、`40-checker/.github/workflows/plugin-verify.yml`、`40-checker/samples/entry18.json` 已按 2026-11-14 改钉 `0.2.2-rc.3`（entry18 的安装行与 `--expected-dsh-version` 成对改） | 该时点全库无 rc.3 锚结果 → rc.2/rc.3 行记 `not-run`；**本条保留为历史，不复算**。2026-11-14 14:40 用同一命令复算为 alpha.2 **241** / 无锚 **157**，与 243/155 差 2（时点/命令差异），以 A13 的复算命令为准 | `python3 -c "import json,glob,collections;d=[json.load(open(f)) for f in glob.glob('40-checker/results/**/*.json',recursive=True)];print(collections.Counter([(x.get('anchor') or {}).get('dsh') for x in d]))"` |
| A13 | 结果文件（rc3 runtime **第一跑 r1（含 1 error）**，2026-11-14 14:40 asOf） | 2026-11-14 14:40 把两次 rc3 run 的 artifacts 落成新目录（**不覆盖** 2026-10-31 的 alpha.2 历史目录）：`40-checker/results/entry/18/fullbase-rc3-20261114/`（18 个 raw `dsh-entry18-fullbase/1` JSON + `summary.json` + `REPORT.md`；10 verified / 7 partial / 1 error，error 行 = YuJunZhiXue fixture clone 无认证）与 `40-checker/results/webruntime-rc3-20261114/`（18 个行目录；14/15 client-bearing rows `client-module-loaded`、4/4 web-app、2 host-gate-reject、1 shell-only、1 install failure；`REPORT.md`）。落库脚本 `40-checker/scripts/land-runtime-artifacts.mjs`（内置 zip 解包）；rc3 行号核对脚本 `40-checker/scripts/repo-anchor-check.mjs`（368 锚 0 漂移）。归因：run 在 `e73b77f9`（1.6.11）树上执行，证据提交在 **v1.6.12 发布 commit**；按 §0 的「结果 commit 就是该版本的 tag commit」可归属到 `checker 1.6.12` 列，但因 web 分母未满（1 个已被删除的私有 fixture）只记 `partial`；这是第一跑，已被 A14 的 r2 取代为确定性的「17 executed + 1 blocked」。 | 证明 rc3 已有可归属 runtime 证据（ENTRY 18/18 行 + web 17/18 行）；**不**证明 web 15/15 覆盖、**不**证明任何旧 alpha.2 结果可移植。该跑因外部 fixture 被删而 run 红，已由 A14 r2 取代（保留为历史） | `python3 -c "import json,glob;d=[json.load(open(f)) for f in glob.glob('40-checker/results/**/*rc3-20261114/**/*.json',recursive=True)];print(len(d))"`（应 67：ENTRY 19 + web 48）；`python3 -c "import json;print(json.load(open('40-checker/results/entry/18/fullbase-rc3-20261114/summary.json'))['status'])"` |
| A14 | 结果文件（rc3 runtime 重跑 **r2：确定性 17 executed + 1 外部 blocked**；2026-11-14 15:30 asOf） | 2026-11-14 15:30 把 r2 两次 run 的 artifacts 落成新目录（**不覆盖 A13 的 r1 目录**）：`40-checker/results/entry/18/fullbase-rc3-20261114-r2/`（18 个 raw `dsh-entry18-fullbase/1` JSON + `summary.json` + `REPORT.md`；17 executed + 1 blocked，10 verified / 7 partial / 0 failed / 0 error / 1 blocked；`summary.json` 含 `blocked:1` 与 `coverage{rows:18,present:18,executed:17,blocked:1}`）与 `40-checker/results/webruntime-rc3-20261114-r2/`（18 个行目录；14 measured client + 3 measured shell-only + 1 blocked；14/14 measured client rows `client-module-loaded`、4/4 web-app、2 host-gate-reject、1 shell-only、1 blocked；`REPORT.md`）。CI：entry18 run [`43570668837`](https://github.com/PerryLink/dsh-standards/actions/runs/43570668837)（17/17 shard + aggregate，run-level success）、web-runtime run [`43570671265`](https://github.com/PerryLink/dsh-standards/actions/runs/43570671265)（17/17 row + denominator-summary，run-level success），均为 `workflow_dispatch` ref=main、head `943e67e4`（v1.6.12 之后的 main 提交，即 workflow 修复 commit `ci(entry18): mark the deleted YuJunZhiXue fixture as blocked …`）。落库仍用 `40-checker/scripts/land-runtime-artifacts.mjs`；blocked 行也是正常 artifact（`entry18-fullbase-YuJunZhiXue__dsh-purge` / `web-runtime-YuJunZhiXue__dsh-purge`）。blocked 行 = `YuJunZhiXue__dsh-purge@1.1.85`：`GET /repos/YuJunZhiXue/dsh-purge`→**404**（2026-11-14 复核）、user 存在但 **0 public repos**、无公开 fork、npm `dsh-purge` 仅占位 `0.0.0-stage`；行内 `status/verdict=blocked`、`blocked:true`、`error.stage=fixture`、`host=null`、`elapsedMs=0`，**不进 executed 分母、不算 pass、不算 rc.3 failure**。 | 证明 r2 起 rc3 runtime 是**确定性**的「17 executed + 1 外部 blocked」，r1 的 1 error 不再是红，两次 run 均 success；**不**证明 web 15/15 覆盖（第 15 个 client 行外部不可得，构造上不可能）、**不**证明任何旧 alpha.2 结果可移植、**不**把本列升为 `runtime`。 | `python3 -c "import json,glob;d=[json.load(open(f)) for f in glob.glob('40-checker/results/**/*rc3-20261114-r2/**/*.json',recursive=True)];print(len(d))"`（应 67：ENTRY 19 + web 48）；`python3 -c "import json;d=json.load(open('40-checker/results/entry/18/fullbase-rc3-20261114-r2/summary.json'));print(d['blocked'],d['coverage']['executed'],[r['id'] for r in d['rows'] if r['status']=='blocked'])"`（应 `1 17 ['YuJunZhiXue__dsh-purge']`）；web 复算见 `webruntime-rc3-20261114-r2/REPORT.md`（应 `18 14 4 4 1 15`）。 |
| N1 | 本地测试（1.3.0） | `npm test` 在本机 WSL2 Ubuntu 24.04 + Node `v24.22.1` 全绿（2026-11-06；宿主 0.2.1-rc.5，A5）；新增 `40-checker/test/safety.test.mjs` 覆盖默认 `--entry-claim static --no-exec`、`--host-version` / `DSH_HOST_VERSION` / `--allow-host-probe` 三态 | 1.3.0 的自测与静态轴有证据；**不含**宿主 boot | `npm test` |
| W1 | 本机环境（WSL2） | `uname -a`：`6.6.114.1-microsoft-standard-WSL2`；`unshare -Urn true` 与 `prlimit --nproc=1:1 true` 均退出 0；Node `v24.22.1`（2026-11-06） | WSL2 的 Linux 沙箱可用，可作为 runtime 采集环境；不等于任何 host × Node × checker 组合已跑 | `unshare -Urn true; prlimit --nproc=1:1 true` |

行号均按 `cc378b2`（2026-11-06 HEAD）；A11 的实测对象是 `31900e1`（2026-11-07 HEAD）。`40-checker/src/cli.mjs`、`report.mjs` 正被其他改动波及，行号可能漂移——复核请按符号名 grep，别背行号。

全库 JSON 计数（2026-11-14 15:30 复算）：**398 条旧静态结果**（`anchor.dsh=0.2.2-alpha.2` **241**、无锚 **157**；A12 的 243/155 是 05:23 前口径）+ **134 条 rc3 runtime raw JSON**（A13 第一跑 67 + A14 r2 67；无 `anchor` 字段，逐条 `dshVersion=0.2.2-rc.3`）= **532** 个 JSON。旧 398 条没有任何一条能记到 1.1.x/1.2.x/1.3.0/1.4.1 列；rc3 的 1.6.12 列见 A13/A14。

## 3 not-run 条件（单列）

一条结果落在下列任一条件，就只能写 `not-run` / `blocked`，不得写 `runtime`、也不得用「已识别」代替：

1. **缺宿主包**：没有可 `boot()` 的 `@deepseek-ai/dsh@<该版本>`，或没有该版本锚的结果（rc.1/rc.2 本机未装 → 行全 `not-run`；rc.3 已装且已重跑落库 → 不再是 not-run，见 A13（第一跑）/ A14（r2 确定性重跑））。
2. **无 web-app**：包只有 `dsh.client` 而无 web profile → G4 只静态、G5 不测；client runtime 不得写成 runtime。
3. **client-only / 单半边**：缺 `exports["./client"]` 或只有 shell，host 侧 boot 通过也只算 ENTRY。
4. **沙箱不可用**：`unshare -Urn` / `prlimit` 不生效 → `sandbox-degraded`，1.2.1 起**永不** runtime（`40-checker/src/flow-evidence.mjs:189`、`40-checker/scripts/level-audit.mjs:254`）。
5. **平台未测 / sandbox degraded**：Windows 的 Node 22 自测在 1.2.2 红（A10，2/159 失败），且 `unshare -Urn` / `prlimit` 不可用 → `sandbox-degraded`，**永不** runtime。2026-11-07 起 Windows 有 checker 1.4.1 的**静态 `check`** 实测（A11，三包，`partial`），但 runtime 路径仍 `not-run`：`flow collect --sandbox` 在 Windows 上先卡在 `npm pack`（Node 不能无 shell spawn `npm.cmd`，exit 127）。WSL2 Ubuntu 24.04 的 Linux 沙箱可用（W1），但 WSL2 可用不等于组合已跑。
6. **检查器版本不可归属**：旧静态结果缺 `checkerVersion`（`anchor.scanner` 硬编码 `0.1.0`）→ 398 条旧结果都不能记到 1.1.x/1.2.x/1.3.0/1.4.1 名下。这也是 A13/A14 只能记 `partial`（不是 `runtime`）的原因之一：r1 由 1.6.11-era run 产出、归因靠「提交在 v1.6.12 发布 commit 上」；r2 的 run 树是 v1.6.12 之后的 main 提交 `943e67e4`（package.json 仍 1.6.12）。
7. **锚过期**：`expiresAt` 已过（`40-checker/scripts/stale-check.mjs` 的 `effective()`）→ 旧 PASS 必须重跑，不能复用。

## 4 锚变即 stale

锚是一个元组，不是单个字段：

```
(repo, commit, checkerVersion, dsh, cordis, nodeMajor, ciRunUrl)
```

**任一维变化，该格立即作废**：退回 `not-run`，在审计日志里记 `stale`，重跑前不得引用旧值。具体触发：

- 宿主 `dsh` 预发布位变化（`0.2.2-alpha.2` → `0.2.2-rc.3`，2026-11-14）；
- 检查器版本变化（`1.2.2` → `1.3.0`），或判定语义变化（以 `CHANGELOG-RULES.md` 的「是否须重跑=是」为准）；
- Node 大版本变化（22 → 24）；
- `cordis` 变化（rc3 锚 `4.1.0`）；
- 同一 `(repo, dsh)` 的 commit 变化。
- 90 天复审到期（`MAINTAINERS.md` §Bus factor 的 90-day review）。

与 `stale-check.mjs` 的分工：它查 attestation 的 `expiresAt`；本表查**锚元组**。两者都只允许「重跑」，不允许「续期」。

## 5 默认 runtime 锚的取法

**现状（1.3.0–1.4.1）**：

1. **`dsh-standards check` 已受控**：优先 `--host-version`，其次 `DSH_HOST_VERSION`；只有在显式 `--allow-host-probe` 时才解析 `dsh` 的 JS 入口并执行 `node <entry> --version`；三者都没有时写 `anchor.runtimeSource=default`、`anchor.suspect=true`，报告顶部写「host 版本未知」。`check` 不会无条件执行 PATH 里的 `dsh`（N1 有测试覆盖三态）。
2. **裸检查器仍是兼容旧路径**：`dsh-standards <dir>` 调 `cli.mjs` 的 `detectHostRuntime()`，仍会执行 `dsh --version`；`DEFAULT_RUNTIME_VERSION` 是它的最后回退——1.6.10 仍是 `0.2.2-alpha.2`，1.6.11 已把默认锚升到 `0.2.2-rc.3`（`--cordis-version` → `4.1.0`、`--commit` → `38a6a5c9…`；以 1.6.11 发布后的 `40-checker/src/{manifest,cli}.mjs` 为准）。Windows 上该路径必失败：`spawnSync('dsh.cmd')` 返回 EINVAL（Node 对 `.cmd` 的加固），落 `runtimeSource=fallback`（A11；1.4.1 时代行为），所以 Windows 裸检查器的锚永远不是宿主版本。
3. 不跑 runtime 时 `anchor.runtime` 为 `null`（398 条里 207 条 null、34 条写占位符 `<dsh-checkout>/…`）。

**已知后果**：真实宿主是 `0.2.2-rc.3`（A7），裸检查器的最后回退常量在 1.6.10 仍是 `alpha.2`（1.6.11 的目标值是 `0.2.2-rc.3`，以 `40-checker/src/manifest.mjs` 常量为准）。gap-audit 实测（`FINAL-PLAN.md` §C2，2026-11-06，当时宿主 rc.1）：**默认锚产生 56 条隐藏 detail FAIL，显式 `--runtime-version 0.2.2-rc.1` 后只剩 2 条**。差值来自锚，不是插件。要跑 rc.3 的对照，用 `check --host-version 0.2.2-rc.3` 或显式 `--runtime-version 0.2.2-rc.3`。

**验收口径**：

1. `anchor.runtimeSource ∈ {host, cli, default}`、`anchor.hostVersionKnown`、`anchor.suspect` 可由 JSON 直接核对；`default` 必须伴随 `suspect: true`。
2. `suspect` 不改变结论，但 detail 数必须单列，并且**不得**把 suspect 下的 detail FAIL 计入聚合。
3. 同包连跑两次，只改 `anchor.suspect` 与 detail 数，结论与 exit code 不变。
4. 未做 / 待办：把同一策略下沉到裸检查器的 `cli.mjs`，并让 `--runtime-version` 与宿主声明冲突时在任何入口都标 `suspect`。

## 6 生成契约（TODO: generate）

> **`publish/sidecar.json` 的 `checker.version` / `checker.sha` 语义（2026-11-14 定稿）**：它们记录**产出这些检查的 checker 版本/提交**，不是"当前包版本"，本仓**不要求**两者相等，也没有相等性门禁。理由：sidecar 不在 npm tarball 内（`files` 白名单不含 `publish/`），其唯一一致性契约是"顶层 `checker.version` ∈ 各条目 `checkedBy` 版本集合"（`test/sidecar.test.mjs` 断言）；重建只应发生在需要重新检查这 50 个包时（命令骨架见 `HANDOFF-CONTINUITY` §7.9），否则只会改元数据、不改语义。

- **输入**：`40-checker/results/**/*.json`；`spec/levels.json` 的 evidence 枚举（`not-run, recognized, static, runtime, measured, blocked, failed, stale`）；`.github/workflows/*.yml` 的 `node-version` 与钉住的宿主版本；`gh api …/actions/runs`（run id / conclusion / head_sha / created_at）。
- **输出**：只替换 `<!-- BEGIN GENERATED:supported -->` 与 `<!-- END GENERATED:supported -->` 之间的矩阵。
- **结果 JSON 还缺的字段**（缺了就只能生成 `not-run`）：`checkerVersion`、`nodeVersion`、`ciRunUrl`、`runtimeSource`。`anchor.scanner` 现在写死 `dsh-plugin-verify@0.1.0`，必须补真实包版本。
- **CI 校验**：重跑生成器，与提交内容逐字比对；不一致 → fail（防手改）。生成器同时校验每个 `runtime` 格必须能定位到 `results/` 里的文件与一条 CI run。
- **TODO: generate** 的三个具体缺口：① 生成器脚本；② 结果 JSON 的四个字段；③ `SUPPORTED.md` 的历史轮次快照（每次锚变留一份，才能证 `stale`）。

## 7 治理现状（一句话，别读成背书）

`MAINTAINERS.md` §Bus factor 的 `BUS_FACTOR=1` 是现状；过渡方案（建议，未落地）是 Stage 0.5 邀 1 名外部 shadow reviewer（无 merge 权、评审报告公开）、COI 命中时由其终裁、招到人之前全量强制 `selfAssessed:true`——在它落地前，本表只声称「结果可复算」，**不声称**外部独立评审或任何认证。

## 8 已知局限

- 0 格 `runtime`：旧 runtime 证据（A1/A2/A8）的产出方都早于 1.0.0，无法归属到本表的任何一列；rc3 的新证据（A13 第一跑）由 1.6.11-era 树产出、web 分母未满，只能记 `partial`；r2（A14）把 rc3 runtime 变成确定性的「17 executed + 1 外部 blocked」，但 15/15 仍不可能达成，故仍只记 `partial`。
- Node 只量到 `v22.23.4` / `v24.22.1`，`22.19`、`24.9` 是引擎线而非实测版本。
- 平台：Linux（含 WSL2）是唯一 runtime 采集环境；Windows 无 `unshare` / `prlimit` → sandbox degraded。Windows 只有 checker 1.4.1 的静态 `check` 实测（A11，`partial`），runtime 与 `flow collect --sandbox` 仍 `not-run`（Windows 上 `npm.cmd` 无 shell spawn 即 exit 127）。
- 1.3.0 只有自测 / 静态证据（N1），没有宿主 boot；1.3.0 列的 `partial` 不代表 runtime。
- 1.4.1 列只有 Windows / 24.9 的静态证据（A11）；1.4.1 无宿主 boot，Windows 的 `partial` 不代表 runtime。
- rc.2 从未被跑过（0/398），rc.1 也从未跑过；rc.3 已于 2026-11-14 重跑并落库（A13 第一跑、A14 r2），但旧 398 条静态结果仍是 alpha.2 锚。1.6.10 的默认锚仍会把未指定 host 的报告锚成 alpha.2；1.6.11 起默认锚是 rc.3（§5，1.6.12 延续）——**先修锚，再看矩阵**。
- `1.1.0`、`1.0.4`–`1.0.7` 从未发布到 npm；`1.1.1` 有 tag 但 npm 发布失败（run 41855336115）。「1.1.x」列因此只能用 `1.1.2` 代表。

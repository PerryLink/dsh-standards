# CHANGELOG-RULES.md — 规则级变更记录

> `CHANGELOG.md` 记**版本**（发版、打包、测试数）；本文件记**规则**：某条 clause / check 的判定语义有没有变、旧结果还能不能用。
> 一行一变更，列固定：**日期 ｜ 规则 ID ｜ 旧→新语义 ｜ 受影响状态/结论 ｜ 影响版本 ｜ 是否须重跑**。
>
> **CI 拦截（本轮只写契约，脚本未落地）**：改 `spec/clauses.json` 或 `spec/levels.json` 却没有对应条目 → 必 fail。检查器判定语义（`DSC-*` / `C-*` 的 PASS/WARN/FAIL/NA/not-run 条件）同理。见 §2。
>
> 种子说明：下面 9 行由 `CHANGELOG.md` 与对应 commit 逐条核对补出（2026-11-06），只补到能核实的最小集；更早的 0.x 行留 `TODO: seed`。

## 1 变更表

| 日期 | 规则 ID | 旧→新语义 | 受影响状态/结论 | 影响版本 | 是否须重跑 |
|---|---|---|---|---|---|
| 2026-11-06 | FLOW runtime 前提（`FLOW-J1–J8`，`spec/flow-evidence.schema.json`） | `producer.kind=sandbox` 即 runtime → 还须隔离项全部生效：`sandbox.mode!=='sandbox-degraded'` 且 `sandbox.degraded===[]`；否则 `sandbox-degraded`，**永不** runtime | 所有降级采集的 FLOW 行由 `runtime` / `not-run` 一律记 `not-run`；reason 含 `sandbox-degraded (...)`；`claims.claimLevel=sandbox-attested` 也救不回来 | 1.2.2 | 是（降级环境必须重跑；判定层见 `40-checker/scripts/level-audit.mjs:254`、`40-checker/src/flow-evidence.mjs:189`） |
| 2026-11-06 | `FLOW-J1–J8`（`flow-evidence/2` 的 `claims` / `producer.kind`） | 结构自洽的 `self-attested` / `ci-attested` v2 证据可判 FLOW `runtime` → **只有** `claims.claimLevel=sandbox-attested` 或 `producer.kind=sandbox` 可判 `runtime`；self/ci 保留 `passed` 计数但 state 记 `not-run` | 已提交的 FLOW 结论失效：`40-checker/results/flow/real/*.json` 的 10 个包（J1 pass 7、J2 pass 7、J4 pass 8、J6 pass 1，仅 `ci-diet` 四态全 pass）与 `results/flow/*.json` 由 pass/runtime → `deprecated` / `not-run`，reason `<claimLevel> evidence; runtime requires sandbox-attested`。ENTRY 的 G3 boot 结论不受影响 | 1.2.1 | 是（旧 FLOW 证据须在沙箱内用 collector 重跑，不自证即 `not-run`） |
| 2026-11-06 | `DSC-01`–`DSC-14`（报告的 `advice[]`） | 无 advice 字段 → 加**加性** `advice[]`（68 条规则，`spec/remediation.json`）；`severity` 跟随 `gate` | 不改任何 check 构造、不改判定、不改 exit code；只多出建议与 `docsUrl` | 1.2.0 | **否**（纯加性，旧结果无需重算） |
| 2026-11-04 | `C-11.4` / `C-12.4`（AST 解析失败） | 任一文件解析失败 → 整条强制检查 ERROR/incomplete → 仅**非入口**文件失败时记 `NA/not-run`、coverage `partial`；所有可分析文件都失败才保持 ERROR | 含解析失败文件的包：ERROR 计数下降、coverage 变 `partial`；第三套 holdout 的 `dsh-expert-team` 由 ERROR → partial | 1.1.1 | 是（含解析失败文件的包结论变化） |
| 2026-11-04 | `DSC-10`（`C-10.1`–`C-10.4`）、`C-11.4`、`C-12.4` | 行首正则 / 文本匹配 → vendored `@babel/parser` 真 AST（JS/TS/JSX；无运行时 npm 依赖）；只分析入口模块 + 本地相对 import 闭包；包导入 / 解析不到 / `.d.ts` 记 C-10.3 coverage note（`not-run`） | 旧的正则命中不可比；`.d.ts` 不再参与扫描；C-11.4/C-12.4 只对可执行上下文 WARN（注释、等值比较、`desc`/`message`/`help` 文档字符串不算） | 1.1.0 | 是（DSC-10/11/12 的旧结论全部作废） |
| 2026-11-04 | `C-10.2`、`C-11.4`、`C-12.4`（DSC-10/11/12 系列） | 入口顶层立即 `void main()` 不报 → 记 advisory WARN；注释与等值比较（`===`/`!==`/`==`/`!=`）里的 `danger-full-access` / `--add-dir` 字面量 → 不再 WARN | 5 个上下文盲案例（dev 的 router/skill-mcp、holdout 的 skill-mcp、自家 github-bot、89 条的 github-bot）由 WARN → 无告警；`void main()` 新增 1 类 advisory | 1.0.7 | 是（WARN 集合变化） |
| 2026-11-04 | `DSC-10`（`C-10.1`–`C-10.4` 的可分析性） | 无源文件可扫 → WARN → **NA / not-run**（条款三值表本来就写「入口不可读 → NA」） | 去掉 dev 上最后 3 条 `no source scanned` 噪声；该行改记 NA/not-run，WARN 集合少一类 | 1.0.6 | 是（NA 与 WARN 不可互换） |
| 2026-11-04 | `DSC-10`（`C-10.1` / `C-10.2` / `C-10.4`） | C-10.1/2 扫全包（含随包的 samples/probes/selfcheck）→ 与 C-10.4 一致，只扫**入口模块**；C-10.4 把只读 `openSync` 当写 → 只认写标志 | 89 条样本里 9 条命中只剩 1 条（8 条消失）；dev 多条命中消失；`openSync` 只读不再 WARN | 1.0.5 | 是（枚举口径变了，旧命中列表不可比） |
| 2026-11-03 | `DSC-01`（`C-1` / G4）、`C-1.2`、L1–L3 runner | `g4` 的 client-shape 失败被丢弃 → 判 DSC-01 FAIL；`private:true` 与 workspace 根 → WARN/FAIL → **NA**；L1–L3 在子进程跑、超时硬杀，事件循环被挡住 → `not-run`（此前可能记 pass）；`dsh.capabilities`/`dsh.labels` 警告 → advisory、不翻判定；无 `package.json` 的目录 → exit 3 | 私有包 / workspace 根的 FAIL 数下降（WARN/FAIL → NA）；缺 client 形状的包由 pass → FAIL；阻塞型运行由 pass → `not-run` | 1.0.2 | 是（同一输入结论翻转，1.0.2 之前的结果不能与之后并列） |

行号均按 `cc378b2`；`40-checker/` 另有改动在途，复核请按符号名 grep。

## 2 CI 拦截：改 clause 必须有条目

**触发**：diff 命中 `spec/clauses.json` 或 `spec/levels.json`，或改动 `40-checker/src/*.mjs` 里某个 `DSC-*` / `C-*` 的判定分支（文件改动可直接检测；判定语义是否真变了由 reviewer 判定，脚本只保证「改了就得写一行」）。

**校验规则**：
1. 从 `git diff -U0 origin/<base>...HEAD -- spec/clauses.json spec/levels.json` 抽出被改的 `clauses.json.id`（如 `ENTRY-CLIENT`）与 `levels.json` 的 gate id（`G0–G5`、`J1–J8`、`LEV-1–8`）；
2. 本文件的 diff 必须新增/修改至少一行，且该行「规则 ID」列包含上述 id 之一（或直接写对应的 `DSC-*` / `C-*` id）；
3. 该行必须有日期（ISO）、影响版本（semver）、`是否须重跑 ∈ {是,否}`；
4. 缺任一项 → exit 1，并打印「改 clause 必须带 CHANGELOG-RULES 条目」。

**落点（TODO: impl）**：新增 `40-checker/scripts/rules-changelog-check.mjs`，在 `.github/workflows/governance.yml` 的 checks job 里、与 `clause-map.mjs` / `stale-check.mjs` 同级加一步。**本轮不动 `40-checker/`**，所以现在 CI 还不会拦——契约先立，脚本随 P1-4 落地。

**方向性校验**：`CHANGELOG.md` 的每个版本头都要在本文件「影响版本」出现 ≥1 次；缺则 warn（历史版本无规则变更的可显式记「无规则变更」）。反例正是本表的 1.0.5 / 1.0.6 / 1.0.7 / 1.1.0：它们**没有 git tag、也不在 npm**（见 §3），只有 `CHANGELOG.md` 文本与 commit 可查。

## 3 版本可得性（读表前先看这一行）

`1.x` 线上真正可装的只有 `1.0.0`–`1.0.3`、`1.1.2`、`1.2.0`–`1.2.2`。`1.0.4`–`1.0.7`、`1.1.0` **无 tag、未发布**；`1.1.1` 有 tag 但 npm 发布失败（run 41855336115）。所以表里 1.0.5–1.0.7、1.1.0 的「影响版本」不可安装，读者最早在 `1.1.2` 一次拿到这些修正；引用这些行时必须写「随 1.1.2 首次对外可得」。

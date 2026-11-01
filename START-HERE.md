# START HERE — DSH standards handoff

> 给**没有上下文的新会话**：先读这一页，再读 `51-新会话操作手册.md`；需要启动提示词时用 `50-新会话交接提示词.md`。
> 不要搜索或索引已删除的旧会话；事实以本仓文档和实际命令输出为准。

## 这是什么

DSH 插件三层标准/实践体系：

- **DSH-ENTRY**：兼容基线（G0–G5）
- **DSH-FLOW**：推荐可用性（J1–J8）
- **DSH-BOOST**：Cordis 提效（LEV-1–8）

用途：官方前沿探索、市场参考、开发者指南。  
定位：**非官方、非认证、非安全审计**，不代表 DeepSeek 官方背书。

Canonical：https://github.com/PerryLink/dsh-standards  
本地：`/mnt/c/Users/zzhdz/WorkBuddy/2026-10-30-16-02-58/dsh-standard`

## 先读顺序

1. `START-HERE.md`（本页）
2. `51-新会话操作手册.md` — 仓库地图、命令、权限、验收
3. `46-剩余事项与执行建议.md` — 还剩什么、P0/P1/P2
4. `49-配套包改名迁移记录-2026-11-02.md` — 四个配套包的新旧名
5. `44-角色治理与贡献机制.md` — 谁能决定什么
6. `45-三用途落地-官方市场开发者.md` — 三套采用包
7. `P0-P2-STATUS.md` — 逐项状态
8. `spec/levels.json`、`spec/clauses.json`、`scheme/SCHEME-v1.md`

需要细节时按 `00-索引.md` 找；不要整目录读 `00-live/`、`01-research/`、`03-index/generated/`。

## 当前状态（2026-11-02，起点）

- 许可：文本 **CC BY 4.0** + `MODIFICATION-POLICY.md`（修改必须显著说明）；代码 **Apache-2.0**；标志单独规则。
- 标准仓已 **public**。
- 治理：`roles` / `reviewers` / `mark-policy` / `scheme` / DCT 已 **active**（D-014）。
- 评价记录：`DSH-ATT-2026-001` 为 **active**，但仍是 `selfAssessed` / `self-reported`，不是独立验证。
- 标准仓测试：**73/73**。
- ENTRY：base-only 10 verified / 8 partial；real web profile 18/18 verified（16 clean + 2 **verified-gate-reject**）；18/18 clean 未达成；FLOW：10 个真实包 **78 PASS / 4 FAIL / 2 BLOCKED / 66 not-run**；BOOST：8/8 measured（synthetic/loader，不是生产基线）。
- J8 只有 module-load，没有 UI render；5 人 30 分钟中位数用机器干跑替代。
- 配套包：`dsh-clinic` 0.8.0、`dsh-scaffold` 0.2.0、`dsh-primer` 0.4.1、`dsh-codemod` 3.0.2；`dsh-cert-mcp` 0.2.12。
- 旧仓保留为指针/备份；旧 npm 包已 deprecate；`dsh-toolkit` 被 npm 拒绝，kit 实际名为 `dsh-scaffold`。
- 外部采用/第三方评审仍为空；co-maintainer 按用户决定“未来再说”。

## 不要做

- 不要重新讨论已定事项：CC BY 4.0 文本、Apache-2.0 代码、public、治理 active、四个新包名；要改先问。
- 不要删除旧仓、重写历史、重新启用 Dependabot、把 `dsh-toolkit` 当已发布包。
- 不要把 `not-run` / `partial` 写成 PASS、clean、verified；不要把自评写成独立验证。
- 不要修改只读的 `deepseek-harness` checkout。
- 不要读取/回显 token。

## 第一件事

读 `51-新会话操作手册.md`，运行其中“开工会话检查”，输出：

1. 现状核对（最多 10 行）
2. 文档与代码/CI 的差异
3. 最多 3 项建议（从 `46` 的 P0/P1 里选）

**先不要改代码**；等用户选一项后再动手。

# 决策日志（append-only）

> 规则：只追加，不删除；更正以新行追加并在 `supersedes` 注明。机器可读副本：`governance/decision-log.json`（可选，后续由 `ai-clerk` 生成）。
> 决策分级见 `governance/roles.json` 的 `decisions`。`A` = 不可逆/对外/法律；`B` = 标准语义；`C` = 代码/展示；`D` = 例行。

| ID | 日期 | 级别 | 决策 | 理由 | 证据/链接 | 反对/保留 | 复审日期 | 决策者 |
|---|---|---|---|---|---|---|---|---|
| D-001 | 2026-11-01 | A | 采用 ENTRY/FLOW/BOOST 三层“采用深度”模型；认证 A–D 与层正交 | 三层回答不同问题；混用会产生“等级=层”的误读 | `34`、`spec/levels.json` | 无 | 2027-02-01 | PerryLink (organizer) |
| D-002 | 2026-11-01 | A | 贡献机制采用 DCO 1.1 + DCT v1（许可而非版权转让），不采用传统版权转让 CLA | 降低早期贡献门槛；保留贡献者版权；机器可校验 | `governance/contribution-terms.md` | 无 | 2027-02-01 | PerryLink (organizer) |
| D-003 | 2026-11-01 | A | AI 角色不得单独签发/撤销证书、决定标准语义、终裁申诉、对外发言 | AI 无法律与道德责任能力；避免自批自评 | `governance/roles.json` §ai | 无 | 2027-02-01 | PerryLink (organizer) |
| D-004 | 2026-11-01 | A | `80/84/86` 的 7 席理事会、签署页、实体/保险不作为当前运行规则；仅在 Stage 2 触发时重启 | 没有真实成员/法人；纸面治理会制造虚假共识 | `96`、`44` §11 | 保留：未来可能需要 | 2027-05-01 | PerryLink (organizer) |
| D-005 | 2026-11-01 | B | 所有公开层标签必须带 `status` + `scope` + `date` + `evidence`；缺一按 `not-run` 处理 | 防止“空徽章”与“日期新=证据新” | `governance/mark-policy.md` | 无 | 2027-02-01 | PerryLink (organizer) |
| D-006 | 2026-11-01 | B | 证书与检验报告分离：`dsh-report/1` 与 `dsh-certificate/1` 不得互相包含结论字段 | 防止“doctor 通过=认证” | `spec/schemas/` | 无 | 2027-02-01 | PerryLink (organizer) |
| D-007 | 2026-11-01 | C | 新增 `governance/` 机器文件与 `dco-check`/`governance-check`/`certificate-check` | 让规则可执行，而不是只写在文档里 | `40-checker/scripts/` | 无 | 2026-12-01 | PerryLink (organizer) |

## 待决（不阻塞）

| ID | 问题 | 当前处理 | 何时再决 |
|---|---|---|---|
| P-001 | 标准仓是否转 public | 保持 private；公开教学副本在 guide | 内测群/官方使用方出现后 |
| P-002 | 是否申请商标/团体标准 | 不做；无实体、无预算 | Stage 2 且有法律意见后 |
| P-003 | 是否引入付费认证 | 不做；与“不卖等级”冲突 | 不计划 |
| P-004 | 是否设 7 席理事会 | 不做；当前 1 人 + AI | 有 5 名以上跨组织维护者后 |

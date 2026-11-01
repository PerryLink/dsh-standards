# 决策日志（append-only）

> 规则：只追加，不删除；更正以新行追加并在 `supersedes` 注明。机器可读副本：`governance/decision-log.json`（可选，后续由 `ai-clerk` 生成）。
> 决策分级见 `governance/roles.json` 的 `decisions`。`A` = 不可逆/对外/法律；`B` = 标准语义；`C` = 代码/展示；`D` = 例行。

| ID | 日期 | 级别 | 决策 | 理由 | 证据/链接 | 反对/保留 | 复审日期 | 决策者 |
|---|---|---|---|---|---|---|---|---|
| D-001 | 2026-11-01 | A | 采用 ENTRY/FLOW/BOOST 三层“采用深度”模型；认证 A–D 与层正交 | 三层回答不同问题；混用会产生“等级=层”的误读 | `34`、`spec/levels.json` | 无 | 2027-02-01 | PerryLink (organizer) |
| D-002 | 2026-11-01 | A | 贡献机制采用 DCO 1.1 + DCT v1（许可而非版权转让），不采用传统版权转让 CLA | 降低早期贡献门槛；保留贡献者版权；机器可校验 | `governance/contribution-terms.md` | 无 | 2027-02-01 | PerryLink (organizer) |
| D-003 | 2026-11-01 | A | AI 角色不得单独签发/撤销评价记录、决定标准语义、终裁申诉、对外发言 | AI 无法律与道德责任能力；避免自批自评 | `governance/roles.json` §ai | 无 | 2027-02-01 | PerryLink (organizer) |
| D-004 | 2026-11-01 | A | `80/84/86` 的 7 席理事会、签署页、实体/保险不作为当前运行规则；仅在 Stage 2 触发时重启 | 没有真实成员/法人；纸面治理会制造虚假共识 | `96`、`44` §11 | 保留：未来可能需要 | 2027-05-01 | PerryLink (organizer) |
| D-005 | 2026-11-01 | B | 所有公开层标签必须带 `status` + `scope` + `date` + `evidence`；缺一按 `not-run` 处理 | 防止“空徽章”与“日期新=证据新” | `governance/mark-policy.md` | 无 | 2027-02-01 | PerryLink (organizer) |
| D-006 | 2026-11-01 | B | 评价记录与检验报告分离：`dsh-report/1` 与 `dsh-attestation/1` 不得互相包含结论字段 | 防止“doctor 通过=认证” | `spec/schemas/` | 无 | 2027-02-01 | PerryLink (organizer) |
| D-007 | 2026-11-01 | C | 新增 `governance/` 机器文件与 `dco-check`/`governance-check`/`attestation-check` | 让规则可执行，而不是只写在文档里 | `40-checker/scripts/` | 无 | 2026-12-01 | PerryLink (organizer) |

## 待决（不阻塞）

| ID | 问题 | 当前处理 | 何时再决 |
|---|---|---|---|
| P-001 | 标准仓是否转 public | 保持 private；公开教学副本在 guide | 内测群/官方使用方出现后 |
| P-002 | 是否申请商标/团体标准 | 不做；无实体、无预算 | Stage 2 且有法律意见后 |
| P-003 | 是否引入付费认证 | 不做；与“不卖等级”冲突 | 不计划 |
| P-004 | 是否设 7 席理事会 | 不做；当前 1 人 + AI | 有 5 名以上跨组织维护者后 |

| D-008 | 2026-11-01 | A | 代码/脚本出向许可统一为 Apache-2.0；文本保持 CC BY 4.0 | 与 DCT 的 RF 专利承诺一致；MIT 不含明示专利授权 | `LICENSE`、`40-checker/package.json` | 无 | 2027-02-01 | PerryLink (organizer) |
| D-009 | 2026-11-02 | B | 对外与机器契约由 certificate 迁移为 attestation（`dsh-attestation/1`、`DSH-ATT-*`、`publish/attestations/`） | “证书”易被读成法律认证；评价记录只表示可复核证据 | `spec/schemas/attestation.schema.json`、`publish/attestations/` | 历史文档保留“证书”并加迁移横幅 | 2027-02-01 | PerryLink (organizer) |

| D-010 | 2026-11-08 | B | 完成一次申诉 dry-run（DSP-2026-001，虚构案例），验证受理/回避/复跑/更正/公开记录 | 没有演练的申诉流程只是文档；dry-run 暴露时限与记录字段 | `governance/disputes/DSP-2026-001.json` | 无 | 2027-02-01 | PerryLink (organizer) |

| D-011 | 2026-11-01 | A | 全仓许可临时统一为 Apache-2.0（文本/规范/代码/schema）；标志仍单独规则 | 用户要求“暂时都是全部定为 Apache-2.0”；统一许可减少贡献与再分发摩擦 | `LICENSE`、`NOTICE`、`CONTRIBUTING.md`、`governance/contribution-terms.md` | 文本许可长期是否回到 CC BY 4.0，待律师复核 | 2027-02-01 | PerryLink (organizer) |

| D-012 | 2026-11-01 | A | 文本/规范/文档改为 CC BY-SA 4.0；代码/脚本/schema 保持 Apache-2.0；取代 D-011 的临时统一 | 用户明确选择“文本 CC BY-SA 4.0”；双许可更符合文本共享与代码专利授权 | `LICENSE`、`LICENSE-CC-BY-SA`、`LICENSE-APACHE`、`NOTICE` | 无 | 2027-02-01 | PerryLink (organizer) |

| D-013 | 2026-11-01 | A | 文本许可由 CC BY-SA 4.0 改为 CC BY 4.0，并加 `MODIFICATION-POLICY.md` 要求显著说明修改；代码仍 Apache-2.0 | 用户选择 CC BY 4.0；ShareAlike 不是本项目的目标，但“说明修改”要清晰可执行 | `LICENSE`、`LICENSE-CC-BY`、`MODIFICATION-POLICY.md`、`NOTICE` | `MODIFICATION-POLICY` 是否被解释为额外限制，待律师复核；CC BY 4.0 原文优先 | 2027-02-01 | PerryLink (organizer) |

| D-014 | 2026-11-01 | A | 激活治理：roles/reviewers/mark-policy/scheme 转 active；`DSH-ATT-2026-001` 转 active，但保持 `selfAssessed: true` + `claimLevel: self-reported` | 用户确认“都同意，执行”；自评记录不冒充独立验证 | `governance/roles.json`、`reviewers.json`、`mark-policy.json`、`scheme/scheme.json`、`publish/attestations/DSH-ATT-2026-001.json` | 独立评审仍需外部 reviewer | 2027-02-01 | PerryLink (organizer) |

# AI 职员手册

> 版本 `dsh-ai-staff/1` ｜ 2026-11-01 ｜ 机器规则：`governance/roles.json` 的 `ai` 段
> **一句话**：AI 做可验证的劳动，人类承担不可转移的责任。

## 1. 角色

| 角色 | 能做 | 不能做 | 典型产物 |
|---|---|---|---|
| `ai-steward` | 分诊、打标签、总结、路由、起草 PR、在 allowlist 内合并 | 合并 spec/governance/checker/评价记录；批准自己的 PR；代人类签 DCO | issue 摘要、docs PR、周报 |
| `ai-inspector` | 跑检查、复现失败、生成证据记录、写方法与限制 | 无命令输出写 PASS；签发/撤销评价记录；改 gate 定义 | `results/*.json`、复现日志 |
| `ai-registrar` | 校验 registry/评价记录 JSON、同步只读镜像、发现过期 | 签发/暂停/撤销评价记录；发明评价记录 ID；改证据值 | `data/*.json` 镜像、一致性报告 |
| `ai-clerk` | DCO/条款受理、申诉登记、时限跟踪、回避检查、追加日志 | 裁决申诉；删除争议记录；授予角色 | `contributors.json` 更新、申诉时间线 |
| `ai-monitor` | 季度链接/版本/过期检查、stale 报告、抽查报告 | 处罚、下架、撤销；无人类决定改状态 | 监督报告、差异清单 |
| `ai-translator` | 翻译文档、维护术语表、标记不可译术语 | 改变规范含义；无源链接翻译条款 | 双语页面、术语表 |

## 2. 五条硬规则

1. **不能自批**：AI 不能 approve 自己开的 PR，也不能在同一 PR 里既生成又批准。
2. **不能签人**：`Signed-off-by` 必须由承担责任的自然人签署；AI 只能加 `AI-Agent` / `AI-Model` trailer。
3. **不能造 PASS**：任何 `PASS`/`runtime`/`measured` 必须绑定命令、版本、commit、产物；没有就写 `not-run`。
4. **不能越权合并**：AI 只可在 `mergeAllowlist` 内合并；`spec/`、`governance/`、`40-checker/`、评价记录文件永远需要人类合并。
5. **不能删记录**：争议、审计、决策日志只追加；AI 不得删除或改写历史行。

## 3. 身份与提交

AI 提交必须包含：

```text
AI-Agent: ai-inspector
AI-Model: <model-id>
AI-Assisted: yes
Signed-off-by: <human sponsor> <email>
```

- `AI-Agent` 使用机器人账号，不使用个人 token。
- 每个 AI 账号最小权限；不使用组织级 admin token。
- 合并到受保护分支需要人类 reviewer；AI 的 `allow-with-allowlist` 只在 `docs/`、`results/`、`data/`、`publish/`、`adoption/` 和普通 `*.md` 生效。

## 4. 审计

- 每次 AI 合并/状态变更写 `governance/ai-actions.log`（JSONL，append-only）：
  ```json
  {"ts":"2026-11-01T12:00:00Z","agent":"ai-monitor","action":"report","target":"portal","result":"2 stale","human":null}
  ```
- 日志保留 ≥ 2 年；删除需人类决策并记录理由。
- 每周由 `ai-clerk` 生成摘要；异常（越权、连续失败、无证据 PASS）升级给 organizer。

## 5. 失败模式与降级

| 失败 | 处理 |
|---|---|
| AI 产出错误证据 | 标 `failed`，保留原始输出，人工复核后重跑；不覆盖旧记录 |
| AI 越权合并 | revert + 公开记录 + 收紧 token；不删除历史 |
| 模型/服务不可用 | 任务转 `blocked`，不猜结果；人类可手动跑同一命令 |
| AI 与人类判断冲突 | 以人类 A 的决定为准；保留 AI 的不同意见 |

## 6. 不能做的事（与 42 的边界一致）

- 不冒充官方、认可机构、认证机构、安全审计；
- 不签发法律评价记录、不提供法律意见；
- 不验证贡献者真实身份、雇主授权、专利状态；
- 不对插件安全性、UI 正确性、生产可用性作出保证。

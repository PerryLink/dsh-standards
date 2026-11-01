# 申诉与投诉（Appeals and Complaints）

> 版本 `dsh-appeals/1` ｜ 2026-11-01 ｜ 机器入口：`.github/ISSUE_TEMPLATE/appeal.yml`
> **不是法律救济、不是仲裁、不是监管投诉。** 没有法人、没有合同关系时，这里只能做“事实更正 + 程序复核 + 公开记录”。

## 1. 谁可以申诉

- 被标注的插件作者/维护者；
- 被展示的市场/目录运营者；
- 因标签、报告、评价记录、公示受到影响的用户；
- 认为评审过程违反本规则的人。

## 2. 可受理的理由

只受理以下五类，其他转普通 issue：

1. **事实错误**：评价记录/报告中的 repo、版本、commit、证据、日期不正确；
2. **程序错误**：没有回避、没有给评论期、没有引用条款 ID；
3. **利益冲突**：评审者与被评审方存在未披露关系；
4. **证据过期/失效**：记录超过 `expiresAt` 仍显示有效；
5. **标签越界**：把 `self-declared` 写成 `certified`，或把层写成等级。

不受理：对等级/层本身的主观不满、要求删除真实证据、要求处罚第三方。

## 3. 时限

| 步骤 | 负责 | 时限 |
|---|---|---|
| 受理确认 | `ai-clerk` | 2 个工作日 |
| 回避检查 | `ai-clerk` | 受理后 1 个工作日 |
| 事实复核/复跑 | `ai-inspector` | 7 个工作日 |
| 决定 | organizer（或 Stage 2  panel） | 14 个工作日 |
| 公开记录 | `ai-clerk` | 决定后 2 个工作日 |
| 更正/撤回 | `ai-registrar` | 决定后 2 个工作日 |

逾期未决 → 自动标 `under-review`，并在页面显示“复核中”，不得继续显示旧 PASS。

## 4. 流程

```text
issue (appeal.yml)
  → ai-clerk 确认受理 + 检查回避
  → 有 COI 的评审者退出
  → ai-inspector 复跑/核对证据
  → organizer 决定（维持/更正/撤回/重启评审）
  → ai-clerk 写 decision-log + 公开摘要
  → ai-registrar 更新状态（active/suspended/withdrawn/corrected）
```

## 5. 决定类型

| 决定 | 效果 |
|---|---|
| `upheld` | 原结论维持；说明理由与证据 |
| `corrected` | 更正事实字段，保留历史版本 |
| `reopened` | 重启评审，状态 `under-review` |
| `withdrawn` | 撤回标签/评价记录，公开原因 |
| `no-jurisdiction` | 不属于本流程，转普通 issue |

## 6. 回避

以下任一情形必须回避：

- 与被申诉方同一 GitHub 组织；
- 同一雇主/资助方；
- 过去 12 个月有付费关系；
- 自己是该插件/市场的作者或运营者；
- 已在该争议中公开站队。

回避记录写入 `governance/coi.json` 的 `recusals`（后续字段），不记录不必要的个人信息。

## 7. 公开记录

每条申诉生成 `governance/disputes/<id>.json`（后续实现），最少包含：

```json
{
  "id": "DSP-2026-001",
  "subject": "repo@version",
  "grounds": "factual-error",
  "filedAt": "2026-11-01",
  "status": "decided",
  "recusals": [],
  "decision": "corrected",
  "reason": "...",
  "evidence": ["..."],
  "decidedAt": "2026-11-15",
  "decidedBy": "organizer"
}
```

## 8. 边界

- 不提供赔偿、不裁定法律责任、不强制任何第三方；
- 不能因为申诉而删除真实证据；
- 不能由被申诉方自己终裁；
- AI 只能登记、计时、核对、起草，不能决定。

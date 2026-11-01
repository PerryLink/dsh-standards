# DSH Attestation Scheme v1

> **非官方。** 这不是认证机构方案、不是认可、不是法律意见。它是一份**可复核的评价记录方案**：把 A–E 证据映射到 A–D 等级，并明确它不证明什么。
> 机器可读：`scheme/scheme.json`；评分准则：`scheme/rubric.json`。
> 命名：对外用 **attestation（评价记录）**；历史文档中的 “certificate/证书” 是同一文书，见 `governance/decision-log.md` D-009。

## 1. 对象与范围

- **对象**：一个已发布的 DSH 插件/ bundle，固定到 `repo@version` 与 commit。
- **范围**：A–E 五个维度；只评价该快照，不评价未来版本。
- **排除**：安全审计、运行时隔离、UI 正确性、生产可用性、官方背书、市场排名。
- **有效期**：自 `issuedAt` 起 12 个月；到期必须 `expired`/`stale`，不得继续显示有效。

## 2. A–E 维度

| 维度 | 证据 | 通过条件 | 不证明 |
|---|---|---|---|
| **A 清单合规** | 静态 | `dsh.bundle`、SPDX license、keywords/topics、README、`engines` | patch 能解析、host 能装、能 boot |
| **B 构建卫生** | 静态 | `files` allowlist、peer/optional 声明、无恶意 install 模式、lint/typecheck | 文件完整、脚本无害、运行时正确 |
| **C 供应链** | OpenSSF Scorecard | 快照日期的 scorecard 记录 | 插件行为、安全结论、ENETRY gate |
| **D 发布完整性** | npm provenance | `npm audit signatures` 可验证 | 代码正确、来源安全、host 接受 |
| **E 安装冒烟** | test-drive | 隔离 profile 中 install + keyless boot，四态 `ok/load-fail/install-fail/skip` | 每行 ACTIVE、其他 host 版本、FLOW 卸载 |

**Security veto（不是维度）**：混淆代码、凭据外泄、异常安装行为 → 直接 D，并公开原因。它不是安全审计，只是“未发现已知模式”。

## 3. 等级

| 等级 | 条件 |
|---|---|
| **A** | A–E 全过，E=`ok`，无 veto |
| **B** | E=`ok`，A/B/C/D 至少 3 个过 |
| **C** | E=`ok`，其余不完整 |
| **D** | 任一硬门失败（无 `dsh.bundle`、无 license、恶意模式命中） |

**环境阻塞**：E 仅因无人值守环境（如交互式 approve-builds）失败 → 记 `environment-blocked`，保留 B（若 A–D 过），不得记 D。

## 4. 证据纪律

1. 每个分数必须来自真实、可复跑的执行：probe、Scorecard、provenance、test-drive。
2. 没有证据 = `no-evidence`，不是猜测。
3. 每个维度记录 audit link + snapshot date。
4. 报告（`dsh-report/1`）与评价记录（`dsh-attestation/1`）是两种文书；报告无 grade，记录无 check 结果。
5. 自评（作者=评审者）只能 `claimLevel: self-reported`；独立 reviewer 才能 `verified`；3 人 panel 才能 `peer-reviewed`。

## 5. 证书/评价记录要素

`attestationId`（`DSH-ATT-YYYY-NNN`）、subject、grade、claimLevel、status、issuedAt/expiresAt、scope（dimensions + excluded）、scheme、assessor、evidence[]、selfAssessed、disclaimer、verifyUrl、history[]。

## 6. 暂停/撤销/过期

| 状态 | 触发 | 显示 |
|---|---|---|
| `draft` | 材料未签 | 不作为有效 |
| `active` | organizer 签发 | 可显示，带 scope/expiry |
| `suspended` | 申诉/复核中 | `under-review`，不得显示旧 PASS |
| `withdrawn` | 证据错误/误用/作者撤回 | `withdrawn` + 原因 |
| `expired` | `expiresAt` 已过 | `stale`/历史区 |

**没有申诉/COI 的记录不得签发。** 自家插件必须 `selfAssessed: true`。

## 7. 标志

标志使用见 `governance/mark-policy.md`。等级徽章必须带 `attestationId`、`scope`、`expiresAt`、`verifyUrl`，并同视图显示“非官方 · 非认证 · 非安全审计”。

## 8. 不能做

- 不能把 A–D 换算成 ENTRY/FLOW/BOOST；
- 不能把 doctor 报告叫评价记录；
- 不能声称官方/认可/CNAS；
- 不能在没有 COI/申诉的情况下签发；
- 不能把 `self-reported` 写成 `verified`；
- 不能把过期/撤回的记录恢复成有效。

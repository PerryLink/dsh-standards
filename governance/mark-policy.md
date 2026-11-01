# DSH 标志使用规则（Mark Policy）

> 版本 `dsh-mark-policy/1` ｜ 2026-11-01 ｜ 机器可读版本：`governance/mark-policy.json`
> **不是商标注册、不是认证标志、不是法律意见。** 本项目没有法人、没有注册评价记录；这里只是一套**来源标识 + 使用规则**，让读者知道“这个词是谁说的、证据在哪”。

## 1. 标志范围

- 文字：`DSH-ENTRY`、`DSH-FLOW`、`DSH-BOOST`。
- 图形：`publish/` 下的 level badge（如有）。
- 不包含：`DSH` 单独字样、DeepSeek 名称/ Logo、任何官方徽章。

## 2. 允许的用法

**自动授予**：只要证据记录满足 `status + scope + date + evidence`，任何仓库/市场即可使用层名与 badge，不需要申请、账号、付费或人工批准。许可是非排他、免费、可撤销、不可转让的。

1. 在 README / 市场卡片 / 报告中显示层名，**同时**显示：
   - `status`（如 `runtime` / `manual` / `measured` / `not-run`）；
   - `scope`（dsh/cordis 版本、commit）；
   - `date`；
   - 证据链接或评价记录 ID。
2. 写明 `self-declared`（自声明）或 `tool-verified`（工具验证），不得混用。
3. 原样引用条款文本，注明来源与版本。
4. 在 badge 上链接到证据页或 `verify` 页。

**推荐格式**：

```text
DSH-ENTRY · runtime · dsh 0.2.2-alpha.2 / cordis 4.0.6-alpha.1 · 2026-11-01 · evidence: <url>
非官方 · 非认证 · 非安全审计
```

## 3. 禁止的用法

- `official`、`national standard`、`GB`、`CNAS`、`accredited`、`certified`、`security audit`、`secure`、`recommended`、`best`、`top`、`ranking`、`guaranteed`、`passed`、`approved by DeepSeek`；
- 没有证据链接的 `PASS` / `通过`；
- 把层名当作品质排名、付费排序、市场准入门槛；
- 修改条款后继续使用原名；
- 把过期/撤销的记录继续显示为有效；
- 把 badge 说成“法定标志”或“认证评价记录”。

## 4. 免责声明

任何展示标志的页面，必须在**同一视图**内出现：

> 非官方 · 非认证 · 非安全审计 / Not official, not a certification, not a security audit.

只放在链接页、脚注、图片 alt 里不算。

## 5. 终止

1. 发现误用 → `ai-monitor` 记录 → 管理人在 7 天内发出更正请求。
2. 30 天未更正 → 管理人可撤回标志使用权，并在 `decision-log.md` 公示。
3. 撤回不影响对历史事实的准确引用，但必须附更正说明。
4. 不收费、不设许可费；也不承诺批准任何使用申请。

## 6. 机器检查

`40-checker/scripts/claim-check.mjs` 扫描指定 Markdown/JSON：

- 出现层名但同段落没有 `status` 或 `evidence` → WARN；
- 出现禁用词 → FAIL；
- 出现层名但同页面没有免责声明 → WARN；
- 评价记录 JSON 含 `level` 字段 → FAIL（评价记录与层正交）。

## 7. 边界

- 本规则不产生商标权、不构成默示许可、不限制合理使用/描述性使用。
- 没有法人时，执行手段只有：公开更正、撤回展示合作、拒绝合并；**没有法律强制执行**。
- 未来如注册主体/商标，本规则需由律师复核后重写。

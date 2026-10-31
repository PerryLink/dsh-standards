# npm `dsh-standard` 相似度误判申诉稿

> 状态：**草稿，未提交**。提交前确认 npm 账号、包名、时间。
> 事实：npm 对 `dsh-standard` 返回 403，不是已有同名包，而是名称相似度策略。

---

## 一、提交入口

1. **首选**：<https://www.npmjs.com/support?inquire=naming-dispute>
   - 分类：Naming dispute / Package name
   - 标题：`False-positive name similarity block: dsh-standard vs ts-standard`
2. **备用**：邮件 `support@npmjs.com`
   - 主题同上；附 npm 用户名、错误原文、GitHub 仓库、README。
3. **不要**用 `abuse@npmjs.com`：那是商标/滥用通道，本项目没有商标注册证。

---

## 二、可直接粘贴的正文（英文）

```text
Subject: False-positive name similarity block: dsh-standard vs ts-standard

Hi npm support,

I am the owner of the npm account `perrylink` and of the repository
https://github.com/PerryLink/dsh-standards (private draft).

I am trying to publish the package name `dsh-standard`. npm returned:

  403 Forbidden - PUT https://registry.npmjs.org/dsh-standard
  Package name too similar to existing package ts-standard;
  try renaming your package to '@perrylink/dsh-standard'.

I believe this is a false positive:

1. `dsh` means DeepSeek Harness, not TypeScript. `ts-standard` is a
   TypeScript style tool; `dsh-standard` is a DSH plugin standard.
   They do not share a namespace, API, CLI, or user base.
2. The shared suffix `-standard` is a generic English word, not a
   brand or scoped identifier. Many unrelated packages use it.
3. `dsh-standard` is not a placeholder: it has a real spec, checker,
   evidence, and examples at the repository above. The package would
   expose the conformance CLI, not an empty reservation.
4. I am not asking to take over `ts-standard` or to rename it; I am
   only asking for a manual review of the similarity heuristic.

Request: please allow the unscoped name `dsh-standard` for the account
`perrylink`, or tell me the concrete rule/threshold that blocks it.

If the name cannot be allowed, I will keep using the scoped package
`@perrylink/dsh-standard` and the already-published `dsh-standards`.
I will not create duplicate empty packages.

Evidence:
- 403 response: [paste full error + timestamp]
- repository: https://github.com/PerryLink/dsh-standards
- npm account: perrylink
- package metadata: name dsh-standard, version 0.0.1, MIT

Thank you,
<your name>
```

---

## 三、提交时附什么

- npm 用户名：`perrylink`
- 403 全文（含时间、PUT URL、`ts-standard` 原文）
- GitHub 私仓邀请/公开说明（如果 support 看不到私仓，附 README 截图或公开 gist）
- `package.json`（name/version/license/repository）
- 一句话差异：`dsh = DeepSeek Harness`，`ts = TypeScript`
- 不附：token、用户数据、无关仓库

---

## 四、成功率判断

| 因素 | 判断 |
|---|---|
| 是否同名包冲突 | 否，是相似度启发式 |
| 是否恶意抢注 | 否，有真实规范/工具 |
| `ts-standard` 是否会被混淆 | 低：不同领域、不同前缀、不同 CLI |
| npm 是否有人工复核 | 有 support，但无公开 SLA |
| 成功率 | **低到中**；可能维持 403，也可能给 allowlist |
| 最坏结果 | 继续用 `dsh-standards` / `@perrylink/dsh-standard`，不影响项目 |

**不要重复提交/换账号刷**；一次正式申诉 + 一次 follow-up 足够。

---

## 五、备用方案（已落地）

- `dsh-standards@0.0.3` 已发布（有 `bin`/`canonical()`，registry 直连 200；避免 squatting 判定）
- `@perrylink/dsh-standard@0.0.2` 已发布（功能包）
- `@perrylink/dsh-standards@0.0.3` 已发布
- PyPI：`dsh-standard` / `dsh-standards` 0.0.1
- GitHub/Gitee/GitCode：双仓占位，canonical 已切到 `dsh-standards`

---

## 六、重要风险

npm 的 [Dispute Resolution](https://github.com/npm/policies/blob/main/disputes.md) 明确反 squatting：**没有真实功能的占位包可能被转走**。所以占位包不能长期空着；至少要有：

- 一个可执行 `bin` 或可导入函数；
- README 说明用途；
- 真实仓库链接。

`dsh-standards` 下一步应发 **0.0.2 功能性占位**，而不是只放 README。

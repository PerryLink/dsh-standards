# 平台占位状态（2026-10-31，2026-11-01 更新）

> 2026-11-01 更新：`PerryLink/dsh-standards` 已转 **public**；`PerryLink/dsh-standard` 仍是私有 alias。canonical 仍是 `dsh-standards`，本地 `origin` 应指它。

| 平台 | `dsh-standard` | `dsh-standards` | 说明 |
|---|---|---|---|
| GitHub | **私有仓** `PerryLink/dsh-standard`（alias） | **public 仓** `PerryLink/dsh-standards`（README 指向主仓） | 主仓 2026-11-01 转 public；alias 只放 README |
| npm | **被 npm 拒绝**：名称与 `ts-standard` 过近，403 | **已发布** `dsh-standards@0.0.3` | 备选 `@perrylink/dsh-standard@0.0.2`、`@perrylink/dsh-standards@0.0.3` 已发布 |
| PyPI | **已发布** `dsh-standard@0.0.2` | **已发布** `dsh-standards@0.0.2` | wheel 占位 + `canonical()` 指针；不是可用库 |
| Gitee | **私有仓** `perrylink/dsh-standard` | **私有仓** `perrylink/dsh-standards` | 空仓 + README 指针 |
| GitCode/AtomGit | **私有仓** `PerryLink/dsh-standard` | **私有仓** `PerryLink/dsh-standards` | 空仓 + README 指针 |
| GitLab | 未占 | 未占 | 无 token；待办 |

## npm `dsh-standard` 的 403 原文

> Package name too similar to existing package ts-standard; try renaming your package to '@perrylink/dsh-standard' and publishing with 'npm publish --access=public' instead.

这是 npm 名称相似度策略，不是被现有同名包占用；不能靠重试解决。

## 更新策略

- 内容只维护 `dsh-standards`；`dsh-standard` 只放指针，不复制。
- npm/PyPI 占位包已升级到有最小功能的 0.0.2/0.0.3；正式发布前重新评估包名。
- 平台链接不得写成“官方/认证”。

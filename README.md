# dsh-standards

> **非官方、非认证、非安全审计。** 这是 DSH 插件规范与实践草稿（canonical: dsh-standards），不代表 DeepSeek 官方背书。
> `"DeepSeek Harness"` 是 DeepSeek 的商标；本项目只使用 `DSH` 缩写。

一个项目，三层采用深度：

| 层 | 规范/实践 | 当前状态 |
|---|---|---|
| 1 | **DSH-ENTRY 入门规范** | 18/18 `recognized`；10/18 base-only G3 verified，gate 后 8/18 clean；client 15/15 loaded |
| 2 | **DSH-FLOW 顺畅规范** | draft；J1 真跑，J2–J8 `not-run` |
| 3 | **DSH-BOOST 加速实践** | draft；LEV-3/6/7 已 measured（loader / provider-capture / synthetic timer） |

## 先看什么

- [00-索引](00-索引.md) — 全包路由
- [31-DSH-ENTRY 入门规范](31-DSH-ENTRY入门规范.md) — 内部条款
- [99-DSH-ENTRY 兼容性画像（对外版）](99-DSH-ENTRY兼容性画像-对外版.md) — 4–6 页对外版
- [32-DSH-FLOW 顺畅规范](32-DSH-FLOW顺畅规范.md) — J1–J8
- [33-DSH-BOOST 加速实践](33-DSH-BOOST加速实践.md) — 8 条 LEV
- [34-三层分级模型（GB/GB-T/GB-Z 类比）](34-三层分级模型-GB-GBT-GBZ类比.md) — 为什么是三层、怎么读
- [35-三层开发建议与验收清单](35-三层开发建议与验收清单.md) — 作者最短路径 / 评审清单
- [36-插件全生命周期与工具链](36-插件全生命周期与工具链.md) — 从脚手架到退役
- [37-PerryLink 插件生态三层对照](37-PerryLink插件生态-三层对照与升级清单.md) — 我的仓怎么升级
- [97-采纳可行性评估](97-采纳可行性评估.md) — 官方路径、缺口、90 天
- [98-内测群与官方沟通包](98-内测群与官方沟通包.md) — 对外话术

## 快速命令

```bash
cd 40-checker
node --test test/*.test.mjs

# 只做结构识别（不声明运行）
node bin/dsh-plugin-verify.mjs <plugin-dir> --scope entry --entry-claim static

# 声明运行（bundle 需要 host）
node bin/dsh-plugin-verify.mjs <bundle-dir> --scope entry \
  --host /path/to/@deepseek-ai/dsh-app-boot/lib/index.js

# 三层自检（ENTRY 自动；FLOW/BOOST 证据文件）
node scripts/level-audit.mjs <dir> --format json

# J1 安装/卸载旅程
node scripts/journey-runtime.mjs --package <dir> --json

# LEV-7 有界并行基准
cd ../examples/boost
node lev7-bench.mjs 64 20
```

## 当前硬数据

- 18 包 entry static：**18/18 recognized，0 clean**；
- 18 包 DS-C static：**0 PASS / 9 WARN / 9 FAIL**；
- 18 包 base-only runtime：**18/18 有原始 JSON；10/18 G3 verified，8 partial，0 error**；host gate 后 **8 clean + 2 reject + 8 partial**；
- client runtime：**15/15 `client-module-loaded`**（真实 Chromium）；web-app **4/4 loaded**；
- 不可用：**0 plugin code FAIL；2 host-gate reject（telemetry/verification）**；
- 检查器：**20/20 tests**；
- J1：**6 PASS + 1 WARN**；LEV-3：volatile **0/20** vs control **20/20** remount；LEV-6：稳定 prefix **100%** vs 易变 **0%**；LEV-7：**8.24×**（合成，非生产基线）。

## 边界

- 不收费、不卖等级、不卖排名；
- 不做认证/安全审计；
- 不把 static 写成 runtime；
- 不把 10/18 base-only 写成 18/18 web/生产；不把 `client-module-loaded` 写成 UI/认证；
- 不声称官方推荐/采纳。

## 目录

```text
00-99*.md         规范/研究/画像/沟通包
40-checker/       检查器、J1 旅程、bundle smoke、样本框、结果
examples/boost/   LEV-7 参考实现与基准
publish/          format-1 labels 示例
```

## 先行项目

`dsh-plugin-standard`（lanbaolu）是同生态的先行项目；本项目与其无隶属关系，引用/对比时将标注来源。许可在正式对外前单独确认。

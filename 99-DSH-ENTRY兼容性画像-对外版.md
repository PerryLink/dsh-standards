# 99 · DSH-ENTRY 兼容性画像（对外版 v0.1）

```text
Community self-check record — not a certification, not a security audit, not an endorsement.
Not affiliated with, authorized by, or endorsed by DeepSeek. "DeepSeek Harness" is a trademark of DeepSeek.
Snapshot at deepseek-harness@ce7073d · dsh 0.2.2-alpha.2 · cordis 4.0.6-alpha.1 · scanner 0.1.0 · reviewed 2026-10-31
Covers load-time consistency and declared capabilities only; no warranty; install third-party code at your own risk.
```

> **这不是标准，也不是认证。** 这是一次 18 个真实 bundle 的装载期兼容性画像；目的不是给插件打分，而是回答“现有插件不改代码，能不能被识别、安装、至少跑起来”。

---

## 1. 一句话

**18 个 bundle 中，7 个在 base-only + gate 下全行 ACTIVE；4 个只完成部分行；4 个缺 web-app 无法判定；2 个被宿主版本门拒绝；1 个 patch 缺根行，插件侧可归因失败。**

---

## 2. 方法

- 样本：10 个 GitHub 源码 + 8 个 npm bundle，全部 `kind=bundle`，共 18 个去重包；这是**目的性样本**，不是随机抽样。
- 静态：`DSC-01/02/11/12/13`（DS-C 口径）。
- 运行：真实 `app-boot` + base-only patch + 目标 bundle patch；隔离 `HOME/DSH_HOME/TMPDIR`；读 `ctx.loader.entries()` 的 `fiber.state`。
- 门槛：G0 patch 解析；G1 组合/行解析；G2 `evaluatePluginCompatibility`；G3 目标行 ACTIVE/disabled；G4 client root 静态；G5 产物 mtime。
- **已做**：18 包 base-only G0–G3（18/18 原始 JSON）；18 行真实 web profile + Chromium client probe；60/20 full-clone static。
- **未做**：60+ 随机 runtime；真实 provider / 生产基准；server 行逐行断言。

---

## 3. 结果

### 3.1 五种状态（18 包）

| 状态 | 数量 | 含义 |
|---|---|---|
| `runtime` | **7** | G0–G3 全过，目标行全 ACTIVE |
| `partial` | **4** | 核心行 ACTIVE，其余等 web-app 服务 |
| `unavailable` | **4** | base-only 无法判定，需完整 web profile |
| `blocked` | **2** | 宿主 gate 拒绝（版本范围不满足） |
| `failed` | **1** | 插件侧可归因（patch 缺根行） |

> 7+4+4+2+1=18。**没有“18/18 通过”**。

### 3.2 静态口径（不要混）

| 口径 | 结果 |
|---|---|
| DS-C 静态（`package`） | **0 PASS / 9 WARN / 9 FAIL**；18/18 至少 1 WARN |
| ENTRY 静态（`--entry-claim static`） | **18/18 recognized；0 个干净通过**（C-2.1/C-11/C-13 WARN） |
| server-entry L1 | 17/18（只是单入口，不是 bundle） |
| bundle runtime（base-only，18/18 有原始 JSON） | **10/18 G3 verified；host gate 后 8/18 clean** |
| client runtime（`client-module-loaded`，真实 Chromium） | **15/15** |
| web-app 行（web profile，真实 Chromium） | **4/4 加载；server 行未逐行断言** |

### 3.3 零改动分类

| 类别 | 数量 | 含义 |
|---|---|---|
| A 零改动可跑（base-only clean） | 8 | 不改任何东西，G3 全行 ACTIVE + gate admit |
| B 改 1 个 manifest peer 范围 | 2 | telemetry / verification；host gate REJECT，改范围可解 |
| C 零改动但需目标 profile | 8 | 4 个 web-app + 4 个等 webServer/agentPresets 的行；web profile 下 4 个 web-app 已加载 |
| D 改 patch | 0 | YuJun 的“根行缺失”是 fixture 未建模 postinstall，不是 patch 缺陷 |
| 硬坏 | 0 | — |

**结论**：**“不改代码”成立；“零改动”不成立。**

---

## 4. 两个真实缺陷 + 一个早期误判

1. **YuJun/dsh-purge（早期误判，已更正）**：根行由 `postinstall` 写进 profile 的 `cordis.patch.yml`，不是包内 patch 缺失。真实安装 + profile 层组合后根行 ACTIVE；base-only 的 2/3 是 fixture 没跑 postinstall。**不是插件侧 FAIL。**
2. **telemetry / verification**：声明的 peer 范围与测试宿主不匹配（`<0.2.0` / `<0.1.0`），宿主 preflight 正确 REJECT。**host gate 拒绝，不是插件代码 FAIL；最小修复是把上界改到 `<0.3.0`。**
3. **4 个 web-app（早期 unavailable，已补）**：SeaOf0、liguobao、shaobeichen、ui-auth 在真实 web profile + Chromium 下 **4/4 客户端模块加载**；base-only 缺 `webServer/connection/agentPresets` 是分层事实，不是不可用。

---

## 5. 局限

- 样本非随机：18/2,686（约 0.67%），3 个同源 purge，全是 bundle；不能外推“现有插件”。
- 每包 G3 原始 JSON 已落：`40-checker/results/entry/18/fullbase/`；本画像仍只是汇总，复核请以 JSON 为准。
- web profile 已跑 18 行；client 是 `client-module-loaded`（boot graph + 资源 + shell mount + 0 error），**不是 UI 像素/交互评审**，server 行未逐行断言。
- 60/20 是 static full-clone；不是 60+ 随机 runtime，也没有误报率。
- LEV-6 是合成 provider，不是真实计费；BOOST 仍无生产基准。

---

## 6. 一个请求

如果你有真实插件，跑一次 checker，回一句“哪条最烦/哪条误报”。  
**不要求你遵守，不要求你贴标，不要求你支持。** 只收 `name/version/manifest/结果`，不收代码/会话/凭据。

---

## 7. 结论

- 这套东西现在只能叫**非官方兼容性画像 + 工具**，不能叫标准/认证。
- 真正可归因的插件代码失败：**0 个**（YuJun 已更正为 fixture limitation）；2 个是宿主 gate 的版本范围问题，且宿主拒绝是正确的。
- 现在有 18 包 base-only 原始 JSON、18 行 web profile、15/15 client-module-loaded、60/20 static；仍不能外推成“生态结论”。
- 下一步是 **真实 provider 的 BOOST 基准 + 随机 runtime 样本 + 上游 peer range 修复 + 1–2 名 co-maintainer**。

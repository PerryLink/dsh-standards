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
- **未做**：完整 base+web-app web profile；浏览器 client runtime；60+ 随机样本。

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
| bundle runtime | **7/18** |
| client runtime | **0/15** |

### 3.3 零改动分类

| 类别 | 数量 | 含义 |
|---|---|---|
| A 零改动可跑 | 7 | 不改任何东西，runtime |
| B 改 1 个 manifest 字段 | 2 | C-2.2 版本范围；改完能否跑待证 |
| C 零改动但需目标 profile/构建 | 8 | 4 个 web unavailable、ysr 需构建、3 个 partial |
| D 改 patch | 1 | YuJun 根行未插入 |
| 硬坏 | 0 | — |

**结论**：**“不改代码”成立；“零改动”不成立。**

---

## 4. 三个真实缺陷

1. **YuJun/dsh-purge**：`cordis.patch.yml` 只 insert 子行，没 insert 根行；主插件不挂载，client 无 root row。**插件侧 FAIL。**
2. **telemetry / verification**：声明的 peer 范围与测试宿主不匹配；宿主 preflight 拒绝/跳过。**host gate blocked，不是插件代码 FAIL。**
3. **4 个 web unavailable**：SeaOf0、liguobao、shaobeichen、ui-auth；缺 `webServer/webStartup/connection/agentPresets`，base-only 无法判定。

---

## 5. 局限

- 样本非随机：18/2,686（约 0.67%），3 个同源 purge，全是 bundle；不能外推“现有插件”。
- 没有落盘每包 G3 原始 JSON；本画像是汇总表，不是可复算证据包。
- 没有完整 web profile；4 个 unavailable 不是 pass，也不是 fail。
- 没有 client runtime；15 个 client 只证明 `exports["./client"]` 存在。
- 没有 60+ 随机/长尾样本；没有误报率。

---

## 6. 一个请求

如果你有真实插件，跑一次 checker，回一句“哪条最烦/哪条误报”。  
**不要求你遵守，不要求你贴标，不要求你支持。** 只收 `name/version/manifest/结果`，不收代码/会话/凭据。

---

## 7. 结论

- 这套东西现在只能叫**非官方兼容性画像 + 工具**，不能叫标准/认证。
- 真正可归因的插件失败只有 **1 个**；2 个是宿主 gate，4 个是环境缺口。
- 下一步是 **60+ 随机样本 + 完整 web profile + 原始 JSON**；在这之前，7/18 只能作为“当前画像”，不能作为“生态结论”。

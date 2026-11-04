# 31 · DSH-ENTRY 入门规范（v2）

> **版本**：v2.0.0-rc.1 ｜ **日期**：2026-10-31
> **定位**：三套规范/实践的第一套；回答“现有插件几乎不改，能不能被 DSH 识别、安装、至少跑起来”。
> **依据**：`92-兼容运行时实测.md`（18 包真实 boot）、`90-兼容运行时保证.md`（G0–G3）、`40-checker`（`--scope entry`/`DSC-14`）。
> **不是**：认证、排名、完整 DSH-ENTRY 的 11/12 条强制；`interop-static` 不是通过。
> **对外版**：4–6 页画像见 `99-DSH-ENTRY兼容性画像-对外版.md`；本文件是内部条款。
> **当前证据（2026-11-01）**：18/18 base-only JSON，10 G3 verified / 8 partial / 0 error；gate 后 8 clean + 2 reject + 8 partial；web profile client 15/15 loaded。
> **三层模型**：`34-三层分级模型-GB-GBT-GBZ类比.md`；作者清单：`35`。

---

## 一、三条轨道，不是三级

| 轨道 | 中文 | 代码 | 回答 |
|---|---|---|---|
| 1 | 入门规范 | **DSH-ENTRY** | 能不能装、能不能跑 |
| 2 | 顺畅规范 | **DSH-FLOW** | 装得上、配得动、用得顺、卸得净 |
| 3 | 加速实践 | **DSH-BOOST** | 用 Cordis 多快好省 |

- 三套是**不同问题**，不是分数/等级；
- 第三套是**实践库**，不贴插件；
- 旧 `DS-C/R/G` 只作历史别名（`89`）。

---

## 二、entry profile

`entry` 是 DSH-ENTRY 的兼容档，不是完整 DSH-ENTRY。

### 2.1 run set（coverage full；not-run = exit 2）

| 检查 | package | listing |
|---|---|---|
| `DSC-01`（ENT-1） | 必跑 | 必跑 |
| `DSC-02`（ENT-2） | 必跑，C-2.1/2.4 只 WARN | 同左 |
| `DSC-03`（ENT-3） | NA | 必跑 |
| `DSC-11/12/13` | 必跑，字段类 WARN/NA | 同左 |
| `DSC-14`（ENT-14） | 必跑；plugin L1 / bundle G0–G3 | 同左 |

### 2.2 blocking

- `C-1.1` / `C-1.2` / `C-1.4`
- `C-2.2` / `C-2.3`（仅 **runtime claim**；声明不满足/`workspace:` 发布包，宿主会拒绝安装/跳过）
- listing `C-3.1/3.2/3.5`
- `DSC-14` 可归因 FAIL（仅 **runtime claim**；plugin 相对文件缺失/apply 抛错；bundle patch/行/真实 boot 失败）

**不 blocking（WARN）**：`C-11.3`、`C-12.1` hard hit、`C-13.4`（安全/品牌交 FLOW/治理轨；entry 不做安全审计）。

**WARN/NA**：`C-2.1`、`C-2.4`、`C-1.5/1.6`、`C-11.1/2/3/5`、`C-12.1/2/3/4`、`C-13.1/2/3/4/5`、S2 `unmatchedTargets`、C-7 dispose 残留。

### 2.3 按 kind 的“运行”

| kind | 运行证据 | 结论 |
|---|---|---|
| `plugin` | L1 ACTIVE + L2 归零（L2 失败只 WARN） | `interop-runtime` |
| `bundle` | G0 patch 解析 + G1 组合/行解析 + G2 gate + G3 真实 boot 目标行 ACTIVE/disabled | `interop-runtime (bundle)` |
| `client` | 仅 `exports["./client"]` + root row（静态） | `interop-static (client, build-only)` |
| `preset` | 组合层，不是可安装包 | `NA` |
| `skill` | 纯 skill NA；有入口+apply 才按 plugin | `NA` 或 `interop-runtime` |
| `theme`/`mcp-config` | 静态资源/外部进程 | `NA` |
| `unknown` | 无法判定 | `NA + manual` |

### 2.4 结论状态

| 状态 | exit | level |
|---|---|---|
| recognized（static claim，无 runtime 声明） | 0 | `DSH-ENTRY recognized` |
| runtime verified + anchor 匹配 | 0 | `DSH-ENTRY runtime` |
| runtime verified + anchor 不匹配 | 0 | `DSH-ENTRY runtime (unanchored)` |
| composition only | 0 | `DSH-ENTRY runtime (composition)` |
| static/not-run | 2 | `DSH-ENTRY static` |
| blocked（host/fixture） | 2 | `DSH-ENTRY unavailable` |
| plugin 可归因 FAIL | 1 | `DSH-ENTRY failed` |

**永不输出 `level: DSH-ENTRY` 的“通过”；static 不是通过。**

---

## 三、18 包真实基线

18 个去重包 = 10 GitHub + 8 npm，全是 bundle；另 1 条 listing 复跑。

| 口径 | 结果 |
|---|---|
| DS-C 静态 L0 | **0 PASS / 9 WARN / 9 FAIL**；18/18 至少 1 WARN |
| ENTRY 静态（`--entry-claim static`） | **18/18 recognized**；0 个干净通过（C-2.1/C-11/C-13 WARN） |
| server-entry L1 | 17/18 |
| G0/G1 | 18/18 / 18/18 |
| G2 gate | 16/18 ADMIT（2 SKIP） |
| G3 真实 boot base-only | 18/18 BOOT_OK；全行 9/18；gate 后 **7/18**；主行 11/18 |
| 明确不可用 | 3/18：1 个插件 FAIL（YuJun patch）+ 2 个 host/gate blocked（telemetry/verification） |
| 无法判定 | 4/18（SeaOf0、liguobao、shaobeichen、ui-auth，缺 web-app） |
| client runtime | 0/15 |

> 这不是“18/18 可用”；是“18/18 能被识别，7/18 在 base-only + gate 下全行 ACTIVE”。完整 base+web-app 未跑，4 个 pending 不得写成 pass。
>
> **0.2.2-alpha.3 补充（2026-11-04）**：ENTRY 还要按 Node `>=24.9.0`、`engines.dsh` 优先（0.2.1-alpha.4+）、Typert `create()`、`dsh-client-runtime` 已移除来核对；详见 `35` §七。

---

## 四、开发建议

见 `93-开发建议-入门.md`：最小 `package.json`、plugin/bundle/client 入口、root row、常见错误、自检命令。

---

## 五、边界

- 不做安全审计/运行时沙箱；只做装载期一致性 + 运行冒烟。
- 不排名、不打分、不做市场门禁；entry 是兼容底线。
- `--treat-as-plugin` 只是 server-entry 代理，不是 bundle；bundle 必须 G0–G3。
- 报告必须带 runtime commit + 产物 mtime；旧结果不得当现值。

---

## 六、下一步

1. 补 base+web-app 的 4 个样本，区分 runtime / unavailable。
2. G4 client 从静态升级为构建/浏览器探测（需要宿主页面）。
3. 把 `--scope entry` + `DSC-14` 接 CI，7/18 作为回归基线。

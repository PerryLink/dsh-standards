# 34 · 三层分级模型（GB / GB∕T / GB∕Z 类比）

> **版本**：v1.0.0-rc.1 ｜ **日期**：2026-11-01 ｜ **状态**：草案，待内测群/作者共同确认
> **定位**：把 `31`/`32`/`33` 的三层关系写成**一个可解释、可机器读、可对外沟通**的模型；不是第四套标准。
> **不是**：官方标准、认证、排名、安全审计、法律意义上的强制规范。GB 只是**类比**，本项目没有标准化主管机构、没有标准号、没有强制力。
> **机器可读**：`spec/levels.json`；自检工具：`40-checker/scripts/level-audit.mjs`。

---

## 一、为什么要三层：三个不同的问题

DSH 插件生态里，“合格”至少有三层含义，而且它们不是同一根尺子的三个刻度：

| 问题 | 层 | 一句话 |
|---|---|---|
| 装得上、跑得起来、不把宿主拖垮 | **DSH-ENTRY** | 兼容底线 |
| 用户装得上、配得动、用得顺、卸得净 | **DSH-FLOW** | 采用体验 |
| 用 Cordis 的 effect / inject / volatile / jobs / seam 做得更省 | **DSH-BOOST** | 框架利用率 |

把三者压成一个总分，会制造两种假象：

- 一个 `ENTRY` 很干净的插件，可能 `FLOW` 一塌糊涂（文档缺失、卸载残留）；
- 一个 `BOOST` 很漂亮的插件，可能连 `ENTRY` 都没过（peer 范围写错、client 入口缺失）。

所以三层必须**分开判定、分开引用、分开过期**。

---

## 二、GB / GB∕T / GB∕Z 类比

> 下表只借用“强制基线 / 推荐 / 指导性技术文件”的**分层直觉**，不借用法律效力、标准号、发布机构或任何官方身份。

| 维度 | GB（类比） | GB∕T（类比） | GB∕Z（类比） |
|---|---|---|---|
| 中文 | 强制性国家标准 | 推荐性国家标准 | 国家标准化指导性技术文件 |
| 本项目 | **DSH-ENTRY** | **DSH-FLOW** | **DSH-BOOST** |
| 回答 | 能不能装、能不能跑 | 装完之后顺不顺 | 有没有把 Cordis 用出效率 |
| 采用方式 | 自选采用；声称“ENTRY 兼容”时必须过 | 推荐采用；不采用不构成“不合格” | 指导性；只登记做法与证据 |
| 失败的说法 | 不能声称兼容 | 不推荐大规模采用 | 不声称“增效” |
| 证据 | G0–G5 + 静态/运行时状态 | J1–J8 + 用户旅程记录 | LEV-1–8 + 证据卡 |
| 谁可以判 | 作者、市场、CI、评审者 | 作者 + 真实用户旅程 | 作者 + 可复现基准 |
| 本项目强制力 | **无法律强制力**；只有“引用时的自洽要求” | 无 | 无 |

**一句话**：`ENTRY` 是“采用基线”，`FLOW` 是“推荐做法”，`BOOST` 是“指导性实践”；三者都不是认证。

**方向不要读反**：GB∕Z 的官方定位是“技术尚在发展中、尚不具备制定国家标准条件”时的指导性文件——它比 GB∕T **更不成熟**，不是“更高级”。所以 `BOOST` 不是第三级“最高级”，而是**变化最快、最不该被当门槛**的一层；把 `BOOST` 叫“高级/进阶”会诱导作者追 rc API。`01` 的 D2 已记录这条，`34` 只是把它写进模型。

---

## 三、两级坐标：采用深度 × 证据状态

只用“ENTRY/FLOW/BOOST”一个轴，会被误读成“等级”。必须同时记录**证据状态**：

| 证据状态 | 含义 | 允许的说法 | 不允许的说法 |
|---|---|---|---|
| `not-run` | 该跑没跑 | “未测” | “通过”“应该能跑” |
| `recognized` / `static` | 静态可识别、可安装 | “静态识别” | “运行时通过” |
| `runtime` | 真实 boot，目标行 ACTIVE | “ENTRY runtime 通过” | “UI 正确”“生产可用” |
| `measured` | 有可复现基准/旅程记录 | “在该 fixture/版本上 measured” | “生产环境省 X%” |
| `blocked` | 宿主 gate/服务缺失，判不了 | “blocked，原因……” | “fail”“pass” |
| `failed` | 真实失败，可复现 | “failed，证据……” | “环境问题” |

**两个轴一起写**，例如：

- `ENTRY=runtime, FLOW=not-run, BOOST=not-measured`
- `ENTRY=static, FLOW=manual(J1-J8), BOOST=measured(LEV-3)`

禁止把两个轴折成一个分数，禁止用 `BOOST` 反推 `ENTRY` 通过。

---

## 四、三层的判定

### 4.1 DSH-ENTRY（采用基线）

**回答**：现有插件几乎不改，能不能被 DSH 识别、安装、至少跑起来。

| 门 | 检查 | 失败归因 |
|---|---|---|
| G0 | `dsh.bundle.patch` 可解析 | 插件（patch 语法/字段） |
| G1 | base + 样本可组合，插入行 name 可解析 | 插件（行结构/文件/exports） |
| G2 | `evaluatePluginCompatibility` 放行，或显式 exemption | 宿主版本/peer 范围 |
| G3 | 真实 `boot()` 后目标行 `ACTIVE` 或 `disabled` | 插件/宿主/夹具 |
| G4 | 有 `dsh.client` 时：`exports["./client"]` + 包根行 | 插件（静态） |
| G5 | 报告带 runtime 版本/commit/产物 mtime | 流程 |

状态：`recognized`（只过静态）→ `runtime`（G0–G3 过）→ `blocked`/`failed`。
**G0–G3 是 runtime 门槛；G4 是 client 静态；G5 是新鲜度/锚。** 只声称 `ENTRY=runtime` 时看 G0–G3；要发布完整 ENTRY 记录时 G4/G5 也要带上。
通过 `ENTRY` 只代表“能装能跑”，不代表安全、UI 正确、生产可用。

### 4.2 DSH-FLOW（推荐采用）

**回答**：装得上之后，用户能不能装得上、配得动、用得顺、卸得净。

八条用户旅程 J1–J8（详见 `32`）：安装/移除、启用/停用、配置、首次成功、权限/披露、升级/回滚/卸载、可观测/诊断、client/server 形态。
每条要有：入口、预期、失败提示、回滚/恢复、证据。
状态：`manual`（人工旅程）/ `runtime`（自动化旅程）/ `not-run`。
不采用 `FLOW` 不构成“不合格”，只说明“未推荐大规模采用”。

### 4.3 DSH-BOOST（指导性实践）

**回答**：有没有用 Cordis 原生能力，把开发和使用做得更省。

八条 LEV（详见 `33`）：可逆、等待、热配置、事件、seam/隔离、前缀/装配、并行/长活、组合/证据卡。
每条证据卡至少记录：环境、输入规模、命令、负向控制、结果、版本锚、限制。
状态：`measured` / `not-measured` / `failed`。
**没有总分、没有排行榜**；`LEV-7 8.24×` 只在该 fixture/版本上成立。

---

## 五、不是等级：与认证 A–D 的关系

`dsh-plugin-certification` 的 A–D 是**质量/证据等级**；本模型的 ENTRY/FLOW/BOOST 是**采用深度**。两者正交：

| 组合 | 含义 |
|---|---|
| 认证 A + ENTRY runtime + FLOW not-run | 质量证据好，但用户旅程没测 |
| 认证 C + ENTRY runtime + FLOW runtime | 认证材料少，但真实旅程跑通 |
| 认证 A + ENTRY blocked | 认证不能替代宿主兼容性；blocked 仍是 blocked |
| 认证 D + BOOST measured | 安全/供应链有问题，BOOST 再好也不能采用 |

因此：

- 不把 `A` 叫“ENTRY 级”，不把 `D` 叫“BOOST 不合格”；
- 认证徽章与三层标签可以并列展示，但必须各自注明 scope；
- 任何“总分 = 认证等级 + 层数”的算法都禁止。

---

## 六、版本、过期与复审

- 每层条款带版本号；引用时必须写 `(层, 版本, dsh 版本, cordis 版本, commit)`。
- 证据默认 **90 天**过期；`ENTRY` 跟随宿主 minor，`FLOW` ≤6 个月，`BOOST` 事件驱动（锚变化/反例）。
- 过期后只能写 `stale`，不能继续引用旧 PASS。
- 单人维护期，规范文本标 `provisional`；至少 2 名维护者复核后才去掉。

---

## 七、采用方式

1. **README 自述**：作者写 `DSH-ENTRY: runtime (dsh 0.2.2-alpha.2, 2026-11-01)`；不要只写“兼容”。
2. **CI**：`level-audit` / checker 产出 JSON；市场只读 JSON，不读 prose。
3. **市场标签**：`dsh-entry:runtime`、`dsh-flow:j1-j8`、`dsh-boost:measured`；标签必须带证据链接。
4. **企业采购**：可以写“只采用 ENTRY=runtime 且 FLOW≥J1–J4 的插件”；不能写“通过国家标准”。

---

## 八、机器可读与自检

- `spec/levels.json`：层、门、证据状态、交叉映射的唯一机器源。
- `40-checker/scripts/level-audit.mjs <plugin-dir>`：
  - 自动跑 ENTRY 静态/运行时（给 `--host` 时）；
  - FLOW 输出人工清单，不伪造 PASS；
  - BOOST 读取 `--boost-evidence`，没有就 `not-measured`；
  - 输出 JSON + 下一步动作。
- 一键示例见 `35-三层开发建议与验收清单.md`。

---

## 九、边界

- 不冒充官方、不做认证、不做安全审计、不做排名。
- 不要求宿主做沙箱；同进程插件可以绕过一切策略。
- 不把 `static` 写成 `runtime`，不把 `not-run` 写成 `pass`，不把 `client-module-loaded` 写成 `UI-rendered`。
- 不把 GB/GB∕T/GB∕Z 写成法律效力；它们只是分层直觉的类比。

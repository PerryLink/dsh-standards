# 32 · DSH-FLOW 顺畅规范（v2）

> **版本**：v2.0.0-rc.1 ｜ **日期**：2026-10-31
> **定位**：三套规范/实践的第二套；回答“装得上之后，用户能不能装得上、配得动、用得顺、卸得净”。
> **依据**：`94-开发建议-顺畅.md`、`87` 的 8 条用户旅程、`81` 的验收缺口。
> **不是**：认证、排名、完整契约审计；未跑=WARN，不冒充 PASS。
> **对外状态**：内部草案；J3/J5/J7/J8 未跑，暂不作为对外规范。
> **当前 runtime**：fixture 上 J1/J2/J4/J6 12 PASS；10 个真实包上 **78 PASS / 4 FAIL / 2 blocked / 66 not-run**（`results/flow/real/`）；J3/J7 有 fixture 级 runtime；J5/J8 有 static preflight；J8 浏览器渲染仍 `not-run`。
> **已知未完成**：J1–J8 的完整 runtime harness 尚未落成；`journey.mjs` 仍有 static-prep。
> **三层模型**：`34`；作者清单：`35`；生命周期：`36`。

---

## 一、定位

- **DSH-ENTRY** 保证“能装、能跑”；
- **DSH-FLOW** 保证“好用”；
- **DSH-BOOST** 保证“用 Cordis 做得更省”。

`DSH-FLOW` 的判据不是“条款写得多”，而是**用户旅程能复现**。

---

## 二、八条最小集

| ID | 要求 | 判定（J） | 为什么是“顺畅” |
|---|---|---|---|
| R1 安装/移除 | 一条命令 add/remove；不手改 profile；不强制 `allowBuilds`；发布预构建 | J1：add → `--dump-config` 出现层 → remove → 层/依赖消失 | 安装是 100% 必经 |
| R2 启用/停用 | 稳定 `id`；危险能力默认关；写清热生效 vs 需重启 | J2：默认→开→关→dump diff | 减少“改了没用”的试错 |
| R3 配置 | schema + 默认值；坏配置 FAILED + 字段路径；volatile 热改 | J3：空配置 boot；非法配置路径；0 restart | 配置是最大摩擦 |
| R4 首次成功 | README 5 分钟 quickstart；错误三要素 | J4：五类故障逐条检查 | 第一次成功决定留存 |
| R5 权限 | capabilities/labels/commitments/disclosure + README Permissions | J5：字段闭集 + README 一致 + 禁用词 0 | 权限不清晰会吓退用户 |
| R6 升级/回滚/卸载 | SemVer/CHANGELOG/engines；卸载 0 残留；回滚 ≤2 命令 | J6：v1→数据→v2→回滚→读数据 | 升级/卸载是长期成本 |
| R7 可观测 | 启动一行 `name@version`；失败/PENDING 可诊断；日志路径 | J7：正常/缺服务/端口占用 | 出问题能自己修 |
| R8 client/server | `dsh.client` 三态；headless/sdk 可用或明确拒绝 | J8：headless/web/关闭 client；console error 0 | 同一插件多种运行形态 |

**R-1..R-12 旧“契约正确性”移到附录**，不再作为顺畅主判据。

---

## 三、J1–J8 判定协议

| J | 输入 | PASS | WARN | FAIL |
|---|---|---|---|---|
| J1 | 临时 `DSH_HOME`、profile、tarball | add→dump→remove 全成功 | 需 `allowBuilds` 但有提示 | 手改 profile / remove 残留 |
| J2 | 默认配置、开关 | 默认可用；开关后 dump 差异正确 | 需重启但已写明 | 开关无效/崩溃 |
| J3 | `{}`、非法值、volatile 字段 | 空配置启动；非法 FAILED 带路径；0 restart | 迁移/未知键行为未写明 | 静默用默认值/崩溃 |
| J4 | README、日志、错误 | 5 分钟内成功；错误三要素 | 有步骤但缺错误处理 | 无 quickstart/无法启动 |
| J5 | manifest、README | 字段闭集、README 一致、禁用词 0 | 字段缺失但 README 说明 | 冒充官方/权限不说明 |
| J6 | 两个版本、数据 | 升级/回滚/卸载全成功 | 需手工迁移但有文档 | 数据丢失/无法回滚 |
| J7 | 正常/缺服务/端口占用 | 三种都有可读诊断 | 只覆盖正常 | 崩溃无日志 |
| J8 | headless/web/client off | 三态可用或明确拒绝 | 一态未测 | 宣称支持但崩溃 |

**未跑=WARN，不冒充 PASS。** 每个 J 记录：命令、环境、结果、日志路径、时间。

---

## 四、证据与文案

### 4.1 README 最小结构

`Quickstart` / `Permissions` / `Config` / `Upgrade & Uninstall` / `Troubleshooting`。

### 4.2 错误三要素

1. 原因（字段/服务/文件/端口）；
2. 下一条命令/链接；
3. 文档锚。

反例：`Error: failed`。  
正例：`缺少 services.llm；先 dsh plugin add @deepseek-ai/dsh-llm，或把 inject 改成可选；见 README#permissions`。

### 4.3 权限文案

- 声明不是门控；安装即运行代码；
- 高风险能力写“能做什么/不能做什么/怎么关”；
- 不写“已认证/官方/安全”。

---

## 五、判定状态

| 状态 | 含义 |
|---|---|
| `flow-pass` | J1–J8 全 PASS，或 WARN 已披露且有替代路径 |
| `flow-warn` | 至少 1 个 WARN，未跑不等于 PASS |
| `flow-fail` | 至少 1 个 FAIL |
| `flow-not-run` | 未跑/环境不足；不是 PASS |

不设“通过率/等级”；不做市场门禁。

---

## 六、开发建议与下一步

- 做法见 `94-开发建议-顺畅.md`。
- 已有 `40-checker/scripts/journey.mjs`：static-prep 检查 J1/J2/J3/J4/J5/J6/J7/J8 的 manifest/README/source/client 证据，runtime 项标 `not-run`。
- 已有 `journey-runtime.mjs`：J1 install/remove + J2 enable/disable + J4 keyless tree-load + J6 upgrade/rollback；J3/J7 有 fixture 级 runtime；J5/J8 有 static preflight；J8 浏览器渲染仍 `not-run`。
- 首条实测：`results/flow/journey-fixture-bundle.json`（旧 J1）与 `journey-fixture-j1-j2-j4-j6.json`（新 12 PASS）。
- 下一步：J3 坏配置、J4 首次启动、J6 升级/回滚、J8 headless/web。
- 在 runtime harness 落地前，报告只能写 `flow-not-run`，不能写 `flow-pass`。

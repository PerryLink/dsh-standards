# 37 · PerryLink 插件生态的三层对照与升级清单

> **版本**：v1.0.0-rc.1 ｜ **日期**：2026-11-01
> **范围**：PerryLink 名下与“插件标准/质量/分发”直接相关的 **12 个元工具仓**；不是 95 个业务插件的逐仓审计。
> **目的**：回答“我已有的这些 DSH 项目，分别能对应哪一层、这轮改了什么、下一轮该改什么”。
> **注意**：这些仓库的 README 可能自称“official-grade”“certified”等；本文件只按三层模型描述**能力**，不替它们做官方/认证背书。

---

## 一、总表

| 仓库 | 角色 | 能支撑的层 | 当前状态（2026-11-01） | 本轮动作 | 下一轮 |
|---|---|---|---|---|---|
| `dsh-plugin-guide` | 作者知识库 + skill + CLI | ENTRY/FLOW/BOOST 教学 | 有 10 章开发指南，但无三层章节 | **已推送 `c86aef3`：`guide/standards.md` + 中文版 + `data/standards.json` + 侧栏/SKILL/§8 路由** | 把 J1–J8、LEV 证据卡做成可复制的模板 |
| `dsh-plugin-certification` | A–E 质量证据 + A–D 等级 | ENTRY（A/E/veto） | 有认证 registry；无层 crosswalk | **已推送 `c280680`：`STANDARDS.md` + `data/standards-crosswalk.json`** | 给 FLOW 增加“用户旅程证据”维度（可选，不混入 A–D） |
| `dsh-plugin-doctor` | R/K/D/CC/X 检查器 | ENTRY（R/K/D/X） | 有成熟检查器；JSON 无层字段 | **已推送 `2d4adb4`：`lib/standards.mjs` + JSON `standards` 字段 + `STANDARDS.md` + 18 项测试** | 把 `level-audit` 的 FLOW/BOOST 证据文件接进 `--standards` 视图 |
| `dsh-plugin-portal` | 生态门户 | 展示 | 只显示 star/rating，无层标签 | **已推送 `dfa2586`：README 增加三层入口与公开教学副本链接** | 读 `levels` 字段显示 ENTRY/FLOW/BOOST 徽章；无证据显示 `not-run`（CI 仍有 5 条 pre-existing 数据漂移） |
| `dsh-catalog` | Desktop Market 目录 | 展示/收录 | 有 curated 条目，无层字段 | **已推送 `aef7bb9`：README 增加三层入口** | 收录时要求 `level-labels`，缺证据不显示 PASS |
| `dsh-plugin-kit` | 共享 peer 范围 + 骨架 | ENTRY | 有 skeleton/peer-range；无层元数据 | 未改（本轮） | 骨架写入 `dsh.standards` 模板；peer-range 跟随 0.2.x |
| `dsh-checkers` | 53 个 checker 的一键 bundle | ENTRY static | 有 53 项检查；无 runtime G0–G3 | 未改（本轮） | 把 ENTRY static 与 `level-audit` 串联；runtime 另跑 |
| `dsh-score` | 多维度评分 | 质量（正交） | 消费 test-drive；无层字段 | 未改（本轮） | 明确“score 不是 level”；输出层证据链接而不算分 |
| `dsh-test-drive` | 隔离安装/冒烟 | ENTRY（安装/加载） | 成熟；可提供 E 证据 | 未改（本轮） | 记录 `levels.entry` 证据，供 doctor/certification 消费 |
| `dsh-policy-ledger` | 安装诊断 | ENTRY（安装） | 有 tarball/安装日志诊断 | 未改（本轮） | 把安装失败映射到 G0/G2/G3 归因 |
| `dsh-cert-mcp` | 认证 registry MCP | 认证（正交） | 只读 MCP | 未改（本轮） | 增加 `get_levels` 只读工具（不改变认证结论） |
| `dsh-eval-pack` | eval lint/grader | 不属于三层 | 独立评测 | 未改（本轮） | 只作为 BOOST 证据卡的输入之一，不贴层标签 |

---

## 二、这轮真正改了什么

### 2.1 `dsh-plugin-guide`（c86aef3）

- 新增 `guide/standards.md`（EN）与 `guide/standards.zh-CN.md`（ZH）：三层定义、GB 类比、两轴、升级路径、评审清单。
- 新增 `data/standards.json`：层→章节/命令的机器映射。
- `_sidebar.md`、`SKILL.md`、`guide/plugin-dev-guide.md` §8、`README.md` 增加路由（不新增 README `##` 标题，避免五语 README 同步门禁失败）。
- 定位：**教学层**，不判定、不发证。

### 2.2 `dsh-plugin-certification`（c280680）

- 新增 `STANDARDS.md`：A–E 维度 → ENTRY 的“必要不充分”映射；FLOW/BOOST 明确 `not-covered`。
- 新增 `data/standards-crosswalk.json`：机器可读。
- 明确：**A–D 是质量等级，不是 ENTRY/FLOW/BOOST**；认证 A 不能替代 G0–G5。
- 未改 registry / badges / freshness gate。

### 2.3 `dsh-plugin-doctor`（2d4adb4）

- 新增 `lib/standards.mjs`：纯函数 `deriveStandards(results, groups)`。
- `doctor.mjs` JSON envelope 新增 `standards` 字段；**不改** stdout 文本、退出码、verdict、`--format check`。
- ENTRY 规则：R/K/D 有 fail/error → `failed`；D 真跑且无 fail/error → `runtime`；D 跳过 → `static`；全 skip → `not-run`；skip 绝不算 pass。
- FLOW=`manual`（doctor 不跑 J1–J8）；BOOST=`not-measured`（doctor 不做基准）。
- 新增 `tests/standards.mjs`，并接入 `npm test`；新增 `STANDARDS.md`、`data/standards.json`。

---

## 三、互促关系

```
guide 教作者怎么写
  → kit 生成带 level 模板的骨架
  → doctor R/K/D 给出 ENTRY 证据
  → certification A–E 给出质量等级（正交）
  → test-drive / policy-ledger 提供安装证据
  → standards level-audit 汇总 ENTRY/FLOW/BOOST + 下一步
  → catalog/portal 展示层标签 + 证据链接
  → upgrade 跟随宿主；退役判据退出
```

**关键边界**：

- `guide` 不能把“读过指南”当 `ENTRY`；
- `doctor` 的 R/K/D 不能替代真实 G0–G3；
- `certification` 的 A 不能替代 `ENTRY=runtime`；
- `score` 不能给插件贴层；
- `portal/catalog` 只能展示证据，不能自己判定。

---

## 四、下一轮优先级

1. **portal/catalog 层标签**：读 `publish/level-labels` 或 `data/levels.json`，缺证据显示 `not-run`；这是“让作者有展示位”的最低成本。
2. **kit 骨架带 `dsh.standards`**：新插件从第一天就有层声明占位，不伪造结果。
3. **doctor `--standards` 视图**：把 `level-audit` 的 FLOW/BOOST 证据文件接入，不改变默认输出。
4. **test-drive 输出 `levels.entry`**：让 certification E 与 standards ENTRY 共用一份安装证据。
5. **upgrade 0.2.x 走廊**：当前只有 0.1.3→0.1.6 走廊，0.2 世代没有迁移卡。

---

## 五、口径

- 这些仓库的“official-grade”“certified”等历史措辞，是各自 README 的自我描述；本文件不将其视为官方/认证。
- 三层标签必须带 scope（dsh/cordis 版本、commit、日期）和证据链接；没有证据就是 `not-run` / `not-measured`。
- 任何“把 A–D 等级换算成 ENTRY/FLOW/BOOST”的算法都不在本项目内。

---

## 六、推送后的验证（2026-11-01）

| 仓库 | 提交 | CI/验证 |
|---|---|---|
| `dsh-plugin-guide` | `c86aef3` | `plugin-doctor`、`verify-kit`、Scorecard、Pages 四组 workflow **全部 success**；本地 `check-readme-sync` / `check-readme-parity` / `check-facts` 通过 |
| `dsh-plugin-certification` | `c280680` + `7f9946a` + 计数同步 | 已修 `checks.yml` 的 sibling 分支（master→main）并同步 roster 98/87/8/3；`check-freshness` 只剩 **2 条 pre-existing freshness**（registry 2026-09-07 未刷新），markers/mirror 已 ok。远端 `Checks` 失败只归因于这两条 stale 数据 |
| `dsh-plugin-doctor` | `16051df` | 远端 `ci`、`plugin-doctor`、Scorecard **success**；`npm test` 全绿，其中 `standards: 21/21`、contract 58/58、compat 25/25；JSON `standards` 字段已实测 |

| `dsh-plugin-portal` | `dfa2586` | README 增加三层入口；CI 仍有 5 条 **pre-existing** 数据漂移（缺 53 条 blurb、7 个 group label、roster 与 kit 不同步） |
| `dsh-catalog` | `aef7bb9` | README 增加三层入口；`ci` success |

**未改**：`data/certified.json`、badges、任何等级；没有新增认证条目；没有给任何仓库贴“官方/认证”标签。

**仍需注意**：`dsh-standards` 本身仍是私有仓。三份公开文档已改为“私有草案 + 公开教学副本”的写法，避免公开 404；是否把标准仓转 public 需要维护者决定。

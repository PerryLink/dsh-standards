# DSH 三标准全量测试与研究计划 — 2026-11-02

> 执行位置：`session-fa812851-0a68-4147-ad5a-f9fcb14c623b` 的全新环境。当前会话不直接访问那个运行时；本文是可执行协议、数据口径和沟通稿。  
> 定位：**测量研究 + 小范围修复实验**，不是“修完所有下载项目”，也不是“给市场打分”。

## 0. 先修正三个预期

1. **2–4 周只能做 pilot，不是“全量”。** 10–15 个深测项目约 30–60h；30 个项目约 60–200h；一个人 10h/周，pilot 2–4 周、完整 30 项目 8–12 周。**先做 10–15 个 pilot，再决定是否扩到 30。**
2. **不能拿我们的 C1–C8 判市场对错。** 各市场口径不同，只做差异表；市场规则是它自己领域的权威。
3. **工具 pass ≠ 标准 pass ≠ 市场接受。** `guide`/`doctor`/`entry-validate` 都是静态；C3 没有真实宿主安装就只能是 `not-run`。

## 1. 研究设计

### 1.1 先冻结，再测试

- 冻结当前 C1–C8、FLOW J1–J8、BOOST B1–B8 版本；测试期间**不因单个项目失败而改规则**。
- 预注册假设（见 §1.3）；留 **30% hold-out**，hold-out 不参与调参。
- 工具 pin 版本；记录 commit/版本。

### 1.2 样本

- 30 个项目以内：10 个高星/已收录、10 个中低星/长尾、10 个 archived/monorepo/no-bundle/旧版。
- 至少 10 个“低星/archived/monorepo”；至少 3 个非 owner 插件。
- 来源：下载目录 + awesome/hub/radar/市场清单；记录来源，避免只选“已经能装”的。
- 许可证/隐私：只改本地一次性副本；不 push/PR/公开 diff，除非作者书面邀请；AGPL/NC-SA 不混；不跑 install script、不读凭据。

### 1.3 预注册假设

- H0：市场对比显示 **C1/C2 是共性硬要求；C3 可能是自造门槛；C4/C5 是市场/宿主特定；C6 的 license 不是所有市场共性；C8 只约束我们的 label**。这些是待证伪假设，不先改代码。
- H1：C2（bundle/patch）是安装成功的最强预测；C3（host install）可能属于 FLOW，而不是 ENTRY 的硬门槛。
- H2：C3 在静态通过的项目上仍能发现安装失败；C3 必须真跑。
- H3：C4 缺失（无 `engines.dsh`/peer）不预测失败；保持 warning。
- H4：C5/C6 的构建产物未提交不预测失败；声明存在即可，构建由 pack/build 验证。
- H5：C6 缺 `license` 预测市场拒绝（awesome/hub/skillhub）。
- H6：BOOST B1–B6 与更少运行时错误/残留相关；B8 性能噪声大，只做 environment-scoped。
- H7：市场特有规则（TUI approved contributors、skillhub CLA/SKILL.md、dsh-web docs、dsh-market build-script/engines）应进 profile，不进 ENTRY。
- H9：如果 C3/C4/C5/C6 的某些要求只在一部分市场存在，它们应变成 warning、`not-applicable` 或对应 profile，而不是 ENTRY fail。
- H8：任何 ENTRY 条款若拒绝市场已接受的插件，且市场规则不要求它，就是 false positive，必须先修。

### 1.4 基线

对每个项目记录：

- 静态：`entry-validate --meta`、`entry-scan`、`dsh-primer`/`dsh-clinic`（scoped 精确版本）、hyzyn check-package-contents/check-dsh-peers、相关市场检查；doctor 的 skip/degraded 不记 pass。
- 宿主：临时 `DSH_HOME` + 临时 profile；安装 → 启动 → 命令 → 禁用 → 卸载；记录文件/进程/端口/storage 残留。
- FLOW：J1–J8 中适用的 journey；不适用记 `not-applicable`。
- BOOST：B1–B6 fixture；B8 只对子集、固定环境、20 次 p50/p95。
- 市场：awesome/dsh-market/hub/radar/TUI/skillhub 的实际规则；形成差异表，不评分。

### 1.4b Pilot 结果（2026-11-02）

- 30 个第三方样本：C3 15 跑，14 pass / 0 fail / 1 blocked；C3 无区分度。
- C3 已降为 FLOW-only；entry re-run：2 pass / 19 pass-with-warnings / 1 incomplete / 8 fail。
- 8 fail 仍是 C1/C2/C6 静态问题；不是 C3。

## 1.5 修复实验

- 只做最小、可逆、不改行为的修改：补 `dsh.bundle.patch`、`engines.dsh`、`./client` export、license/description、dispose。
- 每次修改只动一个变量；before/after 用同一环境、同一命令。
- 本地副本；不改第三方仓库；不把“本地修好”说成“已修复/已合并”。
- 失败就记 `failed`/`blocked`，不为了 pass 改标准。

### 1.6 评估

- 混淆矩阵：标准 pass/fail × 宿主 install pass/fail；分别报 FP/FN 分母。
- 每条条款的贡献：去掉它，FP/FN 如何变；不只看总通过率。
- 市场差异表：每家查什么/不查什么/证据等级/谁负责；不排名、不打分。
- 性能：只报 raw p50/p95/min/max + 环境；波动 >20% 标 `not-run`。

### 1.7 交付物

`inventory.json`、`hypotheses.md`、`baseline.jsonl`、`host-install.jsonl`、`market-matrix.md`、`repair-report.md`、`performance.jsonl`、`aggregate-report.md`、`comms-kit.md`。

## 2. 参考项目怎么用

### 2.1 `omdsh-dev/plugin-template`

- `docs/dsh-plugin-contracts.md`：manifest/engines/bundle patch（**一个路径或有序列表**）、client export、locale/icon、lifecycle、compose、evidence、build。
- `tests/harness.ts` + `tests/plugin.test.ts`：真实 Cordis `Context` + `Loader` mount、export shape、schema default、dispose。
- `.agents/skills/`：plan/scaffold/align/implement/client/i18n/compose/test/release；可作为我们的 author kit。
- 直接修正：C2 必须接受 patch **array**；C4 优先 `engines.dsh`（有它时 peer 被忽略）；C5 要求 `./client` export；C6 检查 entry 声明与 metadata，不要求构建产物已提交。

### 2.2 `morlay/dsh-plugin` devpackages

- `tsdown-plugin-cordis`：client/host 打包、package exports 推导、CSS、dts、patch 渲染。
- `devkit`：tsdown 预设、bundle patch、dts、client 规则。
- `dshdev`：`web`/`desktop`/`desktop bundle`/`check-deps`，可做 host smoke。
- 用途：C5/C6 的构建面、B8 的 bundle/启动测量、C3 的宿主 smoke；不要直接复制其私有工具链。

### 2.3 工具命名与版本（重要）

- `dsh-plugin-guide` 已迁 `dsh-primer`，`dsh-plugin-doctor` 已迁 `dsh-clinic`；用 scoped 精确版本，**不要 npx 裸名**（裸名是另一个项目）。记录工具版本/SPEC/DSH 版本。
- `dsh-clinic`（doctor）：SPEC v1 是 R0–R8 + K1–K14 + D0–D3/D9 + CC1–CC5/3；工具分组另含 X（X1–X5 宿主契约），**X 不是 SPEC v1 检查项**。五态 + `skip`，`exit 6` = degraded；**skip/degraded 不是 pass**；R2/R4 依赖 built；D 依赖 network/pnpm，只证明 sandbox，不等于真宿主安装；doctor PASS 不等于 C1–C8 全过/认证/安全。
- 建议命令：`--repo <dir> --no-smoke --only R,K --json`；需要宿主兼容时 `--only R,K,X --dsh-install <dsh>`（X 用宿主 `evaluatePluginCompatibility`）；D 只在临时目录/网络允许时跑，不把 D PASS 当 C3。

### 2.4 其他

`bugmaker2/dsh-plugin-template`（旧 Node/DSH、`dsh.plugin.json` 不是宿主 manifest）、`hyzyn/dsh-plugin-kit`（live-host-smoke、check-package-contents、check-dsh-peers）、`kun2-5code/dsh-plugin-template`（六形态/14 UI/volatile）、`DEVbyQIN/dsh-plugin-kit`（scaffolder/validator）；`dsh-tauri`、`dsh-web`、`dsh-TUI`、`DSH-better-sidebar`、`dsh-market` 的 tests/scripts 可做 C3/C5/C6/FLOW；`dshbase`/`dsh-plugin.market`/`dshfind` 作为标签/评分对照。

**借 8：** omdsh contracts；omdsh harness.ts；morlay `cordis-client.ts`；morlay `package-exports` 的 engines 推导；hyzyn `live-host-smoke.mjs`；hyzyn `check-package-contents.mjs`；hyzyn `check-dsh-peers.mjs`；doctor SPEC + R/K。
**不借 3：** bugmaker2 的旧 `dsh.plugin.json`/Node22/DSH0.1；morlay 整套 `@local` dts/typert/devkit（太重，只借 client/export）；doctor 的 D/PASS 当标准通过（网络/pnpm、非确定、skip≠pass、degraded exit 6、非认证）。

## 3. 三标准要验证什么

| 条款 | 当前 | 测试后可能调整 |
| --- | --- | --- |
| C1 public/topic | 通过 | 保留硬门槛 |
| C2 bundle/patch | 字符串/数组 | 保留硬门槛；必须检查所有 patch 文件 |
| C3 compose/install | **已降为 FLOW-only** | 2026-11-02 pilot：15 个 host install，14 pass / 0 fail / 1 blocked；C3 无区分度；J1 成为 FLOW 必跑 |
| C4 engines/peer | 缺失 warning | **待验证是否降为 host profile**：dsh-market/TUI/web 要，awesome/0xsline/handbook 不要求 |
| C5 client export | 构建产物缺失 warning | **待验证是否只做 host profile**：只有 web/TUI/sidebar 有意义 |
| C6 metadata/entry | **license → A7 advisory** | 2026-11-02：license 是 legal/market profile；description/entry 仍是硬门槛；re-run 7 fail（之前 8） |
| C7 version/commit | 通过 | 保持 version；commit/freshness 只 warning |
| C8 no grade/rank | 通过 | **只约束我们的 label**；不能要求市场去掉自己的 score/Verified/等级 |
| FLOW J1–J8 | 未全跑 | 先在 10 个项目上跑适用 journey；市场特有要求进 profile |
| BOOST B1–B6 | fixture 级 | 用真实 Cordis harness + dispose；B8 只子集、环境限定 |

## 4. 市场差异表（模板）

| 条款 | awesome | dsh-market | hub | dsh-web | TUI | sidebar | radar | skillhub |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bundle/patch | 要 | 要 | passport | patch | dsh-std | host | 四态 | SKILL.md |
| engines/peer | 无 | 要 | passport | 无 | dsh-std | host | 无 | 无 |
| client export | 视插件 | 视插件 | 无 | 要 | 无 | 无 | 无 | 无 |
| license/metadata | 要 | 要 | 要 | 要 | 要 | 要 | 部分 | 要 |
| host install | 不查 | 部分 | scanner | 部分 | tests | tests | 四态 | review |
| 结论 | 收录权威 | UX 权威 | 证据锚 | 宿主 | 宿主 | 宿主 | 运行验证 | 企业治理 |

**市场对比结果（公开文档，2026-11-02）：** C1/C2 是 AW/MK/HUB/WEB/TUI/SID 的共性硬要求；C3 是自造门槛（市场要 install/verified，不要求作者交 compose）；C4/C5 是市场/宿主特定；C6 的 license 不是所有市场共性；C7 commit/freshness 是市场侧信号；C8 是我们的 label policy，不能要求市场去掉自己的 score/Verified/等级。结论只做“差异/重叠/谁负责”，不做“谁更合理”；市场规则是各自领域的权威。

## 5. 沟通稿（测试结果出来后）

### 5.1 市场维护者（微信，<=150 字）

> X 你好，我们跑了 10 个公开插件的 entry 检查，发现你们的规则和我们的 C1–C8 有 3 处差异；我做了一页映射，可能帮作者少踩坑、减少你们 review。你们的规则是权威；你们不要求的 C3–C8 项会标 warning/not-applicable/profile，不新增门槛。15 分钟听你挑错？不要求改规则、不 ranking。

邮件主题：关于 entry 检查的 3 处差异，想请你挑错。正文同义，附一页映射；不公开点名、不排名。

### 5.2 官方（<=200 字）

> 你好，我们是一群社区维护者，做了一份 DSH 插件 entry 检查的社区测试报告（非官方、不排名、不认证、不使用官方 logo）。想同步一页摘要，并请教命名/品牌展示有没有约束；不要求审批、不要求背书。官方不回复我们也继续，只按社区项目做；如措辞/品牌不妥，请指出，我们改。

### 5.3 分对象 ask

- awesome / dsh-market：只读 sidecar + 10 条 third-party entry，2 周 pilot；不改 schema、不上卡片、不 ranking。
- dsh-desktop：Fabric RFC 0004 docs-only crosswalk；不碰 runtime/contract。
- dsh-web：docs 一页 evidence 说明；不改代码。
- dsh-TUI / dsh-go：3–5 条 host 兼容数据；同一人只联系一次；不发实现 PR、不替代 dsh-std。
- DSH-better-sidebar：扩展兼容 data/样例；不改 API、不叫 reference implementation。
- radar：四态→evidence crosswalk；不改 verdict、不要求开源引擎。
- 0xsline / handbook：L1 Related 一行 / 10–15 行原创小节；不做逐条字段。
- skillhub：只对 skillhub-dsh 做私有 pilot，declared-only；不公开、不 official。

## 6. 数据纪律与禁区

- 只公开聚合/匿名；n<5 不拆；不公开失败插件名、host 日志路径、私聊。
- 所有数字标日期/样本/方法；无独立 reviewer 前不写 `verified`。
- 不排名、不认证、不 official、不点名差评、不用“XX 已接受”压人；不要求改 schema/UX。
- 第三方代码只本地副本；PR/公开 diff 需作者书面邀请；拒绝就移除样本和名字。
- 官方/群先知情后发帖；任何人说停/移除，立即照做。

## 7. 2–4 周 pilot，8–12 周全量

**Pilot（2–4 周）：** 10–15 个深测项目，先跑 C1/C2/C6 + C3 host install + 1 个市场差异表；不做全量修复、不做性能排名。

**Full（8–12 周）：** 30 个项目、hold-out、性能子集、2–3 个伙伴 review。

| 周 | 动作 | Gate |
| --- | --- | --- |
| 0–1 | 冻结 checklist；预注册 10 项目；golden set + 负向 control；host harness（hyzyn live-host-smoke 或 dsh-clinic D + 真 host） | 工具在 golden set 上 FP/FN ≤10%；C3 可跑；skip/degraded 不当 pass |
| 2–3 | 30 项目静态 baseline；10–15 个 host install；市场差异表 | 至少 10 个 C3 有结果；至少 2 家市场规则映射 |
| 4–5 | 10–15 个本地修复实验；before/after；performance 子集 | 0 第三方公开改动；每个修改只动一个变量 |
| 6–7 | BOOST B1–B6；hold-out 验证；写 aggregate | hold-out 不调参；性能波动 >20% 标 not-run |
| 8–10 | 2–3 个伙伴私下预览；根据反馈修标准；公开匿名 aggregate | 2 家愿意 review；0 点名/排名；官方知情 |
| 11–12 | 决定下一轮：council/更多市场/BOOST B8 | 2 家公开采用前不叫 consensus/standard |

## 8. 风险与 go/no-go

- 样本偏差/过拟合 → 预注册、分层、30% hold-out、冻结规则。
- 工具偏差 → golden set、负向 control、FP/FN 分开报；工具 bug 修工具，不修第三方。
- 第三方/许可 → 本地副本、匿名、书面许可；AGPL/NC-SA 不混。
- 性能噪声 → 固定环境、n≥20、raw data、波动 >20% not-run。
- 市场对比 → 差异表，不打分；市场规则权威。
- 沟通 → 先私聊预览、opt-in、不公开失败名单；官方/群先知情。
- 单人时间 → 8–12 周 pilot；不做“全量修所有项目”。

**Go/No-go：**
1. golden set FP/FN ≤10%，否则先修工具；
2. 至少 10 个 host install 有结果，否则不叫“全量”；
2b. C3/C4/C5/C6 是否降为 FLOW/profile 必须有数据；不要先改代码再找证据；
3. 第三方具名/PR 有书面许可，否则只本地匿名；
4. 性能固定环境 n≥20，否则 B8 not-run；
5. 2 家市场愿意私下 review，否则只发匿名方法/聚合。

## 9. 现在先做 3 件

1. **冻结 + 预注册**：10 个项目、假设、hold-out；不先改规则。
2. **C3 host harness**：临时 `DSH_HOME`/profile，安装→启动→禁用→卸载；先在 10 个项目上跑；同时记录 C3 是否只是 FLOW。
3. **一张市场差异表 + 一个伙伴预览**：优先 awesome 或 dsh-market；只私下给，不公开；用“你们的规则是权威”开场。

## 10. 来源

- `omdsh-dev/plugin-template`（README、docs/dsh-plugin-contracts.md、tests/harness.ts、tests/plugin.test.ts）
- `morlay/dsh-plugin`（devpackages/tsdown-plugin-cordis、devkit、dshdev、dts-prepare）
- `hyzyn/dsh-plugin-kit`（live-host-smoke、check-package-contents、check-dsh-peers）、`dsh-tauri`/`dsh-web`/`dsh-TUI`/`DSH-better-sidebar` 的 tests/scripts
- `PerryLink/dsh-primer`（guide）与 `dsh-clinic`（doctor）SPEC；各市场 README/CONTRIBUTING/CI；dshfind/dshbase/dsh-plugin.market 的标签/数据
- 本仓库：`adoption/entry/real-scan-2026-11-02.json`、`reviews/2026-11-02-p0-self-review.md`

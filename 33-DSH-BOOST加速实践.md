# 33 · DSH-BOOST 加速实践（v2）

> **版本**：v2.0.0-rc.1 ｜ **日期**：2026-10-31
> **定位**：三套规范/实践的第三套；回答“有没有用 Cordis 原生能力，把开发和使用做到多快好省”。
> **形态**：**实践库，不是插件等级**；登记的是做法+证据，不给插件贴“最高级”。
> **对外状态**：内部草案；LEV-3（loader-level）、LEV-6（provider-capture）、LEV-7（合成 timer）已有可复现 measured；**都不是生产基准**，暂不作为对外规范。
> **依据**：`91-增效实践内核研究.md`（REPO `ce7073d` 源码）、`95-开发建议-加速.md`。
> **版本警告**：旧 Linux checkout `22dde3` 是旧内核；`G-10 provide-last` 的旧结论只对旧内核成立，不能直接引用。
> **三层模型**：`34`；作者清单：`35`；生命周期：`36`。

---

## 一、定位

- `DSH-ENTRY` 保证“能装、能跑”；
- `DSH-FLOW` 保证“好用”；
- `DSH-BOOST` 保证“用 Cordis 做得更省”。

**不是第三个徽章**：一条 LEV 只说明“这个做法在给定锚点下有证据”，不代表插件整体“高级”。

---

## 二、八条 LEV

| ID | 要求 | 证据指标 |
|---|---|---|
| LEV-1 可逆 | 定时器/连接/watcher/子进程进 `ctx.effect()` + label；无模块级持有 | restart N 次 `getEffects()` 回基线；reload 100 次泄漏 0 |
| LEV-2 等待 | 必需 `inject`；等待 `ctx.inject()`；可选才 `ctx.get()`；禁轮询 | 缺服务 0 TypeError/PENDING 可枚举；恢复后 1 epoch ACTIVE |
| LEV-3 热配置 | 可调字段 `volatile()` + `.get()`；HMR 只当代码热更 | 配置变更 restart 0；级联重启 0；effect 增量 0 |
| LEV-4 事件 | 事件名/`@mode` 一致；waterfall 观察者 `next()`；等待用 serial/bail/parallel，纯观察用 emit；通知型容错 | mode 不一致 0；监听器故障隔离 1/1；短路分支测试 |
| LEV-5 seam/隔离 | 只经 seam；不 import 实现；多实例才 isolate/group；per-agent `agent.ctx` | consumer 改动 0；两 realm 2/2；`leakedServices 0` |
| LEV-6 前缀/装配 | 工具/提示声明逐字节稳定；易变信息走 `systemPrompt.context`；复用 assembly | prefix 命中/token；两次 boot schema diff 0 |
| LEV-7 并行/长活 | 独立调用并行有界；长活走 jobs；模型面有序；取消贯穿 | `T≈max(T_i)`；kill 后 100% 停止；step 阻塞 0 |
| LEV-8 组合/证据卡 | bundle patch/preset 表达差异；每条实践附证据卡 | 新增层 1；单行启停不影响其他；`leaked 0`；证据卡可复跑 |

**LEV-6 优先**：它是唯一能用 token 直接计价、且与 Cordis 强绑定的实践。

### 2.1 2026-11-01 实测（八组）

| 实践 | 证据等级 | 结果 | 原始数据 |
|---|---|---|---|
| LEV-3 | **loader-level**：真实 Cordis `Context`+`Loader`+`Include`，合成 fixture | volatile 字段 0/20 remount、0/20 restart、effect dispose 0/20；control 普通字段 20/20 remount。两个宿主（0.2.1-rc.5 / 0.2.2-alpha.2）同向 | `40-checker/results/lev3/lev3.json` |
| LEV-6 | **provider-capture**：真实 DSH 请求，合成 Anthropic Messages 端点，不是计费 | 稳定 prefix arm 的 promptOrder 复用 **100.00%**；易变 nonce arm **0.00%**，首个分歧在 system 第 0 字节 | `40-checker/results/lev6/lev6.json` + `capture.jsonl` |
| LEV-7 | **synthetic timer**：64 tasks × 5 runs | median **8.24×**；不是生产基线 | `examples/boost/results/lev7.json` |
| LEV-1/2/4/5/8 | **loader/context-level**：真实 Cordis loader + 合成 fixture | LEV-1 effect 5/5 回收、裸 timer 泄漏 +5；LEV-2 PENDING→ACTIVE；LEV-4 next/veto/emit/serial/bail/parallel 实测；LEV-5 两 realm 隔离 0 串扰；LEV-8 组合只改目标行 | `40-checker/results/boost/lev12458.json` |

八条都带负向对照，能证伪；但都不能写成“生产环境省 X%”或“真实 cache 命中率”。

---

## 三、G-10 的边界

- REPO `ce7073d` 新内核：`fiber._unload` 先等 `dependents` 释放，再撤 provider；consumer cleanup 调服务有保证。
- 旧 Linux checkout `22dde3` 没有这层；旧“provide 最后 yield 是 P0”只对旧内核成立。
- 仍需注意：**同 fiber 内 `ctx.get()` 的 cleanup**，`provide` disposer 会先同步删 store；走 `ctx.<service>` proxy 反而还能读到。
- **结论**：G-10 只作配方，不作无条件 PASS/FAIL；建议上游加 effect teardown rank，但不要把 `Promise.all` 改串行。

---

## 四、证据卡

每条实践一张卡：

```yaml
practice: LEV-6
plugin: "@acme/dsh-hello@0.1.0"
baseline:
  loc: 420
  startupMs: 180
  reloadMs: 900
  tokensPerTurn: 1200
after:
  loc: 380
  startupMs: 150
  reloadMs: 600
  tokensPerTurn: 900
environment:
  dsh: 0.2.2-alpha.3
  cordis: 4.0.6-alpha.2
  node: 24.9
command: "node bench/hello.mjs"
result: "startup -17%, reload -33%, tokens -25%"
caveats: "单机单次，非性能基线"
```

**不能量化**：开发人时、维护成本、“少踩坑”、LOC 节省（合成示例不算证据）→ WARN/主观登记，不冒充 PASS。

---

## 五、判定状态

| 状态 | 含义 |
|---|---|
| `boost-evidenced` | 至少 1 条 LEV 有可复跑证据卡，锚点完整 |
| `boost-warn` | 有做法但指标不可测/样本不足 |
| `boost-fail` | 声称的收益与证据矛盾 |
| `boost-not-run` | 未测；不是 PASS |

不设“通过线/等级/市场门禁”。

---

## 六、开发建议与下一步

- 做法见 `95-开发建议-加速.md`。
- 参考实现目录：`examples/boost/`；LEV-3 有 `lev3-loader-bench.mjs` + fixture + test；LEV-6 有 `lev6-capture-server.mjs` + `lev6-analyze.mjs` + capture；LEV-7 有 `lev7-bounded-batch.mjs` + test；LEV-5 仍为片段。
- 先做 3 个参考实现：
  1. volatile 热配置（LEV-3）；
  2. bounded batch + jobs（LEV-7）；
  3. seam 替换（LEV-5）。
- LEV-6 的下一步不是再补一次 capture，而是接真实 provider usage（`cacheReadTokens`）或真实 key；当前只有 synthetic capture，不能报价。
- 所有基准必须记录：环境、输入规模、命令、负向控制、结果；单次实测只作语义证明，不作性能基线。

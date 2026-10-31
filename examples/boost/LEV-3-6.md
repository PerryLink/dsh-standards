# LEV-3 / LEV-6 状态

> 2026-11-01：两项都已从 `not-measured` 升级为**有原始数据的 measured**。但两者的证据等级不同：
> LEV-3 是 **loader-level**（真实 Cordis Loader，合成 fixture）；LEV-6 是 **provider-capture**
> （真实 DSH 装配出的请求，合成模型服务，不是真实计费）。都不能写成生产环境的 `boost-evidenced`。

## LEV-3 volatile 免重挂

- 实现：`examples/boost/lev3-loader-bench.mjs`；fixture：`examples/boost/lev3-fixture/`。
- 方法：真实 `Context` + `Loader` + `Include`，两行 YAML（probe service + fixture plugin）；
  改 `greeting`（volatile）或 `mode`（普通字段），调用 `Include.refresh()` 并 `await loader.await()`。
- 原始数据：`40-checker/results/lev3/lev3.json`；说明：`40-checker/results/lev3/REPORT.md`。
- 结果（两个宿主，各 20 次 + 2 次 warmup）：

| 宿主 | volatile `greeting` | control `mode` |
|---|---|---|
| DSH 0.2.1-rc.5 / Cordis 4.0.5 | remount 0/20, restart 0/20, effect dispose 0/20, config update 20/20, reload p50 0.668ms / p95 0.863ms | remount 20/20, restart 20/20, effect dispose 20/20, reload p50 0.775ms |
| DSH 0.2.2-alpha.2 / Cordis 4.0.6-alpha.1 | remount 0/20, restart 0/20, effect dispose 0/20, config update 20/20, reload p50 0.682ms / p95 0.793ms | remount 20/20, restart 20/20, effect dispose 20/20, reload p50 0.738ms |

- 可证伪：volatile 0/20 vs control 20/20；两臂可区分。
- 限制：loader-level，没有 DSH CLI/profile；触发是 `Include.refresh()`（`dsh-hmr` 的同一条调用），
  不是 chokidar 防抖；单机单轮；亚毫秒延迟有噪声；不同宿主 bootMs 不可比。

## LEV-6 前缀/装配

- 实现：`examples/boost/lev6-capture-server.mjs` + `examples/boost/lev6-analyze.mjs`；
  叠加层：`examples/boost/lev6-arm.patch.yml`。
- 方法：真实 `dsh --profile headless` 对本地合成的 Anthropic Messages 端点发请求；每个 arm 两次
  fresh session。Arm A 的 persona prefix 固定；Arm B 在 system prompt 最前面加一个 per-run nonce。
- 原始数据：`40-checker/results/lev6/capture.jsonl`；汇总：`40-checker/results/lev6/lev6.json`；
  说明：`40-checker/results/lev6/REPORT.md`。
- 结果（4 个请求，每 arm 2 个）：

| arm | promptOrder 复用 | wire 复用 | 首个分歧 |
|---|---|---|---|
| A（稳定 prefix） | **100.00%**（25785/25785 bytes） | 40.99%（26059 bytes） | `dsh_session_log` 字段 |
| B（易变 nonce 开头） | **0.00%** | 6.44%（4098 bytes） | system 字段第 0 字节 |

- 可证伪：A/B 的 promptOrder 复用差 100pp；nonce 一变，prefix 从第 0 字节就断。
- 独立复跑 R1（`40-checker/results/lev6/replication-r1.json`）：A 25789/25789、26063 bytes；B 4102 bytes、prompt 0；结论相同，绝对字节随 workspace 路径长度有 ±14B 漂移。
- 限制：合成模型，不是真实 provider；没有 `cacheReadTokens`/账单；`promptOrder` 是
  documented canonicalization，不是第二次 capture；token 用 DSH 的 4 chars/token 估算，
  不含 per-block overhead。**不得写成“省 X% 钱”或“真实 cache 命中率”**。

## 结论

- BOOST 现在有 **LEV-3（loader-level）**、**LEV-6（provider-capture）**、**LEV-7（合成 timer，8.24×）**
  三组可复现数据。
- 仍然没有生产 profile / 真实 provider 的端到端基准；`boost-evidenced` 只适用于
  “在这组 fixture 与版本上成立”，不是对外保证。

# LEV-3 / LEV-6 状态

## LEV-3 volatile 免重挂

- 需要的不是纯函数，而是真实 Loader/DSH profile：改 volatile 字段、观察
  `internal/update` 是否触发、restart 次数、effect 增量。
- 当前没有稳定的 host farm；`bundle-smoke` 的 base boot 已超时，不能拿它
  做 LEV-3 基准。
- 状态：`not-measured`。不写“0 restart”或“p50”。

## LEV-6 前缀/装配

- 需要真实 provider usage（`cacheReadTokens`/`inputTokens`/`cacheWriteTokens`）
  或稳定的 prefix 计数器；当前没有 API key/计数器。
- 可做的替代：两次 boot 的 schema/请求体 hash、离线 tokenizer 计数；但这些
  只证明“字节稳定”，不证明“省钱”。
- 状态：`not-measured`。不写“节省 X%”。

## 结论

BOOST 当前只有 LEV-7 的真实基准（合成 timer，8.24×）；LEV-3/6 仍是
`boost-warn`/`not-measured`，不得写成 `boost-evidenced`。

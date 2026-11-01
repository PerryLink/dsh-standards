# DSH-BOOST 参考实现（最小）

> 这些是**实践参考**，不是第三套标准的“通过样例”；每条只证明一个 LEV 的可运行核心。

## LEV-7 有界并行

- [lev7-bounded-batch.mjs](<<standards>/examples/boost/lev7-bounded-batch.mjs>)
- [lev7-bounded-batch.test.mjs](<<standards>/examples/boost/lev7-bounded-batch.test.mjs>)
- 证据：`node --test` 1/1 pass；`peak=2`、结果顺序稳定。

## LEV-3 volatile 配置（片段）

```js
import Schema from '@deepseek-ai/schemastery'

export const Config = Schema.object({
  limit: Schema.number().default(8).min(1).max(64).volatile(),
})

export function apply(ctx, config) {
  // 每次操作重读，不跨操作持有旧值
  const limit = () => config.limit
  ctx.effect(() => {
    const timer = setInterval(() => run(limit()), 60_000)
    return () => clearInterval(timer)
  }, 'boost.volatile.timer')
}
```

证据要求：改 `limit` 后 `internal/update` 不触发、restart 0、effect 增量 0。

## LEV-5 seam（片段）

```ts
// 只依赖定义包；运行时通过 ctx.<service> 拿实现
import type { HelloService } from '@acme/hello-service'

export const inject = ['hello']

export function apply(ctx: Context) {
  const hello = ctx.hello as HelloService
  ctx.effect(() => hello.subscribe(() => {}), 'boost.seam.subscribe')
}
```

证据要求：consumer 对实现包 0 import；`leakedServices()==[]`。

## LEV-6 前缀/装配（待补基准）

- 工具名/描述/参数 schema、system section 文本逐字节稳定；
- 时间/cwd/端口/模式走 `systemPrompt.context`；
- 复用 `refreshContext()` / `prepareCall()` 的 assembly；
- 证据：两次 boot schema diff 0、prefix 命中/token、每步重付 token。

当前没有稳定的 token 计数器，LEV-6 只能给 `boost-warn`，不冒充 `boost-evidenced`。

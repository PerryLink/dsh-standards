# coverage 契约（`dsh-conformance/1`）

> 适用版本：dsh-standards **1.6.0**（计划版本；1.5.0 及更早为 14 项）。`40-checker/src/report.mjs` 的 `buildReport()` 负责计数；`security` 块见 §6。
> 机器可校验形状见 [`schemas/conformance.schema.json`](schemas/conformance.schema.json)；本文只统一字段含义。
> 结论：`coverage` 是**加性计数**，不参与 verdict；`PASS/WARN/FAIL` 与 `status/level` 由 `conclusion` 和对应 profile 的强制项决定。

## 1. 两个层次，不要混用

| 层次 | 字段 | 取值 | 回答的问题 |
|---|---|---|---|
| 检查级 | `checks[].coverage` | `full` / `partial` / `not-run` | **这一项自己**跑完了没有 |
| 报告级 | 顶层 `coverage` 对象 | 整数计数 | 报告携带的**全部** `checks[]` 里，各结果/覆盖状态各多少 |

检查级 `NA` 的默认覆盖是 `not-run`（`result.mjs`），但它是**显式不适用**，在报告级单列到 `coverage.na`，不并入 `notRun`。

## 2. 顶层 `coverage` 字段

| 字段 | 定义 |
|---|---|
| `total` | `checks[].length`：默认 `ds-c` 为 14（`DSC-01`…`DSC-14`）；`--scope security` 为 22（再加 `DSC-15`…`DSC-22`）。 |
| `mandatory` | 当前 `scope`/`profile`/`staticOnly`/`entryClaim` 选出的强制检查 ID 数，不是 22；默认 package 11、listing 12、`--scope security` 4（`DSC-15/16/17/21`）。 |
| `checked` | 结果属于 `PASS` / `WARN` / `FAIL` 的检查数，即**实际评估过**的项。 |
| `pass` | 结果 `PASS` 的数量。 |
| `warn` | 结果 `WARN` 的数量。 |
| `advisory` | `check.advisory === true` 且结果为 `WARN` 的数量；是 `warn` 的子集，只作信号，永不改 verdict。 |
| `fail` | 结果 `FAIL` 的数量。 |
| `na` | 结果 `NA` 的数量（对象形态/上下文不适用），**不是通过**。 |
| `notRun` | `coverage` 为 `not-run`/`partial` 且结果非 `NA` 的项、结果 `ERROR` 的项、以及**缺失的强制项** ID 去重后的数量；包含 `error`。 |
| `error` | 结果 `ERROR` 的数量（检查器失效或该跑没跑）；是 `notRun` 的子集。 |

加性诊断字段（1.3.0 工作树同时输出；旧消费者应按“可选”处理，不参与 verdict）：

| 字段 | 定义 |
|---|---|
| `coverage.partial` | `checks[].coverage === "partial"` 的数量。它同时保留在 `checked`（若结果 PASS/WARN/FAIL）和 `notRun` 中；这个计数只是把重叠显式化，**不是第 10 个通过口径**。 |
| 顶层 `notChecked` | `buckets.notChecked` 与 `buckets.partial` 按 `id` 去重后的可读视图，每行带 `howToEnable`。等价信息已在 `buckets` 里子集化，消费者可忽略。 |
| `buckets.partial` | `coverage: "partial"` 的检查行；同一行可能也出现在 `blocking` / `hygiene`。 |
| 行级 `howToEnable` | 让该 NA/ERROR/partial 行可运行的命令或 flag；仅提示。 |

恒等式与边界：

- `checked = pass + warn + fail`（`advisory <= warn`）。
- `error <= notRun`；`notRun` 统计的是“没拿到完整结论”的项，`NA` 不算没跑。
- 默认 `ds-c` 完整跑（14 项、无缺失）与 `--scope security` 完整跑（22 项、无缺失）都满足 `checked + na + notRun = total`；两份报告的 `total` 不同，不能混算通过率。
- **例外**：若某项 `coverage: "partial"` 但结果仍是 `WARN`/`FAIL`，它会同时出现在 `checked` 与 `notRun` 中——已评估但不完整，不能当成 `full`。有缺失强制项时，`notRun` 会含不在 `checks[]` 里的 ID，此时上述加法可大于 `total`。
- `metrics = { checked, total, declaredFields }`：`checked`/`total` 与 `coverage` 同源；`declaredFields` 是 capabilities/labels/commitments/disclosure/engines.dsh 五个可选声明面中实际声明的个数（0–5），只作上下文。

## 3. 与旧检查级 `full` / `partial` 的映射

旧报告（31 §3.3 草案）与旧检查项只有 `coverage: full | partial | not-run`，没有结果计数。映射：

| 旧检查级 | 新顶层计数 | 说明 |
|---|---|---|
| `full` + `PASS`/`WARN`/`FAIL` | `checked`，并落入 `pass`/`warn`/`fail` | 完整评估，计入结论。 |
| `full` + `NA` | `na` | 显式不适用；旧报告常把 NA 记在 `full` 之外。 |
| `partial`（无论结果） | `notRun` | 只跑了一部分，必须当未完成；若结果仍是 `WARN`/`FAIL`，同时计入 `checked`。 |
| `not-run` | `notRun` | 完全没跑。 |
| `ERROR`（旧 `error` 计数） | `notRun` + `error` | 检查器失效/未执行；两者都计。 |

旧对象字段的对应关系：

- 旧 `mandatory` → 新 `mandatory`（同义，选出的强制项数）。
- 旧 `full` → 新 `checked` **减去** `partial` 但已评估的项，再减去 `full + NA` 的项；最稳妥的读法是“旧 full 只看覆盖，新 checked 看结果”。
- 旧 `partial` / `notRun` → 新 `notRun`。
- 旧 `na` → 新 `na`。
- 旧 `error` → 新 `error`（并已包含在 `notRun`）。
- 旧对象没有 `total` / `pass` / `warn` / `advisory` / `fail` / `checked`；这些是 1.3.0 的新增计数。

## 4. `entryBlocking`

仅 `scope: "entry"` 非 null；`ds-c`/`mvp` 固定为 `null`。形状：

```json
{ "required": 6, "checked": ["C-1.1", "..."], "notChecked": ["C-3.1"], "failed": [], "pass": false }
```

- `required`：该 claim 的阻断前提总数（static 6 个；runtime 再加 `C-2.2`/`C-2.3`）。
- `checked`：真正产出 detail 的前提；`notChecked`：没产出的前提。
- `checked.length + notChecked.length = required`；`failed` 是 `checked` 中结果为 `FAIL` 的子集。
- `pass` 仅在 `failed` 为空**且** `notChecked` 为空时为 `true`。没给 `--install-spec`/`--market-index` 时 C-3.x 未查，`pass` 必为 `false`。
- `entryBlocking` 不替代 `coverage`；它回答“阻断前提齐不齐”，`coverage` 回答“`checks[]` 各是什么状态”（默认 14 项，security 22 项）。

## 5. 示例（`--scope security` 示意，22 项；数字非实测）

```json
{
  "total": 22, "mandatory": 4, "checked": 14,
  "pass": 12, "warn": 1, "advisory": 1, "fail": 1,
  "na": 1, "notRun": 7, "error": 7, "entryBlocking": null,
  "security": {
    "scope": "security", "status": "fail",
    "blocking": ["DSC-17"], "warn": [], "advisory": ["DSC-19"], "notRun": []
  }
}
```

读法：12 PASS + 1 WARN + 1 FAIL = 14 项实际评估；1 项显式 NA；7 项 ERROR/未跑；`checked + na + notRun = 22`；`error (7) <= notRun (7)`。`conclusion.status` 由 `--scope security` 的 4 个强制项（`DSC-15/16/17/21`）决定；`security.status=fail` 只是 security 块的独立结论，不把 `DS-C` 徽章改写成 fail。

## 6. security scope（C-15～C-22）

`--scope security` 是独立 opt-in scope，不并入 `ds-c` / `entry` / `mvp`。8 个 security 检查**始终**在报告的 `security` 块里运行；是否进入 `checks[]`、是否可 FAIL，取决于 scope。

| 项 | 语义 |
|---|---|
| 计入 `total` | **默认否**：`checks[]` 仍是 14，`security` 块单独存在、不计入 `coverage`。**security 是**：`checks[]` 22，`coverage.total=22`、`coverage.mandatory=4`。 |
| 默认 `security.scope` | `"advisory"`。8 项照常评估，但任何 `FAIL` 封顶为 `WARN`，不改 `conclusion`/exit；`security.status` 可为 `pass`/`warn`。 |
| `security.status=pass` | **security scope 下**：无 FAIL、无强制项结果不在 `PASS`/`WARN`/`FAIL`、无任何 WARN（含 advisory）。默认 advisory 模式只可能 `pass`/`warn`，且 `pass` 不代表覆盖完整。advisory 的 `not-run`（如 C-22 无元数据）不挡 `pass`，但必须留在 `security.notRun[]`；C-21 的传递依赖元数据缺失只记 check 级 `coverage: partial`，不等同 PASS。 |
| `security.status=fail` | **仅 security scope**：`DSC-15`/`DSC-16`/`DSC-17` 任一 FAIL。`DSC-21` 永不 FAIL；默认模式 FAIL 封顶 WARN，不会出现 fail。 |
| `security.status=warn` | 无 FAIL，但有 `DSC-21` 或 15/16/17 的 WARN，或 18/19/20/22 的 advisory WARN。 |
| `security.status=incomplete` | **security scope 下** `DSC-15`/`DSC-16`/`DSC-17`/`DSC-21` 任一结果不在 `PASS`/`WARN`/`FAIL`（即 `NA`/`ERROR`/`not-run`）。 |
| 与 DS-C 关系 | **独立**：security FAIL 不撤销 DS-C PASS；DS-C PASS 不证明 security 通过；反之亦然。 |
| 徽章 | **不得**发 security 徽章；市场只透传 `security.status`、`security.checks[]` 与 `security.notRun[]`，不按安全分排序/筛选。 |

严重度以 `spec/dsc-clauses.json` 的 `mandatory`/`advisory` 与 31 §2 C-15～C-22 为准：`DSC-15/16/17` 为 blocking（可 FAIL）；`DSC-21` 是强制项但发现封顶 WARN（永不 FAIL，未跑才 `incomplete`）；`DSC-18/19/20/22` 为 advisory（`advisory:true`，永不改 verdict）。`security` 块只汇总这 8 项，不与顶层 `coverage` 换算成第二套通过率。

## 7. 禁止事项

- 不得把 `na`、`notRun`、`error` 或 `partial` 写成 PASS。
- 不得用 `coverage.pass / total` 当通过率或等级；`total` 含未跑项，且 `mandatory` 随 profile 变。
- 不得把 `advisory` 计入 `fail` 或据其改变 `exitCode`。
- 检查级 `coverage` 与报告级 `coverage` 同名不同义；引用时必须写全路径（`checks[].coverage` vs `coverage`）。
- 不得把 `security.status` 写成安全认证/审计结论；security 的 `pass` 只覆盖这 8 项的静态/元数据证据。

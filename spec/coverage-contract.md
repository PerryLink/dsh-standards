# coverage 契约（`dsh-conformance/1`）

> 适用版本：dsh-standards **1.3.0**（`40-checker/src/report.mjs` 的 `buildReport()`）。
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
| `total` | `checks[].length`，完整跑是 14（`DSC-01`…`DSC-14`）。 |
| `mandatory` | 当前 `scope`/`profile`/`staticOnly`/`entryClaim` 选出的强制检查 ID 数，不是 14。 |
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
- 常规完整跑（14 项、无缺失）满足 `checked + na + notRun = total`。
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
- `entryBlocking` 不替代 `coverage`；它回答“阻断前提齐不齐”，`coverage` 回答“14 项各是什么状态”。

## 5. 示例（1.3.0，good fixture，`--no-exec`）

```json
{
  "total": 14, "mandatory": 11, "checked": 6,
  "pass": 5, "warn": 0, "advisory": 0, "fail": 1,
  "na": 1, "notRun": 7, "error": 7, "entryBlocking": null
}
```

读法：5 项 PASS + 1 项 FAIL = 6 项实际评估；1 项显式 NA；7 项 ERROR/未跑；`checked + na + notRun = 14`；`error (7) <= notRun (7)`。`status` 仍由强制项决定（此处因 FAIL 为 `fail`），不能只看 `coverage` 反推通过。

## 6. 禁止事项

- 不得把 `na`、`notRun`、`error` 或 `partial` 写成 PASS。
- 不得用 `coverage.pass / total` 当通过率或等级；`total` 含未跑项，且 `mandatory` 随 profile 变。
- 不得把 `advisory` 计入 `fail` 或据其改变 `exitCode`。
- 检查级 `coverage` 与报告级 `coverage` 同名不同义；引用时必须写全路径（`checks[].coverage` vs `coverage`）。

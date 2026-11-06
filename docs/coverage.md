# 覆盖说明（14 项）— `dsh-standards check` 默认查什么

`dsh-standards check <package-dir>` 是作者入口。**默认 `--entry-claim static --no-exec`：不执行插件代码**。本文只描述这套默认，不把 `not-run` / `NA` 写成 PASS。

默认命令等价于：

```sh
dsh-standards check <package-dir> \
  --entry-claim static --no-exec --scope ds-c --profile package
```

## 一眼看总数

| 口径 | 数量 | 说明 |
|---|---|---|
| 报告固定携带 | **14** | `DSC-01` … `DSC-14` |
| 默认实际评估 | **6** | `DSC-01`、`DSC-02`、`DSC-10`、`DSC-11`、`DSC-12`、`DSC-13` |
| 默认未检查 | **8** | `DSC-03`（NA）+ `DSC-04`–`DSC-09`（not-run）+ `DSC-14`（NA） |

`not checked` 桶把 NA / not-run / ERROR 都列出来；**没检查不等于通过**。`DSC-10` 是 advisory，只提供信号，不改变结论。

## 14 项逐条

| ID | 层 | 默认状态 | 默认为什么 | 怎么开启 |
|---|---|---|---|---|
| `DSC-01` | L0 | **检查** | manifest / name / version / license / 入口 / 导出形态 | 默认即查 |
| `DSC-02` | L0 | **检查** | `engines.dsh` / peer 是否被 anchor 的宿主版本满足 | 默认即查；版本源见下 |
| `DSC-03` | L0 | **NA** | 没有安装 spec / 市场索引可查 | `--install-spec <spec>`，或 `--market-index <file> --plugin-name <name>`（listing） |
| `DSC-04` | L1 | **not-run** | `--no-exec`，不导入插件 | `--runtime <cordis lib/index.js>`；bundle 用 `--host <app-boot lib/index.js>` |
| `DSC-05` | L1 | **not-run** | 同上 | 同上 |
| `DSC-06` | L1+L2 | **not-run** | 同上 | 同上 |
| `DSC-07` | L2 | **not-run** | 同上 | 同上 |
| `DSC-08` | L3 | **not-run** | 同上 | 同上 |
| `DSC-09` | L1 | **not-run** | 同上 | 同上 |
| `DSC-10` | L0 | **检查（advisory）** | import 期副作用静态信号 | 默认即查；不单独 FAIL |
| `DSC-11` | L0 | **检查** | `dsh.capabilities` 与高信号触发 | 默认即查 |
| `DSC-12` | L0 | **检查** | 凭据 backing file、`listRecords`、seam、commitments/disclosure 形状 | 默认即查 |
| `DSC-13` | L0 | **检查** | `dsh.labels` / `upstream` / 禁用语标签 | 默认即查 |
| `DSC-14` | L1 | **NA** | 默认 `entry-claim=static`，不声明运行时证据 | `--scope entry --entry-claim runtime --runtime <...>`（bundle 加 `--host`） |

## 执行 opt-in

默认不执行插件代码。以下任一参数出现，才算显式允许运行时检查：

- `--runtime <path>`：Cordis 运行时的 `lib/index.js`，开启 L1–L3；
- `--host <file>`：app-boot 入口，开启 bundle 的 G0–G3 冒烟；
- `--entry-claim runtime`：entry 门声明运行时证据（通常还要配 `--runtime` / `--host`）。

想保留运行时声明但只看静态结果，显式加 `--no-exec`。`--runtime-version` 只是 anchor，**不是**执行开关。

## host 版本从哪里来

`check` 不会无条件执行 PATH 里的 `dsh`。anchor 按以下顺序取：

1. `--host-version <v>`；
2. `DSH_HOST_VERSION` 环境变量；
3. `--allow-host-probe`：解析 `dsh` 的 JS 入口，执行 `node <entry> --version`（仅此一种情况会探测）；
4. 都没有：报告写「host 版本未知」，`anchor.runtimeSource=default`、`anchor.suspect=true`。

三态在 JSON 里可直接核对：`anchor.hostVersionKnown`、`anchor.hostVersionSource`（`flag` / `env` / `probe` / `none`）、`anchor.runtimeSource`（`host` / `default`；显式 `--runtime-version` 时保留 `cli`）。

## 跨平台

- **Windows：** `unshare -Urn` / `prlimit` 不可用 → sandbox degraded；本仓**不声称** Windows 上的 runtime 结论，矩阵里的 Windows / Node 22 行固定 `not-run`。静态检查（上表 6 项）仍可跑。
- **WSL2（Ubuntu 24.04）：** Linux 沙箱可用，能提供 `unshare` / `prlimit`；这是本仓做 runtime 采集的环境。WSL2 可用不等于某个 host × Node × checker 组合已经跑过，具体以 [SUPPORTED.md](../SUPPORTED.md) 的格子为准。
- **Node：** 包声明 `engines.node >=24.9.0`；Node 22 只在自测 / 静态矩阵中有记录（见 SUPPORTED.md）。

## 复核命令

```sh
# 默认：6/14 评估，8 项 not-run/NA
dsh-standards check <package-dir> --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(r.coverage.checked+"/"+r.coverage.total);console.log(r.anchor);console.log(r.safety)})'

# 显式声明宿主版本，仍不执行插件
dsh-standards check <package-dir> --host-version 0.2.2-rc.1

# 显式允许宿主版本探测（只跑 dsh --version，不跑插件）
dsh-standards check <package-dir> --allow-host-probe

# 显式开启 L1–L3（会执行插件代码）
dsh-standards check <package-dir> --runtime /path/to/cordis/lib/index.js
```

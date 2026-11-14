# 覆盖说明（22 项口径）— `dsh-standards check` 默认查什么

`dsh-standards check <package-dir>` 是作者入口。**默认 `--entry-claim static --no-exec`：不执行插件代码**。本文只描述这套默认，不把 `not-run` / `NA` 写成 PASS。

默认命令等价于：

```sh
dsh-standards check <package-dir> \
  --entry-claim static --no-exec --scope ds-c --profile package
```

## 一眼看总数

| 口径 | 数量 | 说明 |
|---|---|---|
| 完整口径 | **22** | `DSC-01` … `DSC-22`；`--scope security` 时 `checks[]` 带全 22 项 |
| 默认 `checks[]` | **14** | `DSC-01` … `DSC-14`；默认 DS-C 判定只看这 14 项 |
| 默认 ds-c 实际评估（bundle） | **12 / 14** | bundle 的 `DSC-04`–`09` 以静态子集 `PASS`+`partial` 计入；`DSC-03`/`DSC-14` 为 NA |
| 默认 ds-c 实际评估（plugin，无 `--runtime`） | **6 / 14** | `DSC-04`–`09` 为 not-run；`DSC-03`/`DSC-14` 为 NA |
| 默认未检查（plugin 静态） | **8** | 2 NA + 6 not-run；不等于通过 |
| `--scope security` `checks[]` | **22** | 加 `DSC-15`–`DSC-22`；`coverage.mandatory=4`（15/16/17/21），仍可能 not-run |
| 默认 security 块 | **8** | `DSC-15`–`DSC-22` 在 `security` 块里跑 advisory；FAIL 封顶 WARN，不改变 DS-C 结论 |

`not checked` 桶把 NA / not-run / ERROR 都列出来；**没检查不等于通过**。`DSC-10` 是 advisory，只提供信号，不改变结论。

## 22 项逐条

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
| `DSC-15` | L0 | **advisory（security 块）** | 默认 scope 下 FAIL 封顶 WARN | `--scope security`；生命周期脚本，可 FAIL |
| `DSC-16` | L0 | **advisory（security 块）** | 默认 scope 下 FAIL 封顶 WARN | `--scope security`；动态执行，可 FAIL |
| `DSC-17` | L0 | **advisory（security 块）** | 默认 scope 下 FAIL 封顶 WARN | `--scope security`；敏感文件，可 FAIL |
| `DSC-18` | L0 | **advisory（security 块）** | 端点线索，永不 FAIL | `--scope security`；外联端点 |
| `DSC-19` | L0 | **advisory（security 块）** | 只登记不判恶 | `--scope security`；混淆/二进制 |
| `DSC-20` | L0 | **advisory（security 块）** | 语义不可判、误报高 | `--scope security`；提示词注入 |
| `DSC-21` | L0 | **WARN（security 块）** | 名字线索；默认 scope 不 FAIL | `--scope security`；供应链，强制项但只 WARN、不阻断 |
| `DSC-22` | L0 | **advisory（security 块）** | 只有字段自证 | `--scope security`；来源/完整性，v1 只读字段 |

## security scope（C-15～C-22）

`--scope security` 是**独立、opt-in** 的安全范围。它把 8 项加入 `checks[]`（14 → 22），但**不改变** `DS-C` 徽章、也不并入 DS-C 的 11/12 条强制。它只降低风险，**不证明无恶意**：

| 项 | security scope 判定 | 触发 |
|---|---|---|
| `DSC-15` 生命周期脚本 | **blocking**（可 FAIL） | 安装期 `curl\|sh`、`base64 -d`、`node -e`、`sh -c`、`powershell -enc`、引用缺失脚本、写 `$HOME`/`/etc` |
| `DSC-16` 动态执行 | **blocking**（可 FAIL） | `eval`/`new Function(非空)`/`vm`/`module._compile`/`process.binding` → FAIL；裸 `child_process` → WARN；静态危险子进程命令 1.6.2 起 FAIL；1.6.6 起 vendor/第三方文件内的 `eval`/`new Function` → WARN（`--strict-vendor` 恢复 FAIL） |
| `DSC-17` 敏感文件 | **blocking**（可 FAIL） | 直接读 `~/.ssh`、`$DSH_HOME` credentials、`id_rsa`、`.aws`、`.npmrc`、`.netrc` 等；`.env` 只 WARN |
| `DSC-18` 外联端点 | **advisory**（永不 FAIL） | 非 https、userinfo、公网裸 IP、webhook/paste/ngrok/onion、未披露端点 |
| `DSC-19` 混淆/二进制 | **advisory** | 二进制 sha256、超长单行、大块 base64、高熵；只登记不判恶 |
| `DSC-20` 提示词注入 | **advisory** | 外部文本进 systemPrompt、指令样字面量、无 untrusted 包裹；语义不可判 |
| `DSC-21` 供应链 | **WARN-only（强制项，不阻断）** | scope 同形字/近似 scope、近似名、元数据缺失；**永不 FAIL**，listing/package 均只 WARN；未跑会使 security `incomplete` |
| `DSC-22` 来源/完整性 | **advisory**（永不 FAIL） | 只读 `dist.integrity` / `dsh.attestation` / `dsh.signature` 字段是否存在；不验签、不比对 digest；无输入即 `not-run` |

**默认不改变判定**：不传 `--scope security` 时，这 8 项不进 `checks[]`，只在 `security` 块里以 `scope=advisory` 运行；任何 FAIL 封顶 WARN，`DS-C` 的 11/12 条强制集合与 exit code 不变。security 的 FAIL 不能撤销 `DS-C` PASS，`DS-C` PASS 也不能证明 security 通过。

**报告读法（headline vs buckets）**：`conclusion.headline` 的 `blocking N` 与 `buckets.blocking[]` 只数 `checks[]` 里的 FAIL。默认 scope 下 security FAIL 封顶 WARN，只在 `security` 块（`security.warn[]`，`security.blocking=[]`），**不进 `buckets.blocking`**；`--scope security` 下 `DSC-15/16/17` FAIL 才进 `buckets.blocking`、抬高 headline 并 exit 1。`DSC-21` 永不 FAIL，两个 profile 都不阻断。

**partial 怎么读**：`checks[].coverage=partial` 仍计入 `coverage.checked`（若结果 PASS/WARN/FAIL），并单列到 `coverage.partial` / `buckets.partial`；它**不并入** `coverage.notRun`（后者只数完整 `not-run` + `ERROR` + 缺失强制项）。`security` 块没有独立 `partial[]`：看 `security.checks[].coverage`；`security.notRun[]` 不收 partial。

**边界**：C-15/C-16/C-17 可以 FAIL；C-21 是强制项但 **WARN-only、不阻断（listing 同）**；C-18/C-19/C-20/C-22 是 advisory；其余安全面（实际网络流量、审批绕过、同进程逃逸、client DOM、`!!js` 配置、Remote 调用方身份）**没有机械判据**。任何 PASS 都只是"本次覆盖内未见该类线索"，不是"安全/已审计"。

## 执行 opt-in

默认不执行插件代码。以下任一参数出现，才算显式允许运行时检查：

- `--runtime <path>`：Cordis 运行时的 `lib/index.js`，开启 L1–L3；
- `--host <file>`：app-boot 入口，开启 bundle 的 G0–G3 冒烟；
- `--entry-claim runtime`：entry 门声明运行时证据（通常还要配 `--runtime` / `--host`）；
- `--scope security`：只跑 C-15～C-22 的静态/元数据检查，**仍不执行插件代码**（C-15 只读脚本文本，不跑 `npm install`）。

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

## advice 的 docsUrl

报告 `advice[].docsUrl` 的基址是 checker 的 `DOCS_BASE`：1.6.1 为 `dsh-plugin-guide` `v0.4.6`，计划在 **1.6.2 升到 `v0.5.0`**。guide 0.5.0 的 `docs/security.md` 中 C-15～C-22 advice 使用的锚点（`#2-credentials-and-sensitive-files-dsc-17`、`#3-egress-endpoints-dsc-18`、`#4-files-subprocesses-and-dynamic-execution-dsc-15-dsc-16-dsc-17-dsc-19`、`#5-tool-output-and-prompt-injection-dsc-20`、`#6-dependencies-build-and-publish-dsc-15-dsc-21-dsc-22`）以及显式锚点 `#author-files`、`#author-credentials`、`#author-egress`、`#author-prompt`、`#author-publish`、`#scope` 已核对存在。

## 复核命令

```sh
# 默认静态：plugin 6/14（04–09 not-run），bundle 12/14（04–09 PASS+partial）；security 块是 advisory
dsh-standards check <package-dir> --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(r.coverage.checked+"/"+r.coverage.total);console.log(r.anchor);console.log(r.security)})'

# 默认 + security scope：checks[] 变 22 项（不执行插件）
dsh-standards check <package-dir> --scope security --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(r.coverage.checked+"/"+r.coverage.total);console.log(r.security)})'

# 显式声明宿主版本，仍不执行插件
dsh-standards check <package-dir> --host-version 0.2.2-rc.3

# 显式允许宿主版本探测（只跑 dsh --version，不跑插件）
dsh-standards check <package-dir> --allow-host-probe

# 显式开启 L1–L3（会执行插件代码）
dsh-standards check <package-dir> --runtime /path/to/cordis/lib/index.js
```

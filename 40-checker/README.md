# 40 · DS-C 一致性检查器（MVP）

> 版本：0.1.0 ｜ 日期：2026-10-31 ｜ 标准：DS-C v1.0.0 ｜ 许可：Apache-2.0
> 零依赖，Node ≥ 20。只读目标包；不修改被检对象。
>
> **未发布到 npm。** npm 上的 `dsh-plugin-verify` 是另一个项目；`dsh-levels` 也是第三方包。请从本仓运行 `node bin/...`，不要 `npx dsh-plugin-verify` / `npx dsh-levels`。

## 1. 它做什么

对**一个插件包目录**跑 DS-C 的检查项，输出 `text` / `json` / `SARIF 2.1.0`，exit `0/1/2/3`。

- 覆盖 `DSC-01`～`DSC-13`（对应 31 §2 的 C-1～C-13）。
- `--scope mvp` 只跑 E 路 MVP 13 项落到的 8 个检查 ID：`DSC-01/02/04/05/06/07/08/09`。
- `--scope ds-c`（默认）按 `package` / `listing` profile 判定；缺项输出 `incomplete`，**不会**"跳过即通过"。

```bash
node bin/dsh-plugin-verify.mjs /path/to/plugin
node bin/dsh-plugin-verify.mjs /path/to/plugin --format json --out report.json
node bin/dsh-plugin-verify.mjs /path/to/plugin --format sarif --out report.sarif
```

## 2. 检查项

| ID | 条款 | 层 | 说明 |
|---|---|---|---|
| `DSC-01` | C-1 | L0 | manifest / name / version / license / 入口 / `dsh.bundle.patch` / 导出形态 |
| `DSC-02` | C-2 | L0 | `engines.dsh` 或 `@deepseek-ai/dsh*` peer，被 runtime 满足 |
| `DSC-03` | C-3 | L0 | install spec / 市场索引条目 / 供应链固定性 |
| `DSC-04` | C-4 | L1 | 装载到 ACTIVE |
| `DSC-05` | C-5 | L1 | 声明的 `provide` 真实注册 |
| `DSC-06` | C-6 | L1+L2 | effect 拓扑 / 私有注册面 |
| `DSC-07` | C-7 | L2 | 卸载后 effect/store/registry 归零 |
| `DSC-08` | C-8 | L3 | restart 幂等 + 冷重装 |
| `DSC-09` | C-9 | L1 | 声明 vs 实测交叉 |
| `DSC-10` | C-10 | L0 | import 期副作用（**advisory，不 FAIL**） |
| `DSC-11` | C-11 | L0 | `dsh.capabilities` + 高信号触发 |
| `DSC-12` | C-12 | L0 | 凭据 backing file / `listRecords` / 全局 seam；并读取 `dsh.commitments`/`dsh.disclosure` 的形状 |
| `DSC-13` | C-13 | L0 | `dsh.labels` / `upstream` / 禁用语标签 |

**MVP 覆盖缺口**：E 路的 13 个检查项只落到 8 个 ID；`DSC-03/10/11/12/13` 不在 MVP。`--scope mvp` 的结论是 `subset: "MVP-13"`、`level: null`，**不得**当 DS-C 徽章。

## 3. 两种 profile（对齐 31 §1.3）

| profile | 强制条款 | C-3 |
|---|---|---|
| `package`（默认） | 11 条（不含 C-3） | NA |
| `listing` | 12 条（含 C-3） | 需要 `--market-index` + `--plugin-name` |

```bash
# package：作者本地
node bin/dsh-plugin-verify.mjs ./my-plugin

# listing：市场门禁
node bin/dsh-plugin-verify.mjs ./my-plugin \
  --profile listing \
  --market-index ./market.json \
  --plugin-name @acme/dsh-greet
```

`NA` 是显式不适用（例如 bundle 的 C-4～C-9）；`not-run` 是该跑没跑。二者都**不是** PASS。

### M1 的 `--static-only`

```bash
node bin/dsh-plugin-verify.mjs ./my-plugin \
  --static-only \
  --market-index ./market.json --plugin-name @acme/dsh-greet
```

- 只判 `DSC-01/02/03/11/12/13`；C-4～C-9 显式映射为 `NA/out-of-scope`。
- 结论是 `DS-C static` / `DS-C static (warnings)`；**不是**完整 `DS-C`。
- 这是 T3 的 M1 通道；M2 通过后才可标 `DS-C verified`。

### bundle 的 `--treat-as-plugin`

```bash
node bin/dsh-plugin-verify.mjs ./my-bundle \
  --treat-as-plugin \
  --runtime /path/to/cordis/lib/index.js
```

- 对 `dsh.bundle.patch` 包，按 `lib/index.js` / `index.js` / `lib/public-entry.js` / `src/index.ts` 选 server entry，跑 L1–L3。
- 入口缺失相对文件 → FAIL；缺一个**裸包**（如 `ajv`、`@deepseek-ai/schemastery`）→ `ERROR/not-run`，因为检查器分不清是宿主农场缺依赖还是插件漏依赖。
- 真实 bundle 的 L1 需要隔离 host farm；没有它，报告只能是 `incomplete`，不是 PASS。

### 入门 `--scope entry`（DSH-ENTRY）

```bash
# 只做结构识别：recognized（不声明运行）
node bin/dsh-plugin-verify.mjs ./my-plugin --scope entry --entry-claim static

# plugin：必须 L1 真跑，才算 runtime
node bin/dsh-plugin-verify.mjs ./my-plugin --scope entry \
  --runtime /path/to/cordis/lib/index.js --runtime-version 0.2.2-alpha.2

# bundle：默认 require，有 --host 时跑 G0–G3（无 host 则 incomplete）
node bin/dsh-plugin-verify.mjs ./my-bundle --scope entry --host /path/to/app-boot/lib/index.js

# 兼容旧数据：只跑 server entry，明确标 proxy，不冒充 bundle
node bin/dsh-plugin-verify.mjs ./my-bundle --scope entry \
  --entry-runtime server-entry --treat-as-plugin \
  --runtime /path/to/cordis/lib/index.js --runtime-version 0.2.2-alpha.2
```

- `interop-static` 只表示可识别/可安装，不是通过；只有 `interop-runtime` 才是通过。
- `DSC-14` 是 run evidence；plugin 用 L1，bundle 用 G0–G3（`--host`），G4 client 只做静态。
- `--entry-runtime server-entry` 只给 `DSH-ENTRY runtime (server-entry)`，**不是 bundle pass**。
- C-2.2/C-2.3 在 entry 是 blocking；C-2.1 只 WARN。

### 三层自检 `level-audit.mjs`

```bash
# 只做 ENTRY 静态；FLOW/BOOST 明确 not-run/not-measured
node scripts/level-audit.mjs ./my-plugin

# ENTRY 真跑 + 可选的 FLOW/BOOST 证据
node scripts/level-audit.mjs ./my-bundle \
  --host /path/to/app-boot/lib/index.js \
  --base /path/to/dsh-base/cordis.patch.yml --bare /tmp/farm \
  --flow-evidence flow.json --boost-evidence boost.json --format json
```

- 机器源：`spec/levels.json`；标签格式：`publish/level-labels.example.json`。
- ENTRY 自动；FLOW 只读 `--flow-evidence`（J1–J8），BOOST 只读 `--boost-evidence`（LEV-1–8）。
- 没有证据就写 `not-run` / `not-measured`，工具不会替作者升级。

## 4. 运行 L1–L3

需要一个**已构建**的 `@deepseek-ai/cordis` 入口。检查器不修改宿主，也不从源码构建宿主：

```bash
node bin/dsh-plugin-verify.mjs ./my-plugin \
  --runtime /path/to/deepseek-harness/vendor/cordis/lib/index.js \
  --runtime-version 0.2.2-alpha.2 \
  --cordis-version 4.0.6-alpha.1
```

- 只对 `kind: plugin` 跑；`bundle`/`client` 默认输出 NA。`--treat-as-plugin` 可对 bundle 的 server entry 跑（见下）。
- 缺失宿主包 / 夹具桩不完整 → `ERROR` + `not-run`，**不 FAIL**。
- 插件可能留下 timer/子进程；CLI 写完报告后强制退出（250 ms），不靠事件循环自然结束。
- 运行时用隔离的临时 `DSH_HOME`/子进程是 T2 的下一阶段；当前 MVP 在检查器进程内跑，**只用于可执行样本**。

## 5. 三值 / exit / 覆盖度

| 结果 | 含义 |
|---|---|
| `PASS` | 有证据满足 |
| `WARN` | 部分满足 / 替代声明 / 证据不足；不阻断，但不等于 PASS |
| `FAIL` | 有明确反例；exit 1 |
| `NA` | 形态/上下文不适用；不是 PASS |
| `ERROR` | 检查器失效或该跑没跑；exit 2 |

| exit | 含义 |
|---|---|
| 0 | 完成，无 FAIL（可能 WARN；`level` 带 `warnings`） |
| 1 | 完成，有 FAIL |
| 2 | incomplete：强制项 not-run/ERROR，或检查器内部失败 |
| 3 | 用法错误 |

**结论门**：`--scope ds-c` 只有在 profile 对应的强制项全部 `coverage: full`（允许显式 NA）时才给 `level`；否则 `status: incomplete`、exit 2。WARN 仍给 `level`，但写 `DS-C (profile, warnings)`，不冒充干净通过。

## 6. 已知限制

1. **C-3 只在 listing 模式可判**；package 模式是 NA，仅附供应链 advisory 证据。
2. **L1–L3 已覆盖 13/14 个真实包**：4 个 npm bundle + 9/10 GitHub 源码样本 C-4/C-7 PASS；仅 `dsh-vision-router` 构建后仍缺 `lib/session-affinity.js` FAIL。host farm 用 `scripts/host-farm.mjs` 搭建，仍是临时目录。
3. **C-8.2 的 revision/epoch 在 Cordis 4.0.5 构建里不可观测**，因此 good fixture 的 C-8 是 WARN；4.0.6 源码有 `_revision`，换运行时后应变 PASS。
4. **C-13 只判声明一致性**；没有 `dsh.capabilities` 的插件无法被分类，高风险样本需要人工/市场复核（见 41）。
5. **C-10 是 advisory**，不产生 FAIL；危险 AST/句柄泄漏仍不进强制级。
6. `dsh.commitments`/`dsh.disclosure` 缺失只记 NA/WARN；C-12 不会因“没写承诺”而 FAIL。
6. 目标只支持**目录**；tarball/npm 包解包是 T2 下一阶段。
7. 未实现 L4 冒烟、GitHub Action、M1/M2 双通道；这些分别在 T2 phase 2 / T3。

## 7. 开发与测试

```bash
cd 40-checker
node --test
node bin/dsh-plugin-verify.mjs fixtures/good --format text
node bin/dsh-plugin-verify.mjs fixtures/bad --format text
```

目录：

```
bin/dsh-plugin-verify.mjs   CLI 入口
src/cli.mjs                 参数、编排、exit
src/manifest.mjs            DSC-01/02/03
src/declarations.mjs        DSC-10/11/12/13
src/runtime.mjs             DSC-04..09
scripts/host-farm.mjs       临时 host farm（符号链接依赖 + npm install/build）
scripts/m1-sidecar.mjs      format-1 索引 → levels.json（index-only + pilot 合并）
scripts/m2-runner.mjs       M2：临时 HOME/DSH_HOME、超时杀进程树、unshare/landlock
scripts/doc-commands-check.mjs  文档命令/模板一致性（防第三方 npx）
scripts/dependabot-check.mjs    no-Dependabot 策略检查
scripts/entry18-web.mjs         真实 web profile 的 ENTRY row 检查（runProfile）
scripts/entry18-realweb-summary.mjs  realweb rows → summary.json（含行哈希）
scripts/landlock-exec.c      Landlock fs 写限制 launcher（C，按需编译）
scripts/apply-overlay.mjs   把 T5 overlay 应用到包副本（不碰上游）
src/report.mjs              text/json/SARIF + 结论门
src/semver.mjs              子集 SemVer
src/install-spec.mjs        parseInstallSpec 的子集
fixtures/                   good/bad/bundle/hang/fs-write/market-index
results/                    样本与 fixtures 的实际输出
test/                       node:test
```

## 8. M1 sidecar

```bash
node scripts/m1-sidecar.mjs \
  --index /tmp/dsh-catalog/index.json \
  --pilot results/m1 \
  --out results/m1/levels.json
```

- `index-only`：只校验索引字段，不下包、不执行，`level: null`；**不是** DS-C level。
- `static-only` / `static-only-warn` / `failed`：8 个 pilot 的包级结论。
- 全量 3,993 条生成一次约 1 秒；不含插件代码、会话数据、凭据。

## 9. M2 runner（process / unshare / Landlock）

```bash
node scripts/m2-runner.mjs \
  --package /tmp/dsh-host/plugins/ci-diet \
  --modules /tmp/dsh-host/node_modules \
  --runtime /path/to/cordis/lib/index.js \
  --backend unshare-landlock \
  --timeout 60000 \
  --out results/m2/ci-diet.unshare-landlock.json
```

- 临时 `HOME`/`DSH_HOME`/`TMPDIR`；复制包；detached 子进程；超时杀进程树。
- 映射：checker `pass`→`verified`、`warn`→`verified-warn`、`fail`→`failed`、`incomplete`→`inconclusive`。
- `--backend process`：`containment: none`；`--backend unshare`：`unshare -Urn --fork --pid --mount-proc`，`containment: network-namespace+process`。
- `--backend landlock`：Landlock ABI 3，拒绝 HOME/TMP/cwd 之外的写；`unshare-landlock` 再叠 network/PID。
- `--image ref@sha256:<64hex>` 只做格式校验并记录 `sandbox.image`（`verified:false`）；本机没有 Docker 后端。
- **仍不是完整安全沙箱**：读权限仍打开，无 seccomp/cgroup/只读 root；OCI 容器是下一阶段。
- 实测：`dsh-ci-diet`/`dsh-project-memory` → `verified-warn`；`dsh-status-rotator`/`dsh-ui-auth` → `failed`（仅 C-2）；`fixtures/hang` → `inconclusive`（3s kill）；`fixtures/fs-write` 写 `<home>/...` → EACCES，文件未生成。

## 10. CI

`.github/workflows/plugin-verify.yml` 是模板：

- push/PR 只跑 L0（`node --test` + good/bad fixture + SARIF）；
- `workflow_dispatch` 手工跑 L1（需要仓库变量 `DSH_HOST` 指向一个 DSH checkout）。

## 11. 下一步（T2 phase 2）

1. `--scope entry` + `DSC-14` + `bundle-smoke.mjs`（G0–G3）已接进 `entry18-runtime` CI；G4 client root 是组合静态，client 运行时由 `web-runtime` 的真实浏览器 probe 提供。
2. 18 包 base-only 真实基线：`results/entry/18/fullbase/`，10/18 G3 `verified`、8 `partial`、0 `error`；host gate 后 8 clean `verified` + 2 `reject` + 8 `partial`（`92` §七）。web profile 的 4 个 web-app 看 `results/webruntime/`。
3. M2 OCI 化、LEV-6/证据卡、三份开发建议。

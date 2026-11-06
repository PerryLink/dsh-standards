## 未发布

- **FLOW 证据链**：新增 `spec/flow-evidence.schema.json`（`dsh-flow-evidence/2`）与 `40-checker/src/flow-evidence.mjs`。`level-audit --flow-evidence` 只接受 v2；v1（`dsh-flow-journey/1`、`dsh-flow-runtime/1`）与裸 `{Jx:{status}}` 标 `deprecated`，不计 pass。每个 J 须有 `checks[]` 且全部 `exitCode === 0`、断言成立、至少一条非 `static` 观测检查才计 pass（`warn`/`blocked`/`na`/`static` 不计 8/8）。v2 的 `chain.evidenceHash` 由 audit 重算，改动一个字节即 `invalid`。
- **collector**：新增 `40-checker/bin/dsh-flow-collect.mjs`（根入口 `bin/dsh-flow-collect.mjs`，并支持 `dsh-levels flow collect`）。只读副本 + 前后 `treeSha256` 一致、`npm pack --ignore-scripts` 的 integrity/tarballSha256、`git rev-parse` commit、临时 HOME/DSH_HOME、失败五要素提示（子检查/命令/exitCode/stderr 末 20 行/日志绝对路径 + 条款锚）；前置缺失记 `blocked` 且 exit 0，真失败 exit 1。
- **安全**：新增 `40-checker/src/sandbox-env.mjs` 白名单 env。`src/cli.mjs` 的 runtime-child/bundle-smoke 子进程、`bundle-smoke.mjs`/`runtime-child.mjs` 进程内 boot、`m2-runner.mjs`、`journey-runtime.mjs`、`journey-config-observe.mjs`、`flow-sample-ci.mjs`、`host-farm.mjs`、`entry18-web.mjs` 不再把 `process.env` 透传给被检插件/宿主 boot。
- 测试 137 → 149（新增 `40-checker/test/flow-evidence.test.mjs`：v1 不再 pass、v2 伪造 checks/exitCode 不 pass、篡改链路 invalid、blocked 不判 fail、collector 产物可被 audit 读取、失败五要素提示、env 白名单）。

## 1.2.0 — 2026-11-06

- 新增**建议管道**：`spec/remediation.json` 提供 68 条规则（`details[].item` ∪ `checks[].clause` ∪ G0–G4），`40-checker/src/remediation.mjs` 的纯函数 `joinAdvice(report, rules, docsBase)` 把 FAIL/WARN detail 连接成 `advice[]`；无 detail 的运行时 FAIL 用 `check.clause` 兜底（C-4/C-14）。
- `buildReport()` 输出新增**加性** `advice[]`（key/severity/title/why/fix/docsUrl/source/version/evidence），不改任何 check 构造、不改判定与 exit code；CLI 新增 `--advice`（默认开）与 `--no-advice`。
- 建议文档统一指向 `dsh-plugin-guide` 的 v0.4.3：`docsUrl = https://github.com/PerryLink/dsh-plugin-guide/blob/v0.4.3/ + docs`；规则表 `docs` 只存 `文件#锚点`。
- 新增 `40-checker/test/remediation.test.mjs`：规则表覆盖全集、fixture 无 `ruleMissing`、本地 guide 锚点存在、severity/merge/兜底/纯函数回归。测试 128 → 137。

## 1.1.2 — 2026-11-04

- 修复 1.1.1 的发布失败：vendored `@babel/parser` 的 `node_modules/` 被根 `.gitignore` 忽略，CI checkout 缺依赖导致 `npm test` 失败。现在 force-add 四个 vendored 包（约 2 MB），并加 1.1.2 的回归说明。
- 无行为变化；128 tests 仍全绿。

## 1.1.1 — 2026-11-04

- AST 解析失败的语义修正：一个**非入口**文件解析失败时，C-11.4/C-12.4 记 `NA/not-run`、coverage `partial`，不再把整条强制检查打成 ERROR/incomplete；只有所有可分析文件都失败时才保持 ERROR/not-run。第三套 holdout 的 `dsh-expert-team` 暴露了这个 bug。
- 新增 fixture `parse-error-nonentry` 与 1 条测试；127 → 128。

## 1.1.0 — 2026-11-04

- DSC-10 改为**真 AST**（vendored `@babel/parser`，支持 JS/TS/JSX；无运行时 npm 依赖）。只分析入口模块 + 本地相对 import 闭包；包导入/解析不到/`.d.ts` 记 C-10.3 coverage note（not-run），不再用行首正则。
- C-11.4 / C-12.4 改为 AST 字符串上下文：注释、等值比较、`console.*` 与 `desc`/`message`/`help` 等文档字符串不 WARN；`.set()`/`.resolve()`、`mode`/`sandboxPolicy`/`sandbox_permissions`、spawn/exec 的 `--add-dir` args 仍 WARN；未知上下文保守 WARN。
- 声明文件 `.d.ts` 没有运行期行为，跳过 AST 扫描，避免一条坏声明把整条检查打成 ERROR。
- 测试 110 → 127；新增 fixture `import-local-side-effect`、`import-package-only`、`import-parse-error`、`c12-doc-string`、`c12-command-arg`、`declaration-file`。

## 1.0.7 — 2026-11-04

- DSC-10 C-10.2 补齐“立即 `void main()`”：入口顶层 `void name()` 现在记 advisory WARN（此前只查 await/timer/process.on/env/globalThis）。
- DSC-11 C-11.4 / DSC-12 C-12.4：注释与等值比较（`===`/`!==`/`==`/`!=`）中的 `danger-full-access`/`--add-dir` 字面量不再 WARN；可执行上下文与普通字符串仍 WARN。5 个上下文盲案例驱动（dev 的 router/skill-mcp、holdout 的 skill-mcp、自家的 github-bot、89 条的 github-bot）。
- 新增 fixture `import-void-main`、`c12-comment`、`c12-compare`、`c12-grant`、`c12-string`；测试 105 → 110。

## 1.0.6 — 2026-11-04

- DSC-10：没有任何源文件可扫时记 **NA / not-run**，不再记 WARN（条款三值表本来就写“入口不可读 → NA”）。去掉 dev 上最后 3 条“no source scanned”噪声。
- 新增 fixture `no-source`；测试 104 → 105。

## 1.0.5 — 2026-11-04

- C-10.1/C-10.2 也改为只扫**入口模块**，与 C-10.4 一致；随包的 samples/probes/selfcheck 不再命中（89 条里 8/9、dev 里多条属于这一类）。
- C-10.4 不再把只读 `openSync` 当写操作（它没有写标志）。
- 新增 fixture `import-open-readonly`，扩展 `import-side-effect-nonentry`（根目录 selfcheck，含 globalThis）；测试 102 → 104。

## 1.0.4 — 2026-11-04

- DSC-10 新增 C-10.4：入口模块顶层 fs 写操作（`writeFileSync`/`appendFileSync`/`mkdirSync`/`rmSync`/`unlinkSync` 等）与子进程调用（`execSync`/`execFileSync`/`spawnSync` 等）记为 advisory WARN，仍然永不 FAIL。
- C-10.4 按条款只扫**入口模块**；同一行出现在随包发布的自检脚本里属于 C-10.3（not-run），不命中。
- 新增 fixture `import-side-effect`、`import-side-effect-nonentry` 与 3 条回归测试；测试 99 → 102。

## 1.0.3 — 2026-11-03

- Published from GitHub Actions with npm provenance (OIDC); local token publishes are retired.

## 1.0.2 — 2026-11-03

- L1–L3 run in a child process and are hard-killed on timeout; a blocked event loop is reported as `not-run`, never a pass.
- `dsh.capabilities` / `dsh.labels` warnings are advisory: still reported, no longer flip the verdict.
- A `g4` client-shape failure now fails DSC-01 instead of being dropped.
- `private: true` and workspace roots report NA instead of WARN/FAIL.
- A directory without `package.json` returns exit 3 (usage), matching `dsh-levels`.

## 1.0.0 — 2026-11-03

- First 1.x release: `dsh-standards` becomes the public execution umbrella — it ships the conformance checker, the level audit and the canonical specification files.
- Public commands: `dsh-standards` (checker) and `dsh-levels` (three-layer audit).
- The prose guide lives in `dsh-plugin-guide`; the low-level rule text stays in `dsh-plugin-spec`.

## 1.0.1 — 2026-11-03

- 打包：`files` 收窄，不再把 `40-checker/results/` 打进 npm 包（此前包含第三方插件结果、截图与本机路径）。
- 文档：`npx dsh-levels` 会装到第三方包，改为 `npx -p dsh-standards dsh-levels`；修正不存在的 `bin/` 路径；测试数 73→98。
- CLI：`dsh-standards --help` 首行显示自己的包名与版本。
- 检查器：`exports["."]` 指向缺失文件时不再回退到 `main`。

# Changelog

## 2026-11-04 — 0.2.2-alpha.3 baseline in the three-level docs

- Add the 0.2.2-alpha.3 baseline table and six PR-review evidence gates to `35`.
- Carry the baseline into `31` (ENTRY), `32` (FLOW R6) and the `33` BOOST card.
- Fix the ENTRY checklist: Node `>=24.9.0`, `engines.dsh` precedence from 0.2.1-alpha.4, frozen lockfile / release-age evidence.

## 2026-11-03 — Node 24.9 baseline
- Require Node >=24.9.0 to match DeepSeek Harness 0.2.2-alpha.3.

## 2026-11-02 — P0–P2, Apache-2.0, and attestation migration

- Renamed certificate → attestation (`dsh-attestation/1`, `DSH-ATT-*`,
  `publish/attestations/`); historical docs carry a migration banner.
- Added the gap ledger (43), role governance (44), and three-purpose kits (45).
- Added `scheme/`, `spec/clauses.json`, `spec/reference-suite.json`,
  `spec/schemas/report.schema.json`, `evidence/` hash chain.
- Added G4 static check, clause-map, stale-check, surveillance, dashboard.
- Added developer/official/market kits and `publish/verify.mjs` / `verify.html`.
- CI: governance checks, 73 tests, attestation verify, shell syntax, cross-platform matrix.
- License: text CC BY 4.0 with a required Change Notice; code Apache-2.0 (D-013); marks separate.
- Cross-repo: portal `f882144`, guide `e75cd9f`, kit `9897213`, catalog `a272d06`, certification `2f27666`, cert-mcp `4f0cf72`.

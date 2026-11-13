## 1.6.10 — 2026-11-13

### Fixed

- **C-11.5 no longer calls a static blind spot "over-declaration".** The clause fired for plugins that declare `fs:read`/`fs:write` and use `node:fs` directly, because the only trigger was `ctx.fs`; the remediation even told authors to delete a declaration they were really using. Direct `node:fs` reads/writes are now observation evidence (only for C-11.5 — they never produce a new C-11.2 FAIL), and `ctx.fs` reads/writes are observed separately instead of `fs:write` borrowing `fs:read`'s hit.
- **C-11.5 records `NA` instead of `WARN` when nothing can be observed**: no source files were scanned, or the capability has no static observation surface in this checker version (`credentials:provider`). Wording across `31-DS-C条款.md`, `60-权限与标注规范.md`, `spec/dsc-clauses.json` and `spec/remediation.json` now says "静态未观测（不等于未使用）" and no longer advises deleting a real declaration.

## 1.6.9 — 2026-11-08

### Fixed

- C-11.1 no longer emits a WARN when `dsh.capabilities` is a declared empty array. The clause only warns on a missing field; an empty array is the explicit "uses none" declaration, and C-11.2 still fails when a static trigger is observed but not declared. A freshly generated `dsh-plugin-start` skeleton now passes static ENTRY with hygiene 0.

### Verified

- `npm test`: 313 passed / 1 skipped / 0 failed.
- Generated `dsh-plugin-start` skeleton: local check exits 0, `blocking 0`, `hygiene 0`, no advice.

## 1.6.8 — 2026-11-07

### Added

- `conformance.schema.json`：`subject.source`（`package`/`registry`/`unknown`，可选加性）与 `checks[].howToEnable` 显式放行；`subject` 仍 `additionalProperties:false`，其余未知键照旧被拒。registry 报告（`dsh.plugin.json`，1.6.7 起输出 `source=registry`）现在可整份通过 schema。
- 离线包 `publish/dsh-standards-offline-1.6.8.tgz`：1,001,036 B，64 文件，sha256 `24117149e8dbc5ca44bc90e013461a6e1d385dd691c47d36e18728aa42a82fcb`；内层本地打包 911,496 B，sha256 `aa49e7d209eea37251d6a53851651eeb90692c2bea1e570f5c413c666c419e43`（npm 发布 tarball 911,485 B，sha256 `478716…`，差异仅 CHANGELOG）。

### Changed

- `publish/sidecar.json` 50 条按 1.6.7 代码重建（`checker=1.6.7`，sha `da6eeac`）：每包 ENTRY + security 两份报告，均显式 `--host-version 0.2.1-rc.5`，使 C-2 有判定而非 NA（不传时 1.6.7 默认把 C-2.1/C-2.2 记 NA/partial，实测 50/50）。50 个 tarball sha256 与 1.6.6 侧车逐条一致。
- C-2 相对 1.6.6 侧车：0 条 NA；ENTRY 口径 34 PASS / 16 WARN（1.6.6 侧车那 14 项是 ds-c 口径，7 条 C-2.1 FAIL 在 ENTRY 语义下记 WARN，security 块仍记 16 FAIL）；`dsh-session-superagent@0.10.4` 由 WARN→PASS（显式 host 0.2.1-rc.5 命中其声明；旧构建的占位默认 0.2.2-alpha.2 不命中）。

### Verified

- `npm test` 313/313。
- 102 份报告（50 ENTRY + 50 security + 2 registry）对 1.6.8 schema 全部 VALID；`source=sidebar`、未知 subject 键均被拒。
- `unshare -rn` 内 `npm install --offline` 离线包内 tarball，`dsh-levels 40-checker/fixtures/good --format json` exit 0、ENTRY `recognized`/`static`。

## 1.6.7 — 2026-11-07

### Added

- `check --host-version`：显式指定宿主版本；未知时 C-2.1/C-2.2 记 NA/partial + howToEnable，不再误报 FAIL。
- `--registry-dir`：读取 sidebar 形态的 `registry/`（`dsh.plugin.json`），输出 `subject.source=registry`，缺 package.json 的检查记 NA。
- Windows：`flow-collect` 用 `npm.cmd + shell` 调 npm pack，修 `EINVAL`。
- sidecar 扩到 50 条；security 块正式化（state/checks/summary/command，partial ≠ 安全审计）。
- 离线包 `dsh-standards-offline-1.6.6.tgz`（992,962 B，64 文件）。

### Verified

- `npm test` 313/313。
- sidebar 0.30.1 / TUI 0.19.0 默认 entry static：exit 1/blocking 1 → exit 0/blocking 0；显式 `--host-version 0.2.1-rc.5` 仍报真实 C-2.2 FAIL。

## 1.6.6 — 2026-11-07

### Fixed

- DSC-16 vendor-aware：`vendor/`、`node_modules/`、`third_party/`、`deps/` 路径，打包器 `//#region node_modules/...` 区间（按命中行判定库名），`schemastery`/`ajv`/`lodash` 库指纹/库形文件名，或同目录（`src/` 外）强证据，现在把 `eval`/`new Function` 降为 WARN（detail 记 `C-16.1` + `vendor: true`），不再进入 `security.blocking`。
- 新增 `--strict-vendor`（别名 `--no-vendor-exempt`）恢复 FAIL；默认行为对非 vendor 代码零变化。`vm.*`、`module._compile`、`process.binding`、危险子进程、base64+eval 永不豁免；`package.json` 依赖仅作佐证。
- `dsh-composer-history@0.8.16`（`lib/index.js:295` 内联 schemastery）由 fail/exit 1 → warn/exit 0；`--strict-vendor` 仍 fail/exit 1。
- conformance schema 的 `details[]` 新增加性 `vendor` 字段；31 号文 C-16、`CHANGELOG-RULES.md` 同步。

### Verified

- `npm test` 301/301；新增 3 个 fixture（bundle / vendor 路径 / 仅声明依赖的诱饵）与 2 个测试。

## 1.6.5 — 2026-11-07

- 31 号文 C-17 环境变量枚举的判定句与实现对齐（单独 PASS，同闭包出站才 WARN）。

## 1.6.4 — 2026-11-07

### Fixed

- `security.status` semantics: `pass` only when all eight checks are PASS and fully covered; WARN/partial → `warn`, NA/ERROR/not-run → `incomplete`, 15/16/17 FAIL → `fail`; new `security.partial[]`.
- `--scope security` no longer reports DSC-02 as blocking; `conclusion.status`, `headline` and `buckets.blocking` now agree.
- C-16 subprocess findings use C-16.3 with the right fix; advice gates never promote a WARN detail to FAIL.
- C-17 dynamic reads become `PASS/partial` (not full PASS); C-21 scans `devDependencies` and lists dependency names; C-21 stays WARN-only.
- `SECURITY.md`, `31-*`, `34-*` now ship in the npm package; README version is 1.6.x; conformance schema accepts `safety`, host-version fields and `security.partial`.
- Author Markdown/HTML render a `## Security (scope)` section (was invisible to `check` users); coverage contract updated.

### Verified

- `npm test` 299/299; 50 historical reports + 20 regenerated pass the schema; malicious samples still fail under security scope.
## 1.6.3 — 2026-11-07

- DSC-15: an install script that downloads code and then loads a literal path outside the package (`require('/tmp/...')`, URL, `../`) now FAILs; the variable form was already covered.

## 1.6.2 — 2026-11-07

### Fixed

- 红队加固：`process.env.HOME` 拼接凭据路径、`exec/spawn` 危险命令、安装脚本「下载后动态 require」、一层 read 别名、base64+eval、拆分 fetch 均能命中；恶意变体阻断从 1/11 升到 7/11，负对照误报 0/12。
- `ctx.credentials` 触发补入 C-11.2，声明 credentials:read 不再反报 C-11.5。
- 文档口径：C-15 读脚本正文、C-17 readdir 可判、C-21 WARN-only、coverage 12/14、security 块 partial/读法、SECURITY 支持版本、advice 链接改 guide 0.5.0（security.md）。
- 10 个真实包 DSC-15/17 FAIL 0/10。

### Verified

- `npm test` 282/282。
## 1.6.1 — 2026-11-07

### Fixed

- DSC-17 现在识别 `os.homedir()`/`HOME`/`DSH_HOME` 与 `.dsh`/`.ssh`/`credentials`/`tokens` 的组合，并对“读取后外发”判 FAIL；恶意样本 s2 由 pass 改为 fail/exit 1。
- DSC-15 现在读取 `scripts` 引用的本地 JS/SH 内容（限包内、≤512 KB），`curl|sh`、`base64 -d`、`eval`、读凭据、下载执行判 FAIL；普通构建脚本仍 WARN。
- 10 个真实包回归：DSC-17 0 误报，DSC-15 0 新增 FAIL。

### Verified

- `npm test` 274/274。
## 1.6.0 — 2026-11-07

### Added

- 安全层 DSC-15…22：生命周期脚本、动态执行、敏感文件、外联端点、混淆/二进制、提示词注入线索、供应链、来源/完整性。
- `--scope security`：22 项检查，DSC-15/16/17/21 为强制；默认 14 项判定不变，security 块内 FAIL 封顶 WARN。
- 威胁模型与宿主边界（`34` §十）：同进程全权限、capabilities 不被宿主读取、sandbox 仅子进程文件写、approval 仅 tool ask、`!!js` 可执行、client 可调 Remote。
- `SECURITY.md`（漏洞报告）、`spec/dsc-clauses.json` 22 父/113 条、`spec/remediation.json` C-15…22、coverage 口径 22。

### Verified

- `npm test` 269/269；恶意 fixture（curl|sh、eval、凭据读取、typosquat）在 security scope 下 FAIL；10 个真实包默认 entry 10/10 exit 0。
- 静态安全 PASS 不代表无恶意；检查器不能证明安全。

## 1.5.0 — 2026-11-07

### Added

- 真实运行时检查：`--runtime`/`--host` 自动解析已装 dsh，在临时 HOME/DSH_HOME + env 白名单 + 超时硬杀下跑 DSC-04–09；报告新增 `runtimeChecks`（executed/modes/durationMs/isolation/checks）。
- Ed25519 证据签名：`sign-evidence.mjs keygen|sign|verify`（node:crypto，零依赖），`docs/SIGNING.md` 说明密钥与信任边界。
- 沙箱加固：`setpriv --no-new-privs --bounding-set=-all`、`nofile/fsize` rlimit、`unshare -Urm` + 只读 bind，记录 `hardening[]/hardeningDegraded[]`。

### Fixed

- `incomplete` 只由「mandatory 且 not-run」触发；静态 `partial` 不再把 ds-c bundle 判成 incomplete（修复前 dsh-fast 静态 ds-c 为 incomplete/exit 2，修复后 pass/exit 0）。
- runtime-child 写 fd3 后立即退出，不再被插件 timers 拖到超时导致六项全 not-run。
- 裸 `--runtime` 对带入口 bundle 直接走 server-entry；无入口纯 patch bundle 仍需 `--host`。
- `conformance.schema.json` 加 `runtimeChecks`。

### Verified

- `npm test` 249/249；真实宿主 dsh 0.2.1-rc.5：dsh-fast/mcp-panel 的 DSC-04–09 出 P/NA/P/P/W/P，security-pack 20.9s 完成 G0–G3。
- Windows 11 + node 24.22.1 实测：check 结果与 WSL 逐字一致；sandbox 记 degraded（unshare/prlimit 缺失），`flow collect --sandbox` 因 `npm.cmd` 无法无 shell spawn 记 not-run。

## 1.4.1 — 2026-11-06

- 建议的 `docsUrl` 基址跟到 `dsh-plugin-guide@v0.4.6`（FLOW 示例修正版），不再指向 0.4.4。

## 1.4.0 — 2026-11-06

### Added

- 契约文件：`spec/schemas/conformance.schema.json`（dsh-conformance/1）、`spec/dsc-clauses.json`（14 父 + 60 子）、`spec/schemas/boost-card.schema.json` + 示例、`spec/examples/flow-evidence.example.json`、`spec/coverage-contract.md`。
- `notChecked[]`：NA/ERROR/partial 项带 `reason` + `howToEnable`，报告能回答“为什么没查、怎么才能查”。
- bundle/client 的 DSC-04–09 静态子集（PASS/WARN + partial），不再 8 项全 NA。
- sidecar 加 `title/repo/license/scope/checks/checkedBy/notChecked`，种 20 条真实插件。
- `check` 默认 `--entry-claim static --no-exec`，报告标注“未执行插件代码”；host 版本三态（显式/环境/受控探测），默认不执行 PATH 的 dsh。

### Fixed

- C-2 range 解析：支持 `>= 0.2.2-rc.1`、hyphen/x-range、`||`，prerelease 语义对齐 node-semver；合法范围不再误报 C-2.1，覆盖判断归 C-2.2。
- DSC-01 检查全部 `exports` 子路径与 `main` 的真实文件存在性，坏入口 FAIL。
- DSC-10 文件截断改为 `NA + coverage=partial` 并明示截断位置，不再假报 ERROR。
- advice：54 条规则 docsUrl 改到具体小节；C-11.4/C-12.4 同证据合并；`package.json#field` 补 `file:line`。
- 文档纠偏：删除 BOOST 的 -17%/-33%/-25%、「保证更省」、「token 直接计价」，明确「BOOST 与 FLOW 不可比、性能未证实」。
- README/SUPPORTED 对齐 1.4.0，补 Windows 行与 14 项默认检查说明。

### Verified

- `npm test` 232/232。

## 1.3.0 — 2026-11-06

### Added

- `check [dir]` 子命令：默认 cwd、Markdown 报告（一句结论、≤3 条优先修复、分桶全表、advice、免责声明），`--json` 与 `--html`（单文件、内联 CSS、零依赖）。
- `spec/schemas/advice.schema.json`（`dsh-advice/1`），advice 逐条过 schema。
- 证据主体绑定：`--flow-evidence --dir` 校验 name/version/treeSha256/tarball 哈希，不一致即 `invalid`。
- CI 归属：collector 写 `producer.runUrl/repository/commit`，audit 标 `attestation: self-declared|ci`（不升级 claimLevel）。
- sidecar 生成（`publish/sidecar.json`，`dsh-market-sidecar/1`）、每日过期/撤回 workflow、离线包（~580 KB）。
- `SUPPORTED.md`（host × node × checker 矩阵 + 证据锚）与 `CHANGELOG-RULES.md`（规则级变更与影响面）。

### Fixed

- coverage 按全部 14 项统计，`na/notRun/error` 不再为 0；未查 C-3.1/3.2/3.5 时 `entryBlocking.pass=false`，并输出 `checked/notChecked`。
- 默认 runtime 锚改为宿主实际版本（`anchor.runtimeSource=host`），与 `--runtime-version` 不一致时 `anchor.suspect=true`；不再固定 `0.2.2-alpha.2`。
- 报告分三桶：`blocking`/`hygiene`（DSC-11/12/13 声明类）/`notChecked`，text 分组渲染，JSON 加 `buckets/metrics/headline`。

### Verified

- `npm test` 193/193（含 root `test/`）。

## 1.2.2 — 2026-11-06

- FLOW 沙箱：`flow collect --sandbox` 在 `unshare -Urn` + `prlimit` 下运行，记录 `sandbox{}`；env 白名单硬断言 token 不在子进程；进程组超时击杀；`producer.kind=sandbox` 仅当隔离项全部生效，否则 `sandbox-degraded` 且 audit 永不 runtime。测试 152 → 159。
- 发布包：`npm test` 改为 `run-tests.mjs`，未随包分发的 test 目录不再导致安装后测试失败。

## 1.2.1 — 2026-11-06

- **V2 核验修复**：`level-audit` 不再把结构自洽的 self-attested/ci-attested `dsh-flow-evidence/2` 判成 FLOW `runtime`。只有 `claims.claimLevel=sandbox-attested` 或 `producer.kind=sandbox` 才允许 `runtime`；self/ci 的 `passed` 计数保留但 state 记 `not-run`，reason 为 `<claimLevel> evidence; runtime requires sandbox-attested`。`spec/flow-evidence.schema.json` 的 `claims`/`producer.kind` 补充了该判定说明。`advice[]` 新增 `gate`（该 check 的最终结果 PASS/WARN/FAIL），`severity` 跟随 `gate`：ENTRY static claim 把 DSC-02 降为 WARN 时，C-2.1 的 FAIL detail 仍保留在 `reason`，但 advice severity 为 WARN。测试 150 → 152。
- **FLOW 证据链**：新增 `spec/flow-evidence.schema.json`（`dsh-flow-evidence/2`）与 `40-checker/src/flow-evidence.mjs`。`level-audit --flow-evidence` 只接受 v2；v1（`dsh-flow-journey/1`、`dsh-flow-runtime/1`）与裸 `{Jx:{status}}` 标 `deprecated`，不计 pass。每个 J 须有 `checks[]` 且全部 `exitCode === 0`、断言成立、至少一条非 `static` 观测检查才计 pass（`warn`/`blocked`/`na`/`static` 不计 8/8）。v2 的 `chain.evidenceHash` 由 audit 重算，改动一个字节即 `invalid`。
- **collector**：新增 `40-checker/bin/dsh-flow-collect.mjs`（根入口 `bin/dsh-flow-collect.mjs`，并支持 `dsh-levels flow collect`）。只读副本 + 前后 `treeSha256` 一致、`npm pack --ignore-scripts` 的 integrity/tarballSha256、`git rev-parse` commit、临时 HOME/DSH_HOME、失败五要素提示（子检查/命令/exitCode/stderr 末 20 行/日志绝对路径 + 条款锚）；前置缺失记 `blocked` 且 exit 0，真失败 exit 1。
- **安全**：新增 `40-checker/src/sandbox-env.mjs` 白名单 env。`src/cli.mjs` 的 runtime-child/bundle-smoke 子进程、`bundle-smoke.mjs`/`runtime-child.mjs` 进程内 boot、`m2-runner.mjs`、`journey-runtime.mjs`、`journey-config-observe.mjs`、`flow-sample-ci.mjs`、`host-farm.mjs`、`entry18-web.mjs` 不再把 `process.env` 透传给被检插件/宿主 boot。
- 测试 137 → 149（新增 `40-checker/test/flow-evidence.test.mjs`：v1 不再 pass、v2 伪造 checks/exitCode 不 pass、篡改链路 invalid、blocked 不判 fail、collector 产物可被 audit 读取、失败五要素提示、env 白名单）。
- 发布包不再包含 `40-checker/test`：该目录依赖仓库内 fixtures，装到用户环境后无法自测，`npm test` 会在 tarball 内失败。`npm test` 152/152。

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

## 1.6.10 — 2026-11-13

### Fixed

- **C-11.5 no longer calls a static blind spot "over-declaration".** The clause fired for plugins that declare `fs:read`/`fs:write` and use `node:fs` directly, because the only trigger was `ctx.fs`; the remediation even told authors to delete a declaration they were really using. Direct `node:fs` reads/writes are now observation evidence (only for C-11.5 — they never produce a new C-11.2 FAIL), and `ctx.fs` reads/writes are observed separately instead of `fs:write` borrowing `fs:read`'s hit.
- **C-11.5 records `NA` instead of `WARN` when nothing can be observed**: no source files were scanned, or the capability has no static observation surface in this checker version (`credentials:provider`). Wording across `31-DS-C条款.md`, `60-权限与标注规范.md`, `spec/dsc-clauses.json` and `spec/remediation.json` now says "静态未观测（不等于未使用）" and no longer advises deleting a real declaration.

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

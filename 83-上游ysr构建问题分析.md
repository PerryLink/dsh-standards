# 83 · 上游 `dsh-vision-router` 构建问题分析

> **版本**：v1.0.0-rc.1 ｜ **日期**：2026-10-31
> **分析对象**：`ysr666/dsh-vision-router@3.1.0`（GitHub `main` 源码 checkout + npm 发布包）。
> **依据**：本机 `/tmp/dsh-verify-samples/ysr666__dsh-vision-router`（源码）、`/tmp/ysr-pkg/pkg`（npm `dsh-vision-router@3.1.0`）、`/tmp/ysr-build.log`（构建日志）、`41` §4.4、`50` §3.7。
> **结论一句话**：**是上游源码构建/依赖解析的可复现性问题，不是"没考虑本标准"的设计选择。** 发布包里有 `lib/session-affinity.js`；源码 checkout 在混合 zod 版本下 `tsc` 失败，导致该文件没被生成，`src/index.js` 的相对 import 因而失败。

---

## 〇、最新状态（2026-10-31）

- 最新 commit：`7b0dd04`（fix build）；`node scripts/build-source-artifacts.mjs` 成功生成 183 个 runtime artifacts。
- `lib/session-affinity.js` 存在；`public-entry.js` 存在。
- 源码 entry 能 import 到 `apply`；L1 失败点是 checker stub 的 `llm.registerAdapter`，不是插件缺文件。
- 结论不变：**上游构建 bug 已修**；检查器的夹具归因仍需 `blocked`，不能把 stub gap 判插件 FAIL。

## 一、现象

| 对象 | 结果 | 说明 |
|---|---|---|
| 源码 checkout + `--treat-as-plugin` | **FAIL** | `Cannot find module '.../src/lib/session-affinity.js'` |
| 源码 `npm run build`（host farm） | **构建失败** | 日志有 `error TS`，zod 4.4.3 vs 4.6.7 类型不兼容 |
| npm 发布包 `dsh-vision-router@3.1.0` | 可导入 | `lib/session-affinity.js` 存在（3,437 bytes） |
| npm 发布包 + `--treat-as-plugin` | `ERROR/not-run` | 导入通过，但 `llm.registerAdapter` 夹具不完整，不判 FAIL |

---

## 二、证据

### 2.1 源码确实有这个文件，也进了构建配置

- `src/lib/session-affinity.ts` 存在（3,725 bytes）。
- `tsconfig.build.json:49-50` 明确包含：
  - `src/lib/session-affinity.ts`
  - `src/lib/session-affinity-runtime.ts`
- `src/index.js:57-58` 从 `./lib/session-affinity.js` 与 `./lib/session-affinity-runtime.js` 导入。

所以不是"作者删了文件"或"故意不导出"。

### 2.2 构建脚本的路径是对的

- `package.json`：`"build": "node scripts/build-source-artifacts.mjs"`。
- `scripts/build-source-artifacts.mjs:42-54`：把 `tsc` 的输出从临时目录 `copyCompiledTree` 到包根。
- `:83-84`：`if (compiled.status !== 0) process.exit(...)`，然后才 copy。
- 结论：**`tsc` 失败时不会 copy**；`lib/session-affinity.js` 缺失是"构建在 copy 之前失败"的直接后果。

### 2.3 失败原因：zod 版本不一致

构建日志（`/tmp/ysr-build.log`）的核心错误：

```
Type '.../zod@4.4.3/.../$ZodType<...>' is not assignable to type
'.../plugins/ysr.../node_modules/zod/v4/core/schemas/$ZodType<...>'
Type '_zod.version.minor' ... Type '4' is not assignable to type '6'
```

即：

- host farm 解析到 `<dsh-checkout>/node_modules/.pnpm/zod@4.4.3`；
- 插件自己的 `node_modules` 解析到 `zod 4.6.7`；
- TypeScript 同时看到两个 zod 的 `$ZodType`，类型不兼容；
- `tsc` 退出非零，`build-source-artifacts.mjs` 在 copy 前退出，于是 `lib/session-affinity.js` 没生成。

### 2.4 发布包证明上游 CI 的构建是通的

- `npm pack dsh-vision-router@3.1.0` 解包后，`lib/session-affinity.js` 存在（3,437 bytes）。
- 说明上游在**它自己的 lockfile/CI 环境**里能构建；问题出在"源码 checkout + 我们的 host farm + `npm install` 未走 lockfile"这套组合。

---

## 三、这是"bug"还是"没考虑这边的标准"？

**是构建/依赖可复现性问题，不是设计上没考虑 DS-C。**

三条理由：

1. **文件在、构建配置在、发布包在**：没有"故意不提供"的迹象。
2. **失败点是 `tsc` 的 zod 类型冲突**：属于依赖解析/构建环境问题，不是插件行为设计。
3. **发布包可导入**：如果作者的设计是"源码入口不可运行"，发布包也不会带 `lib/session-affinity.js`；它带了，说明预期就是构建后可用。

但它确实暴露了一个**上游可改进点**：

- `npm install`（而非 `npm ci`）在混合 workspace 下可能装出两个 zod；
- `tsc` 类型错误会让构建在 copy 前退出，但 README/CI 未把"构建成功"作为发布前置断言；
- 源码 README 的"clone + build"路径在干净环境里不一定可复现。

---

## 四、对 DS-C / 检查器的含义

1. **C-1.2（入口/相对文件）判 FAIL 是对的**：源码 checkout 的相对 import 确实指向不存在的文件；这不是检查器误报。
2. **C-4 对发布包判 `ERROR/not-run` 也是对的**：导入通过、apply 因夹具 `llm.registerAdapter` 不完整而失败；无法归因到插件，不能 FAIL。
3. **M1/M2 应优先用 npm tarball，而不是 git HEAD 源码**：T3 的 `source: npm` 精确版本正是为此；源码 checkout 只适合 L0。
4. **host farm 应使用 `npm ci`/lockfile**：`npm install` 在混合 workspace 下会引入双 zod；这是 T2 phase 2 的 host farm 改进项，不是插件缺陷。

---

## 五、建议的上游修复（不提交，仅建议）

1. **构建脚本加产物断言**：在 `build-source-artifacts.mjs` copy 后断言 `lib/session-affinity.js` 存在；缺失即 `exit 1`，不要留下"半成品 lib"。
2. **用 `npm ci` + 锁文件构建**：CI 里 `npm ci`，避免 host/插件两套 zod。
3. **把 zod 固定到单一版本**：`devDependencies`/`overrides` 锁定 `zod`，或把类型依赖改为 `import type` 并避免跨副本 `$ZodType`。
4. **在 README 的"从源码构建"一节加"已验证 Node/pnpm/zod 版本"**，并加一条 `node scripts/build-source-artifacts.mjs --check` 的 CI gate（脚本已有 `--check` 分支）。
5. **发布前跑 `npm pack` + 解包断言**：确认 `lib/session-affinity.js` 在 tarball 里（`release-package-content-identity.mjs` 已有类似机制，可扩展）。

---

## 六、复现命令

```bash
# 1. 源码 checkout
git clone https://github.com/ysr666/dsh-vision-router.git /tmp/ysr-src
cd /tmp/ysr-src && npm install && npm run build
ls lib/session-affinity.js   # 预期：缺失（本机 zod 冲突时）

# 2. npm 发布包
npm pack dsh-vision-router@3.1.0 --pack-destination /tmp/ysr-pkg
cd /tmp/ysr-pkg && tar -xzf dsh-vision-router-3.1.0.tgz
ls package/lib/session-affinity.js   # 预期：存在

# 3. 检查器
cd 40-checker
node bin/dsh-plugin-verify.mjs /tmp/ysr-src --treat-as-plugin \
  --runtime /path/to/cordis/lib/index.js --runtime-version 0.2.2-alpha.2
# 源码：C-4 FAIL（相对文件缺失）
node bin/dsh-plugin-verify.mjs /tmp/ysr-pkg/package --treat-as-plugin \
  --runtime /path/to/cordis/lib/index.js --runtime-version 0.2.2-alpha.2
# 发布包：C-4 ERROR/not-run（夹具桩不完整），不 FAIL
```

---

## 七、下一步建议（按优先级）

1. **T2 host farm 改用 `npm ci`/lockfile**：消除双 zod；这是当前 14/14 里唯一一个源码构建缺口的直接修法。
2. **给 C-1.2 增加"发布包 vs 源码"双模式说明**：源码模式缺 `lib/` 可 WARN；发布 tarball 缺入口必须 FAIL。当前检查器已按此区分，文档需要写死。
3. **把本案例加入 `70` 的 N 系列**：作为"源码构建不可复现"的反面案例，绑定 C-1.2/C-4 与 T3 的 npm source 优先级。

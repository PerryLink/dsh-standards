# 三项「非 web 阻塞/失败」复核报告

> **范围**：18 包运行时集中被 92 号文档判为「plugin FAIL / host gate blocked」的 3 个非 web 项。
> **环境**：本机 DSH `0.2.1-rc.5`（`$D`）＋标准锚 `0.2.2-alpha.2`（`/tmp/dsh022`，父级 fullbase 使用的同一份安装）；Node `v24.22.1`；pnpm `12.15.0`。
> **方法**：直接 import 已安装 `@deepseek-ai/dsh-app-boot/lib/index.js` 的 `loadOverlayPatches` / `composeEntries` / `boot` / `evaluatePluginCompatibility` / `getDshRuntimeVersion`；真实跑 postinstall；真实跑 `dsh plugin add`；未授予任何 version exemption；未改动上游仓库、`92-*`、`81-*`。
> **原始证据**：`evidence/`（baseline 与含 profile 层的 G0–G4 JSON、G2 rejection 原文、semver 矩阵、postinstall 记录）。

---

## 〇、结论先行

| 项 | 先前分类 | 核实分类 | 一句话依据 |
|---|---|---|---|
| `YuJunZhiXue/dsh-purge@1.1.85` | **plugin FAIL**（主行未插入） | **fixture-limitation** | 根行由 `postinstall` 写进 profile 的 `cordis.patch.yml`；把它作为组合的最后一层后，`dsh-purge` 根行 **ACTIVE**，G4 `ok=true`。夹具以 `--ignore-scripts` 安装并删除 `scripts`，所以永远看不到这一行 |
| `dsh-telemetry-redactor@0.1.0` | host/gate blocked（G2 reject，文档写成 SKIP） | **host-incompatible** | 精确 reject：`@deepseek-ai/dsh-session-telemetry >=0.1.0-rc.5 <0.2.0` 不满足 0.2.x；gate 行为正确，属上游 peer range 过窄 |
| `dsh-verification-receipt@0.1.0` | host/gate blocked（G2 reject，文档写成 SKIP） | **host-incompatible** | 精确 reject：`@deepseek-ai/dsh-session >=0.1.0-rc.5 <0.1.0`；该 range 只接受 0.1.0 预发布版，连 0.1.0 正式版都不接受，是上游元数据 bug，不是对 0.2.x 的有意硬停 |

**一句话**：3 项里 **0 个是 plugin-defect**，1 个是夹具没建模安装期写入，2 个是上游 peer 元数据过窄（宿主 gate 拒绝正确）。先前文档的「3 个明确不可运行」应改为 **2 个 host-gate REJECT + 1 个待 web-app 判定**。

---

## 一、`YuJunZhiXue/dsh-purge@1.1.85`：不是 plugin FAIL

### 1.1 先前说法

`92-兼容运行时实测.md`：

- §二：`FAIL | PASS | ADMIT | 2/3 | FAIL（plugin；主行未插入）`
- §三-A：「`cordis.patch.yml` 只 `insert` 了 `dsh-purge/redteam`、`/store`、`/ui`，**从未插入 `name: dsh-purge` 根行**……**不是宿主/noise，是 patch 形态缺陷**」
- §四：「G4 14/15 有 client 的包有 root row（YuJun 无）」

### 1.2 postinstall 到底做什么、写到哪个文件

`/tmp/yj-purge`（commit `9716ca3e8711c7bb680668d34cc2e93e184028ad`，v1.1.85）：

- `package.json`：`"postinstall": "node scripts/ensure-profile-bundle.mjs"`
- `scripts/ensure-profile-bundle.mjs`：
  - `findProfileDir()` 以 `INIT_CWD` → `npm_config_local_prefix` → `cwd` 为种子向上找 8 层，命中 `name` 以 `dsh-profile-` 开头、或带 `dsh.profile.bundles` 数组的 `package.json`；
  - `ensureProfileBundles(profileDir)`：把 `"dsh-purge"` 追加进 **`<profile>/package.json` 的 `dsh.profile.bundles`**；
  - `ensureProfileBodyInsert(profileDir)`：把 `INSERT_BLOCK` 写进 **`<profile>/cordis.patch.yml`**（对宿主生成的 `[]` 空 flow 序列有 #191 特判，不会追加成第二个 YAML 文档）；
  - `ensurePnpmAllowBuild(profileDir)`：在 `<profile>/pnpm-workspace.yaml` 写 `allowBuilds:` 下的 `dsh-purge: true`。
- `cordis.patch.yml` 顶部注释明确写：**本体 insert 写在用户层 `profile/cordis.patch.yml`（postinstall / 演练台自愈补）；这里只改已入队条目的 inject/config；再 insert 一次会 already queued（#152/#154/#159）**。

`INSERT_BLOCK` 的实际内容（真实跑出来的文件）：

```yaml
- insert:
    - id: dsh-purge
      name: dsh-purge
      inject: [systemPrompt, tools]
      config:
        enabled: true
        stripMnemon: true
        capabilityProtocol: true
        hooksDenyBypass: true
```

### 1.3 真实 postinstall 路径（两条独立证据）

**(A) 直接按生命周期调用脚本**（cwd=包目录，`INIT_CWD`=合成 profile）：

```text
$ cd /tmp/triage-farm/plugins/dsh-purge
$ INIT_CWD=/tmp/triage-profile node scripts/ensure-profile-bundle.mjs
dsh-purge: appended to bundles (/tmp/triage-profile)
dsh-purge: wrote body insert (/tmp/triage-profile/cordis.patch.yml)
dsh-purge: allowed pnpm build for dsh-purge
exit=0
```

**(B) 真实 `dsh plugin add`**（隔离 `DSH_HOME`，按 README 的 codeload 地址 + 两个 allow-build 键）：

```text
$ DSH_HOME=/tmp/triage-dsh-home3 dsh plugin --profile web add \
    --allow-build=dsh-purge \
    --allow-build='dsh-purge@https://codeload.github.com/YuJunZhiXue/dsh-purge/tar.gz/refs/heads/master' \
    'https://codeload.github.com/YuJunZhiXue/dsh-purge/tar.gz/refs/heads/master'
...
node_modules/dsh-purge postinstall$ node scripts/ensure-profile-bundle.mjs
node_modules/dsh-purge postinstall: dsh-purge: appended to bundles (/tmp/triage-dsh-home3/profiles/web)
node_modules/dsh-purge postinstall: dsh-purge: wrote body insert (/tmp/triage-dsh-home3/profiles/web/cordis.patch.yml)
node_modules/dsh-purge postinstall: dsh-purge: allowed pnpm build for dsh-purge
node_modules/dsh-purge postinstall: Done
...
exit=0
```

安装后 profile：`dsh.profile.bundles = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-purge"]`；`cordis.patch.yml` 含上面的 insert 块；`node_modules/dsh-purge/package.json` 为 1.1.85。postinstall 生成的内容与 (A) 一致（只多宿主自带的三行文件头注释）。

### 1.4 组合 + 真实 boot：根行到底激活不激活

用真实 `loadOverlayPatches` + `composeEntries` + `boot`，按宿主真实层序组合：

```text
[base patch] → [包 cordis.patch.yml] → [profile cordis.patch.yml（postinstall 写的用户层）]
```

**基线（只看包 patch，等于 bundle-smoke 现状）**，0.2.2-alpha.2：

```json
"g1": { "rows": 100, "targetRows": 3,
        "warnings": [ ..., "patch: entry \"dsh-purge\" not found" ] },
"g3": { "state": "partial", "active": 2,
        "rows": [ redteam=2, redteam-store=2, redteam-ui=0 ] },
"g4": { "rootRows": [], "ok": false }
```

**加入 postinstall 的 profile 层后**，0.2.2-alpha.2：

```json
"g1": { "rows": 101, "targetRows": 4,
        "warnings": [ ..., "patch: entry \"dsh-purge\" not found" ] },
"g3": { "state": "partial", "active": 3,
        "rows": [
          { "id": "include:dsh-purge-redteam",       "state": 2 },
          { "id": "include:dsh-purge-redteam-store", "state": 2 },
          { "id": "include:dsh-purge-redteam-ui",    "state": 0 },
          { "id": "include:dsh-purge",               "state": 2 }   // ← 根行 ACTIVE
        ] },
"g4": { "rootRows": [ { "id": "dsh-purge", "name": "dsh-purge",
                        "inject": ["systemPrompt","tools"],
                        "config": { "enabled": true, "stripMnemon": true,
                                    "capabilityProtocol": true, "hooksDenyBypass": true } } ],
        "ok": true }
```

0.2.1-rc.5 上的激活结果相同（`include:dsh-purge state=2`，active 3/4，g4 ok=true；行数因 base 层不同为 100 而非 101）。唯一 pending 的 `dsh-purge-redteam-ui` 在等 `webServer`——这是 base-only 组合的已知缺口，不是插件缺陷（与 king/mmparko 的 redteam-ui 同类）。

> 备注：包 overlay 里的 `- id: dsh-purge` override 在 postinstall 路径上会被跳过（`patch: entry "dsh-purge" not found`），因为**bundle 层先于用户层应用**。但 overlay 里 16 个 config 值与 `lib/index.js` 的 `DEFAULTS` 完全相同，所以行为无差别；这是作者的一处小不一致（overlay config 在该路径上无效），不是「主行未插入」。

### 1.5 夹具为什么必然判错

父级当前 fullbase 结果（`40-checker/results/entry/18/fullbase/YuJunZhiXue__dsh-purge.json`，0.2.2-alpha.2）自己记录：

```json
"installScripts": "skipped",
"installCommand": "npm install --omit=dev --ignore-scripts --legacy-peer-deps --no-package-lock --no-audit --no-fund",
"manifestRewrite": "removed scripts"
```

即：夹具**以 `--ignore-scripts` 安装，并且从 manifest 里删掉 `scripts`**。postinstall 永远不可能运行，profile 层永远是 `[]`，根行当然不存在。这是夹具的已知安全取舍，不是插件的 patch 缺陷。

### 1.6 结论与最小改动

- **verified classification：`fixture-limitation`**。
- 证据链：postinstall 源码与真实运行 → 真实 `dsh plugin add` 写出 profile 根行 → 含 profile 层的真实 composition/boot 中根行 `state=2`、G4 `ok=true` → fullbase 结果自述 `installScripts: skipped`。
- **最小上游改动：无**（就「从未插入根行」这个断言而言）。需要改的是 **checker 夹具**：在组合里加入安装期生成的 profile `cordis.patch.yml`（或先跑一次 postinstall），否则这类「安装期 profile 写入」的 bundle 都会被误判。
- 插件侧可选打磨（不影响本次结论）：把完整 16 项 config 放进 `INSERT_BLOCK`，或删掉在 postinstall 路径上无效的 overlay override。
- **安装前提（需在文档里保留）**：pnpm 12 默认拦 build script；不带 `--allow-build` 的普通 `dsh plugin add` 会以 `ERR_PNPM_IGNORED_BUILDS` 退出且不写根行。README 已给出 allow-build 与手动 `ensure-profile-bundle.mjs` 兜底；这是安装前提，不是补丁形态缺陷。file-tarball 场景下裸包名键与 full spec 键都未放行（两次实测均失败），README 的 codeload 写法可用。

---

## 二、`dsh-telemetry-redactor@0.1.0`：精确拒绝原因

### 2.1 真实 G2 调用

```js
import { evaluatePluginCompatibility, getDshRuntimeVersion }
  from '<dsh>/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js'
evaluatePluginCompatibility(manifest, {}, getDshRuntimeVersion())
```

manifest 来自 `npm pack dsh-telemetry-redactor@0.1.0`（解包于 `/tmp/triage-pkgs/telemetry`）。

0.2.2-alpha.2 下的**完整返回对象**（0.2.1-rc.5 只差 `runtimeVersion` 字段）：

```json
{
  "name": "dsh-telemetry-redactor",
  "version": "0.1.0",
  "runtimeVersion": "0.2.2-alpha.2",
  "requirements": {
    "@deepseek-ai/dsh-session-telemetry": ">=0.1.0-rc.5 <0.2.0"
  },
  "exempted": false
}
```

宿主给出的完整诊断原文：

```text
Plugin dsh-telemetry-redactor@0.1.0 is incompatible with dsh 0.2.2-alpha.2: requirements {"@deepseek-ai/dsh-session-telemetry":">=0.1.0-rc.5 <0.2.0"}. Running it may cause crashes or data loss. Update the plugin or install a plugin version compatible with this dsh runtime. To accept this risk explicitly, grant the exact-version exemption for dsh-telemetry-redactor@0.1.0 on dsh 0.2.2-alpha.2 with `dsh plugin allow-version` or the plugin manager, then retry the installation or restart dsh. Exact-version exemption: not active.
```

### 2.2 哪个 peer 失败、为什么

- 失败 peer：**`@deepseek-ai/dsh-session-telemetry`**，range `>=0.1.0-rc.5 <0.2.0`。
- 安装的运行时 peer 版本：本机 0.2.1-rc.5 安装为 `0.2.1-rc.5`，锚 0.2.2-alpha.2 安装为 `0.2.2-alpha.2`；两者都在 range 之外。
- semver（`includePrerelease: true`，宿主就是这么传的）：

| 版本 | 满足 `>=0.1.0-rc.5 <0.2.0` |
|---|---|
| `0.1.0-rc.5` / `0.1.0` | ✅ |
| `0.2.0-rc.1` | ✅（预发布 < `0.2.0`） |
| `0.2.0` / `0.2.1-rc.5` / `0.2.2-alpha.2` | ❌ |

- 归因：**上游 peer range 的 upper bound 停在 0.1.x**，因此整个 0.2 稳定线都被排除；插件运行时不 import 这个 peer（`lib/index.js` 只 import `@deepseek-ai/schemastery`，通过 `ctx.on('session-telemetry/record', …)` 接入），所以这是**兼容声明过期**，不是模块链接问题。宿主 gate 的拒绝是**正确行为**。
- 判定：**`host-incompatible`**（gate 正确，原因在上游元数据）。

### 2.3 最小上游修复

```jsonc
"@deepseek-ai/dsh-session-telemetry": ">=0.1.0-rc.5 <0.3.0"   // 在 0.2.x 上实测后
// 或仅支持现代运行时：">=0.2.1-rc.5 <0.3.0"
```

**不得**授予 exemption；本次也未授予。

---

## 三、`dsh-verification-receipt@0.1.0`：精确拒绝原因

### 3.1 真实返回对象

manifest 来自 `npm pack dsh-verification-receipt@0.1.0`（`/tmp/triage-pkgs/verification`）：

```json
{
  "name": "dsh-verification-receipt",
  "version": "0.1.0",
  "runtimeVersion": "0.2.2-alpha.2",
  "requirements": {
    "@deepseek-ai/dsh-session": ">=0.1.0-rc.5 <0.1.0"
  },
  "exempted": false
}
```

完整诊断原文：

```text
Plugin dsh-verification-receipt@0.1.0 is incompatible with dsh 0.2.2-alpha.2: requirements {"@deepseek-ai/dsh-session":">=0.1.0-rc.5 <0.1.0"}. Running it may cause crashes or data loss. Update the plugin or install a plugin version compatible with this dsh runtime. To accept this risk explicitly, grant the exact-version exemption for dsh-verification-receipt@0.1.0 on dsh 0.2.2-alpha.2 with `dsh plugin allow-version` or the plugin manager, then retry the installation or restart dsh. Exact-version exemption: not active.
```

### 3.2 `<0.1.0` 到底是什么 range

- semver：`>=0.1.0-rc.5 <0.1.0` **不是空集**，但它只接受 **0.1.0 的预发布版**（`0.1.0-rc.5` … `0.1.0-rc.8`）；`0.1.0` 正式版、`0.1.7-rc.2`、`0.2.x` 全部为 false。
- 若不加 `includePrerelease`，该 range 才是空集；宿主固定传 `{ includePrerelease: true }`，所以它恰好放行 0.1.0-rc.*。
- npm 上 `@deepseek-ai/dsh-session` **从未发布过 `0.1.0` 正式版**：版本序列是 `0.1.0-rc.2/3/6/7/8 → 0.1.1-rc.1 …`。包发布于 2026-08-14（0.1.0-rc.6 之后一天），当时这个 range 等价于「当前 0.1.0 预发布线」。
- 但这是一个**永远无法容纳后续版本**的写法：连 `0.1.0` 正式版都不接受，更不用说 0.2.x。0.2.x 在发布时还不存在，因此**不是针对 0.2.x 的有意硬停**，而是 upper bound 写错（应为 `<0.2.0`，更现实是 `<0.3.0`）。
- 另一个细节：`package.json` 的 `peerDependenciesMeta` 把 `@deepseek-ai/dsh-session` 标成 `optional: true`，但宿主 `unmetRequirements` 对**所有** `@deepseek-ai/dsh*` peer 一视同仁（`dsh-app-boot/lib/index.js` 约 291 行），不看 optional，所以 gate 仍然触发。插件运行时不 import `@deepseek-ai/dsh-session`（只用 `sessions` 服务与 `session/event`），peer 是纯声明。
- 判定：**`host-incompatible`**；子归因「上游元数据 bug（over-tight upper bound），不是 intentional hard stop」。gate 拒绝正确。

### 3.3 最小上游修复

```jsonc
"@deepseek-ai/dsh-session": ">=0.1.0-rc.5 <0.3.0"   // 在 0.2.x 上实测后
```

只把 `<0.1.0` 改成 `<0.2.0` 是最小笔误修复，但**仍然拒绝 0.2.1/0.2.2 锚**，不足以让当前标准锚通过。也可在确认无运行时依赖后删掉这个 optional peer（但会失去兼容声明）。**不得**授予 exemption。

---

## 四、18 包汇总应怎么改

> 计数中标注 **derived** 的需要全量重跑确认；其余有本次实测或父级 fullbase 分片直接支持。

| 92 号文档位置 | 现文 | 建议改为 | 依据 |
|---|---|---|---|
| §一 总表 | 明确不可运行 **3/18**（1 plugin FAIL + 2 host/gate） | **2/18**（0 plugin FAIL + 2 host-gate **REJECT**）；YuJun 移入「无法判定/partial（等 webServer）」 | 本次实测 |
| §一 总表 | 无法判定（缺 web-app）**4/18** | **5/18**（+YuJun；其 redteam-ui 等 webServer） | 本次实测 |
| §二 明细 YuJun 行 | `FAIL … 2/3 … FAIL（plugin；主行未插入）` | `核心真跑 … root row ACTIVE（含 install-time profile layer）；3/4 active，redteam-ui 等 webServer … fixture-limitation` | `include:dsh-purge state=2` |
| §一 总表 | 主行（root row）ACTIVE **11/18** | **12/18**（derived，+YuJun） | YuJun 根行现为 ACTIVE |
| §四 本轮结果 | G4 **14/15** 有 client 的包有 root row（YuJun 无） | **15/15**（YuJun 有；前提是组合含 install-time profile layer） | `g4.rootRows=[dsh-purge]`, `ok=true` |
| §一/§二 gate 列 | 2 个 **SKIP**（telemetry、verification） | 2 个 **REJECT**；SKIP 与宿主 gate 语义不符 | `evaluatePluginCompatibility` 返回 rejection 对象，不是 `undefined` |
| §六 最小验收 | `interop-failed 3`，`interop-unavailable 4`，`interop-runtime (root only) 11/18` | `interop-failed 2`（均 host-gate REJECT），`interop-unavailable 5`（+YuJun），`interop-runtime (root only) 12/18`（derived） | 同上 |
| §三-A 标题与正文 | 「补丁本身（唯一装完也不能跑的补丁类）… patch 形态缺陷」 | 改为「安装期 profile 写入（fixture 未建模）」：bundle patch 只负责 redteam 子行与已入队行 override；根行由 postinstall 写 profile；`--ignore-scripts` 夹具看不到 | fullbase `installScripts: skipped` + profile-aware boot |

**不需要改的**：`真实 boot 18/18 BOOT_OK`；`G3 base-only 全行 ACTIVE 9/18`（YuJun 由 2/3 变 3/4，仍非全 ACTIVE）；`施加 gate 后全 ACTIVE 7/18`（YuJun 仍有一行等 webServer）；`interop-runtime 7/18`。

---

## 五、复现命令

```bash
D=/mnt/c/Users/zzhdz/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh
D2=/tmp/dsh022   # 0.2.2-alpha.2 锚

# 1) 基线：只组合 base + 包 patch（现有 bundle-smoke 语义）
node 40-checker/scripts/bundle-smoke.mjs \
  --package /tmp/triage-farm022/plugins/dsh-purge \
  --host $D2/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js \
  --base $D2/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml \
  --bare /tmp/triage-farm022 --json --timeout 200000

# 2) 加入 postinstall 生成的 profile 层（/tmp/triage 里对 bundle-smoke 的最小副本加了 --profile）
node /tmp/triage/bundle-smoke-profile.mjs \
  --package /tmp/triage-farm022/plugins/dsh-purge \
  --host $D2/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js \
  --base $D2/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml \
  --profile /tmp/triage-dsh-home3/profiles/web/cordis.patch.yml \
  --bare /tmp/triage-farm022 --json --timeout 200000

# 3) G2：真实 evaluatePluginCompatibility
node /tmp/triage/g2-eval-022.mjs     # 锚 0.2.2-alpha.2
node /tmp/triage/g2-eval.mjs         # 本机 0.2.1-rc.5

# 4) 真实 postinstall / dsh plugin add（隔离 DSH_HOME）
cd /tmp/triage-farm/plugins/dsh-purge
INIT_CWD=/tmp/triage-profile node scripts/ensure-profile-bundle.mjs
DSH_HOME=/tmp/triage-dsh-home3 dsh plugin --profile web add \
  --allow-build=dsh-purge \
  --allow-build='dsh-purge@https://codeload.github.com/YuJunZhiXue/dsh-purge/tar.gz/refs/heads/master' \
  'https://codeload.github.com/YuJunZhiXue/dsh-purge/tar.gz/refs/heads/master'
```

说明：`/tmp/triage/bundle-smoke-profile.mjs` 是 `40-checker/scripts/bundle-smoke.mjs` 的**临时副本**，只加了一个 `--profile <patch>` 参数把用户层并入组合；仓库里的 checker 未改动。

---

## 六、边界与未验证项

1. **没有 boot 完整 web profile**（会 bind 端口/起前端）。已证明根行在 base-only 下 ACTIVE；`redteam-ui` 仍 pending on `webServer`，不声称其在完整 web profile 下 ACTIVE。
2. 真实 `dsh plugin add` 用的是本机 0.2.1-rc.5 CLI + 内置 pnpm 12.15.0（Linux）。Windows/pnpm 11 的 allow-build 键匹配未测；README 同时给了两个键。
3. `/tmp/dsh022` 是父级提供的 0.2.2-alpha.2 安装，app-boot 与 base patch 按原样使用。
4. 未修改上游仓库；`/tmp/yj-purge` 只是本地 clone（npm pack 产物已移出该目录）。
5. 未授予、也未申请任何 version exemption。

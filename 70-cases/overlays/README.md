# 补字段 overlay（T5）

这四个 JSON 是对真实样本 `package.json` 的**深合并补丁**，用于验证 T4 字段（`dsh.capabilities` / `dsh.labels` / `engines.dsh` / `upstream` / `disclosure`）的效果。

**不要**直接应用到上游仓库。用 `apply-overlay.mjs` 复制到 `/tmp` 后再跑检查器：

```bash
cd 40-checker
node scripts/apply-overlay.mjs \
  --package /tmp/dsh-verify-samples/mmparko__dsh-purge \
  --overlay ../70-cases/overlays/mmparko__dsh-purge.json \
  --out /tmp/dsh-overlay/mmparko__dsh-purge
node bin/dsh-plugin-verify.mjs /tmp/dsh-overlay/mmparko__dsh-purge --format text
```

| overlay | 目标样本 | 补的标签 | 预期 |
|---|---|---|---|
| `mmparko__dsh-purge.json` | mmparko/dsh-purge | `prompt-modification` / `mirror` / `remote-access` | FAIL → WARN（C-2 消除；C-11/C-12 仍有 danger WARN） |
| `Ebony-Vinyl__dsh-our-free-model.json` | Ebony-Vinyl/dsh-our-free-model | `third-party-model-provider` | WARN → WARN（C-2/C-11/C-13 消除；C-1 private/C-10 保留） |
| `SeaOf0__dsh-redteam-model.json` | SeaOf0/dsh-redteam-model | `red-team` / `prompt-modification` / `remote-access` | WARN → PASS |
| `shaobeichen__dsh-pocket.json` | shaobeichen/dsh-pocket | `remote-access` | FAIL → PASS |

结果文件：`40-checker/results/patched/*.overlay.json`。

规则：

- 数组替换、对象深合并；
- `repository.url` 必须指向**本 fork**，否则 C-13.3 会把 `upstream` 判成自指；
- `mirror` 必须同时有 `upstream`/`mirrorOf`；
- `red-team` 必须有 `usageScope`；
- 这些是测试 overlay，不是上游 PR。

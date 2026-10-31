# Sample frame (60 + 20)

`frame.json` is a reproducible **frame**, not a result set.

- 60 main samples + 20 low-star samples, selected from `topic:dsh-plugin` with `size:<50000`.
- Full clone static executed in CI: `results/sample60-ci` (0/55/5), `results/sample20-ci` (0/19/1).
- Remote-manifest results also kept: `results/sample60`/`sample20`.
- Full clone/dependency/runtime execution is still not done; do not report "60/60 full static".

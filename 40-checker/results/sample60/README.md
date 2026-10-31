# 60 samples: remote-manifest static

- Source frame: `samples/frame.json`（60 主样本，size<50MB）。
- Method: GitHub API 逐仓拉 `package.json` + 声明的 `main`/`exports`/`dsh.bundle.patch`；不是完整仓库 clone。
- Coverage: **remote-manifest static**；没有跑完整源码树、依赖安装、runtime。
- Summary: see `summary.json`；不要写成“60/60 全通过”。
- 5 个 no-manifest 是 frame 里的非插件/空仓；0 fail 不代表生态无缺陷。

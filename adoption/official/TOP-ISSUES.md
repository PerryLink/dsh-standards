# Top issues seen in the field (with reproductions)

> These are observed categories, not a claim about any specific author. Each has
> a minimal fix and a command. A host-gate reject is not a plugin code FAIL.

| # | Symptom | Minimal reproduction | First fix |
|---|---|---|---|
| 1 | Host compatibility gate rejects an otherwise valid bundle | `dsh plugin --profile p add <pkg>` → `installation rejected` | Widen `engines.dsh`/peer range; do not add a silent exemption |
| 2 | `workspace:*` dependency fails outside the monorepo | `npm pack` then install the tarball | Publish a real version or use `file:` |
| 3 | `files` allowlist omits a patch/server file | `npm pack --dry-run` vs `dsh.bundle.patch` paths | Add the file to `files` |
| 4 | `postinstall` required for boot | install with `--ignore-scripts` | Remove the boot dependency on postinstall |
| 5 | Client module loads but nothing renders | open web UI, check console | Add a render probe; do not call module-load “UI works” |
| 6 | Row stays PENDING | `--dump-config`, then boot logs | Declare `inject` or use `ctx.get` with an explicit message |
| 7 | `G1` row name does not resolve | `bundle-smoke` output | Align `name` with `exports` |
| 8 | Upgrade leaves old profile rows | `dsh plugin add` v2 after v1 | Remove by stable id; document data migration |
| 9 | Uninstall leaves data/cache | remove then inspect `DSH_HOME` | Move state under the profile; document it |
| 10 | Five-language README drifts | diff READMEs | Treat translations as derived; link the source |

## What is not an issue

- `not-run`: no harness yet; it is honest.
- `blocked`: host/profile missing; not the plugin’s fault.
- `partial`: some rows verified; not a clean pass.

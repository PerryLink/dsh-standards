# Level audits of the PerryLink meta repos

Run with `node 40-checker/scripts/level-audit.mjs <dir> --format json`.

| repo | ENTRY | FLOW | BOOST | note |
|---|---|---|---|---|
| `dsh-plugin-guide` | `recognized` | `not-run` | `not-measured` | bundle; static only until a `--host` run |
| `dsh-plugin-doctor` | `recognized` | `not-run` | `not-measured` | bundle; static only until a `--host` run |

`dsh-plugin-certification` is a **data repository**, not an installable plugin
(`private: true`, no runtime entry). The ENTRY checker correctly reports that
shape as not a plugin; it is out of scope for this audit and no JSON is kept.

The `recognized` state is not a runtime pass. To replace it, run the audit with
`--host <app-boot/lib/index.js> --base <dsh-base/cordis.patch.yml> --bare <farm>`.
FLOW and BOOST need their own evidence files; this tool does not invent them.

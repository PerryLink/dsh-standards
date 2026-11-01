# Error catalog (top 20)

> Each entry: symptom → likely cause → first fix. Commands assume the checker is
> at `40-checker/`. If your error is not here, open an issue with a minimal
> package and the exact command; do not paste session data.

| # | Symptom / code | Likely cause | First fix |
|---|---|---|---|
| 1 | `G0` patch parse error | YAML indentation, unquoted `:` or `@` | Quote the value; use 2-space indent; validate with a YAML parser |
| 2 | `G1` row name does not resolve | `name` points to `./server.mjs` that is not exported | Add `exports["./server"]` or use the package name |
| 3 | `G1` duplicate row id | Two rows share `id` | Make ids unique; keep the old id for upgrades |
| 4 | `G2` compatibility reject | `peerDependencies` excludes the pinned dsh/cordis | Widen the range; do not add a silent exemption |
| 5 | `G2` exact-version only | `0.2.2-alpha.2` is not admitted by the host | Use `^0.2.0`/`>=0.2.0 <0.3.0` if true; otherwise document the pin |
| 6 | `G3` row PENDING | Required service is missing and the plugin was not `inject`ed | Add `inject` or `ctx.get` + explicit PENDING message |
| 7 | `G3` row not ACTIVE | Boot plugin threw silently | Run with logs; check the first error, not the last |
| 8 | `G4` missing `./client` | `dsh.client` exists but no export | Add `exports["./client"]` and a package-root row |
| 9 | `G4` client loads, UI blank | “module loaded” was mistaken for “rendered” | Add a render probe; label it `not-run` until then |
| 10 | `G5` stale | `expiresAt` passed | Re-run and issue a new record; do not edit the date |
| 11 | `workspace:*` install fail | npm cannot resolve a workspace protocol outside the monorepo | Publish a real version or use `file:`/`link:` |
| 12 | `postinstall` blocked | Install script is skipped in the sandbox | Do not require postinstall for boot; document the fallback |
| 13 | Peer conflict on install | Two plugins pin incompatible `cordis` | Align ranges; use the host’s range, not a fork |
| 14 | `ERR_MODULE_NOT_FOUND` for `./lib/x.js` | File is gitignored or not in `files` | Add it to `files`; check `npm pack` output |
| 15 | Plugin not in `--dump-config` | Added to the wrong profile or row disabled | Check `--profile`; check `disabled` |
| 16 | `J2` row id not found | `name` is a `>-` block or `file://` URL | The harness handles block values; check the dump manually |
| 17 | `J4` no credential boundary | A key is present in the environment | Unset `DEEPSEEK_API_KEY`/`OPENAI_API_KEY` for the tree-load test |
| 18 | `J6` rollback leaves residue | Data was written outside `DSH_HOME` | Move state under the profile; document it |
| 19 | `claim-check` forbidden word | “official/certified/secure/recommended” | Rewrite as “non-official / not a certification”; keep the disclaimer |
| 20 | `dco-check` missing sign-off | Commit was not created with `-s` | `git commit -s --amend --no-edit`; never let a bot sign |

## Not errors

- `not-run`: the check was not executed. It is honest, not a failure.
- `blocked`: the host/profile/infrastructure is missing. It is not a plugin FAIL.
- `stale`: the record expired. It is not a new PASS.
- `partial`: some gates ran; it is not “clean”.

## Reporting

Include: command, package name@version, dsh/cordis versions, OS/Node, the JSON
record, and the first 20 lines of the error. Redact tokens, session data, and
personal paths.

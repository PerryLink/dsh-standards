# web-app smoke (blocked)

The four remaining web-app samples were run with `--base` + `--web` in the
loader-only smoke. The web-app layer needs `cmdlineArgs` / `webApp`, which the
real CLI surface provides, not the loader. Result: 12-13 plugins wait for
`webStartup`/`webServer`/`connection`; no target row ACTIVE.

This is **blocked**, not unavailable and not a pass. To judge these four, run a
real `dsh --profile web` with an isolated `DSH_HOME`; do not claim runtime from
this directory.

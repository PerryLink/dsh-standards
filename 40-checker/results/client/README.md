# client runtime: 0/15

The 15 client-bearing samples only prove `exports["./client"]` exists.
No browser/host page was available; no client runtime result is claimed.

Next: run a real Web profile with an isolated `DSH_HOME`, open the host page,
assert console error 0 and the plugin's slot renders. Until then, client is
`interop-static (build-only)`.

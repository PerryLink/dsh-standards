# Host-level issues (for the upstream, not for plugin authors)

> These are issues the plugin cannot fix. They are recorded so a host team can
> reproduce them; they are not a demand or a support request.

1. **Compatibility gate rejects a bundle that boots.** `telemetry` and
   `verification` were rejected by the gate; the plugin code was not the cause.
   Reproduction: `40-checker/results/entry/18/fullbase/` + `entry18-ci.mjs`.
2. **G3 partial on 8/18 base-only packages.** The base profile does not provide
   every service; the row is PENDING. This is a profile limitation, not a plugin
   FAIL. Reproduction: `fullbase/REPORT.md`.
3. **Client shape is static only.** `client-module-loaded` is not a render
   proof; a browser probe is in `web-runtime` but does not assert layout.
4. **No stable host-minor compatibility contract.** A patch can pass on one
   minor and be rejected on the next; `upgrade` has a corridor but not a formal
   guarantee.
5. **Profile overlays are the only disable mechanism.** There is no stable
   public “disable by id” API; the harness uses `--patch`.

Each item includes a command and an expected/actual; no exploit details, no
credentials, no private data.

# client runtime: 15/15 client-module-loaded

The 15 client-bearing packages were installed into a real `web` profile and
opened in Chromium. Each row proves:

- the package id is in `window.__DSH_BOOT__.entries`;
- the client bundle URL was fetched (resource timing);
- the boot page marker disappeared and `#root` mounted;
- there were no console errors, page errors, or failed same-origin scripts.

Evidence: `40-checker/results/webruntime/summary.json` and each `<id>/probe.json`.
Run: https://github.com/PerryLink/dsh-standards/actions/runs/41218358951

Claim is **`client-module-loaded`**, not `UI-rendered`: plugin-specific slots and
interactions are not visually reviewed. Three of the 18 have no `./client`
export (one shell-only, two host-gate rejected).

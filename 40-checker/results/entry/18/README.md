# Entry results (18)

Generated: 2026-10-31T13:24:19.371Z (static) · 2026-11-01 (runtime)

- **Static** (`<id>.json`): 18/18 `recognized`; 0 clean pass; the warnings are expected
  transitional claims (C-2.1 / C-11 / C-13). Static is not a runtime pass.
- **Runtime base-only** (`fullbase/`): 18/18 rows written against
  `dsh@0.2.2-alpha.2` + `dsh-base`; G3 `verified` 10, `partial` 8, `error` 0;
  after the host gate, clean `verified` 8, `gate-reject` 2 (`telemetry`,
  `verification`), `partial` 8. See `fullbase/REPORT.md` and `fullbase/summary.json`.
- **Runtime web-layer** (`richbase/`): 2026-11-01 time-boxed experiment; the
  first shard (`SeaOf0__dsh-redteam-model`) was **blocked** because
  `bundle-smoke` cannot supply `webStartup`/`cmdlineArgs`/`webApp`; no row was
  promoted. See `richbase/REPORT.md`.
- **Real web profile** (`realweb/`): 8/8 former partials `verified`; combined
  18/18 `verified` (16 clean + 2 `verified-gate-reject`); 18/18 clean not
  claimed. See `realweb/REPORT.md`.
- **Target-only** (`targetonly/`): earlier attempt without the base layer; it is
  retained only as an intermediate artifact, not as the runtime result.
- The old "runtime JSON is still missing / 7/18" note is obsolete. The
  reproducible runner is `../scripts/entry18-ci.mjs`; the CI matrix is
  `.github/workflows/entry18-runtime.yml`.
- The 4 web-app packages are **not** upgraded on base-only evidence; their web
  profile result lives in `../../webruntime/`.

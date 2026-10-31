# Runtime G0–G3: not-run

- The 7 runtime candidates were attempted with `bundle-smoke.mjs` and the host base patch.
- The host boot exceeded the 160s per-process budget; target rows did not become ACTIVE.
- Empty/partial attempts were removed. `ci-diet.runtime-attempt.json` is retained as a failed attempt, not a pass.
- Do not cite this directory as 7/18 runtime raw evidence. The 7/18 figure remains a manual/base-only summary, not a reproducible raw JSON set.
- Next: reduce host boot cost or run a real profile with a fixed host farm.

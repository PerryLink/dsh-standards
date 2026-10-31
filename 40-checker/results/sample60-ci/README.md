# 60 samples: full clone static (CI)

- Workflow: `.github/workflows/sample60.yml`, run 41212756102, success.
- 60/60 clone ok; results:
  - **0 pass / 55 warn / 5 fail / 0 incomplete / 0 clone-fail**
- This is full `git clone --depth 1` + ENTRY static (`--entry-claim static`), not runtime.
- The 5 fail are real static failures in the sampled set; they are not a plugin runtime verdict.

# Round-robin rounds

`2026Q4.json` was produced by `.github/workflows/round-robin.yml` from two
independent GitHub runners (ubuntu-latest, windows-latest, Node 22). It compares
the frozen known answers in `40-checker/fixtures/known-answer/expected.json`.

- `comparable: true` means both runners produced the expected statuses and are
  not the same runner.
- It does **not** prove a laboratory capability, an accreditation, or ecosystem
  coverage. Two known-answer fixtures are a smoke test, not proficiency testing.
- `skipped` is an ignored control: two `not-run` results prove nothing.

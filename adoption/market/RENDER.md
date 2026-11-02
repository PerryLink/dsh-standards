# Directory rendering contract (v0.1)

A directory that consumes a label is a **renderer, not an auditor**. It displays an immutable record, its evidence link, and the fixed disclaimer in the same view. It must not compute a level, grade, score, ranking, or endorsement.

## Allowed

- `subject.repo`, `subject.version`, `subject.commit`
- `level` (`entry` / `flow` / `boost`) and the per-level `status`
- `claimLevel` (must be `reference` for directory labels)
- `scope` (`dsh`, `cordis`, optional `platform`)
- `validity` (`generatedAt`, `expiresAt`)
- `evidence[]` (HTTPS URL, optional `sha256`)
- `issuer`, `recordHash`, `verifyUrl`
- the fixed disclaimer: `非官方 · 非认证 · 非安全审计 · 非背书 · 无担保`

## Forbidden

- `grade`, `score`, `rank`, `recommended`, `official`, `certified`, `secure`
- sorting or filtering by level/status
- an aggregate/trust score or a comparison table
- a card badge that turns a status into a quality claim
- hiding the disclaimer or the evidence link

## Effective status at read time

1. `withdrawn` if `withdrawn === true`, `status === "withdrawn"`, or `revokedAt` exists.
2. `stale` if `validity.expiresAt` is before today.
3. Otherwise the declared per-level `status`.

Show `not-run`, `not-measured`, `blocked`, `failed`, and `stale` exactly. Never convert a skip into a pass.

## Minimal embed

```html
<aside class="dsh-evidence" data-record-hash="sha256:...">
  <strong>DSH evidence</strong>
  <span>entry · static · claimLevel reference</span>
  <a href="https://example.invalid/verify/label">evidence / verify</a>
  <small>非官方 · 非认证 · 非安全审计 · 非背书 · 无担保</small>
</aside>
```

The directory may link to `sample-index.json`, but it must not re-host or mutate the record. A withdrawn or stale record stays in history and is excluded from the valid view.

## Revocation

The issuer publishes a new record with `status: "withdrawn"` or `revokedAt`, and optionally `supersedes`. The directory drops it from the valid view on the next sync (<=15 minutes), keeps the history, and never restores it to valid. If the source is unreachable, keep the last known record visible as `stale` after 24 hours, not valid.

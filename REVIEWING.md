# Reviewing

> A reviewer signs a **review record**, not a certification. Review is about
> evidence and procedure, not about liking the plugin.

## Before you start

1. Read the clause/gate you are reviewing and its `notClaimed` list.
2. Check `governance/coi.json`: if you share an org, employer, funder, or paid
   relationship with the subject, **stop** and mark `recusalRequired`.
3. If you are the author, you cannot be the independent reviewer.

## What to check

- [ ] The subject is pinned to `(repo, commit, scanner, dsh, cordis)`.
- [ ] Every PASS has a command, artifact, or URL.
- [ ] A skip is `not-run`, never PASS; `blocked` is not `failed`.
- [ ] `static` is not written as `runtime`; `client-module-loaded` is not UI.
- [ ] The level status is allowed for that level (`measured` only for BOOST,
      `manual` only for FLOW).
- [ ] A certificate/attestation has `claimLevel`; `selfAssessed` is not
      `verified`.
- [ ] The disclaimer is visible in the same view as the mark.
- [ ] No `official`, `certified`, `secure`, `recommended`, or ranking claim.
- [ ] The evidence has an expiry date and is not past it.

## Output

Write a review record with:

```text
reviewId:
subject:
clause/gate:
method:
command/artifact:
result: PASS | FAIL | WARN | NOT-RUN | BLOCKED
conflict: none | <declared>
limitations:
reviewer:
date:
expiresAt:
```

## What you must not do

- Do not approve your own change.
- Do not merge spec/governance/checker as a reviewer.
- Do not turn a review into “certified”, “secure”, or “official”.
- Do not delete a negative result; mark it `failed` and explain.

AI can run checks and summarize; it cannot be the approving reviewer or sign
`Reviewed-by`.

# Incident runbook

> Scope: evidence errors, unauthorized merges, leaked secrets, and a false label.
> This is not a security incident response service for third-party plugins.

## 1. Detect

- CI failure, appeal, user report, surveillance mismatch, or a maintainer notice.

## 2. Contain

- If a label is disputed: set `under-review`, hide the old PASS, keep history.
- If a secret leaked: revoke the token first, then rotate; do not paste it.
- If an AI merged outside its allowlist: revert, disable the token, record.

## 3. Assess

- Which record/subject/version? Which clause? Is it factual, procedural, or COI?
- Does it affect a third party? If yes, notify via the public record.

## 4. Correct

- Issue a **new** record; do not edit the old PASS into a FAIL.
- Append a decision-log entry and (if needed) a dispute JSON.
- If the error was ours, say so; do not blame the plugin.

## 5. Learn

- Add a regression test/fixture.
- Update the checklist or the taxonomy.
- Record the time to detect and time to correct.

## Red lines

- Never delete a dispute or audit record.
- Never restore a stale/withdrawn label to “valid”.
- Never claim “no impact” without checking.

# Revocation and withdrawal

> A label is a read-only projection. When the record changes, the label changes;
> the market does not get to keep the old one.

## Triggers

| Trigger | Who | Display | Timing |
|---|---|---|---|
| `expiresAt` passed | clock (reader) | `stale` | immediately |
| Author withdraws | author | `withdrawn` + history | next sync |
| Certificate/attestation revoked | organizer | `withdrawn` + reason | next sync |
| Evidence found invalid | reviewer/organizer | `under-review`, then `withdrawn` or corrected | 14 days |
| Mark misuse | organizer | correction request, then removal | 7-day notice + 30-day cure |

## What the market must do

1. Drop the label from the “valid” filter as soon as `status` is `stale`,
   `withdrawn`, or `under-review`.
2. Keep a history entry with the date and reason; do not delete it.
3. Do not recompute the level from stars, downloads, or a grade.
4. Do not keep a paid placement tied to a withdrawn label.

## What the project must do

1. Publish the new record with a new `generatedAt` and `status`.
2. Keep the old record for ≥2 years; never edit a PASS into a FAIL silently.
3. Record the decision in `governance/decision-log.md` (or a dispute record).
4. Notify known consumers; if none, the public record is the notice.

## Rollback red line

Never restore a `stale` or `withdrawn` label to “valid”. If a mistake was made,
issue a **new** record with a correction note; do not resurrect the old status.

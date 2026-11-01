# 30-minute time trial (protocol, not yet measured)

> Status: **not measured**. The protocol exists; the 5-author trial has not run.
> Do not claim “30 minutes” until the table below has real rows.

## Machine dry run

```bash
node adoption/developer/time-trial.mjs --package <plugin-dir> --out trial.json
```

It records one machine run (start → first record) and is labelled a dry run; it
does **not** replace the 5-author table below.

## Protocol

1. Recruit 5 authors who have never used the standard.
2. Give them only `QUICKSTART.md`, `CHECKLIST-entry.md`, and a template.
3. Start the clock at “first command”; stop at “first non-`not-run` record”.
4. Record: minutes, OS, Node, dsh/cordis, first failing gate, number of edits.
5. Do not help unless they are blocked >10 minutes; record the help.

## Result table (empty)

| # | Author | Minutes | OS/Node | First failure | Edits | Notes |
|---|---|---|---|---|---|---|
| 1 | — | — | — | — | — | not-run |
| 2 | — | — | — | — | — | not-run |
| 3 | — | — | — | — | — | not-run |
| 4 | — | — | — | — | — | not-run |
| 5 | — | — | — | — | — | not-run |

## Acceptance

- median ≤30 min, p90 ≤45 min;
- top-20 errors have a fix;
- migration ≤3 changes.

Until then, the honest claim is: **“we have a checklist and a quickstart; the
30-minute target is untested.”**

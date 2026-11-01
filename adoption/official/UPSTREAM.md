# Upstream contribution plan

> What we could send upstream, and what we should not. A PR is not a demand.

| Candidate | Target | Why | Stop rule |
|---|---|---|---|
| A reproducible 18-package harness | host repo / test infra | field data, no product change | if it needs a private fixture or a token |
| G4 static check | host checker | catches a missing `./client` export | if it changes ENTRY semantics |
| `blocked` vs `failed` taxonomy | docs | avoids blaming plugins for host gates | if it is only our vocabulary |
| Client render probe | web runtime | goes beyond “module loaded” | if it needs a browser farm we do not have |
| Upgrade corridor fixtures | plugin-upgrade | real migration seams | if it encodes our private layout |

## Not sending

- the standard text as an “official proposal”;
- badges, certification, or ranking;
- a request for endorsement or a meeting;
- anything containing tokens, session data, or private plugin code.

## Acceptance

A maintainer can run the reproduction without our repo; the change is smaller
than the problem; a “no” is recorded and respected.

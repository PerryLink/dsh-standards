# Status and failure taxonomy

> The most common way a record lies is not a wrong number; it is a wrong status.
> This page fixes the vocabulary.

## Record status (per level)

| Status | Meaning | Is it a pass? |
|---|---|---|
| `recognized` | static recognition only | no runtime claim |
| `static` | static checks ran | no runtime claim |
| `runtime` | a real boot/journey ran | yes for that scope |
| `manual` | a human ran the journey and recorded it | yes for FLOW only |
| `measured` | a benchmark was run and recorded | yes for BOOST only |
| `blocked` | environment/host/service missing | **no** |
| `failed` | the subject failed a check | **no** |
| `not-run` | the check did not run | **no** |
| `not-measured` | no BOOST evidence | **no** |
| `not-applicable` | the check does not apply (data/docs repo) | **no** |
| `stale` | evidence expired or host anchor changed | **no** |
| `withdrawn` | author/project withdrew it | **no** |

## Rules

1. `blocked` ≠ `failed`: infrastructure/host is not the plugin’s fault.
2. `not-run` ≠ `not-applicable`: “did not run” and “does not apply” are different.
3. `static` ≠ `runtime`; `client-module-loaded` ≠ UI rendered.
4. `measured` only for BOOST; `manual` only for FLOW.
5. `stale` is computed by the reader from `expiresAt`, not trusted from the writer.
6. A `PASS` needs a command/artifact; a skip must never be upgraded.

## Failure classes

| Class | Example | Who fixes |
|---|---|---|
| `subject-fail` | G1 row unresolved, G4 export missing | plugin author |
| `host-blocked` | host gate rejects, profile service missing | host/adapter |
| `fixture-fail` | fixture cannot boot; sample is wrong | standards maintainer |
| `tool-error` | checker crash, JSON parse error | checker maintainer |
| `stale` | expiry passed | author re-runs |
| `withdrawn` | evidence invalid/misused | organizer |

The checker must not map `host-blocked` or `tool-error` to `subject-fail`.

## Reporting template

```text
status: <one of the above>
class: subject-fail | host-blocked | fixture-fail | tool-error | stale | withdrawn
evidence: <command + artifact>
scope: dsh=<v> cordis=<v> platform=<v>
expiresAt: <date>
limitation: <one sentence>
```

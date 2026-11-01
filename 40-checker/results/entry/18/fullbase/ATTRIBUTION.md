# ENTRY 18-package attribution

> This explains the rows that are not `verified`. It does not turn a partial
> into a pass. A missing host/profile service is not a plugin code FAIL.

| id | status | active/target | missing services | verdict |
|---|---|---|---|---|
| `DDDMUC__dsh-free-search` | verified | 1/1 | — | verified |
| `Ebony-Vinyl__dsh-our-free-model` | verified | 1/1 | — | verified |
| `SeaOf0__dsh-redteam-model` | partial | 0/11 | agentPresets, connection | partial |
| `YuJunZhiXue__dsh-purge` | partial | 2/3 | webServer | partial |
| `ci-diet` | verified | 1/1 | — | verified |
| `daily-log` | verified | 1/1 | — | verified |
| `howmp__dsh-pentest` | partial | 2/3 | agentPresets | partial |
| `kingcharleslzy-ai__dsh-purge` | partial | 4/5 | webServer | partial |
| `liguobao__ds-harness-remote` | verified | 2/2 | — | verified |
| `mmparko__dsh-purge` | partial | 3/4 | webServer | partial |
| `project-memory` | verified | 1/1 | — | verified |
| `qiushi` | verified | 1/1 | — | verified |
| `shaobeichen__dsh-pocket` | partial | 0/1 | — | partial |
| `status-rotator` | verified | 1/1 | — | verified |
| `telemetry` | verified | 1/1 | — | verified-gate-reject |
| `ui-auth` | partial | 0/1 | — | partial |
| `verification` | verified | 1/1 | — | verified-gate-reject |
| `ysr666__dsh-vision-router` | partial | 1/2 | — | partial |

Total: 18; not verified: 8.

A richer host profile (the missing services) is required before these can be `verified`; the plugin code itself was not the cause.

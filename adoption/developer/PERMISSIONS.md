# README permissions & data access (J5 author kit)

> 非官方 · 非认证 · 非安全审计。This is a **developer aid**, not an ENTRY gate. J5 evidence is a host/flow check.

The pilot found 10/15 READMEs did not state permissions. Use this section in every plugin README:

```md
## Permissions & data access

- Reads: <files/config/services>
- Writes: <files/storage/profile>
- Network: <domains; or "none">
- Credentials/secrets: <which; or "none">
- Background/processes: <timers/children/ports; or "none">
- Explicitly does not access: <user home, other profiles, shell history, etc.>
```

Rules:

- Say what the plugin **actually** does, not what it might do.
- Do not claim "no permissions" if it reads a config file or calls the network.
- Do not put secrets in the README; list the key name only.
- Add a one-line `Last reviewed: YYYY-MM-DD` when the behavior changes.

This is not a substitute for a security review or a market’s own policy.

# FLOW checklist (J1–J8)

> FLOW asks: can a user install, configure, use, recover, upgrade, and uninstall
> without surprises? A `manual` journey is allowed, but it must be recorded as
> `manual`, never as `runtime`.

## Coverage today (be honest)

| Journey | Current evidence |
|---|---|
| J1 install/remove | `journey-runtime.mjs` (fixture + 5 real packages) |
| J2 enable/disable | `journey-runtime.mjs` (fixture) |
| J3 configuration | **not-run** (no invalid-config harness yet) |
| J4 first success | `journey-runtime.mjs` keyless tree-load (fixture) |
| J5 permissions/disclosure | **manual only** |
| J6 upgrade/rollback | `journey-runtime.mjs --previous` (fixture) |
| J7 observability | **not-run** |
| J8 client/server shapes | **not-run** |

## J1 — install and remove

- [ ] `dsh plugin --profile <p> add <pkg>` succeeds (or is `BLOCKED` by the host
      gate, with no silent exemption).
- [ ] `--dump-config` shows the plugin/row.
- [ ] `dsh plugin --profile <p> remove <name>` succeeds and the row is gone.
- [ ] No hand-edited profile YAML.

## J2 — enable and disable

- [ ] The inserted row has a stable `id`.
- [ ] `disabled: true` overlay hides it; `disabled: false` restores it.
- [ ] If the row id cannot be found: `not-run`, not PASS.

## J3 — configuration

- [ ] README documents every config key with a default.
- [ ] An invalid value fails loudly with a **field path** (not a stack trace).
- [ ] A volatile value can change without remounting the plugin.
- [ ] If no harness exists: write `not-run` and link this checklist.

## J4 — first success

- [ ] A five-minute quickstart exists and is copy-pasteable.
- [ ] Without a key, boot reaches the credential boundary (tree-load).
- [ ] An error has three elements: what failed, where, what to do next.
- [ ] `tree-load` is not “a successful task”.

## J5 — permissions and disclosure

- [ ] `dsh.capabilities`, `dsh.labels`, `dsh.commitments` match the README.
- [ ] No forbidden words (`official`, `certified`, `secure`, `recommended`).
- [ ] Destructive actions are disclosed before they run.
- [ ] This is a **manual review** today; record the reviewer and date.

## J6 — upgrade, rollback, uninstall

- [ ] Two versions are available; upgrade preserves data.
- [ ] Rollback takes ≤2 commands.
- [ ] Uninstall leaves no residue (config, cache, data).
- [ ] Without `--previous`: `not-run`, not PASS.

## J7 — observability

- [ ] Start line prints `name@version`.
- [ ] A failure/PENDING state is diagnosable from logs.
- [ ] The log path is documented.
- [ ] If no probe exists: `not-run`.

## J8 — client/server shapes

- [ ] Headless works.
- [ ] Web works.
- [ ] `client-off` works or is explicitly refused with a clear message.
- [ ] `client-module-loaded` is not “UI rendered”.

## Final record

Use `level: "flow"` with `status: manual|runtime|not-run|stale`; include the
journey IDs you actually ran. Do not fill J3/J5/J7/J8 with PASS unless you have
a record.

# Compatum/1 — compatibility, capability, and evidence profile

> **Status:** Draft 0.10 · 2026-11-15 · Editor: PerryLink (independent community project)
> **Notice:** This is **not an official standard**. It is not a W3C, AAIF, OpenAtom,
> OpenSSF, IETF, or DeepSeek deliverable and carries no endorsement from any of
> them. “Compatum” is an unregistered working name; no trademark is claimed.
> **License:** text CC BY 4.0, schemas and code Apache-2.0 (§6).
> **Feedback:** open an issue at <https://github.com/PerryLink/dsh-standards/issues>
> and quote the clause or field name.

Normative keywords **MUST**, **SHOULD**, and **MAY** are used as in RFC 2119/8174.

## 1. Purpose

Agent hosts change faster than plugin ecosystems absorb. Compatibility claims
are scattered across `engines`, peers, READMEs, badges, and marketplaces, and
“compatible” conflates three facts: a version range is a claim, a static check
is not a boot, and one boot is not a matrix. Capability vocabulary drifts
(`network:egress` vs `listen`), evidence lacks host and commit anchors, and
inconsistent result words let `not-run` read as a pass. Compatum/1 defines one
additive, opt-in metadata block that keeps these facts separate and
machine-readable.

## 2. Scope

**In scope:** the `compatum` block in package metadata; `capabilities[]`,
`requires`, and `evidence[]`; three evidence levels (`declared → checked →
tested`); six result values; content hashing and anchors; JSON Schema,
conformance cases, and a one-page implementer guide.

**Out of scope:** runtime sandboxing or enforcement; security audit;
certification, badges, scores, or ranking; host API semantics; registry policy;
SBOM; signing or PKI (reuse Sigstore and in-toto); new cryptographic primitives.

## 3. Profile fields

A conforming package carries a `compatum` object with `schema: "compatum/1"`:
for DSH at `package.json#dsh.compatum`, elsewhere as a vendor extension. It is
authoritative at package level, MUST be valid JSON, and MUST NOT contain
secrets. The object also carries `name` and `version`, which bind the claim to
one exact package version and let the block travel outside `package.json`; for
a DSH package they MUST equal `package.json#name` and `package.json#version`.
The [JSON Schema](../spec/compatum.schema.json) validates the inner object; the
wrapper below only shows the embedding.

```json
{
  "compatum": {
    "schema": "compatum/1",
    "name": "dsh-example",
    "version": "1.2.0",
    "capabilities": [
      { "id": "network:egress", "scope": "user", "approval": "once" },
      { "id": "tools:register", "scope": "host", "approval": "once" }
    ],
    "requires": {
      "portable": "1.0",
      "dsh": ">=0.2.1-0 <0.3.0",
      "node": "^22.19.0 || >=24.9.0",
      "platform": ["linux", "darwin", "win32"],
      "install": {
        "unit": "bundle",
        "entry": "dsh.bundle.patch",
        "activation": "hot-reload",
        "data": "$DSH_HOME/dsh-example",
        "uninstall": {
          "stops": true,
          "removesCode": true,
          "removesData": false,
          "residue": []
        }
      }
    },
    "evidence": [
      {
        "schema": "compatum-evidence/1",
        "level": "checked",
        "subject": { "repo": "https://github.com/PerryLink/example", "version": "1.2.0", "commit": "ce7073d" },
        "host": { "name": "dsh", "version": "0.2.2-rc.3" },
        "checker": "dsh-standards@1.6.12",
        "result": "PASS",
        "scope": "capability",
        "checkedAt": "2026-11-14T09:00:00Z",
        "reportPath": "evidence/dsh-example/1.2.0/0.2.2-rc.3.json"
      }
    ]
  }
}
```

### 3.1 `capabilities[]`

An array of objects. `id` is required and MUST come from the 16-ID closed set
in [`60-权限与标注规范.md` §2.2](../60-权限与标注规范.md); `effect`, `scope`,
`targets`, `reversible`, `approval`, `hostOnly`, and `reason` MAY qualify it,
using registry defaults when absent. Aliases (`listen`, `exec`, `process`) MUST
be normalized by the checker and MUST NOT be written here. Unknown or duplicate
IDs make the declaration invalid.

**Missing ≠ empty ≠ unknown.** A missing field means *unknown* and MUST NOT be
read as “no risk”. An empty array is an explicit “no capabilities” claim but is
still a WARN with risk `unknown`, never a PASS.

### 3.2 `requires`

A declarative object: `portable` (profile version, currently `"1.0"`) plus host
constraints such as `dsh` and `node` (SemVer ranges), `platform` (enum), and the
required `install` object. `install` states the unit, entry, activation, data
location, and uninstall semantics: whether uninstall stops processes, removes
code, removes data (`true`, `false`, or `"ask"`), and what residue remains
(`residue: []` is an explicit no-residue claim). `mcp`, `claude-code`, `codex`,
`agent-plugins`, `agent-skills`, `transport`, and `denies` MAY further constrain
the claim. Tested hosts belong in `evidence[]`: a test result is not a
requirement. Missing or unsatisfied requirements mean *not run*, not *pass*.

### 3.3 `evidence[]`

Each record carries `schema: "compatum-evidence/1"`, `level`, `subject` (repo,
version, commit), `host` (name, version), `checker`, `result`, `scope`,
`checkedAt`, and either `reportPath` or `sha256`; `expiresAt` and `stale` are
optional. Hashes use `sha256:` plus 64 lowercase hex characters over the
canonical JSON (RFC 8785 JCS) of the record body, excluding the hash field.

- **Levels:** `declared → checked → tested`, in order, no skipping. `checked`
  means an offline/static check observed the package, not that it booted;
  `tested` means a run was observed on the named host anchors.
- **Reset:** a version bump resets the claim to `declared`; a host change makes
  older records historical (`stale: true`) but keeps them as evidence.
- **Failures remain evidence.** `FAIL`, `BLOCKED`, and `ERROR` records MUST NOT
  be deleted to improve the apparent level.
- **Results:** `PASS | WARN | FAIL | NOT-RUN | BLOCKED | ERROR`, case-sensitive.
  `NOT-RUN` is never a pass and MUST be preserved as such.

### 3.4 Machine-readable artifacts

- [`spec/compatum.schema.json`](../spec/compatum.schema.json) — JSON Schema
  2020-12 for one `compatum/1` block, including the 16-ID registry, the alias
  map (`listen`, `exec`, `process`), the effect map, `requires.install`, and the
  evidence record.
- [`examples/compatum/`](../examples/compatum/) — `plugin-min.json`,
  `plugin-full.json`, `mcp-profile.json`, and `permission-rules-profile.json`;
  all four validate.
- [`spec/compatum-validate.mjs`](../spec/compatum-validate.mjs) — zero-dependency
  validator. It checks the schema plus rules JSON Schema cannot express
  (duplicate IDs, aliases, effect consistency, historical evidence on a version
  bump, and `declared` evidence that tries to carry `PASS`/`WARN`). Run
  `node spec/compatum-validate.mjs`; CI runs the same command.
- [`spec/compatum-reference.mjs`](../spec/compatum-reference.mjs) — reference
  generator: `package.json` → `compatum/1`, then the validator above. It emits
  only `declared`/`NOT-RUN` evidence and refuses to invent missing declarations.
- [`spec/compatum-reference.test.mjs`](../spec/compatum-reference.test.mjs) —
  12 tests for the generator, including explicit `[]`, fs/network,
  `sessions:write`, alias normalization, refusal cases, the CLI, and
  `--from-git`. Run `node --test spec/compatum-reference.test.mjs`.

### 3.5 Reference implementation

[`spec/compatum-reference.mjs`](../spec/compatum-reference.mjs) turns the
metadata a package already ships into one `compatum/1` profile. It reads
`dsh.capabilities`, `engines.dsh`, `engines.node`, `dsh.bundle`,
`dshWorkshop.lifecycle`, and `repository`, then runs the result through
[`spec/compatum-validate.mjs`](../spec/compatum-validate.mjs); it does not
re-implement JSON Schema.

```text
node spec/compatum-reference.mjs <dir> [--from-git [--rev <rev>]]
  [--commit <sha>] [--repo <url>] [--host <name@version>] [--data <value>]
  [--out <file>] [--json]
```

It deliberately cannot invent a declaration:

- A missing `dsh.capabilities` exits `2` (`MISSING_CAPABILITIES`), because
  missing means *unknown*, not *none*. An explicit `[]` is preserved and still
  validates as a WARN.
- Aliases are normalized with a `note:` and never written to `capabilities[]`.
- A working-tree read requires a clean `package.json`: anchoring a dirty file
  to `HEAD` would describe a version that is not in the commit. `--from-git`
  reads the committed blob and anchors `subject.commit` to that revision.
- Evidence is always one `declared` / `NOT-RUN` record; the generator never
  emits `PASS`. When no host version was observed, `host.version` is the
  literal `not-run` (the schema has no null); a checked/tested record must name
  the exact host that ran.
- `install.data` defaults to `$DSH_HOME/<name>` (or `none` without a bundle),
  and the uninstall residue string is a conservative template, not a verified
  data-location observation; review it, or override with `--data`, before
  publishing.
- Exit `0` = profile valid, `1` = generated but invalid, `2` = declaration or
  input error (no profile is emitted).

### 3.6 Checked package runs (2026-11-15)

The generator was run against the committed `package.json` of three packages
with `--from-git`, so no uncommitted working-tree declaration could leak in.
Two of them still have no declaration at their anchored commit; the generator
refuses rather than writing an empty array.

| Package | Anchored commit | `dsh.capabilities` at that commit | Reference result |
|---|---|---|---|
| `dsh-auto-review@0.15.1` | `7fc4598` | `network:egress`, `sessions:read` | generated; validator PASS |
| `dsh-permission-rules@0.8.0` | `624a170` | absent | exit 2, `MISSING_CAPABILITIES` |
| `dsh-plugin-guide@0.5.8` | `f59c425` | absent | exit 2, `MISSING_CAPABILITIES` |

`dsh-permission-rules` has a four-ID draft in an uncommitted `0.8.1` working
tree, and `dsh-plugin-guide` has `dshWorkshop.permissions:
["filesystem:read"]`; neither is a capability declaration at a commit. The
different vocabulary is not auto-mapped, and an uncommitted block is not
counted as adoption. No external package is known to carry a `compatum` block
yet.

A generated `dsh-auto-review` profile. Its `checkedAt` is fixed for this
document; everything else is the reference output (validator: `1/1 examples
valid`, with the expected `NOT-RUN` note):

```json
{
  "schema": "compatum/1",
  "name": "dsh-auto-review",
  "version": "0.15.1",
  "capabilities": [
    {
      "id": "network:egress",
      "effect": "network",
      "reason": "Declared in package.json#dsh.capabilities."
    },
    {
      "id": "sessions:read",
      "effect": "read",
      "reason": "Declared in package.json#dsh.capabilities."
    }
  ],
  "requires": {
    "portable": "1.0",
    "dsh": ">=0.2.1-0 <0.3.0 || >=0.2.2-0 <0.3.0",
    "node": "^22.19.0 || >=24.0.0",
    "install": {
      "unit": "bundle",
      "entry": "dsh.bundle.patch",
      "activation": "restart",
      "data": "$DSH_HOME/dsh-auto-review",
      "uninstall": {
        "stops": true,
        "removesCode": true,
        "removesData": false,
        "residue": [
          "plugin data under $DSH_HOME/dsh-auto-review is not removed by `dsh plugin remove`"
        ]
      }
    }
  },
  "evidence": [
    {
      "schema": "compatum-evidence/1",
      "level": "declared",
      "subject": {
        "repo": "https://github.com/PerryLink/dsh-auto-review",
        "version": "0.15.1",
        "commit": "7fc45989d7a0ca3bd368763e2df9ccdfff00fb79"
      },
      "host": {
        "name": "dsh",
        "version": "not-run"
      },
      "checker": "dsh-standards/compatum-reference@1.7.0",
      "result": "NOT-RUN",
      "scope": "capability",
      "checkedAt": "2026-11-15T00:00:00.000Z",
      "reportPath": "package.json#dsh.capabilities",
      "stale": false
    }
  ]
}
```

## 4. Relationship to HCB and dsh-standards

**dsh-standards** is the normative source for the 16 capability IDs, the
`dsh-levels/1` evidence vocabulary and expiry (90/180/365 days), and the
checker. Compatum/1 does not redefine those; it adds a host-neutral envelope and
compatibility requirements, and `dsh-standards` wins where they differ for a DSH
package.

**HCB v0.5.0** ([dsh-hcb](https://github.com/PerryLink/dsh-hcb)) is the
reference implementation and data layer: 143 packages, 10 `checked`, 133
`declared`, 0 `tested`; gate 22 `review` / 121 `pilot` / 0
`production-candidate`. HCB answers “what was declared” for the DSH ecosystem;
Compatum answers “how another host or registry reads and compares it”.

HCB is DSH-specific and this profile is not affiliated with DeepSeek. A
reference implementation does not make this an official standard.

## 5. Non-goals

- No runtime sandboxing, permission enforcement, or install blocking. The
  profile is disclosure; a host MAY ignore it, in which case the state is
  `unknown`, not `none`.
- No security audit, certification, badge, grade, score, ranking, or
  “verified/secure” claim. The gate `blocked | review | pilot |
  production-candidate` is advisory only.
- No host API semantics, registry policy, SBOM, signing, or PKI; no new
  cryptography; no new capability IDs or result values outside a versioned
  change to `dsh-standards`.
- Not a W3C, AAIF, OpenAtom, OpenSSF, or DeepSeek document. Do not cite it as an
  official standard or as an endorsement by any organization.

## 6. License and contribution

- **Text and specification:** CC BY 4.0 ([`LICENSE-CC-BY`](../LICENSE-CC-BY));
  modifications must carry a visible Change Notice per
  [`MODIFICATION-POLICY.md`](../MODIFICATION-POLICY.md).
- **Schemas, test suite, and code:** Apache-2.0
  ([`LICENSE-APACHE`](../LICENSE-APACHE)), including its patent grant and
  defensive termination.
- **Contributions:** DCO 1.1 plus a non-exclusive copyright license and a
  royalty-free patent commitment; no copyright assignment. Reading or
  implementing this draft requires no CLA.
- **Trademark:** “Compatum” is an unregistered working name; this draft makes no
  trademark claim and is not a trademark clearance. No W3C, AAIF, OpenAtom,
  OpenSSF, or DeepSeek marks are used.

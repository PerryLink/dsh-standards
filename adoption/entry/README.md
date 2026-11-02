# DSH Entry Checklist v0.1

A **static, market-compatible entry checklist** for DSH plugins. It is a pre-submit helper for authors and a low-friction review aid for markets. It is **not** an official standard, not a certification, not a security audit, and not a ranking.

Decision record: [`C3-DECISION-2026-11-02.md`](./C3-DECISION-2026-11-02.md). C3 is flow-only.

## The 8 checks

| ID | Check | What it proves | What it does not prove |
| --- | --- | --- | --- |
| C1 | Public repo + `dsh-plugin` topic | The project is discoverable | Code quality, safety, maintenance |
| C2 | `dsh.bundle` + existing patch file | The package declares an installable bundle | The bundle works on every host |
| C3 | FLOW J1 install/uninstall evidence (flow-only) | The install command/result was recorded | Every profile/version works |
| C4 | `engines.dsh` or `@deepseek-ai/dsh` peer range | A compatibility claim exists | The claim is true at runtime |
| C5 | `dsh.client` has an existing `./client` export | The client entry is present | The UI renders correctly |
| C6 | Entry declaration + description (license A7; repository optional) | Basic identity and metadata exist | The code is real or original |
| C7 | Version + commit/digest + freshness | The subject is identifiable and recent | The version is correct or secure |
| C8 | No grade/rank; `claimLevel=reference` | The record is not a certification | The plugin is good |

## Usage

```bash
node 40-checker/scripts/entry-validate.mjs <plugin-dir> --meta <meta.json> --json
node 40-checker/scripts/entry-validate.mjs <plugin-dir> --meta <meta.json> --host-evidence host.json --json
node 40-checker/scripts/entry-validate.mjs <plugin-dir> --meta <meta.json> --out entry-audit.json
```

`meta.json` supplies what a local directory cannot:

```json
{
  "repo": "owner/repo",
  "topics": ["dsh-plugin"],
  "archived": false,
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "pushedAt": "2026-11-01",
  "installCommand": "dsh plugin --profile web add owner/repo",
  "claimLevel": "reference"
}
```

Exit codes: `0` pass / pass-with-warnings; `2` fail; `3` incomplete (missing meta, blocked, or not-run checks).

C3 is **flow-only**: without `--host-evidence` it is `not-applicable` and does not block ENTRY; J1 is the required FLOW evidence. `--host-evidence` accepts:

```json
{
  "status": "pass|fail|blocked|not-run|not-applicable",
  "command": "dsh plugin --profile test add <pkg>",
  "host": "dsh 0.2.2-alpha.2 / cordis 4.0.6-alpha.1",
  "evidence": "https://example.invalid/host-install/1",
  "generatedAt": "2026-11-02"
}
```

C3 becomes `pass`/`fail`/`blocked`/`not-applicable`; a `blocked` host install keeps the conclusion `incomplete`, never a pass. `not-applicable` means the sample is a host/directory or has no install path; it does not block ENTRY. `advisories` (A1–A5) report missing `dsh.manifestVersion`, `engines.node`, client platform, locale, or icon without changing C1–C8 status.

## Why this is not a gate

- A market may add stricter rules; those belong in a market/host profile, not here.
- C1/C3/C7 are `not-run` without metadata; the tool never upgrades a skip to a pass.
- C6 is a metadata/entry declaration check; a missing repository field is a warning, a missing license is advisory A7 (legal/market profile), and a human still has to inspect the code.
- C8 is a policy check; it does not make the plugin trustworthy.

## Samples

`fixtures/` contains twelve small packages used by `40-checker/test/entry-validate.test.mjs`: one good, one without meta, one build-output pass-with-warnings, one ordered patch-list pass, seven deliberate failures (client-only, missing patch, `engines: "*"`, missing client export, missing metadata, missing version, forbidden label), and one peer-range pass.

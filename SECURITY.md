# Security policy

> 本仓库是**非官方**的 DSH 插件标准与检查器，不是安全审计、认证、背书或担保。
> This repository is a non-official draft standard and a checker. It is **not** a
> security audit, certification, endorsement, or warranty for any plugin.

## Supported versions

Security fixes target the latest published minor line. Older lines may receive
best-effort fixes only when the fix is small and the reporter is affected.

| Version | Supported | Notes |
|---|---|---|
| `1.5.x` (current) | **Yes** | Security fixes and checker-rule corrections. |
| `1.4.x` | Best effort | Upgrade recommended; no new features. |
| `<= 1.3` | No | Please reproduce on `1.5.x` before reporting. |

The table describes **targets**, not a service-level agreement. This project has
a bus factor of 1 (see [`CONTINUITY.md`](CONTINUITY.md)); response may be slower
during absences. There is no bug bounty.

## What to report

In scope:

- a checker rule that can be **bypassed** to mark an unsafe or non-conforming
  plugin as `PASS` (false negative), or a rule that fails a benign package
  predictably (false positive with a minimal repro);
- a false negative that lets a plugin with a known-dangerous trigger
  (`credentials:*`, `network:egress`, shell/exec, filesystem writes outside the
  workspace) pass ENTRY/DS-C without a label or a `not-run` record;
- a vulnerability in the checker's own code, its sandbox/runner, or its CI
  workflows (including a leaked CI secret);
- a leaked credential, token, private key, or `.env` value in this repository,
  its commits, issues, releases, or npm tarballs;
- a documentation claim that overstates what a check proves (for example calling
  a `PASS` a "security audit" or "certified safe");
- a supply-chain problem in this repository's own dependencies or release
  process.

Out of scope:

- vulnerabilities in **third-party plugins**. Report those to the plugin author
  and, for malicious npm packages, to npm support. This project is not a CVE
  authority and cannot coordinate disclosure for third-party code;
- general support, feature requests, or "is this plugin safe?" reviews;
- a plugin merely being listed or checked here. Listing is not endorsement.

## How to report

**Preferred:** open a private GitHub Security Advisory at
<https://github.com/PerryLink/dsh-standards/security/advisories/new>.
If private advisories are unavailable, contact the maintainer listed in
[`MAINTAINERS.md`](MAINTAINERS.md) through the contact method on their GitHub
profile. Do **not** open a public issue for a security report.

**Do not put any of the following in a public issue, discussion, PR, or social
post:**

- a working exploit, bypass, payload, or step-by-step reproduction against an
  unpatched version;
- credentials, tokens, API keys, cookies, private keys, `.env` contents, or
  `$DSH_HOME`/`~/.dsh` file contents;
- personal data, session transcripts, private filesystem paths, or third-party
  user content;
- a malicious plugin tarball or a link that executes one;
- CVE/embargo details before a coordinated disclosure date.

If you already posted sensitive material publicly, say so in the private report
and rotate/revoke the exposed secret first; deleting the post is not enough.

## What to include

A useful report has:

1. affected project version (`dsh-standards --version`) and commit/tag;
2. DSH host version and Cordis version, if the issue involves runtime behavior;
3. OS and Node version;
4. the affected clause/check ID (`C-15`, `DSC-17`, …) and the expected vs actual
   result;
5. impact: what an attacker gains, or what a user is misled to believe;
6. a minimal repro (sanitized): package manifest, fixture, command, and the
   relevant report JSON;
7. whether the issue is already public or known to others;
8. preferred credit name, or "anonymous".

Reports that contain secrets should redact them; we do not need the real value to
fix a leak.

## Response targets (not commitments)

| Stage | Target |
|---|---|
| Acknowledge receipt | within 7 calendar days |
| Initial triage + severity | within 14 calendar days |
| Fix or documented mitigation | within 90 calendar days |
| Coordinated disclosure | default 90 days after triage, by mutual agreement |

These are **targets**, not guarantees. If a fix needs a host change or a
third-party release, we will say so and may ask for more time. If the issue is
being actively exploited, we may publish a mitigation before a full fix.

## Disclosure and credit

- We follow coordinated disclosure: private report → fix → advisory → public
  details. We will credit the reporter unless they ask to remain anonymous.
- We may request a CVE through GitHub's advisory flow when the issue affects
  users broadly. We cannot assign CVEs for third-party plugins.
- We do not pay bounties. We do not sign NDAs or provide legal advice.
- Please do not test against other people's machines, accounts, or data; use
  your own temporary profile and a fake `DSH_HOME`/`HOME` (see the audit
  fixtures in the repository for the expected pattern).

## What a PASS means (scope boundary)

- `DS-C`, `DSH-ENTRY`, `DSH-FLOW`, `DSH-BOOST`, and `--scope security` are
  **evidence checks at a recorded anchor**, not a security review.
- In `--scope security`, `security.status=pass` only means: within the 8
  security checks (`C-15`–`C-22`), no blocking check produced FAIL and no
  mandatory check was left `NA`/`ERROR`/`not-run`; there was also no WARN.
  Outside that scope the block is advisory only (FAIL is capped to WARN), so
  `pass` there does not assert coverage. `C-18`/`C-19`/`C-20`/`C-22` are
  advisory and never produce FAIL (their WARN can make the status `warn`, not
  `fail`). `C-21` is mandatory in `--scope security` but its findings cap at
  WARN; a `not-run` can make the status `incomplete`.
- A plugin is code that runs in the host process with the user's privileges.
  Static checks cannot prove the absence of malice: dynamic code loading,
  runtime URL construction, `readdir` + prefix matching, transitive dependency
  scripts, and prompt injection semantics are outside static reach.
- A `PASS` without a command, version, and artifact is a bug. Report it.
- Plugin authors remain responsible for their own code and disclosures. A
  "recognized" or "passing" result does not mean the plugin is secure, correct,
  or endorsed.

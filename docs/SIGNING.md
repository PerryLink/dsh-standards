# Evidence signing (Ed25519)

`dsh-flow-evidence/2` documents can carry a detached Ed25519 signature. The
implementation uses only `node:crypto` (no dependencies) and lives in
`40-checker/src/signature.mjs`; `40-checker/scripts/sign-evidence.mjs` is the
CLI. Signing is optional: it does not change `validateFlowEvidence()`, does not
change the chain hash, and never upgrades a claim level.

## What is signed

The payload is canonical JSON (recursively sorted object keys, array order
preserved) of every field **except `signature`**. This includes `chain`, so a
signature also binds the declared `chain.evidenceHash`. The chain hash itself
is computed over the body only (it excludes `chain` and `signature`). A signed
document keeps its existing `chain.evidenceHash`; `signature` is outside the
hash, so signing and re-signing do not invalidate the chain.

```
signature: {
  alg: "ed25519",
  keyId: "<first 16 hex of sha256(SPKI public key PEM)>",
  publicKey: "<SPKI PEM>",
  sig: "<base64 detached signature>",
  at: "<ISO-8601 timestamp>"
}
```

`keyId` is the first 16 hex characters of sha256 over the exact SPKI PEM string
embedded as `publicKey` (line endings included), so a verifier can recompute it
from the signature record. `publicKey` is embedded for transport convenience;
it is **self-asserted**.

## Key management

```sh
# Generate once, outside the repository working tree.
node 40-checker/scripts/sign-evidence.mjs keygen --out ~/.dsh-evidence-keys
# ed25519.pem (PKCS#8 private) and ed25519.pub.pem (SPKI public), both mode 0600.
```

- Never commit `ed25519.pem`, put it in logs, or paste it into an issue. Back it
  up in a secret manager; losing it means old signatures can no longer be
  produced (they remain verifiable).
- `keygen` refuses to overwrite an existing key unless `--force` is passed.
- Distribute `ed25519.pub.pem` and its `keyId` through a separate, trusted
  channel (release notes, repository file, pinned fingerprint). A public key
  fetched from the same JSON it verifies proves nothing about identity.
- Rotate by generating a new pair; signatures keep their old `keyId`. Verifiers
  should accept a set of pinned keyIds and record which one matched.
- The `at` field is signer-defined. It is evidence metadata, not a trusted
  timestamp; a signer can backdate or replay. Add policy (expiry, nonce,
  transparency log) outside this tool if that matters.

## Usage

```sh
# Sign after the collector has written and finalized the evidence.
node 40-checker/scripts/sign-evidence.mjs sign flow-evidence.json \
  --key ~/.dsh-evidence-keys/ed25519.pem \
  --out flow-evidence.signed.json

# Verify. Prints exactly one of: valid | invalid | missing.
node 40-checker/scripts/sign-evidence.mjs verify flow-evidence.signed.json
node 40-checker/scripts/sign-evidence.mjs verify flow-evidence.signed.json \
  --pub ~/.dsh-evidence-keys/ed25519.pub.pem
```

Exit codes: `0` valid, `1` invalid or missing, `2` usage/input error.
`--json` prints the detailed result (`status`, `keyId`, `keyIdMatch`,
`publicKeySource`, `reason`). `missing` means the document has no signature (or
`signature: null`), or there is no public key to check it (no embedded
`publicKey` and no readable `--pub`). `invalid` covers malformed records, key
mismatch, and a payload that does not verify. When `--pub` is supplied, it is
the trust anchor: the embedded key is only used to cross-check `keyId`.

The same helpers are re-exported from `40-checker/src/flow-evidence.mjs`:
`attachEvidenceSignature()`, `verifyEvidenceSignature()`,
`evidenceSigningPayload()`, `keyIdFromPublicKey()`.

## CI usage

Keep the private key in a CI secret and materialize it as a 0600 file only for
the signing step; delete it immediately afterwards. Never print it.

```yaml
- name: Sign FLOW evidence
  env:
    EVIDENCE_PRIVATE_KEY: ${{ secrets.EVIDENCE_PRIVATE_KEY }}
  run: |
    umask 077
    printf '%s' "$EVIDENCE_PRIVATE_KEY" > "$RUNNER_TEMP/evidence-key.pem"
    node 40-checker/scripts/sign-evidence.mjs sign flow-evidence.json \
      --key "$RUNNER_TEMP/evidence-key.pem" \
      --out flow-evidence.signed.json
    rm -f "$RUNNER_TEMP/evidence-key.pem"

- name: Verify with the pinned public key
  run: |
    node 40-checker/scripts/sign-evidence.mjs verify flow-evidence.signed.json \
      --pub .github/evidence-pub.pem
```

For PRs from forks, do not expose the signing secret to code from the fork.
Sign on a trusted workflow (e.g. `workflow_run` after review, or a maintainer
run); a signature produced by untrusted code is only as trustworthy as that
code.

## Trust boundary

**A valid self-signature is not trust.** It proves that whoever held the
private key signed these exact bytes. It does **not** prove:

- who that holder is (no identity, no CA, no account binding);
- that the evidence was produced honestly, or that commands ran where claimed;
- that the subject package is safe, correct, or officially endorsed;
- freshness: `at` can be backdated and a valid old document can be replayed;
- that the signer is allowed to speak for a project or marketplace.

Consequences:

- A verifier must pin the public key or `keyId` out-of-band. Treat the embedded
  `publicKey` as a hint, not as an identity.
- Compromise of the private key compromises every signature made with it;
  revocation and rotation are policy decisions this tool does not implement.
- Signature + chain hash give integrity and origin-of-holding, not truth. The
  structural rules of `validateFlowEvidence()` and `level-audit` are unchanged;
  signing cannot turn `self-attested`/`ci-attested` into `sandbox-attested`.
- A marketplace or adoption decision still needs its own policy: who is
  allowed to sign, which keyIds are accepted, what evidence is required, how
  long it is valid, and how disputes/revocations are handled. This repository
  ships a mechanism, not a trust root and not a certification.

For the sandbox side of the evidence, see `40-checker/src/sandbox-run.mjs`:
`setpriv --no-new-privs --bounding-set=-all`, extra `nofile`/`fsize` rlimits,
and a read-only bind of the package copy are attempted and recorded. They are
containment, not seccomp/cgroup/OCI isolation, and they do not make a
self-signed document trustworthy.

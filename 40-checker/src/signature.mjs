/**
 * Ed25519 signatures for FLOW evidence (`dsh-flow-evidence/2`).
 *
 * Zero dependencies: `node:crypto` only. A signature is a detached Ed25519
 * signature over the canonical JSON encoding of the document with the
 * `signature` field removed. The chain hash is computed over the body (minus
 * `chain` and `signature`); the signed payload includes `chain`, so the
 * signature also binds the declared chain hash. Signing never changes
 * `chain.evidenceHash`, because `signature` is excluded from both payloads.
 *
 * Signature record:
 *
 *   signature: {
 *     alg: "ed25519",
 *     keyId: "<first 16 hex of sha256(SPKI public key PEM)>",
 *     publicKey: "<SPKI PEM>",
 *     sig: "<base64 detached signature>",
 *     at: "<ISO-8601 timestamp>"
 *   }
 *
 * `keyId` is derived from the exact SPKI PEM string that is embedded as
 * `publicKey` (line endings included), so a verifier can recompute it from the
 * signature record. This is an integrity/origin mechanism only: an embedded
 * public key is self-asserted, so a valid signature does not make the signer
 * trustworthy.
 */
import crypto from 'node:crypto'

export const SIGNATURE_ALG = 'ed25519'
export const SIGNATURE_SCHEMA = 'dsh-evidence-signature/1'
export const KEY_ID_LENGTH = 16

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** JSON with recursively sorted object keys; array order is preserved. */
export function canonicalJson(value) {
  const sort = (node) => {
    if (Array.isArray(node)) return node.map(sort)
    if (isPlainObject(node)) {
      const out = {}
      for (const key of Object.keys(node).sort()) out[key] = sort(node[key])
      return out
    }
    return node
  }
  return JSON.stringify(sort(value))
}

/**
 * The exact bytes an evidence signature covers: canonical JSON of every field
 * except `signature`. Unlike `evidenceHash()` (which also removes `chain`),
 * this includes `chain`, so a signature binds the declared chain hash as well.
 */
export function evidenceSigningPayload(document) {
  if (!isPlainObject(document)) throw new TypeError('evidence document must be a JSON object')
  const copy = { ...document }
  delete copy.signature
  return Buffer.from(canonicalJson(copy), 'utf8')
}

function asPublicKey(key) {
  if (key instanceof crypto.KeyObject) {
    if (key.type === 'public') return key
    return crypto.createPublicKey(key)
  }
  return crypto.createPublicKey(key)
}

function asPrivateKey(key) {
  if (key instanceof crypto.KeyObject) {
    if (key.type === 'private') return key
    return crypto.createPrivateKey(key)
  }
  return crypto.createPrivateKey(key)
}

export function publicKeyPem(key) {
  return asPublicKey(key).export({ type: 'spki', format: 'pem' }).toString()
}

/** keyId = first 16 hex of sha256(SPKI public key PEM text). */
export function keyIdFromPublicKey(key) {
  let pem
  if (typeof key === 'string' && key.includes('BEGIN PUBLIC KEY')) {
    pem = key
  } else if (Buffer.isBuffer(key) && key.toString('utf8').includes('BEGIN PUBLIC KEY')) {
    pem = key.toString('utf8')
  } else {
    pem = publicKeyPem(key)
  }
  return crypto.createHash('sha256').update(pem).digest('hex').slice(0, KEY_ID_LENGTH)
}

export function generateEd25519KeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKeyPem(publicKey),
    keyId: keyIdFromPublicKey(publicKey),
  }
}

export function loadPrivateKey(pem) {
  return crypto.createPrivateKey(pem)
}

export function loadPublicKey(pem) {
  return crypto.createPublicKey(pem)
}

/**
 * Return a copy of `document` carrying an Ed25519 signature. Any previous
 * signature is replaced (it is not part of the signed payload). `at` defaults
 * to now; pass an explicit ISO timestamp for reproducible evidence.
 */
export function signEvidence(document, privateKey, { at = new Date().toISOString(), keyId = null } = {}) {
  if (!isPlainObject(document)) throw new TypeError('evidence document must be a JSON object')
  const privateObject = asPrivateKey(privateKey)
  const publicObject = crypto.createPublicKey(privateObject)
  const pem = publicKeyPem(publicObject)
  const computed = keyIdFromPublicKey(pem)
  const id = keyId ?? computed
  if (typeof id !== 'string' || !/^[0-9a-f]{16}$/.test(id)) {
    throw new Error('signature.keyId must be 16 lowercase hex characters')
  }
  if (id !== computed) {
    throw new Error(`signature.keyId does not match the private key (expected ${computed})`)
  }
  if (typeof at !== 'string' || at.length === 0) {
    throw new Error('signature.at must be a non-empty ISO-8601 string')
  }
  const sig = crypto.sign(null, evidenceSigningPayload(document), privateObject).toString('base64')
  return {
    ...document,
    signature: {
      alg: SIGNATURE_ALG,
      keyId: id,
      publicKey: pem,
      sig,
      at,
    },
  }
}

function invalid(reason, extra = {}) {
  return { status: 'invalid', reason, ...extra }
}

/**
 * Verify a signed evidence document.
 *
 * - `missing`: no `signature` (or `signature: null`), or no public key is
 *   available to check it (embedded key absent and no pinned key supplied).
 * - `invalid`: malformed signature, key mismatch, or a payload that does not
 *   verify.
 * - `valid`: the signature verifies against the embedded key (or `publicKey`
 *   when pinned).
 *
 * `publicKey` pins the trust anchor: pass a PEM/KeyObject out-of-band and the
 * embedded key is only used to check `keyId` consistency. Without a pin, the
 * embedded key is self-asserted — valid means "these bytes were signed by the
 * holder of this key", not "the signer is trusted".
 */
export function verifyEvidenceSignature(document, { publicKey = null } = {}) {
  if (!isPlainObject(document)) return invalid('evidence document must be a JSON object')
  const signature = document.signature
  if (signature === undefined || signature === null) {
    return { status: 'missing', reason: 'document has no signature' }
  }
  if (!isPlainObject(signature)) return invalid('signature must be an object')
  if (signature.alg !== SIGNATURE_ALG) return invalid(`signature.alg must be ${SIGNATURE_ALG}`)
  if (typeof signature.sig !== 'string' || signature.sig.length === 0) {
    return invalid('signature.sig must be a non-empty base64 string')
  }
  if (typeof signature.keyId !== 'string' || !/^[0-9a-f]{16}$/.test(signature.keyId)) {
    return invalid('signature.keyId must be 16 lowercase hex characters')
  }

  let embedded = null
  if (signature.publicKey !== undefined && signature.publicKey !== null) {
    if (typeof signature.publicKey !== 'string' || signature.publicKey.trim() === '') {
      return invalid('signature.publicKey must be a non-empty PEM string when present')
    }
    try {
      embedded = asPublicKey(signature.publicKey)
    } catch {
      return invalid('signature.publicKey is not a valid public key')
    }
    const embeddedId = keyIdFromPublicKey(signature.publicKey)
    if (embeddedId !== signature.keyId) {
      return invalid('signature.keyId does not match sha256(signature.publicKey)[:16]', {
        keyId: embeddedId,
        embeddedKeyId: embeddedId,
        keyIdMatch: false,
      })
    }
  }

  let key = null
  let source = null
  if (publicKey !== null && publicKey !== undefined) {
    try {
      key = asPublicKey(publicKey)
    } catch {
      return invalid('pinned public key is not a valid public key')
    }
    source = 'pinned'
    const pinnedId = keyIdFromPublicKey(key)
    if (pinnedId !== signature.keyId) {
      return invalid('signature.keyId does not match the pinned public key', {
        keyId: pinnedId,
        embeddedKeyId: embedded ? keyIdFromPublicKey(embedded) : null,
        keyIdMatch: false,
      })
    }
  } else if (embedded) {
    key = embedded
    source = 'embedded'
  } else {
    return {
      status: 'missing',
      reason: 'no public key: signature.publicKey is missing and no pinned public key was supplied',
    }
  }

  const derivedKeyId = keyIdFromPublicKey(key)
  let ok = false
  try {
    ok = crypto.verify(null, evidenceSigningPayload(document), key, Buffer.from(signature.sig, 'base64'))
  } catch (error) {
    return invalid(`signature verification failed: ${error.message}`, {
      keyId: derivedKeyId,
      keyIdMatch: true,
    })
  }
  const result = {
    status: ok ? 'valid' : 'invalid',
    alg: SIGNATURE_ALG,
    keyId: derivedKeyId,
    embeddedKeyId: embedded ? keyIdFromPublicKey(embedded) : null,
    keyIdMatch: true,
    publicKeySource: source,
    at: typeof signature.at === 'string' ? signature.at : null,
  }
  if (!ok) result.reason = 'signature does not verify against the public key'
  return result
}

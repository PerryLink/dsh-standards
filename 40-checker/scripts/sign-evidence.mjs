#!/usr/bin/env node
/**
 * sign-evidence.mjs — Ed25519 key generation, evidence signing, verification.
 *
 * Usage:
 *   node 40-checker/scripts/sign-evidence.mjs keygen --out <dir> [--force]
 *   node 40-checker/scripts/sign-evidence.mjs sign <evidence.json> --key <private.pem> --out <signed.json> [--at <iso>]
 *   node 40-checker/scripts/sign-evidence.mjs verify <signed.json> [--pub <public.pem>] [--json]
 *
 * `verify` prints exactly `valid`, `invalid`, or `missing` on stdout (unless
 * `--json`) and exits 0 only for `valid`. The signature covers canonical JSON
 * with the `signature` field removed; see src/signature.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  generateEd25519KeyPair, keyIdFromPublicKey, loadPrivateKey, loadPublicKey,
  signEvidence, verifyEvidenceSignature,
} from '../src/signature.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

function usage() {
  return `sign-evidence — Ed25519 signatures for dsh-flow-evidence/2

Usage:
  node 40-checker/scripts/sign-evidence.mjs keygen --out <dir> [--force]
  node 40-checker/scripts/sign-evidence.mjs sign <evidence.json> --key <private.pem> --out <signed.json> [--at <iso>]
  node 40-checker/scripts/sign-evidence.mjs verify <signed.json> [--pub <public.pem>] [--json]

Keygen writes ed25519.pem (PKCS#8 private) and ed25519.pub.pem (SPKI public)
with mode 0600. Refuses to overwrite unless --force is given.

Sign covers canonical JSON of every field except \`signature\` and records
{ alg, keyId, publicKey, sig, at }; keyId is sha256(SPKI public key PEM)[:16].

Verify recomputes the payload and checks the signature. Pass --pub to pin the
trust anchor; without it the embedded public key is used (self-asserted).
Exit codes: 0 valid, 1 invalid/missing, 2 usage or input error.`
}

function parse(argv, { flags = [], values = [] } = {}) {
  const positional = []
  const options = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (flags.includes(arg)) {
      options[arg] = true
    } else if (values.includes(arg)) {
      const value = argv[i + 1]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      options[arg] = value
      i += 1
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown option: ${arg}`)
    } else {
      positional.push(arg)
    }
  }
  return { positional, options }
}

function readJsonFile(file) {
  const text = fs.readFileSync(file, 'utf8')
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`not valid JSON (${file}): ${error.message}`)
  }
}

function writeJsonFile(file, value) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv
  try {
    if (!command || command === '--help' || command === '-h' || command === 'help') {
      console.log(usage())
      return command ? 0 : 2
    }
    if (command === 'keygen') {
      const { options } = parse(rest, { flags: ['--force'], values: ['--out'] })
      if (!options['--out']) throw new Error('keygen needs --out <dir>')
      const outDir = path.resolve(options['--out'])
      const privateFile = path.join(outDir, 'ed25519.pem')
      const publicFile = path.join(outDir, 'ed25519.pub.pem')
      if (!options['--force'] && (fs.existsSync(privateFile) || fs.existsSync(publicFile))) {
        throw new Error(`refusing to overwrite existing key in ${outDir}; pass --force`)
      }
      const pair = generateEd25519KeyPair()
      fs.mkdirSync(outDir, { recursive: true })
      fs.writeFileSync(privateFile, pair.privateKeyPem, { mode: 0o600 })
      fs.writeFileSync(publicFile, pair.publicKeyPem, { mode: 0o600 })
      // writeFileSync mode is filtered by the umask; force the requested mode.
      fs.chmodSync(privateFile, 0o600)
      fs.chmodSync(publicFile, 0o600)
      const publicKey = loadPublicKey(fs.readFileSync(publicFile, 'utf8'))
      const keyId = keyIdFromPublicKey(publicKey)
      console.log(JSON.stringify({ privateKey: privateFile, publicKey: publicFile, keyId }, null, 2))
      return 0
    }
    if (command === 'sign') {
      const { positional, options } = parse(rest, { values: ['--key', '--out', '--at'] })
      if (positional.length !== 1) throw new Error('sign needs exactly one <evidence.json>')
      if (!options['--key']) throw new Error('sign needs --key <private.pem>')
      if (!options['--out']) throw new Error('sign needs --out <signed.json>')
      let at = new Date().toISOString()
      if (options['--at']) {
        const parsed = Date.parse(options['--at'])
        if (!Number.isFinite(parsed)) throw new Error(`--at is not a valid ISO-8601 timestamp: ${options['--at']}`)
        at = new Date(parsed).toISOString()
      }
      const document = readJsonFile(path.resolve(positional[0]))
      const privateKey = loadPrivateKey(fs.readFileSync(options['--key'], 'utf8'))
      const signed = signEvidence(document, privateKey, { at })
      const out = path.resolve(options['--out'])
      writeJsonFile(out, signed)
      console.log(JSON.stringify({ signed: out, keyId: signed.signature.keyId, alg: signed.signature.alg, at }, null, 2))
      return 0
    }
    if (command === 'verify') {
      const { positional, options } = parse(rest, { flags: ['--json'], values: ['--pub'] })
      if (positional.length !== 1) throw new Error('verify needs exactly one <signed.json>')
      let document
      try {
        document = readJsonFile(path.resolve(positional[0]))
      } catch (error) {
        console.error(`invalid\n${error.message}`)
        return 2
      }
      let publicKey = null
      if (options['--pub']) {
        try {
          publicKey = loadPublicKey(fs.readFileSync(options['--pub'], 'utf8'))
        } catch (error) {
          const status = error?.code === 'ENOENT' ? 'missing' : 'invalid'
          if (options['--json']) {
            console.log(JSON.stringify({ status, reason: `cannot read --pub key: ${error.message}` }, null, 2))
          } else {
            console.log(status)
          }
          console.error(`cannot read --pub key: ${error.message}`)
          return 1
        }
      }
      const result = verifyEvidenceSignature(document, { publicKey })
      if (options['--json']) console.log(JSON.stringify(result, null, 2))
      else console.log(result.status)
      if (result.status !== 'valid' && result.reason) console.error(result.reason)
      return result.status === 'valid' ? 0 : 1
    }
    console.error(`unknown command: ${command}`)
    console.error(usage())
    return 2
  } catch (error) {
    console.error(error.message)
    return 2
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}

export { HERE, main, parse, readJsonFile, writeJsonFile }

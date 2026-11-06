/**
 * Security layer v1: DSC-15…DSC-22.
 *
 * These checks are static clues, not a security audit. They cover:
 *   15 install lifecycle scripts      (blocking in --scope security)
 *   16 dynamic execution              (blocking)
 *   17 sensitive-file reads           (blocking)
 *   18 egress endpoints               (advisory)
 *   19 opaque/binary artifacts        (advisory)
 *   20 prompt-injection clues         (advisory)
 *   21 supply-chain name similarity   (blocking in --scope security, WARN only)
 *   22 provenance/integrity           (advisory, not-run without metadata)
 *
 * None of these checks can prove the absence of malicious code.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { check, detail, worst } from './result.mjs'
import { inventoryFiles } from './util.mjs'
import {
  collectModuleEdges,
  identifierName,
  isDeclarationFile,
  literalStringValue,
  memberPropertyName,
  normalizeRelative,
  parseSource,
  resolveLocalSpecifier,
  walkAst,
} from './declarations.mjs'

export const SECURITY_IDS = [
  'DSC-15', 'DSC-16', 'DSC-17', 'DSC-18', 'DSC-19', 'DSC-20', 'DSC-21', 'DSC-22',
]

const SECURITY_ADVISORY = new Set(['DSC-18', 'DSC-19', 'DSC-20', 'DSC-22'])
const SECURITY_CLAUSE = {
  'DSC-15': 'C-15', 'DSC-16': 'C-16', 'DSC-17': 'C-17', 'DSC-18': 'C-18',
  'DSC-19': 'C-19', 'DSC-20': 'C-20', 'DSC-21': 'C-21', 'DSC-22': 'C-22',
}

const READ_APIS = new Set([
  'readFile', 'readFileSync', 'readJson', 'readJsonSync', 'readYaml', 'readYamlSync',
  'open', 'openSync', 'createReadStream', 'readdir', 'readdirSync',
])
const CHILD_PROCESS = /^(?:node:)?child_process$/
const COMMAND_EXEC_APIS = new Set(['exec', 'execSync', 'spawn', 'spawnSync', 'execFile', 'execFileSync'])
// A subprocess call is only a FAIL when its statically-known command is
// unambiguously a download-and-run / obfuscated payload, never for a plain
// `git status` or an import that is never called.
const DANGEROUS_COMMAND = [
  { pattern: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|ksh|fish)\b/, label: 'remote script piped to a shell' },
  { pattern: /\b(?:curl|wget)\b[^\n]{0,200}(?:&&|;|\|\|)\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|ksh|fish|node)\b/, label: 'downloaded file executed by a shell' },
  { pattern: /\bbase64\s+(?:-d|--decode|-D)\b/, label: 'base64 decode command' },
  { pattern: /\bnode\s+(?:-e|--eval)\b/, label: 'inline node code' },
  { pattern: /\bpowershell(?:\.exe)?\b[^\n]*(?:-enc|-encodedcommand)\b/i, label: 'powershell encoded command' },
  { pattern: /\b(?:bash|sh|zsh|dash|ksh)\s+-[a-z]*c\b[^\n]{0,200}\b(?:curl|wget|base64|nc|eval)\b/, label: 'shell -c with a download/decode payload' },
]
const INSTRUCTION_PATTERN = /\b(?:ignore|disregard|forget)\b[^\n]{0,60}\b(?:previous|prior|above|earlier|system)\b|\byou are now\b|\bdo not (?:tell|reveal|mention|disclose)\b|\bsystem prompt\b|\bact as\b/i
const SUSPICIOUS_HOST = /(?:^|\.)(?:webhook|pastebin|paste|ngrok\.io|ngrok-free\.app|requestbin|pipedream|interact\.sh|burpcollaborator|canarytokens)\./i
const TEXT_EXTENSIONS = /\.(?:[cm]?[jt]sx?|json|md|txt|ya?ml|html|css)$/i
const BINARY_EXTENSIONS = new Set(['.wasm', '.node', '.so', '.dll', '.exe', '.dylib'])
const RULE_FILE = /(?:^|\/)(?:rules?|guards?|defend|detect|policy|policies|patterns?)(?:[./-]|$)/i
const RULE_KEYS = new Set(['rules', 'rule', 'patterns', 'pattern', 'regex', 'regexes', 'guard', 'guards', 'deny', 'blocklist', 'allowlist'])
const DOC_KEYS = new Set(['desc', 'description', 'message', 'title', 'label', 'reason', 'comment', 'help'])

const LIFECYCLE_NAMES = ['preinstall', 'install', 'postinstall', 'prepare']
const DANGEROUS_SCRIPT = [
  { pattern: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|ksh|fish)\b/, label: 'remote script piped to a shell' },
  { pattern: /\bbase64\s+(?:-d|--decode)\b|\bbase64\s+-D\b/, label: 'base64 decode in an install script' },
  { pattern: /\bnode\s+(?:-e|--eval)\b|\bnode(?:\.exe)?\s+['"]?-e/, label: 'node -e in an install script' },
  { pattern: /\b(?:sh|bash|zsh|dash|ksh)\s+-[a-z]*c\b/, label: 'shell -c in an install script' },
  { pattern: /\bpowershell(?:\.exe)?\b[^\n]*(?:-enc|-encodedcommand)\b/i, label: 'powershell encoded command' },
  { pattern: /\$HOME\b|\$\{HOME\}|\$DSH_HOME\b|\$\{DSH_HOME\}/, label: 'install script references the home directory' },
  { pattern: /(?:^|[\s'"=:(])~\/|(?:^|[\s'"=:(])\/etc\//, label: 'install script references ~ or /etc' },
]

// ---------------------------------------------------------------------------
// small AST helpers shared by the checks below
// ---------------------------------------------------------------------------

function keyName(property) {
  if (!property || property.type !== 'Property') return null
  if (!property.computed && property.key?.type === 'Identifier') return property.key.name
  if (property.key?.type === 'Literal' && typeof property.key.value === 'string') return property.key.value
  return null
}

function chainNames(node) {
  const names = []
  let current = node
  for (let guard = 0; current && guard < 12; guard += 1) {
    if (current.type === 'Identifier') { names.unshift(current.name); break }
    if (current.type === 'MemberExpression') {
      const property = memberPropertyName(current)
      if (property === null) break
      names.unshift(property)
      current = current.object
      continue
    }
    if (current.type === 'CallExpression' || current.type === 'NewExpression') {
      current = current.callee
      continue
    }
    break
  }
  return names
}

function isClientRelative(relative) {
  return /(?:^|\/)(?:client|browser)(?:\.(?:[cm]?[jt]sx?)|(?:\/))/i.test(normalizeRelative(relative))
}

function serverSources(sources) {
  return (sources ?? []).filter(source => !isDeclarationFile(source.relative) && !isClientRelative(source.relative))
}

function lineOf(node) {
  return node?.loc?.start?.line ?? 1
}

function evidenceOf(file, node) {
  return `${normalizeRelative(file)}:${lineOf(node)}`
}

function collectBindings(ast) {
  const bindings = new Map()
  walkAst(ast, (node) => {
    if (node.type !== 'VariableDeclarator') return
    if (node.id?.type !== 'Identifier' || !node.init) return
    if (!bindings.has(node.id.name)) bindings.set(node.id.name, node.init)
  })
  return bindings
}

const BASE64_TEXT = /^[A-Za-z0-9+/]+={0,2}$/

/** Decode a base64 literal only when the result is printable text. */
function decodeBase64Literal(text) {
  if (typeof text !== 'string' || text.length < 8 || text.length % 4 !== 0) return null
  if (!BASE64_TEXT.test(text)) return null
  let decoded
  try {
    decoded = Buffer.from(text, 'base64').toString('utf8')
  } catch {
    return null
  }
  if (decoded === '' || decoded.includes('\uFFFD')) return null
  if (!/^[\t\n\r\x20-\x7e]*$/.test(decoded)) return null
  return decoded
}

/**
 * `Buffer.from(<string>, 'base64').toString()` / `atob(<string>)` when the
 * payload is a static literal (also reachable through a local binding).
 * Returns null for runtime-joined or non-base64 encodings.
 */
function base64DecodedFrom(node, bindings, depth = 0, seen = new Set()) {
  if (!node || node.type !== 'CallExpression' || depth > 4 || seen.has(node)) return null
  const names = chainNames(node.callee)
  const last = names[names.length - 1]
  if (last === 'atob') {
    const payload = stringFromNode(node.arguments[0], bindings, depth + 1, new Set(seen).add(node))
    return payload === null ? null : decodeBase64Literal(payload)
  }
  if (last !== 'from' || names[names.length - 2] !== 'Buffer') return null
  const encodingNode = node.arguments[1]
  const encoding = encodingNode === undefined ? 'utf8' : (encodingNode.type === 'Literal' ? encodingNode.value : null)
  if (encoding !== 'base64' && encoding !== 'base64url') return null
  const payload = stringFromNode(node.arguments[0], bindings, depth + 1, new Set(seen).add(node))
  return payload === null ? null : decodeBase64Literal(payload)
}

function isBase64DecodeCall(node, bindings) {
  if (!node || node.type !== 'CallExpression') return false
  const names = chainNames(node.callee)
  const last = names[names.length - 1]
  if (last === 'from' && names[names.length - 2] === 'Buffer') {
    const encoding = node.arguments[1]
    if (encoding?.type !== 'Literal' || (encoding.value !== 'base64' && encoding.value !== 'base64url')) return false
    return stringFromNode(node.arguments[0], bindings) !== null
  }
  if (last === 'toString' && node.callee.type === 'MemberExpression') {
    const encoding = node.arguments[0]
    if (encoding?.type === 'Literal' && (encoding.value === 'base64' || encoding.value === 'base64url')) return false
    return base64DecodedFrom(node.callee.object, bindings) !== null
  }
  if (last === 'atob' && names[0] === 'atob') return base64DecodedFrom(node, bindings) !== null
  return false
}

function isProcessLike(node) {
  if (identifierName(node) === 'process') return true
  return node?.type === 'MemberExpression'
    && memberPropertyName(node) === 'process'
    && ['globalThis', 'global', 'window', 'self'].includes(identifierName(node.object))
}

/**
 * `process.env.HOME` / `process.env['DSH_HOME']` / `globalThis.process.env.HOME`.
 * The old check compared identifierName(node.object) with 'process', but
 * node.object is the `process.env` MemberExpression, so it never matched.
 */
function envPropertyOf(member) {
  if (!member || member.type !== 'MemberExpression') return null
  const env = member.object
  if (env?.type !== 'MemberExpression' || memberPropertyName(env) !== 'env') return null
  if (!isProcessLike(env.object)) return null
  return memberPropertyName(member)
}

/** Property name with static computed keys folded: globalThis['fe' + 'tch']. */
function foldedPropertyName(member, bindings) {
  if (!member || member.type !== 'MemberExpression') return null
  const direct = memberPropertyName(member)
  if (direct !== null) return direct
  if (!member.computed) return null
  return stringFromNode(member.property, bindings)
}

function stringFromNode(node, bindings, depth = 0, seen = new Set()) {
  if (!node || depth > 5 || seen.has(node)) return null
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node.type === 'TemplateLiteral') {
    let text = ''
    for (let index = 0; index < node.quasis.length; index += 1) {
      text += node.quasis[index].value?.cooked ?? node.quasis[index].value?.raw ?? ''
      if (index < node.expressions.length) {
        const part = stringFromNode(node.expressions[index], bindings, depth + 1, new Set(seen).add(node))
        if (part === null) return null
        text += part
      }
    }
    return text
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = stringFromNode(node.left, bindings, depth + 1, new Set(seen).add(node))
    const right = stringFromNode(node.right, bindings, depth + 1, new Set(seen).add(node))
    if (left === null || right === null) return null
    return left + right
  }
  if (node.type === 'ConditionalExpression') {
    return stringFromNode(node.consequent, bindings, depth + 1, new Set(seen).add(node))
      ?? stringFromNode(node.alternate, bindings, depth + 1, new Set(seen).add(node))
  }
  if (node.type === 'LogicalExpression') {
    return stringFromNode(node.left, bindings, depth + 1, new Set(seen).add(node))
      ?? stringFromNode(node.right, bindings, depth + 1, new Set(seen).add(node))
  }
  if (node.type === 'Identifier') {
    if (node.name === 'HOME') return '/home/dsh-user'
    const init = bindings.get(node.name)
    if (!init) return null
    return stringFromNode(init, bindings, depth + 1, new Set(seen).add(node))
  }
  if (node.type === 'MemberExpression') {
    const property = memberPropertyName(node)
    const objectName = identifierName(node.object)
    if (objectName === 'process' && property === 'cwd') return '/work/package'
    const envProperty = envPropertyOf(node)
    if (envProperty === 'HOME' || envProperty === 'USERPROFILE') return '/home/dsh-user'
    if (envProperty === 'DSH_HOME' || envProperty === 'XDG_CONFIG_HOME') return '/home/dsh-user/.dsh'
    return null
  }
  if (node.type === 'CallExpression') {
    const names = chainNames(node.callee)
    const last = names[names.length - 1]
    if (last === 'cwd') return '/work/package'
    if (last === 'homedir') return '/home/dsh-user'
    if (['join', 'resolve', 'normalize'].includes(last)) {
      const object = node.callee.type === 'MemberExpression' ? node.callee.object : null
      const fromArray = object?.type === 'ArrayExpression' ? object.elements : null
      if (fromArray) {
        const parts = fromArray.map(item => stringFromNode(item, bindings, depth + 1, new Set(seen).add(node)))
        if (parts.some(part => part === null)) return null
        return parts.join('/')
      }
      const parts = node.arguments.map(item => stringFromNode(item, bindings, depth + 1, new Set(seen).add(node)))
      if (parts.length === 0 || parts.some(part => part === null)) return null
      return parts.join('/')
    }
    if (last === 'join' && node.callee.type === 'MemberExpression' && node.callee.object.type === 'ArrayExpression') {
      const parts = node.callee.object.elements.map(item => stringFromNode(item, bindings, depth + 1, new Set(seen).add(node)))
      if (parts.some(part => part === null)) return null
      const separator = node.arguments.length > 0 ? stringFromNode(node.arguments[0], bindings, depth + 1, new Set(seen).add(node)) : '/'
      return parts.join(separator ?? '/')
    }
    if (last === 'toString') {
      const object = node.callee.type === 'MemberExpression' ? node.callee.object : null
      const encoding = node.arguments[0]
      const reEncoding = encoding?.type === 'Literal' && (encoding.value === 'base64' || encoding.value === 'base64url')
      if (!reEncoding) {
        const decoded = base64DecodedFrom(object, bindings, depth + 1, new Set(seen).add(node))
        if (decoded !== null) return decoded
      }
      if (object?.type === 'Literal') return String(object.value)
      return null
    }
    if (last === 'atob' && names[0] === 'atob') {
      const payload = stringFromNode(node.arguments[0], bindings, depth + 1, new Set(seen).add(node))
      if (payload !== null) {
        const decoded = decodeBase64Literal(payload)
        if (decoded !== null) return decoded
      }
      return null
    }
    if (names[0] === 'String') return stringFromNode(node.arguments[0], bindings, depth + 1, new Set(seen).add(node))
    return null
  }
  return null
}

function parseModule(source) {
  const parsed = parseSource(source)
  if (parsed.error) return { ast: null, error: parsed.error, bindings: new Map() }
  return { ast: parsed.ast, error: null, bindings: collectBindings(parsed.ast) }
}

// ---------------------------------------------------------------------------
// import-closure walker (DSC-16 only; DSC-10 has its own side-effect walker)
// ---------------------------------------------------------------------------

function analyseClosure(sources, entryRelative) {
  const byRelative = new Map()
  for (const source of serverSources(sources)) byRelative.set(normalizeRelative(source.relative), source)
  const entry = entryRelative ? normalizeRelative(entryRelative) : null
  const queue = []
  const notes = []
  if (entry && byRelative.has(entry)) {
    queue.push(entry)
  } else if (entry) {
    notes.push({ item: 'C-16.4', result: 'NA', reason: `not-run: entry module ${entryRelative} is not a scanned server source; scanned every server source instead`, evidence: [normalizeRelative(entryRelative)] })
    for (const relative of byRelative.keys()) queue.push(relative)
  } else {
    notes.push({ item: 'C-16.4', result: 'NA', reason: 'not-run: no resolvable entry; scanned every server source instead', evidence: [] })
    for (const relative of byRelative.keys()) queue.push(relative)
  }
  const visited = new Set()
  const parseErrors = []
  const packageImports = []
  const unresolved = []
  while (queue.length > 0) {
    const relative = queue.shift()
    if (visited.has(relative)) continue
    visited.add(relative)
    const parsed = parseModule(byRelative.get(relative))
    if (parsed.error) {
      parseErrors.push({ file: relative, ...parsed.error })
      continue
    }
    for (const edge of collectModuleEdges(parsed.ast)) {
      const resolution = resolveLocalSpecifier(relative, edge.specifier, byRelative)
      if (resolution.kind === 'local') {
        if (!isClientRelative(resolution.relative)) queue.push(resolution.relative)
      } else if (resolution.kind === 'package') {
        packageImports.push({ file: relative, line: edge.line, specifier: edge.specifier })
      } else {
        unresolved.push({ file: relative, line: edge.line, specifier: edge.specifier })
      }
    }
  }
  return { visited, parseErrors, packageImports, unresolved, notes, byRelative }
}

// ---------------------------------------------------------------------------
// DSC-15: install lifecycle scripts
// ---------------------------------------------------------------------------

const SCRIPT_FILE_EXTENSION = /\.(?:[cm]?[jt]s|sh|bash|zsh|ps1)$/i
const SCRIPT_INSPECT_MAX_BYTES = 512 * 1024
const SCRIPT_DANGER_RULES = [
  { pattern: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|ksh|fish)\b/, label: 'remote script piped to a shell' },
  { pattern: /\bbase64\s+(?:-d|--decode)\b|\bbase64\s+-D\b/, label: 'base64 decode' },
  { pattern: /\beval\b\s*\)?\s*\(|\bnew\s+Function\s*\(|\bvm\.(?:runIn\w+|compileFunction)\s*\(/, label: 'eval/Function of a string' },
  { pattern: /\bnode\s+(?:-e|--eval)\b|\b(?:sh|bash|zsh|dash|ksh)\s+-[a-z]*c\b/, label: 'inline code passed to an interpreter' },
  { pattern: /\bpowershell(?:\.exe)?\b[^\n]*(?:-enc|-encodedcommand)\b/i, label: 'powershell encoded command' },
  { pattern: /(?:readFile(?:Sync)?|createReadStream|open(?:Sync)?)\s*\([^\n]{0,200}(?:\.ssh|\.dsh|credential|id_rsa|id_ed25519|\.aws|\.npmrc|\.netrc|tokens?)/i, label: 'reads a credential-like path' },
  { pattern: /\b(?:cat|cp|scp|tar|zip)\b[^\n]{0,160}(?:\.ssh\/|\.dsh\/|credentials|id_rsa|\.aws\/|\.npmrc|\.netrc)/i, label: 'collects credential-like files' },
  { pattern: /(?:os\.homedir\(\)|process\.env\.(?:HOME|USERPROFILE|DSH_HOME))[^\n]{0,160}(?:\.dsh|\.ssh|credential|tokens?|id_rsa)/i, label: 'combines the home directory with a secret path' },
]
const SCRIPT_NETWORK = /\b(?:fetch|axios\.(?:get|post)|https?\.(?:get|request))\s*\(|\bcurl\b|\bwget\b/
const SCRIPT_EXECUTE = /\beval\b|\bnew\s+Function\b|\b(?:exec|execSync|spawn|spawnSync|execFile|execFileSync)\s*\(|\bvm\.(?:runIn\w+|compileFunction)/
// require(<variable>) / import(<variable>): loading code that is not a static
// literal. Only dangerous when the same script also downloads or pipes code.
const SCRIPT_DYNAMIC_LOAD = /\brequire\s*\(\s*(?!['"`])[A-Za-z_$]|\bimport\s*\(\s*(?!['"`])[A-Za-z_$]|\b(?:require|import)\s*\(\s*['"`](?:\/|\.\.\/|https?:\/\/)/
const SCRIPT_CHILD_DYNAMIC = [
  /\b(?:exec|execSync|spawn|spawnSync|execFile|execFileSync)\s*\(\s*`[^`]*\$\{/,
  /\b(?:exec|execSync|spawn|spawnSync|execFile|execFileSync)\s*\(\s*[A-Za-z_$][\w$]*\s*[,)]/,
]

function scriptDangerLabels(text) {
  const labels = []
  const add = (label) => { if (!labels.includes(label)) labels.push(label) }
  for (const rule of SCRIPT_DANGER_RULES) if (rule.pattern.test(text)) add(rule.label)
  if (SCRIPT_NETWORK.test(text) && SCRIPT_EXECUTE.test(text)) add('downloads remote content and executes it')
  if (SCRIPT_NETWORK.test(text) && SCRIPT_DYNAMIC_LOAD.test(text)) add('downloads remote content and dynamically loads it')
  if (/\bchild_process\b/.test(text) && SCRIPT_CHILD_DYNAMIC.some(pattern => pattern.test(text))) {
    add('child_process with a dynamic command')
  }
  return labels
}

/** Local script paths referenced by one lifecycle command (node/sh/tsx/direct). */
function commandScriptReferences(command) {
  const references = []
  const add = (value) => {
    if (!value || value.startsWith('-')) return
    if (value.includes('://')) return
    if (!SCRIPT_FILE_EXTENSION.test(value)) return
    if (!references.includes(value)) references.push(value)
  }
  for (const match of command.matchAll(/\bnode\s+(?!-e\b|--eval\b)(?:(?:--?[\w-]+(?:=[^\s]+)?)\s+)*([^\s;&|()]+)/g)) add(match[1])
  for (const match of command.matchAll(/\b(?:sh|bash|zsh|dash|ksh|fish)\s+(?!-[a-z]*c\b)([^\s;&|()]+)/g)) add(match[1])
  for (const match of command.matchAll(/(?:^|[;&|]\s*|\b(?:then|do|else)\s+)((?:\.{1,2}\/)?[\w@./-]+\.(?:[cm]?[jt]s|sh|ps1))/g)) add(match[1])
  return references
}

/** Follow `npm run x` one level so `postinstall: npm run setup` is inspectable. */
function collectScriptFacts(command, dir, scripts, depth = 0, seen = new Set(), acc = null) {
  const facts = acc ?? { references: [], missing: [] }
  for (const reference of commandScriptReferences(command)) {
    if (!facts.references.includes(reference)) facts.references.push(reference)
  }
  for (const match of command.matchAll(/\b(?:npm|pnpm|yarn)\s+run\s+([\w:.@-]+)/g)) {
    const name = match[1]
    if (!Object.hasOwn(scripts, name)) {
      if (!facts.missing.includes(`npm run ${name}`)) facts.missing.push(`npm run ${name}`)
      continue
    }
    if (depth >= 2 || seen.has(name)) continue
    seen.add(name)
    collectScriptFacts(String(scripts[name] ?? ''), dir, scripts, depth + 1, seen, facts)
  }
  return facts
}

/**
 * Read a referenced local script and look for install-time danger. The file is
 * never executed; only text is inspected and the walk is bounded to the
 * package directory so a lifecycle command cannot make the checker read an
 * arbitrary host file.
 */
function inspectInstallScript(reference, dir) {
  const root = path.resolve(dir)
  const absolute = path.resolve(root, reference)
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    return { reference, skipped: 'outside the package tree' }
  }
  let stats
  try { stats = fs.lstatSync(absolute) } catch { return { reference, missing: true } }
  if (stats.isSymbolicLink()) return { reference, skipped: 'symlink not followed' }
  if (!stats.isFile()) return { reference, missing: true }
  if (stats.size > SCRIPT_INSPECT_MAX_BYTES) return { reference, skipped: `larger than ${SCRIPT_INSPECT_MAX_BYTES} bytes` }
  let text
  try { text = fs.readFileSync(absolute, 'utf8') } catch { return { reference, skipped: 'unreadable' } }
  if (text.includes('\0')) return { reference, skipped: 'binary content' }
  return { reference, labels: scriptDangerLabels(text) }
}

export function checkLifecycleScripts(manifest, dir) {
  const scripts = manifest?.scripts && typeof manifest.scripts === 'object' && !Array.isArray(manifest.scripts) ? manifest.scripts : {}
  const details = []
  const findings = []
  let present = 0
  for (const name of LIFECYCLE_NAMES) {
    const command = scripts[name]
    if (typeof command !== 'string' || command.trim() === '') continue
    present += 1
    const evidence = [`package.json#scripts.${name}`]
    const dangerous = DANGEROUS_SCRIPT.filter(rule => rule.pattern.test(command)).map(rule => rule.label)
    const facts = dir ? collectScriptFacts(command, dir, scripts) : { references: [], missing: [] }
    const missing = [...new Set(facts.missing)]
    const contentFindings = []
    const skipped = []
    for (const reference of facts.references) {
      const inspected = inspectInstallScript(reference, dir)
      if (inspected.missing) missing.push(reference)
      else if (inspected.skipped) skipped.push(`${reference}: ${inspected.skipped}`)
      else if (inspected.labels.length > 0) contentFindings.push(`${reference}: ${inspected.labels.join(', ')}`)
    }
    if (name === 'prepare' && dangerous.length > 0) {
      details.push(detail('C-15.1', 'WARN', `scripts.prepare uses a dangerous form (${dangerous.join('; ')}); prepare is allowBuilds-gated, so this is WARN not FAIL`, evidence))
      findings.push('warn')
    } else if (dangerous.length > 0) {
      details.push(detail('C-15.1', 'FAIL', `scripts.${name} uses a dangerous form: ${dangerous.join('; ')}`, evidence))
      findings.push('fail')
    } else if (missing.length > 0) {
      // `prepare` also runs for git/source installs, which pnpm gates behind
      // allowBuilds; a missing prepare target is therefore WARN, not FAIL.
      const level = name === 'prepare' ? 'WARN' : 'FAIL'
      details.push(detail('C-15.3', level, `scripts.${name} references missing script(s): ${missing.join(', ')}${name === 'prepare' ? ' (prepare is allowBuilds-gated)' : ''}`, evidence))
      findings.push(level === 'WARN' ? 'warn' : 'fail')
    } else if (contentFindings.length > 0) {
      const level = name === 'prepare' ? 'WARN' : 'FAIL'
      details.push(detail('C-15.1', level, `referenced install script is dangerous: ${contentFindings.join('; ')}${name === 'prepare' ? ' (prepare is allowBuilds-gated)' : ''}`, evidence))
      findings.push(level === 'WARN' ? 'warn' : 'fail')
    } else if (skipped.length > 0) {
      details.push(detail('C-15.2', 'WARN', `referenced install script was not inspected: ${skipped.join('; ')}`, evidence))
      findings.push('warn')
    } else {
      details.push(detail('C-15.2', 'WARN', `lifecycle script scripts.${name} is present; install-time commands are not executed by the checker`, evidence))
      if (facts.references.length > 0) {
        details.push(detail('C-15.2', 'PASS', `inspected referenced script(s): ${facts.references.join(', ')}; no dangerous pattern found`))
      }
      findings.push('warn')
    }
  }
  if (present === 0) {
    details.push(detail('C-15.2', 'PASS', 'no preinstall/install/postinstall/prepare script is declared'))
  }
  const result = worst(findings.map(value => value === 'fail' ? 'FAIL' : 'WARN'))
  return check({
    id: 'DSC-15',
    clause: 'C-15',
    layer: 'L0',
    result: findings.length === 0 ? 'PASS' : result,
    coverage: 'full',
    reason: details.filter(item => item.result === 'FAIL' || item.result === 'WARN').map(item => `${item.item}: ${item.reason}`).join(' | '),
    details,
    evidence: ['package.json#scripts'],
  })
}

// ---------------------------------------------------------------------------
// DSC-16: dynamic execution in the server entry closure
// ---------------------------------------------------------------------------

function allowsEvalContext(ancestors) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const node = ancestors[index]
    if (node.type === 'Property' && keyName(node) === 'allowsEval') return true
    if (node.type === 'VariableDeclarator' && identifierName(node.id) === 'allowsEval') return true
    if (node.type === 'AssignmentExpression' && memberPropertyName(node.left) === 'allowsEval') return true
  }
  return false
}

function isFunctionConstructor(node) {
  if (node.type !== 'NewExpression' && node.type !== 'CallExpression') return false
  return chainNames(node.callee).join('.') === 'Function'
}

function functionConstructorExempt(node, ancestors) {
  const args = node.arguments ?? []
  if (args.length === 0) return true
  if (args.every(arg => arg.type === 'Literal' && arg.value === '')) return true
  return allowsEvalContext(ancestors)
}

/** exec/execSync/spawn/... called directly or through a one-level alias. */
function commandExecApiOf(callee, bindings) {
  if (!callee) return null
  if (callee.type === 'Identifier') {
    if (COMMAND_EXEC_APIS.has(callee.name)) return callee.name
    const init = bindings.get(callee.name)
    if (init?.type === 'MemberExpression') {
      const property = memberPropertyName(init)
      if (property && COMMAND_EXEC_APIS.has(property)) return property
    }
    return null
  }
  if (callee.type === 'MemberExpression') {
    const property = memberPropertyName(callee)
    if (property && COMMAND_EXEC_APIS.has(property)) return property
  }
  return null
}

/** Join the statically resolvable command/argv parts; options objects are skipped. */
function commandTextOf(node, bindings) {
  const parts = []
  for (const argument of node.arguments ?? []) {
    if (!argument || argument.type === 'ObjectExpression') continue
    if (argument.type === 'ArrayExpression') {
      for (const element of argument.elements) {
        if (!element) continue
        const value = stringFromNode(element, bindings)
        if (value !== null) parts.push(value)
      }
      continue
    }
    const value = stringFromNode(argument, bindings)
    if (value !== null) parts.push(value)
  }
  return parts.length > 0 ? parts.join(' ') : null
}

function dangerousCommandLabels(text) {
  const labels = []
  for (const rule of DANGEROUS_COMMAND) if (rule.pattern.test(text)) labels.push(rule.label)
  return labels
}

export function checkDynamicExecution(manifest, sources, entry, kind = null) {
  if (kind === 'client') {
    return check({
      id: 'DSC-16', clause: 'C-16', layer: 'L0', result: 'NA', coverage: 'not-run', advisory: false,
      reason: 'client-only package; server entry closure is not applicable',
      details: [detail('C-16.4', 'NA', 'not-run: client package has no server entry', ['package.json#dsh.kind'])],
      evidence: ['package.json#dsh.kind'],
    })
  }
  if (!sources || sources.length === 0) {
    return check({
      id: 'DSC-16', clause: 'C-16', layer: 'L0', result: 'NA', coverage: 'not-run', advisory: false,
      reason: 'no source files scanned; DSC-16 not-run',
      details: [detail('C-16.4', 'NA', 'not-run: no source files', [])],
      evidence: [],
    })
  }
  if (serverSources(sources).length === 0) {
    return check({
      id: 'DSC-16', clause: 'C-16', layer: 'L0', result: 'NA', coverage: 'not-run', advisory: false,
      reason: 'only client/browser sources were scanned; DSC-16 does not scan client code',
      details: [detail('C-16.4', 'NA', 'not-run: no server source outside client/browser paths', [])],
      evidence: [],
    })
  }
  const closure = analyseClosure(sources, entry?.relative ?? null)
  const details = [...closure.notes]
  const dynamic = []
  const subprocess = []
  const fileFacts = new Map()
  for (const relative of closure.visited) {
    const parsed = parseModule(closure.byRelative.get(relative))
    if (parsed.error) continue
    let facts = fileFacts.get(relative)
    if (!facts) {
      facts = { base64Line: null, evalLike: false }
      fileFacts.set(relative, facts)
    }
    walkAst(parsed.ast, (node, ancestors) => {
      if (isBase64DecodeCall(node, parsed.bindings)) {
        if (facts.base64Line === null) facts.base64Line = lineOf(node)
      }
      if (node.type === 'ImportDeclaration' && typeof node.source?.value === 'string' && CHILD_PROCESS.test(node.source.value)) {
        subprocess.push({ file: relative, line: lineOf(node), what: `import ${node.source.value}` })
        return
      }
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') {
        const argument = node.arguments[0]
        if (argument?.type === 'Literal' && typeof argument.value === 'string' && CHILD_PROCESS.test(argument.value)) {
          subprocess.push({ file: relative, line: lineOf(node), what: `require('${argument.value}')` })
        }
      }
      if (node.type === 'ImportExpression' && node.source?.type === 'Literal' && typeof node.source.value === 'string' && CHILD_PROCESS.test(node.source.value)) {
        subprocess.push({ file: relative, line: lineOf(node), what: `import('${node.source.value}')` })
      }
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'eval') {
        facts.evalLike = true
        dynamic.push({ file: relative, line: lineOf(node), what: 'eval()', item: 'C-16.1' })
        return
      }
      if (isFunctionConstructor(node)) {
        facts.evalLike = true
        if (!functionConstructorExempt(node, ancestors)) dynamic.push({ file: relative, line: lineOf(node), what: 'new Function()', item: 'C-16.1' })
        return
      }
      if (node.type === 'CallExpression') {
        const execApi = commandExecApiOf(node.callee, parsed.bindings)
        if (execApi) {
          const command = commandTextOf(node, parsed.bindings)
          const labels = command === null ? [] : dangerousCommandLabels(command)
          if (labels.length > 0) {
            // Dangerous exec/spawn input is a subprocess finding (C-16.3), not
            // eval/new Function (C-16.1): the remediation for it is "pass an
            // argument array / allowlist", not "remove eval".
            dynamic.push({ file: relative, line: lineOf(node), what: `child_process.${execApi} executes a dangerous command (${labels.join('; ')})`, item: 'C-16.3' })
            return
          }
        }
      }
      if (node.type === 'CallExpression' || node.type === 'NewExpression') {
        const names = chainNames(node.callee)
        const joined = names.join('.')
        if (/^vm\.(?:runInContext|runInNewContext|runInThisContext|compileFunction|createContext|Script)$/.test(joined)
          || (names.length === 2 && names[0] === 'vm' && names[1] === 'Script')) {
          dynamic.push({ file: relative, line: lineOf(node), what: joined, item: 'C-16.2' })
          return
        }
        if (names.length === 2 && names[1] === '_compile' && ['module', 'Module'].includes(names[0])) {
          dynamic.push({ file: relative, line: lineOf(node), what: `${names[0]}._compile`, item: 'C-16.2' })
          return
        }
        if (names.join('.') === 'process.binding') dynamic.push({ file: relative, line: lineOf(node), what: 'process.binding', item: 'C-16.2' })
      }
    })
  }
  const obfuscated = []
  for (const [file, facts] of fileFacts) {
    if (facts.base64Line !== null && facts.evalLike) {
      obfuscated.push({ file, line: facts.base64Line, what: 'base64-decoded payload in the same file as eval/new Function' })
    }
  }
  const dynamicEvidence = dynamic.slice(0, 5).map(item => `${item.file}:${item.line}`)
  const obfuscatedEvidence = obfuscated.slice(0, 5).map(item => `${item.file}:${item.line}`)
  const subprocessEvidence = subprocess.slice(0, 5).map(item => `${item.file}:${item.line}`)
  for (const item of dynamic.slice(0, 8)) {
    details.push(detail(item.item, 'FAIL', `dynamic execution (code:dynamic): ${item.what} at ${item.file}:${item.line}`, [`${item.file}:${item.line}`]))
  }
  for (const item of obfuscated.slice(0, 4)) {
    details.push(detail('C-16.1', 'FAIL', `dynamic execution (code:obfuscated): ${item.what} at ${item.file}:${item.line}`, [`${item.file}:${item.line}`]))
  }
  for (const item of subprocess.slice(0, 8)) {
    details.push(detail('C-16.3', 'WARN', `subprocess capability observed: ${item.what} at ${item.file}:${item.line}`, [`${item.file}:${item.line}`]))
  }
  if (closure.packageImports.length > 0) {
    details.push(detail('C-16.4', 'NA', `not-run: ${closure.packageImports.length} package import(s) are outside the local closure (for example ${closure.packageImports[0].specifier})`, [`${closure.packageImports[0].file}:${closure.packageImports[0].line}`]))
  }
  for (const error of closure.parseErrors) {
    details.push(detail('C-16.4', 'ERROR', `not-run: AST parse failed in ${error.file}:${error.line} (${error.message})`, [`${error.file}:${error.line}`]))
  }
  const coverage = closure.parseErrors.length > 0 || closure.packageImports.length > 0 || closure.unresolved.length > 0 ? 'partial' : 'full'
  let result
  let reason = ''
  if (dynamic.length > 0 || obfuscated.length > 0) {
    result = 'FAIL'
    reason = `${dynamic.length} dynamic-execution site(s) in the server entry closure (code:dynamic)`
    if (obfuscated.length > 0) reason += `; ${obfuscated.length} base64-obfuscated execution clue(s)`
    if (closure.parseErrors.length > 0) reason += `; ${closure.parseErrors.length} file(s) could not be parsed`
  } else if (closure.parseErrors.length > 0) {
    result = 'ERROR'
    reason = `AST parse failed in ${closure.parseErrors.length} closure file(s); DSC-16 not-run`
  } else if (subprocess.length > 0) {
    result = 'WARN'
    reason = `${subprocess.length} subprocess site(s) in the server entry closure`
  } else {
    result = 'PASS'
  }
  if (coverage === 'partial' && result === 'PASS') reason = `partial: ${closure.packageImports.length} package/unresolved import(s) were not scanned`
  return check({
    id: 'DSC-16',
    clause: 'C-16',
    layer: 'L0',
    result,
    coverage: result === 'ERROR' ? 'not-run' : coverage,
    reason,
    details,
    evidence: dynamicEvidence.length > 0 ? dynamicEvidence : obfuscatedEvidence.length > 0 ? obfuscatedEvidence : subprocessEvidence.length > 0 ? subprocessEvidence : [...closure.visited].slice(0, 3),
  })
}

// ---------------------------------------------------------------------------
// DSC-17: sensitive-file reads (AST argument backtracking)
// ---------------------------------------------------------------------------

function classifySecretPath(value) {
  const normalized = String(value).replace(/\\/g, '/').toLowerCase()
  if (/(?:^|\/)id_(?:rsa|ed25519|ecdsa|dsa)(?:[^/]*)?$/.test(normalized) || /(?:^|\/)\.ssh(?:\/|$)/.test(normalized)) return 'fail'
  if (/(?:^|\/)\.aws(?:\/|$)|(?:^|\/)\.npmrc$|(?:^|\/)\.netrc$|(?:^|\/)\.pypi(?:rc)?$|(?:^|\/)\.pypirc$/.test(normalized)) return 'fail'
  if (/(?:^|\/)tokens?(?:[-_.][^/]*)?$/.test(normalized)) return 'fail'
  if (/(?:^|\/)\.dsh(?:\/|$)/.test(normalized) && /credential|auth|token|secret|key/.test(normalized)) return 'fail'
  if (/\$dsh_home|\$home/.test(normalized) && /credential|token|secret/.test(normalized)) return 'fail'
  if (/(?:^|\/)\.env(?:$|\.)/.test(normalized) && !/\.(?:example|sample|template|dist)$/.test(normalized)) return 'warn'
  return null
}

const HOME_ENV_NAMES = new Set(['HOME', 'USERPROFILE', 'DSH_HOME', 'XDG_CONFIG_HOME'])
const SECRET_STRONG = /(?:^|[^a-z0-9])(?:\.ssh|id_rsa|id_ed25519|credentials?(?![a-z0-9])|tokens?(?![a-z0-9-]))(?:[^a-z0-9]|$)/i
const SECRET_WEAK = /(?:^|[^a-z0-9])\.dsh(?:[^a-z0-9]|$)/i
const FUNCTION_SCOPE_NODES = new Set([
  'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
  'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod', 'Program',
])
const FUNCTION_LIKE_NODES = new Set([...FUNCTION_SCOPE_NODES].filter(type => type !== 'Program'))
const PATH_LIKE_NAME = /(?:path|file|dir|folder|config|secret|cred|token|home)/i

function secretStrengthOfText(text) {
  if (typeof text !== 'string' || text === '') return null
  if (SECRET_STRONG.test(text)) return 'strong'
  if (SECRET_WEAK.test(text)) return 'weak'
  return null
}

function strongerSecret(left, right) {
  if (left === 'strong' || right === 'strong') return 'strong'
  return left ?? right ?? null
}

/** Literal text, template text or regex pattern; comments never reach the AST. */
function literalPathText(node) {
  if (!node) return null
  if (node.type === 'Literal') {
    if (node.regex && typeof node.regex.pattern === 'string') return node.regex.pattern
    if (typeof node.value === 'string') return node.value
  }
  if (node.type === 'TemplateElement' && node.value) {
    return typeof node.value.cooked === 'string' ? node.value.cooked : (typeof node.value.raw === 'string' ? node.value.raw : null)
  }
  return null
}

/**
 * Only path-like literals count. A sentence such as "invalid credentials" is
 * not a clue; `'.dsh'`, `'~/.ssh/id_rsa'`, `'credentials.json'` and a regex like
 * `/^\.?credentials/` are.
 */
function isPathLikeSecretLiteral(node, text) {
  const strength = secretStrengthOfText(text)
  if (!strength) return null
  if (node.type === 'Literal' && node.regex) return strength
  const trimmed = String(text).trim()
  if (trimmed === '') return null
  if (trimmed.startsWith('.') || /[\\/]/.test(trimmed)) return strength
  if (/^(?:credentials?|tokens?|id_rsa|id_ed25519|\.dsh|\.ssh)$/i.test(trimmed)) return strength
  if (/^[\w@.-]*(?:credentials?|tokens?|id_rsa|id_ed25519)[\w@.-]*\.(?:json|ya?ml|txt|pem|key|env|ini|conf)$/i.test(trimmed)) return strength
  return null
}

/** Follow the argument through local assignments for a secret-path clue. */
function containsSecretSource(node, bindings, depth = 0, seen = new Set()) {
  if (!node || depth > 4 || seen.has(node)) return null
  const text = literalPathText(node)
  if (text !== null) {
    const strength = isPathLikeSecretLiteral(node, text)
    if (strength) return strength
  }
  if (node.type === 'Identifier') {
    const init = bindings.get(node.name)
    if (!init || FUNCTION_LIKE_NODES.has(init.type)) return null
    return containsSecretSource(init, bindings, depth + 1, new Set(seen).add(node))
  }
  let best = null
  for (const key of Object.keys(node)) {
    if (key === 'loc') continue
    const value = node[key]
    const children = Array.isArray(value) ? value : [value]
    for (const child of children) {
      if (!child || typeof child.type !== 'string' || FUNCTION_LIKE_NODES.has(child.type)) continue
      const found = containsSecretSource(child, bindings, depth + 1, new Set(seen).add(node))
      if (found === 'strong') return 'strong'
      if (found === 'weak') best = 'weak'
    }
  }
  return best
}

/** Home markers: os.homedir(), process.env.HOME/USERPROFILE/DSH_HOME/XDG_CONFIG_HOME. */
function containsHomeSource(node, bindings, depth = 0, seen = new Set()) {
  if (!node || depth > 4 || seen.has(node)) return false
  if (node.type === 'CallExpression') {
    const names = chainNames(node.callee)
    if (names[names.length - 1] === 'homedir') return true
  }
  if (node.type === 'MemberExpression') {
    const property = memberPropertyName(node)
    const object = node.object
    if (property && HOME_ENV_NAMES.has(property) && object?.type === 'MemberExpression'
      && identifierName(object.object) === 'process' && memberPropertyName(object) === 'env') return true
  }
  if (node.type === 'Identifier') {
    if (HOME_ENV_NAMES.has(node.name)) return true
    const init = bindings.get(node.name)
    if (!init || FUNCTION_LIKE_NODES.has(init.type)) return false
    return containsHomeSource(init, bindings, depth + 1, new Set(seen).add(node))
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc') continue
    const value = node[key]
    const children = Array.isArray(value) ? value : [value]
    for (const child of children) {
      if (!child || typeof child.type !== 'string' || FUNCTION_LIKE_NODES.has(child.type)) continue
      if (containsHomeSource(child, bindings, depth + 1, new Set(seen).add(node))) return true
    }
  }
  return false
}

/** A variable argument whose name suggests a path, e.g. configPath or secretFile. */
function argumentLooksPathLike(node) {
  let found = false
  walkAst(node, (child) => {
    if (found) return
    if (child.type === 'Identifier' && PATH_LIKE_NAME.test(child.name)) found = true
    if (child.type === 'MemberExpression') {
      const property = memberPropertyName(child)
      if (property && PATH_LIKE_NAME.test(property)) found = true
    }
  })
  return found
}

function isDshDirectoryPath(value) {
  const normalized = String(value).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return /(?:^|\/)\.dsh$/.test(normalized)
}

function securityScopeOf(ancestors, root) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    if (FUNCTION_SCOPE_NODES.has(ancestors[index].type)) return ancestors[index]
  }
  return root
}

function resolveMemberCallee(callee, bindings, depth = 0, seen = new Set()) {
  if (!callee || depth > 3 || seen.has(callee)) return null
  if (callee.type === 'MemberExpression') return callee
  if (callee.type !== 'Identifier') return null
  const init = bindings.get(callee.name)
  if (!init) return null
  if (init.type === 'MemberExpression') return init
  if (init.type === 'Identifier') return resolveMemberCallee(init, bindings, depth + 1, new Set(seen).add(callee))
  return null
}

/**
 * fetch / http(s).get called directly, through a one-level alias, or through a
 * statically folded computed property such as globalThis['fe' + 'tch'].
 */
function egressKindOf(node, bindings) {
  if (!node || node.type !== 'CallExpression') return null
  const callee = node.callee
  if (callee.type === 'Identifier' && callee.name === 'fetch') return 'fetch'
  const member = resolveMemberCallee(callee, bindings)
  if (!member) return null
  const name = foldedPropertyName(member, bindings)
  if (name === 'fetch') return 'fetch'
  const objectName = identifierName(member.object)
  if ((objectName === 'http' || objectName === 'https') && (name === 'get' || name === 'request')) return name
  return null
}

function isEgressCall(node, bindings) {
  return egressKindOf(node, bindings) !== null
}

function isEnvEnumeration(node) {
  return node.type === 'CallExpression'
    && node.callee.type === 'MemberExpression'
    && identifierName(node.callee.object) === 'Object'
    && memberPropertyName(node.callee) === 'keys'
    && node.arguments[0]?.type === 'MemberExpression'
    && identifierName(node.arguments[0].object) === 'process'
    && memberPropertyName(node.arguments[0]) === 'env'
}

function hasEgressCall(ast, bindings) {
  let found = false
  walkAst(ast, (node) => {
    if (!found && isEgressCall(node, bindings)) found = true
  })
  return found
}

/**
 * Direct read API or a one-level alias: `const read = fs.readFileSync;
 * read(path)`. Only a direct identifier declaration is resolved; destructuring
 * aliases such as `{ readFileSync: read }` remain out of scope.
 */
function readApiOf(callee, bindings) {
  if (!callee) return null
  if (callee.type === 'Identifier') {
    if (READ_APIS.has(callee.name)) return callee.name
    const init = bindings.get(callee.name)
    if (init?.type === 'MemberExpression') {
      const property = memberPropertyName(init)
      if (property && READ_APIS.has(property)) return property
    }
    return null
  }
  if (callee.type === 'MemberExpression') {
    const property = memberPropertyName(callee)
    return property && READ_APIS.has(property) ? property : null
  }
  return null
}

export function checkSensitiveFileReads(manifest, sources) {
  if (!sources || sources.length === 0) {
    return check({
      id: 'DSC-17', clause: 'C-17', layer: 'L0', result: 'NA', coverage: 'not-run', advisory: false,
      reason: 'no source files scanned; DSC-17 not-run',
      details: [detail('C-17.1', 'NA', 'not-run: no source files', [])],
      evidence: [],
    })
  }
  const details = []
  const failures = []
  const warnings = []
  const unresolved = []
  let parseErrors = 0
  for (const source of serverSources(sources)) {
    const parsed = parseModule(source)
    if (parsed.error) { parseErrors += 1; continue }
    let envEnumeration = false
    const scopeFacts = new Map()
    walkAst(parsed.ast, (node, ancestors) => {
      const scope = securityScopeOf(ancestors, parsed.ast)
      let facts = scopeFacts.get(scope)
      if (!facts) {
        facts = { secretLiteral: null, egress: false, reads: [] }
        scopeFacts.set(scope, facts)
      }
      if (isEgressCall(node, parsed.bindings)) facts.egress = true
      const literal = literalPathText(node)
      if (literal !== null) {
        const strength = isPathLikeSecretLiteral(node, literal)
        if (strength) facts.secretLiteral = strongerSecret(facts.secretLiteral, strength)
      }
      if (isEnvEnumeration(node)) envEnumeration = true
      if (node.type !== 'CallExpression' || node.arguments.length === 0) return
      const api = readApiOf(node.callee, parsed.bindings)
      if (!api) return
      const argument = node.arguments[0]
      facts.reads.push({
        api,
        line: lineOf(node),
        value: stringFromNode(argument, parsed.bindings),
        homeDerived: containsHomeSource(argument, parsed.bindings),
        secretDerived: containsSecretSource(argument, parsed.bindings),
        pathNamed: argumentLooksPathLike(argument),
      })
    })
    for (const facts of scopeFacts.values()) {
      for (const read of facts.reads) {
        const where = `${source.relative}:${read.line}`
        if (read.value !== null && read.value !== '') {
          const classification = classifySecretPath(read.value)
          if (classification === 'fail') {
            failures.push({ file: source.relative, line: read.line, api: read.api, reason: `${read.api} reads a sensitive path at ${where}` })
            continue
          }
          if (classification === 'warn') {
            warnings.push({ file: source.relative, line: read.line, api: read.api, item: 'C-17.2', reason: `${read.api} reads a dotenv/environment surface at ${where}` })
            continue
          }
          if (isDshDirectoryPath(read.value)) {
            if (facts.egress && facts.secretLiteral) {
              failures.push({ file: source.relative, line: read.line, api: read.api, reason: `${read.api} lists the DSH home directory while the same function handles credential-like names and network egress at ${where}` })
            } else {
              warnings.push({ file: source.relative, line: read.line, api: read.api, item: 'C-17.2', reason: `${read.api} lists the DSH home directory at ${where}` })
            }
          }
          continue
        }
        // Variable argument: approximate taint using the argument's assignment
        // chain, a sibling credential-like literal, and network egress.
        if (!read.homeDerived && !read.secretDerived) {
          // A sibling literal alone is weak: only a path-named variable plus a
          // credential literal (and egress for FAIL) is actionable.
          if (!facts.secretLiteral || !read.pathNamed) {
            // Fully dynamic argument (function parameter, runtime concat, ...):
            // nothing can be resolved statically. It is not a PASS with full
            // coverage; C-17.4 requires partial/not-run plus a reason.
            unresolved.push({ file: source.relative, line: read.line, api: read.api })
            continue
          }
          if (facts.egress && facts.secretLiteral === 'strong') {
            failures.push({ file: source.relative, line: read.line, api: read.api, reason: `${read.api} reads a path-named variable while the same function contains a credential-like literal and network egress at ${where}` })
          } else {
            warnings.push({ file: source.relative, line: read.line, api: read.api, item: 'C-17.2', reason: `${read.api} reads a path-named variable while the same function contains a credential-like literal at ${where}` })
          }
          continue
        }
        if (facts.egress) {
          failures.push({ file: source.relative, line: read.line, api: read.api, reason: `${read.api} reads a home/secret-derived path and the same function performs network egress at ${where}` })
        } else {
          warnings.push({ file: source.relative, line: read.line, api: read.api, item: 'C-17.2', reason: `${read.api} uses a home/secret-derived path that cannot be fully resolved at ${where}` })
        }
      }
    }
    if (envEnumeration && hasEgressCall(parsed.ast, parsed.bindings)) {
      warnings.push({ file: source.relative, line: 1, api: 'Object.keys(process.env)', item: 'C-17.2', reason: 'environment enumeration with egress' })
    }
  }
  for (const item of failures.slice(0, 8)) {
    details.push(detail('C-17.1', 'FAIL', item.reason, [`${item.file}:${item.line}`]))
  }
  for (const item of warnings.slice(0, 8)) {
    details.push(detail(item.item ?? 'C-17.2', 'WARN', item.reason, [`${item.file}:${item.line}`]))
  }
  for (const item of unresolved.slice(0, 8)) {
    const where = `${item.file}:${item.line}`
    details.push(detail('C-17.4', 'NA', `not-run: dynamic ${item.api} argument at ${where} could not be statically resolved`, [where]))
  }
  if (parseErrors > 0) {
    details.push(detail('C-17.3', 'ERROR', `not-run: AST parse failed in ${parseErrors} source file(s)`, []))
  }
  if (failures.length === 0 && warnings.length === 0 && parseErrors === 0 && unresolved.length === 0) {
    details.push(detail('C-17.1', 'PASS', 'no sensitive-file read argument found in the scanned sources'))
  }
  // A fully dynamic read/readdir argument is not a full PASS: the check ran but
  // could not see the path. Keep the PASS verdict (no clue found) and mark the
  // coverage partial, with C-17.4 rows naming every unresolved call site.
  const partialNote = unresolved.length > 0
    ? `partial: ${unresolved.length} read argument(s) are dynamic and could not be statically resolved`
    : ''
  let result
  if (failures.length > 0) result = 'FAIL'
  else if (parseErrors > 0) result = 'ERROR'
  else if (warnings.length > 0) result = 'WARN'
  else result = 'PASS'
  return check({
    id: 'DSC-17',
    clause: 'C-17',
    layer: 'L0',
    result,
    coverage: parseErrors > 0 || unresolved.length > 0 ? 'partial' : 'full',
    reason: failures.length > 0
      ? `${failures.length} sensitive-file read(s) in API arguments${partialNote ? `; ${partialNote}` : ''}`
      : parseErrors > 0
        ? `AST parse failed in ${parseErrors} file(s); DSC-17 partial`
        : warnings.length > 0
          ? `${warnings.length} dotenv/environment clue(s)${partialNote ? `; ${partialNote}` : ''}`
          : partialNote,
    details,
    evidence: failures.slice(0, 5).map(item => `${item.file}:${item.line}`),
  })
}

// ---------------------------------------------------------------------------
// DSC-18: egress endpoints
// ---------------------------------------------------------------------------

function isPrivateIp(host) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false
  const parts = host.split('.').map(Number)
  if (parts.some(part => part > 255)) return false
  if (parts[0] === 10 || parts[0] === 127) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 169 && parts[1] === 254) return true
  return false
}

function egressEndpointFrom(node, bindings) {
  if (!node) return null
  if (node.type === 'NewExpression' && chainNames(node.callee).join('.') === 'WebSocket') return node.arguments[0]
  return node
}

function parseEndpoint(raw) {
  try {
    const url = new URL(raw)
    const pathname = url.pathname.replace(/\/+$/, '') || '/'
    return {
      url,
      normalized: `${url.protocol}//${url.host}${pathname}`,
      host: url.hostname,
    }
  } catch {
    return null
  }
}

export function checkEgressEndpoints(manifest, sources) {
  if (!sources || sources.length === 0) {
    return check({
      id: 'DSC-18', clause: 'C-18', layer: 'L0', result: 'NA', coverage: 'not-run', advisory: true,
      reason: 'no source files scanned; DSC-18 not-run',
      details: [detail('C-18.3', 'NA', 'not-run: no source files', [])],
      evidence: [],
    })
  }
  const endpoints = []
  const dynamic = []
  let parseErrors = 0
  for (const source of serverSources(sources)) {
    const parsed = parseModule(source)
    if (parsed.error) { parseErrors += 1; continue }
    walkAst(parsed.ast, (node) => {
      let target = null
      if (node.type === 'CallExpression') {
        const names = chainNames(node.callee)
        if (egressKindOf(node, parsed.bindings) !== null || names[0] === 'axios') {
          target = egressEndpointFrom(node.arguments[0], parsed.bindings)
        }
      } else if (node.type === 'NewExpression' && chainNames(node.callee).join('.') === 'WebSocket') {
        target = egressEndpointFrom(node, parsed.bindings)
      }
      if (!target) return
      const raw = stringFromNode(target, parsed.bindings)
      if (raw === null) {
        dynamic.push({ file: source.relative, line: lineOf(node) })
        return
      }
      const endpoint = parseEndpoint(raw)
      if (!endpoint) return
      endpoints.push({ file: source.relative, line: lineOf(node), ...endpoint, raw })
    })
  }
  const disclosure = manifest?.dsh?.disclosure
  const declared = Array.isArray(disclosure?.endpoints) ? disclosure.endpoints : null
  const declaredNormalized = declared === null ? null : new Set(declared.map(value => {
    const parsed = parseEndpoint(String(value))
    return parsed ? parsed.normalized : String(value)
  }))
  const details = []
  const warnings = []
  for (const endpoint of endpoints) {
    const clues = []
    if (endpoint.url.protocol !== 'https:') clues.push(`non-https scheme ${endpoint.url.protocol}`)
    if (endpoint.url.username || endpoint.url.password) clues.push('userinfo in the URL')
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(endpoint.host) && !isPrivateIp(endpoint.host)) clues.push('public bare IP host')
    if (SUSPICIOUS_HOST.test(endpoint.host) || /\.onion$/i.test(endpoint.host)) clues.push('webhook/paste/ngrok/onion host')
    if (/^xn--/i.test(endpoint.host) || endpoint.host.includes('.xn--')) clues.push('punycode host')
    if (declaredNormalized !== null && !declaredNormalized.has(endpoint.normalized)) clues.push('endpoint is not listed in dsh.disclosure.endpoints')
    if (clues.length > 0) warnings.push({ ...endpoint, clues, item: clues.some(clue => clue.startsWith('endpoint is not listed')) ? 'C-18.2' : 'C-18.1' })
  }
  for (const item of warnings.slice(0, 8)) {
    details.push(detail(item.item, 'WARN', `${item.clues.join('; ')} at ${item.file}:${item.line}`, [`${item.file}:${item.line}`]))
  }
  for (const item of dynamic.slice(0, 3)) {
    details.push(detail('C-18.3', 'NA', `not-run: dynamic endpoint argument at ${item.file}:${item.line}`, [`${item.file}:${item.line}`]))
  }
  if (parseErrors > 0) {
    details.push(detail('C-18.3', 'NA', `not-run: AST parse failed in ${parseErrors} source file(s); endpoint coverage is partial`, []))
  }
  for (const endpoint of endpoints.slice(0, 10)) {
    if (warnings.some(item => item.file === endpoint.file && item.line === endpoint.line)) continue
    details.push(detail('C-18.3', 'PASS', `registered egress endpoint ${endpoint.normalized} at ${endpoint.file}:${endpoint.line}`, [`${endpoint.file}:${endpoint.line}`]))
  }
  if (endpoints.length === 0 && dynamic.length === 0) {
    details.push(detail('C-18.3', 'PASS', 'no fetch/http request call site found'))
  }
  if (warnings.length === 0 && endpoints.length > 0) {
    details.push(detail('C-18.3', 'PASS', `${endpoints.length} egress endpoint(s) registered; no suspicious host or scheme`))
  }
  const result = warnings.length > 0 ? 'WARN' : 'PASS'
  return check({
    id: 'DSC-18',
    clause: 'C-18',
    layer: 'L0',
    result,
    coverage: dynamic.length > 0 || parseErrors > 0 ? 'partial' : 'full',
    advisory: true,
    reason: warnings.length > 0 ? `${warnings.length} egress endpoint clue(s) (advisory)` : '',
    details,
    evidence: warnings.slice(0, 5).map(item => `${item.file}:${item.line}`),
  })
}

// ---------------------------------------------------------------------------
// DSC-19: opaque text / binary artifacts
// ---------------------------------------------------------------------------

function shannonEntropy(text) {
  const counts = new Map()
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1)
  let entropy = 0
  const length = text.length
  for (const count of counts.values()) {
    const probability = count / length
    entropy -= probability * Math.log2(probability)
  }
  return entropy
}

export function checkOpaqueArtifacts(dir, sources) {
  if (!dir) {
    return check({
      id: 'DSC-19', clause: 'C-19', layer: 'L0', result: 'NA', coverage: 'not-run', advisory: true,
      reason: 'no package directory; DSC-19 not-run',
      details: [detail('C-19.1', 'NA', 'not-run: no package directory', [])],
      evidence: [],
    })
  }
  const inventory = inventoryFiles(dir)
  const details = []
  const binaries = []
  const opaque = []
  for (const file of inventory.files) {
    const extension = path.extname(file.relative).toLowerCase()
    if (BINARY_EXTENSIONS.has(extension)) {
      let buffer
      try { buffer = fs.readFileSync(file.file) } catch { continue }
      const sha256 = createHash('sha256').update(buffer).digest('hex')
      binaries.push({ relative: file.relative, size: file.size, sha256 })
      continue
    }
    if (!TEXT_EXTENSIONS.test(extension) || file.size > 512_000) continue
    let text
    try { text = fs.readFileSync(file.file, 'utf8') } catch { continue }
    if (/(?:\/\/[#@]\s*|\/\*[#@]?\s*)sourceMappingURL=/.test(text)) continue
    const longestLine = text.split(/\r?\n/).reduce((max, line) => Math.max(max, line.length), 0)
    if (longestLine > 20_000) {
      opaque.push({ relative: file.relative, clue: `single line of ${longestLine} chars without a sourcemap` })
      continue
    }
    if (/(?:^|[^A-Za-z0-9+/=])[A-Za-z0-9+/]{4000,}={0,2}(?:[^A-Za-z0-9+/=]|$)/.test(text)) {
      opaque.push({ relative: file.relative, clue: 'base64 block of 4000+ chars' })
      continue
    }
    if (text.length > 4096 && shannonEntropy(text) > 7.5) {
      opaque.push({ relative: file.relative, clue: `high entropy ${shannonEntropy(text).toFixed(2)} over ${text.length} chars` })
    }
  }
  for (const item of opaque.slice(0, 8)) {
    details.push(detail('C-19.1', 'WARN', `opaque text clue: ${item.clue} in ${item.relative}`, [item.relative]))
  }
  for (const item of binaries.slice(0, 8)) {
    details.push(detail('C-19.2', 'WARN', `binary artifact ${item.relative} (${item.size} bytes, sha256:${item.sha256}) is recorded, not judged`, [item.relative]))
  }
  if (opaque.length === 0 && binaries.length === 0) {
    details.push(detail('C-19.1', 'PASS', 'no opaque text or binary artifact above the advisory thresholds'))
  }
  if (inventory.stats.truncated) {
    details.push(detail('C-19.1', 'NA', 'not-run: file inventory was truncated; opaque artifacts beyond the budget were not scanned', []))
  }
  const result = opaque.length > 0 || binaries.length > 0 ? 'WARN' : 'PASS'
  return check({
    id: 'DSC-19',
    clause: 'C-19',
    layer: 'L0',
    result,
    coverage: inventory.stats.truncated ? 'partial' : 'full',
    advisory: true,
    reason: result === 'WARN' ? `${opaque.length} opaque text clue(s), ${binaries.length} binary artifact(s) (advisory)` : '',
    details,
    evidence: [...opaque, ...binaries].slice(0, 5).map(item => item.relative),
  })
}

// ---------------------------------------------------------------------------
// DSC-20: prompt-injection clues
// ---------------------------------------------------------------------------

function propertyKeyOf(ancestors) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const node = ancestors[index]
    if (node.type === 'Property') return keyName(node)
    if (node.type === 'ObjectExpression' || node.type === 'ArrayExpression') continue
    return null
  }
  return null
}

function isRuleContext(ancestors, node) {
  const key = propertyKeyOf(ancestors)
  if (key && RULE_KEYS.has(key)) return true
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index]
    if (ancestor.type === 'NewExpression' && chainNames(ancestor.callee).join('.') === 'RegExp') return true
    if (ancestor.type === 'CallExpression' && ancestor.callee.type === 'MemberExpression') {
      const method = memberPropertyName(ancestor.callee)
      if (['test', 'match', 'matchAll', 'exec', 'includes', 'compile', 'replace', 'split'].includes(method)) return true
    }
  }
  return false
}

function collectParameterNames(ast) {
  const names = new Set()
  walkAst(ast, (node) => {
    if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) return
    for (const parameter of node.params ?? []) {
      if (parameter.type === 'Identifier') names.add(parameter.name)
      if (parameter.type === 'AssignmentPattern' && parameter.left?.type === 'Identifier') names.add(parameter.left.name)
    }
  })
  return names
}

function isExternalExpression(node, bindings, parameters, depth = 0, seen = new Set()) {
  if (!node || depth > 4 || seen.has(node)) return false
  if (node.type === 'Identifier') {
    if (parameters.has(node.name)) return true
    const init = bindings.get(node.name)
    if (!init) return false
    return isExternalExpression(init, bindings, parameters, depth + 1, new Set(seen).add(node))
  }
  if (node.type === 'AwaitExpression') return isExternalExpression(node.argument, bindings, parameters, depth + 1, new Set(seen).add(node))
  if (node.type === 'TemplateLiteral') {
    return node.expressions.some(expression => isExternalExpression(expression, bindings, parameters, depth + 1, new Set(seen).add(node)))
  }
  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
    return isExternalExpression(node.left, bindings, parameters, depth + 1, new Set(seen).add(node))
      || isExternalExpression(node.right, bindings, parameters, depth + 1, new Set(seen).add(node))
  }
  if (node.type === 'MemberExpression') {
    return ['tools', 'toolResult', 'messages', 'results'].includes(memberPropertyName(node))
  }
  if (node.type === 'CallExpression') {
    const names = chainNames(node.callee)
    const joined = names.join('.').toLowerCase()
    return /fetch|request|tool|invoke|call|read|query|search|message|completion/.test(joined)
  }
  return false
}

export function checkPromptInjectionClues(manifest, sources) {
  if (!sources || sources.length === 0) {
    return check({
      id: 'DSC-20', clause: 'C-20', layer: 'L0', result: 'NA', coverage: 'not-run', advisory: true,
      reason: 'no source files scanned; DSC-20 not-run',
      details: [detail('C-20.1', 'NA', 'not-run: no source files', [])],
      evidence: [],
    })
  }
  const details = []
  const clues = []
  for (const source of serverSources(sources)) {
    if (RULE_FILE.test(source.relative)) continue
    const parsed = parseModule(source)
    if (parsed.error) continue
    const parameters = collectParameterNames(parsed.ast)
    walkAst(parsed.ast, (node, ancestors) => {
      if (node.type !== 'CallExpression') return
      const names = chainNames(node.callee)
      if (!names.includes('systemPrompt')) return
      const method = names[names.length - 1]
      if (!['section', 'context', 'variable'].includes(method)) return
      const argument = node.arguments[0]
      if (!argument) return
      if (isRuleContext(ancestors, node)) return
      const property = propertyKeyOf(ancestors)
      if (property && DOC_KEYS.has(property)) return
      const literal = argument.type === 'TemplateLiteral'
        ? stringFromNode(argument, parsed.bindings)
        : literalStringValue(argument)
      if (literal !== null) {
        if (INSTRUCTION_PATTERN.test(literal)) {
          clues.push({ file: source.relative, line: lineOf(node), what: 'instruction-like systemPrompt literal' })
        }
        return
      }
      if (isExternalExpression(argument, parsed.bindings, parameters)) {
        clues.push({ file: source.relative, line: lineOf(node), what: 'systemPrompt argument derives from external input' })
      }
    })
  }
  for (const clue of clues.slice(0, 8)) {
    details.push(detail('C-20.1', 'WARN', `${clue.what} at ${clue.file}:${clue.line}; this is a clue, not a judgement`, [`${clue.file}:${clue.line}`]))
  }
  if (clues.length === 0) details.push(detail('C-20.1', 'PASS', 'no prompt-surface clue found (instruction-like literal or external systemPrompt argument)'))
  return check({
    id: 'DSC-20',
    clause: 'C-20',
    layer: 'L0',
    result: clues.length > 0 ? 'WARN' : 'PASS',
    coverage: 'full',
    advisory: true,
    reason: clues.length > 0 ? `${clues.length} prompt-injection clue(s); semantic intent is not judged` : '',
    details,
    evidence: clues.slice(0, 5).map(clue => `${clue.file}:${clue.line}`),
  })
}

// ---------------------------------------------------------------------------
// DSC-21: supply-chain name similarity
// ---------------------------------------------------------------------------

const KNOWN_SEEDS = [
  '@deepseek-ai/dsh', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-app-boot',
  '@deepseek-ai/dsh-plugin-manager', '@deepseek-ai/dsh-credentials',
  '@deepseek-ai/dsh-credentials-local', '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-fs', '@deepseek-ai/dsh-fs-sandbox',
  '@deepseek-ai/dsh-sandbox', '@deepseek-ai/dsh-interaction', '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-web', '@deepseek-ai/dsh-client', 'cordis',
  '@cordisjs/core', 'schemastery', 'cosmokit',
]
const KNOWN_SET = new Set(KNOWN_SEEDS)
const SEED_BASENAMES = [...new Set(KNOWN_SEEDS.map(name => name.split('/').pop()))]

function editDistanceWithin(left, right, limit) {
  if (Math.abs(left.length - right.length) > limit) return false
  const previous = new Array(right.length + 1).fill(0).map((_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0]
    previous[0] = i
    let rowMin = previous[0]
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j]
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost)
      diagonal = above
      rowMin = Math.min(rowMin, previous[j])
    }
    if (rowMin > limit) return false
  }
  return previous[right.length] <= limit
}

function normalizeHomoglyph(value) {
  return String(value).toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l').replace(/rn/g, 'm')
}

function scopeOf(name) {
  return name.startsWith('@') ? name.split('/')[0] : null
}

export function checkSupplyChain(manifest) {
  // devDependencies are scanned as well: a near-miss name there still installs
  // code into the author's machine and is what DS-C §C-21 asks about.
  const dependencies = {
    ...(manifest?.dependencies && typeof manifest.dependencies === 'object' ? manifest.dependencies : {}),
    ...(manifest?.devDependencies && typeof manifest.devDependencies === 'object' ? manifest.devDependencies : {}),
    ...(manifest?.optionalDependencies && typeof manifest.optionalDependencies === 'object' ? manifest.optionalDependencies : {}),
    ...(manifest?.peerDependencies && typeof manifest.peerDependencies === 'object' ? manifest.peerDependencies : {}),
  }
  const names = Object.keys(dependencies)
  const details = []
  const findings = []
  let knownCount = 0
  for (const name of names) {
    if (KNOWN_SET.has(name)) { knownCount += 1; continue }
    const scope = scopeOf(name)
    if (scope && scope !== '@deepseek-ai' && (editDistanceWithin(scope, '@deepseek-ai', 1) || normalizeHomoglyph(scope) === normalizeHomoglyph('@deepseek-ai'))) {
      findings.push({ name, item: 'C-21.2', why: `dependency scope ${scope} is a near-miss of the official @deepseek-ai scope` })
      continue
    }
    const basename = name.split('/').pop()
    if (!/dsh/i.test(basename) && !/dsh/i.test(scope ?? '')) continue
    const similar = SEED_BASENAMES.find(seed => seed !== basename && editDistanceWithin(basename, seed, 1))
    if (similar) findings.push({ name, item: 'C-21.1', why: `dependency ${name} is one edit away from known package ${similar}` })
  }
  for (const finding of findings.slice(0, 8)) {
    details.push(detail(finding.item, 'WARN', finding.why, [`package.json#dependencies.${finding.name}`]))
  }
  if (names.length === 0) {
    details.push(detail('C-21.1', 'PASS', 'no dependencies declared (dependencies/devDependencies/optional/peer)'))
    return check({
      id: 'DSC-21', clause: 'C-21', layer: 'L0', result: 'PASS', coverage: 'full', advisory: false,
      reason: '', details, evidence: ['package.json#dependencies'],
    })
  }
  const nameList = names.slice(0, 20).join(', ')
  const more = names.length > 20 ? ` (+${names.length - 20} more)` : ''
  details.push(detail('C-21.3', 'NA', `not-run: dependency install scripts and transitive registry metadata need registry data; declared dependencies: ${nameList}${more}; a missing lockfile is not treated as a defect`, []))
  if (findings.length === 0) {
    details.push(detail('C-21.1', 'PASS', `${names.length} dependency name(s) checked; ${knownCount} exact known name(s)`))
  }
  return check({
    id: 'DSC-21',
    clause: 'C-21',
    layer: 'L0',
    result: findings.length > 0 ? 'WARN' : 'PASS',
    coverage: 'partial',
    advisory: false,
    reason: findings.length > 0 ? `${findings.length} supply-chain name clue(s)` : '',
    details,
    evidence: findings.slice(0, 5).map(finding => `package.json#dependencies.${finding.name}`),
  })
}

// ---------------------------------------------------------------------------
// DSC-22: provenance / integrity (advisory only)
// ---------------------------------------------------------------------------

export function checkProvenance(manifest) {
  const integrity = manifest?.dist?.integrity
  const attestation = manifest?.dsh?.attestation
  const signature = manifest?.dsh?.signature
  const details = []
  if (typeof integrity === 'string' && integrity.trim() !== '') {
    details.push(detail('C-22.1', 'PASS', 'dist.integrity is present; this is integrity-only and does not prove provenance', ['package.json#dist.integrity']))
    return check({
      id: 'DSC-22', clause: 'C-22', layer: 'L0', result: 'PASS', coverage: 'full', advisory: true,
      reason: '', details, evidence: ['package.json#dist.integrity'],
    })
  }
  if ((typeof attestation === 'object' && attestation !== null) || (typeof signature === 'object' && signature !== null) || typeof attestation === 'string' || typeof signature === 'string') {
    details.push(detail('C-22.1', 'PASS', 'attestation/signature field is present (self-declared; not verified by this checker)', ['package.json#dsh.attestation', 'package.json#dsh.signature']))
    return check({
      id: 'DSC-22', clause: 'C-22', layer: 'L0', result: 'PASS', coverage: 'full', advisory: true,
      reason: '', details, evidence: ['package.json#dsh.attestation'],
    })
  }
  details.push(detail('C-22.1', 'NA', 'not-run: no registry metadata or attestation supplied; provenance is not judged', []))
  return check({
    id: 'DSC-22', clause: 'C-22', layer: 'L0', result: 'NA', coverage: 'not-run', advisory: true,
    reason: 'no registry metadata/attestation input; not-run',
    details, evidence: [],
  })
}

// ---------------------------------------------------------------------------
// aggregate
// ---------------------------------------------------------------------------

function unavailable(reason) {
  return SECURITY_IDS.map(id => check({
    id,
    clause: SECURITY_CLAUSE[id],
    layer: 'L0',
    result: 'ERROR',
    coverage: 'not-run',
    advisory: SECURITY_ADVISORY.has(id),
    reason,
    details: [detail(SECURITY_CLAUSE[id], 'ERROR', `not-run: ${reason}`, [])],
    evidence: [],
  }))
}

/** Run all eight security checks. Never throws: a failure becomes not-run rows. */
export function runSecurityChecks({ dir, manifest, sources = [], entry = null, kind = null } = {}) {
  if (!manifest) return unavailable('manifest unavailable')
  const checks = []
  const run = (id, factory) => {
    try {
      checks.push(factory())
    } catch (error) {
      checks.push(check({
        id,
        clause: SECURITY_CLAUSE[id],
        layer: 'L0',
        result: 'ERROR',
        coverage: 'not-run',
        advisory: SECURITY_ADVISORY.has(id),
        reason: `checker error: ${error?.message ?? error}`,
        details: [detail(SECURITY_CLAUSE[id], 'ERROR', `not-run: ${error?.message ?? error}`, [])],
        evidence: [],
      }))
    }
  }
  run('DSC-15', () => checkLifecycleScripts(manifest, dir))
  run('DSC-16', () => checkDynamicExecution(manifest, sources, entry, kind))
  run('DSC-17', () => checkSensitiveFileReads(manifest, sources))
  run('DSC-18', () => checkEgressEndpoints(manifest, sources))
  run('DSC-19', () => checkOpaqueArtifacts(dir, sources))
  run('DSC-20', () => checkPromptInjectionClues(manifest, sources))
  run('DSC-21', () => checkSupplyChain(manifest))
  run('DSC-22', () => checkProvenance(manifest))
  return checks
}

import path from 'node:path'
import { createRequire } from 'node:module'

const requireVendor = createRequire(import.meta.url)
const { parse: parseBabel } = requireVendor('../vendor/babel/index.cjs')
import { isObject, regexHits } from './util.mjs'
import { check, detail, worst } from './result.mjs'
import { validateCommitments, validateDisclosure } from './permissions.mjs'

export const CAPABILITIES = new Set([
  'fs:read', 'fs:write', 'shell', 'subprocess', 'network:egress', 'network:ingress',
  'credentials:read', 'credentials:list', 'credentials:provider', 'llm:adapter',
  'sessions:read', 'system-prompt:write', 'tools:register', 'remote:expose', 'plugin:install',
])

export const LABELS = new Set([
  'prompt-modification', 'red-team', 'third-party-model-provider', 'remote-access', 'mirror',
])

export const FORBIDDEN_LABELS = new Set(['official', 'verified', 'certified', 'secure', 'audited'])

const TRIGGERS = [
  { cap: 'network:ingress', pattern: /ctx\.(?:webServer|webhookRuntime)\b/g },
  { cap: 'plugin:install', pattern: /\b(?:installBundle|removeBundle)\s*\(/g },
  { cap: 'llm:adapter', pattern: /registerAdapter\s*\(|ctx\.llm\.register/g },
  { cap: 'system-prompt:write', pattern: /ctx\.systemPrompt\.(?:section|context|variable)\s*\(/g },
  { cap: 'tools:register', pattern: /ctx\.tools\.register\s*\(/g },
  { cap: 'remote:expose', pattern: /@Remote(?:Scope)?\s*\(/g },
  { cap: 'credentials:list', pattern: /\.listRecords\s*\(/g },
  { cap: 'sessions:read', pattern: /ctx\.(?:sessions|sessionQuery)\b/g },
  { cap: 'shell', pattern: /ctx\.(?:shell|bash)\b/g },
  { cap: 'subprocess', pattern: /ctx\.subprocess\b/g },
  { cap: 'fs:read', pattern: /ctx\.fs\b/g },
  { cap: 'network:egress', pattern: /ctx\.web\b|\bfetch\s*\(/g },
]

function capabilityList(manifest) {
  const value = manifest?.dsh?.capabilities
  if (value === undefined) return { defined: false, list: [], error: null }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    return { defined: true, list: [], error: 'dsh.capabilities must be a string array' }
  }
  return { defined: true, list: value, error: null }
}

function labelList(manifest) {
  const value = manifest?.dsh?.labels
  if (value === undefined) return { defined: false, list: [], error: null }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    return { defined: true, list: [], error: 'dsh.labels must be a string array' }
  }
  return { defined: true, list: value, error: null }
}


// ---------------------------------------------------------------------------
// AST layer (vendored @babel/parser, no runtime dependency)
// ---------------------------------------------------------------------------

function parsePlugins(relative) {
  const extension = path.extname(String(relative || '')).toLowerCase()
  const plugins = ['estree', 'decorators-legacy', 'importAttributes']
  if (extension === '.ts' || extension === '.tsx') plugins.push('typescript')
  if (extension !== '.ts' && extension !== '.tsx') plugins.push('jsx')
  if (extension === '.tsx') plugins.push('jsx')
  return plugins
}

const SOURCE_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']
const FUNCTION_NODES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])
const TRANSPARENT_NODES = new Set([
  'TemplateLiteral', 'TemplateElement', 'BinaryExpression', 'LogicalExpression',
  'ConditionalExpression', 'ParenthesizedExpression', 'ChainExpression',
])
const EQUALITY_OPERATORS = new Set(['==', '===', '!=', '!=='])
const GRANT_METHODS = new Set(['set', 'resolve'])
const CONSOLE_METHODS = new Set(['log', 'info', 'warn', 'error', 'debug'])
const DOC_PROPERTY_KEYS = new Set(['desc', 'description', 'message', 'reason', 'help', 'label', 'title', 'comment'])
const COMMAND_PROPERTY_KEYS = new Set(['mode', 'sandboxPolicy', 'sandbox_permissions'])
const SPAWN_ARG_METHODS = new Set(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync'])
const FS_WRITE_METHODS = new Set([
  'writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'unlinkSync', 'rmdirSync', 'renameSync',
  'copyFileSync', 'chmodSync', 'symlinkSync', 'truncateSync', 'writeSync',
])
const C10_SUBPROCESS_METHODS = new Set(['execSync', 'execFileSync', 'spawnSync', 'execFile', 'spawn'])

const PARSE_CACHE = new WeakMap()

function parseSource(source) {
  const cached = PARSE_CACHE.get(source)
  if (cached) return cached
  const record = { ast: null, error: null }
  try {
    const parsed = parseBabel(source.text, {
      sourceType: 'module',
      allowHashBang: true,
      plugins: parsePlugins(source.relative),
    })
    record.ast = parsed.program ?? parsed
  } catch (error) {
    record.error = {
      message: String(error?.message ?? error),
      line: Number.isInteger(error?.loc?.line) && error.loc.line > 0 ? error.loc.line : 1,
    }
  }
  PARSE_CACHE.set(source, record)
  return record
}

function normalizeRelative(relative) {
  return String(relative ?? '').replace(/\\/g, '/').replace(/^\.\//, '')
}

// Declaration files have no runtime behavior; parsing them for import-time
// side effects or execution strings only creates noise.
function isDeclarationFile(relative) {
  return /\.d\.[cm]?ts$/i.test(String(relative ?? ''))
}

function identifierName(node) {
  return node?.type === 'Identifier' ? node.name : null
}

function memberPropertyName(node) {
  if (!node || node.type !== 'MemberExpression') return null
  if (!node.computed && node.property?.type === 'Identifier') return node.property.name
  if (node.property?.type === 'Literal' && typeof node.property.value === 'string') return node.property.value
  return null
}

function propertyKeyName(property) {
  if (!property.computed && property.key?.type === 'Identifier') return property.key.name
  if (property.key?.type === 'Literal' && typeof property.key.value === 'string') return property.key.value
  return null
}

function calledFunctionName(call) {
  if (!call || call.type !== 'CallExpression') return null
  if (call.callee.type === 'Identifier') return call.callee.name
  if (call.callee.type === 'MemberExpression') return memberPropertyName(call.callee)
  return null
}

function walkAst(root, visit) {
  const ancestors = []
  const walkNode = (node) => {
    if (!node || typeof node.type !== 'string') return
    visit(node, ancestors)
    ancestors.push(node)
    for (const key of Object.keys(node)) {
      if (key === 'loc') continue
      const value = node[key]
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') walkNode(child)
      } else if (value && typeof value.type === 'string') {
        walkNode(value)
      }
    }
    ancestors.pop()
  }
  walkNode(root)
}

// Module scope means "runs while the module is evaluated". Function bodies and
// class method bodies are skipped; top-level if/try/loop bodies are not.
function walkModuleScope(ast, visit) {
  const ancestors = []
  const walkNode = (node) => {
    if (!node || typeof node.type !== 'string') return
    if (FUNCTION_NODES.has(node.type) || node.type === 'MethodDefinition') return
    visit(node, ancestors)
    ancestors.push(node)
    for (const key of Object.keys(node)) {
      if (key === 'loc') continue
      const value = node[key]
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') walkNode(child)
      } else if (value && typeof value.type === 'string') {
        walkNode(value)
      }
    }
    ancestors.pop()
  }
  for (const statement of ast.body) walkNode(statement)
}

function callArgumentContext(ancestors, node, predicate) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index]
    if (ancestor.type !== 'CallExpression' || !predicate(ancestor)) continue
    const child = index + 1 < ancestors.length ? ancestors[index + 1] : node
    if (ancestor.arguments.includes(child)) return ancestor
  }
  return null
}

function isEqualityOperand(ancestors) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index]
    if (ancestor.type === 'BinaryExpression' && EQUALITY_OPERATORS.has(ancestor.operator)) return true
    if (!TRANSPARENT_NODES.has(ancestor.type)) return false
  }
  return false
}

function isGrantCallArgument(ancestors, node) {
  return Boolean(callArgumentContext(ancestors, node, (call) => (
    call.callee.type === 'MemberExpression' && GRANT_METHODS.has(memberPropertyName(call.callee))
  )))
}

function isConsoleArgument(ancestors, node) {
  return Boolean(callArgumentContext(ancestors, node, (call) => (
    call.callee.type === 'MemberExpression'
    && identifierName(call.callee.object) === 'console'
    && CONSOLE_METHODS.has(memberPropertyName(call.callee))
  )))
}

function isSpawnArrayElement(ancestors, node) {
  for (let index = 0; index < ancestors.length; index += 1) {
    if (ancestors[index].type !== 'ArrayExpression') continue
    for (let outer = index + 1; outer < ancestors.length; outer += 1) {
      const call = ancestors[outer]
      if (call.type !== 'CallExpression') continue
      const child = outer + 1 < ancestors.length ? ancestors[outer + 1] : node
      if (call.arguments.includes(child) && SPAWN_ARG_METHODS.has(calledFunctionName(call))) return true
    }
  }
  return false
}

function isSwitchCaseValue(ancestors, node) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index]
    if (ancestor.type === 'SwitchCase') {
      const child = index + 1 < ancestors.length ? ancestors[index + 1] : node
      return ancestor.test === child
    }
    if (!TRANSPARENT_NODES.has(ancestor.type)) return false
  }
  return false
}

function propertyContext(ancestors, node) {
  let child = node
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index]
    if (ancestor.type === 'Property') {
      if (ancestor.value !== child) return null
      return { key: propertyKeyName(ancestor) }
    }
    if (ancestor.type === 'ObjectExpression' || ancestor.type === 'ArrayExpression' || TRANSPARENT_NODES.has(ancestor.type)) {
      child = ancestor
      continue
    }
    return null
  }
  return null
}

function hasCommandProperty(ancestors, node) {
  let child = node
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index]
    if (ancestor.type === 'Property') {
      if (ancestor.value !== child) return false
      if (COMMAND_PROPERTY_KEYS.has(propertyKeyName(ancestor))) return true
      child = ancestor
      continue
    }
    if (ancestor.type === 'ObjectExpression' || ancestor.type === 'ArrayExpression' || TRANSPARENT_NODES.has(ancestor.type)) {
      child = ancestor
      continue
    }
    return false
  }
  return false
}

/**
 * Classify a string literal. Comments never reach the AST. Equality comparisons
 * and documentation strings are ignored; grant/command contexts and unknown
 * contexts warn (unknown stays conservative).
 */
function classifyLiteral(node, ancestors) {
  if (isEqualityOperand(ancestors)) return 'ignore'
  if (isGrantCallArgument(ancestors, node)) return 'command'
  if (isSpawnArrayElement(ancestors, node)) return 'command'
  if (isSwitchCaseValue(ancestors, node)) return 'command'
  if (hasCommandProperty(ancestors, node)) return 'command'
  const property = propertyContext(ancestors, node)
  if (isConsoleArgument(ancestors, node)) return 'doc'
  if (property && DOC_PROPERTY_KEYS.has(property.key)) return 'doc'
  return 'unknown'
}

function literalStringValue(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node.type === 'TemplateElement' && node.value) {
    if (typeof node.value.cooked === 'string') return node.value.cooked
    if (typeof node.value.raw === 'string') return node.value.raw
  }
  return null
}

function findLiteralHits(sources, values) {
  const wanted = new Set(values)
  const hits = []
  const parseErrors = []
  for (const source of sources) {
    if (isDeclarationFile(source.relative)) continue
    const parsed = parseSource(source)
    if (parsed.error) {
      parseErrors.push({ file: source.relative, line: parsed.error.line, message: parsed.error.message })
      continue
    }
    walkAst(parsed.ast, (node, ancestors) => {
      const value = literalStringValue(node)
      if (value === null || !wanted.has(value)) return
      const context = classifyLiteral(node, ancestors)
      if (context === 'ignore' || context === 'doc') return
      hits.push({ file: source.relative, line: node.loc?.start?.line ?? 1, text: value })
    })
  }
  return { hits, parseErrors }
}

function literalCandidates(base) {
  const candidates = [base]
  const extension = path.posix.extname(base)
  if (SOURCE_EXTENSIONS.includes(extension)) {
    const stem = base.slice(0, -extension.length)
    for (const candidate of SOURCE_EXTENSIONS) if (candidate !== extension) candidates.push(`${stem}${candidate}`)
  } else {
    for (const candidate of SOURCE_EXTENSIONS) candidates.push(`${base}${candidate}`)
  }
  for (const candidate of SOURCE_EXTENSIONS) candidates.push(path.posix.join(base, `index${candidate}`))
  return candidates
}

function resolveLocalSpecifier(fromRelative, specifier, byRelative) {
  const spec = String(specifier).replace(/\\/g, '/')
  if (!(spec.startsWith('./') || spec.startsWith('../') || spec === '.' || spec === '..')) return { kind: 'package' }
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(normalizeRelative(fromRelative)), spec))
  if (base === '.' || base === '..' || base.startsWith('../') || path.posix.isAbsolute(base)) return { kind: 'unresolved' }
  for (const candidate of literalCandidates(base)) {
    if (byRelative.has(candidate)) return { kind: 'local', relative: candidate }
  }
  return { kind: 'unresolved' }
}

function collectModuleEdges(ast) {
  const edges = []
  walkAst(ast, (node) => {
    if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
      if (node.source?.type === 'Literal' && typeof node.source.value === 'string') {
        edges.push({ specifier: node.source.value, line: node.loc?.start?.line ?? 1 })
      }
    }
  })
  // require() is only import-time when it runs at module scope; a lazy require
  // inside apply()/a factory must not be treated as part of the import closure.
  walkModuleScope(ast, (node) => {
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') {
      const argument = node.arguments[0]
      if (argument?.type === 'Literal' && typeof argument.value === 'string') {
        edges.push({ specifier: argument.value, line: node.loc?.start?.line ?? 1 })
      }
    }
  })
  return edges
}

function isSetIntervalCall(call) {
  if (call.callee.type === 'Identifier' && call.callee.name === 'setInterval') return true
  return call.callee.type === 'MemberExpression'
    && identifierName(call.callee.object) === 'globalThis'
    && memberPropertyName(call.callee) === 'setInterval'
}

function isProcessOnCall(call) {
  return call.callee.type === 'MemberExpression'
    && identifierName(call.callee.object) === 'process'
    && memberPropertyName(call.callee) === 'on'
}

function assignmentTargetKind(node) {
  if (node.left.type !== 'MemberExpression') return null
  const property = memberPropertyName(node.left)
  if (!property) return null
  const object = node.left.object
  if (object.type === 'MemberExpression') {
    return identifierName(object.object) === 'process' && memberPropertyName(object) === 'env' ? 'process.env' : null
  }
  return identifierName(object) === 'globalThis' ? 'globalThis' : null
}

function collectSideEffectHits(ast, file, hits) {
  const push = (clause, pattern, node) => hits.push({ clause, pattern, file, line: node.loc?.start?.line ?? 1 })
  walkModuleScope(ast, (node) => {
    if (node.type === 'AwaitExpression' || (node.type === 'ForOfStatement' && node.await === true)) {
      push('C-10.1', 'top-level await', node)
      return
    }
    if (node.type === 'UnaryExpression' && node.operator === 'void' && node.argument?.type === 'CallExpression') {
      push('C-10.2', 'top-level immediate main call', node)
      return
    }
    if (node.type === 'AssignmentExpression') {
      const kind = assignmentTargetKind(node)
      if (kind === 'process.env') push('C-10.2', 'top-level process.env assignment', node)
      else if (kind === 'globalThis') push('C-10.2', 'top-level globalThis assignment', node)
      return
    }
    if (node.type !== 'CallExpression') return
    if (isSetIntervalCall(node)) push('C-10.2', 'top-level setInterval', node)
    if (isProcessOnCall(node)) push('C-10.2', 'top-level process.on', node)
    const name = calledFunctionName(node)
    if (name && FS_WRITE_METHODS.has(name)) push('C-10.4', 'top-level fs mutation', node)
    if (name && C10_SUBPROCESS_METHODS.has(name)) push('C-10.4', 'top-level subprocess spawn', node)
  })
}

function analyseImportClosure(sources, entryRelative) {
  const byRelative = new Map()
  for (const source of sources) byRelative.set(normalizeRelative(source.relative), source)
  const queue = []
  if (entryRelative) {
    const entry = normalizeRelative(entryRelative)
    if (!byRelative.has(entry)) return { error: `entry module ${entryRelative} was not found among scanned sources` }
    queue.push(entry)
  } else {
    // Programmatic callers without an entry: keep the legacy "all sources" shape.
    for (const relative of byRelative.keys()) queue.push(relative)
  }

  const visited = new Set()
  const hits = []
  const parseErrors = []
  const coverage = []
  const seenCoverage = new Set()
  const localEdges = []
  const addCoverage = (key, record) => {
    if (seenCoverage.has(key)) return
    seenCoverage.add(key)
    coverage.push(record)
  }

  while (queue.length > 0) {
    const relative = queue.shift()
    if (visited.has(relative)) continue
    visited.add(relative)
    if (isDeclarationFile(relative)) {
      addCoverage(`declaration:${relative}`, detail('C-10.3', 'NA', `not-run: declaration file ${relative} has no runtime behavior`, [relative]))
      continue
    }
    const parsed = parseSource(byRelative.get(relative))
    if (parsed.error) {
      parseErrors.push({ file: relative, line: parsed.error.line, message: parsed.error.message })
      continue
    }
    collectSideEffectHits(parsed.ast, relative, hits)
    for (const edge of collectModuleEdges(parsed.ast)) {
      const resolution = resolveLocalSpecifier(relative, edge.specifier, byRelative)
      if (resolution.kind === 'local') {
        localEdges.push({ from: relative, to: resolution.relative, line: edge.line })
        queue.push(resolution.relative)
      } else if (resolution.kind === 'package') {
        addCoverage(`package:${edge.specifier}`, detail('C-10.3', 'NA', `not-run: package import '${edge.specifier}' from ${relative}:${edge.line} is outside the local closure`, [`${relative}:${edge.line}`]))
      } else {
        addCoverage(`unresolved:${relative}:${edge.specifier}`, detail('C-10.3', 'NA', `not-run: local import '${edge.specifier}' from ${relative}:${edge.line} could not be resolved`, [`${relative}:${edge.line}`]))
      }
    }
  }

  return { visited, hits, parseErrors, coverage, localEdges }
}

function hitEvidence(hits, limit = 3) {
  return hits.slice(0, limit).map(hit => `${hit.file}:${hit.line}`)
}

/** DSC-10: advisory only; never FAIL. */
export function checkImportTimeAdvisory(sources, entryRelative = null) {
  if (sources.length === 0) {
    return check({
      id: 'DSC-10',
      clause: 'C-10',
      layer: 'L0',
      result: 'NA',
      advisory: true,
      coverage: 'not-run',
      reason: 'no source files scanned; C-10 not-run',
      details: [],
      evidence: [],
    })
  }

  const analysis = analyseImportClosure(sources, entryRelative)
  if (analysis.error) {
    const evidence = normalizeRelative(entryRelative)
    return check({
      id: 'DSC-10',
      clause: 'C-10',
      layer: 'L0',
      result: 'ERROR',
      advisory: true,
      coverage: 'not-run',
      reason: `${analysis.error}; C-10 not-run`,
      details: [detail('C-10', 'ERROR', `not-run: ${analysis.error}`, [evidence])],
      evidence: [evidence],
    })
  }

  const { visited, hits, parseErrors, coverage, localEdges } = analysis
  const details = hits.slice(0, 20).map(hit => detail(hit.clause, 'WARN', `${hit.pattern} at ${hit.file}:${hit.line}`, [`${hit.file}:${hit.line}`]))
  details.push(...coverage.slice(0, 10))
  if (localEdges.length > 0) {
    details.push(detail('C-10.3', 'PASS', `local relative import closure analysed (${visited.size} module(s))`, [...visited].slice(0, 5)))
  }
  for (const error of parseErrors) {
    details.push(detail('C-10', 'ERROR', `not-run: AST parse failed in ${error.file}:${error.line} (${error.message})`, [`${error.file}:${error.line}`]))
  }

  let result
  let reason
  if (parseErrors.length > 0) {
    result = 'ERROR'
    reason = `AST parse failed in ${parseErrors.length} file(s); C-10 not-run`
    if (hits.length > 0) reason += `; ${hits.length} side-effect clue(s) found before the gap`
  } else if (hits.length > 0) {
    result = 'WARN'
    reason = `advisory: ${hits.length} import-time side-effect clue(s)`
  } else {
    result = 'PASS'
    reason = ''
  }

  const evidence = hits.length > 0
    ? hitEvidence(hits)
    : parseErrors.length > 0
      ? hitEvidence(parseErrors)
      : coverage.flatMap(item => item.evidence).slice(0, 3)

  return check({
    id: 'DSC-10',
    clause: 'C-10',
    layer: 'L0',
    result,
    advisory: true,
    coverage: result === 'ERROR' ? 'not-run' : 'full',
    reason,
    details,
    evidence,
  })
}

/** DSC-11: dsh.capabilities declaration + high-signal static triggers. */
export function checkCapabilities(manifest, sources, patch) {
  const caps = capabilityList(manifest)
  const details = []
  if (caps.error) details.push(detail('C-11.1', 'FAIL', caps.error, ['package.json#dsh.capabilities']))
  if (!caps.defined) {
    details.push(detail('C-11.1', 'WARN', 'dsh.capabilities is not declared (transitional WARN; host does not read it yet)', ['package.json#dsh.capabilities']))
  } else if (!caps.error) {
    for (const id of caps.list) {
      if (!CAPABILITIES.has(id)) details.push(detail('C-11.1', 'FAIL', `unknown capability id: ${id}`, ['package.json#dsh.capabilities']))
    }
    if (caps.list.length === 0) details.push(detail('C-11.1', 'WARN', 'dsh.capabilities is empty', ['package.json#dsh.capabilities']))
  }

  const triggered = new Map()
  for (const trigger of TRIGGERS) {
    const hits = regexHits(sources, trigger.pattern)
    if (hits.length > 0) triggered.set(trigger.cap, hits)
  }
  if (!caps.defined) {
    for (const [cap, hits] of triggered) {
      details.push(detail('C-11.2', 'WARN', `trigger for ${cap} observed but dsh.capabilities is absent`, hitEvidence(hits)))
    }
  } else if (!caps.error) {
    for (const [cap, hits] of triggered) {
      const satisfied = caps.list.includes(cap) || (cap === 'fs:read' && caps.list.includes('fs:write'))
      if (!satisfied) {
        details.push(detail('C-11.2', 'FAIL', `static trigger ${cap} is not declared in dsh.capabilities`, hitEvidence(hits)))
      }
    }
    for (const cap of caps.list) {
      const observed = triggered.has(cap) || (cap === 'fs:write' && triggered.has('fs:read'))
      if (!observed) details.push(detail('C-11.5', 'WARN', `declared capability ${cap} was not observed statically`, ['package.json#dsh.capabilities']))
    }
  }

  if (patch?.enabledPluginManagerTools) {
    details.push(detail('C-11.3', 'FAIL', 'bundle patch enables @deepseek-ai/dsh-plugin-manager/tools', ['dsh.bundle.patch']))
  }
  const dangerScan = findLiteralHits(sources, ['danger-full-access'])
  if (dangerScan.hits.length > 0) {
    details.push(detail('C-11.4', 'WARN', `danger-full-access literal in ${dangerScan.hits.length} execution context(s)`, hitEvidence(dangerScan.hits)))
  }
  if (dangerScan.parseErrors.length > 0) {
    details.push(detail('C-11.4', 'ERROR', `not-run: ${dangerScan.parseErrors.length} source file(s) could not be parsed for string literals (${dangerScan.parseErrors[0].file}:${dangerScan.parseErrors[0].line})`, hitEvidence(dangerScan.parseErrors)))
  }
  if (details.length === 0) details.push(detail('C-11.1', 'PASS', 'dsh.capabilities is declared and consistent with static triggers'))

  const result = worst(details.map(item => item.result))
  return check({
    id: 'DSC-11', clause: 'C-11', layer: 'L0', result,
    coverage: dangerScan.parseErrors.length > 0 ? 'not-run' : 'full',
    reason: details.filter(item => item.result !== 'PASS').map(item => `${item.item}: ${item.reason}`).join(' | '),
    details,
    evidence: ['package.json#dsh.capabilities', 'dsh.bundle.patch'],
  })
}

/** DSC-12: direct credential backing-file access / listRecords. */
export function checkCredentials(manifest, sources) {
  const caps = capabilityList(manifest)
  const details = []
  const backingPatterns = [
    /\.credentials\.yaml/g,
    /\bCREDENTIALS_FILENAME\b/g,
    /@deepseek-ai\/dsh-credentials-local/g,
    /\$DSH_HOME[^\n]{0,80}credentials/gi,
  ]
  const backingHits = []
  for (const pattern of backingPatterns) backingHits.push(...regexHits(sources, pattern))
  const provider = caps.defined && caps.list.includes('credentials:provider')
  const hardHits = backingHits.filter(hit => {
    if (/credentials-local/.test(hit.text)) return true
    const source = sources.find(item => item.relative === hit.file)
    if (!source) return false
    const lines = source.text.split('\n')
    const window = lines.slice(Math.max(0, hit.line - 6), hit.line + 6).join('\n')
    return /readFile|readFileSync|createReadStream|openSync|\.load\s*\(|\.parse\s*\(/.test(window)
  })
  if (backingHits.length === 0) {
    details.push(detail('C-12.1', 'PASS', 'no credential backing-file reference found'))
  } else if (provider) {
    details.push(detail('C-12.1', 'PASS', 'credential backing-file reference is declared as credentials:provider', hitEvidence(backingHits)))
  } else if (hardHits.length > 0) {
    details.push(detail('C-12.1', 'FAIL', 'credential backing-file access near a file-read API without credentials:provider', hitEvidence(hardHits)))
  } else {
    details.push(detail('C-12.1', 'PASS', 'credential backing-file path appears in text/UI only; no file-read API found nearby', hitEvidence(backingHits)))
  }

  const listHits = regexHits(sources, /\.listRecords\s*\(/g)
  if (listHits.length > 0) {
    if (!caps.defined) details.push(detail('C-12.2', 'WARN', 'listRecords() used but dsh.capabilities is absent (transitional WARN)', hitEvidence(listHits)))
    else if (!caps.list.includes('credentials:list')) details.push(detail('C-12.2', 'FAIL', 'listRecords() used without credentials:list', hitEvidence(listHits)))
    else details.push(detail('C-12.2', 'PASS', 'listRecords() is declared as credentials:list'))
  } else {
    details.push(detail('C-12.2', 'PASS', 'listRecords() not used'))
  }

  const providerHits = regexHits(sources, /ctx\.provide\(\s*['"](?:shell|credentials|sandboxPolicy|sandbox|deepseekAccount)['"]/g)
  if (providerHits.length > 0) details.push(detail('C-12.3', 'WARN', 'global seam provider registration detected; declaration ownership needs review', hitEvidence(providerHits)))
  const literalScan = findLiteralHits(sources, ['danger-full-access', '--add-dir'])
  if (literalScan.hits.length > 0) {
    details.push(detail('C-12.4', 'WARN', `danger-full-access/--add-dir literal in ${literalScan.hits.length} execution context(s)`, hitEvidence(literalScan.hits)))
  }
  if (literalScan.parseErrors.length > 0) {
    details.push(detail('C-12.4', 'ERROR', `not-run: ${literalScan.parseErrors.length} source file(s) could not be parsed for string literals (${literalScan.parseErrors[0].file}:${literalScan.parseErrors[0].line})`, hitEvidence(literalScan.parseErrors)))
  }
  details.push(...validateCommitments(manifest), ...validateDisclosure(manifest))

  const result = worst(details.map(item => item.result))
  return check({
    id: 'DSC-12', clause: 'C-12', layer: 'L0', result,
    coverage: literalScan.parseErrors.length > 0 ? 'not-run' : 'full',
    reason: details.filter(item => item.result !== 'PASS' && item.result !== 'NA').map(item => `${item.item}: ${item.reason}`).join(' | '),
    details,
    evidence: ['package.json#dsh.capabilities'],
  })
}

/** DSC-13: high-risk labels + mirror/upstream. */
export function checkLabels(manifest, sources) {
  const caps = capabilityList(manifest)
  const labels = labelList(manifest)
  const details = []
  if (labels.error) details.push(detail('C-13.1', 'FAIL', labels.error, ['package.json#dsh.labels']))
  if (!labels.defined) {
    details.push(detail('C-13.1', 'WARN', 'dsh.labels is not declared', ['package.json#dsh.labels']))
  } else if (!labels.error) {
    for (const label of labels.list) {
      if (!LABELS.has(label)) details.push(detail('C-13.1', 'FAIL', `unknown label: ${label}`, ['package.json#dsh.labels']))
    }
  }

  for (const label of labels.list) {
    if (FORBIDDEN_LABELS.has(label)) details.push(detail('C-13.4', 'FAIL', `forbidden endorsement label: ${label}`, ['package.json#dsh.labels']))
  }

  const upstream = manifest?.dsh?.upstream
  if (upstream !== undefined) {
    let url = null
    try { url = new URL(String(upstream)) } catch { /* handled below */ }
    if (!url || url.protocol !== 'https:') {
      details.push(detail('C-13.3', 'FAIL', 'dsh.upstream must be an https URL', ['package.json#dsh.upstream']))
    } else if (isObject(manifest.repository) && typeof manifest.repository.url === 'string' && manifest.repository.url.includes(url.hostname + url.pathname)) {
      details.push(detail('C-13.3', 'FAIL', 'dsh.upstream points at the package itself', ['package.json#dsh.upstream']))
    } else if (!labels.list.includes('mirror')) {
      details.push(detail('C-13.2', 'FAIL', 'dsh.upstream is declared but the mirror label is missing', ['package.json#dsh.labels']))
    }
  }

  if (!caps.defined) {
    details.push(detail('C-13.2', 'WARN', 'dsh.capabilities is absent; trigger-to-label mapping cannot be evaluated', ['package.json#dsh.capabilities']))
  } else if (!caps.error) {
    const required = new Set()
    if (caps.list.includes('system-prompt:write')) required.add('prompt-modification')
    if (caps.list.includes('llm:adapter') && caps.list.includes('network:egress')) required.add('third-party-model-provider')
    if (caps.list.includes('network:ingress')) required.add('remote-access')
    for (const label of required) {
      if (!labels.list.includes(label)) details.push(detail('C-13.2', 'FAIL', `capability trigger requires label ${label}`, ['package.json#dsh.labels']))
    }
  }

  if (labels.list.includes('red-team') && manifest?.dsh?.usageScope === undefined) {
    details.push(detail('C-13.5', 'WARN', 'red-team label without dsh.usageScope', ['package.json#dsh.labels']))
  }
  if (details.length === 0) details.push(detail('C-13.1', 'PASS', 'dsh.labels is declared and consistent with capability triggers'))

  const result = worst(details.map(item => item.result))
  return check({
    id: 'DSC-13', clause: 'C-13', layer: 'L0', result,
    reason: details.filter(item => item.result !== 'PASS').map(item => `${item.item}: ${item.reason}`).join(' | '),
    details,
    evidence: ['package.json#dsh.labels', 'package.json#dsh.upstream'],
  })
}

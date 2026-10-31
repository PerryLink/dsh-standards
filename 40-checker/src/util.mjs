import fs from 'node:fs'
import path from 'node:path'

export const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'])

export function exists(target) {
  try { fs.accessSync(target); return true } catch { return false }
}

export function isFile(target) {
  try { return fs.statSync(target).isFile() } catch { return false }
}

export function isDirectory(target) {
  try { return fs.statSync(target).isDirectory() } catch { return false }
}

export function readText(target) {
  return fs.readFileSync(target, 'utf8')
}

export function readJson(target) {
  return JSON.parse(readText(target))
}

export function readJsonMaybe(target) {
  try { return { value: readJson(target), error: null } } catch (error) {
    return { value: null, error }
  }
}

export function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asArray(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function posixRelative(from, to) {
  return path.relative(from, to).split(path.sep).join('/')
}

const SKIP_DIRECTORIES = new Set([
  'node_modules', '.git', '.hg', '.svn', 'test', 'tests', '__tests__', 'docs', 'doc',
  'assets', 'images', 'screenshots', 'coverage', '.github', '.agents', '.claude',
  'tools', 'scripts', 'examples', 'benchmarks', 'fixtures', 'demo', 'dev', 'deploy', 'quality', 'bench',
])

const BUILD_FILE = /(?:^|\/)(?:build|esbuild|vite|rollup|webpack)\.config\.[cm]?[jt]s$|(?:^|\/)(?:build|esbuild)\.mjs$|(?:^|\/)(?:make|render|verify|check)-[^/]+\.mjs$/

/**
 * Collect source files without following symlinks. Deterministic order, bounded.
 * @param {string} root
 * @param {{maxFiles?: number, maxBytes?: number}} [options]
 */
export function listSourceFiles(root, options = {}) {
  const maxFiles = options.maxFiles ?? 400
  const maxBytes = options.maxBytes ?? 2_000_000
  const files = []
  let bytes = 0
  const walk = (directory) => {
    if (files.length >= maxFiles || bytes >= maxBytes) return
    let entries
    try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch { return }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (files.length >= maxFiles || bytes >= maxBytes) return
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue
        if (entry.name.startsWith('.')) continue
        walk(absolute)
        continue
      }
      if (!entry.isFile()) continue
      if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue
      const relative = path.relative(root, absolute).split(path.sep).join('/')
      if (BUILD_FILE.test(relative)) continue
      let size = 0
      try { size = fs.statSync(absolute).size } catch { continue }
      if (bytes + size > maxBytes) continue
      bytes += size
      files.push(absolute)
    }
  }
  walk(root)
  return files
}

/** Read all source files once, returning {file, relative, text} records. */
export function readSources(root, options) {
  return listSourceFiles(root, options).map(file => ({
    file,
    relative: posixRelative(root, file),
    text: readText(file),
  }))
}

export function regexHits(sources, pattern) {
  const hits = []
  for (const source of sources) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
    let match
    while ((match = re.exec(source.text))) {
      const before = source.text.slice(0, match.index)
      const line = before.split('\n').length
      hits.push({ file: source.relative, line, text: match[0] })
      if (match[0] === '') re.lastIndex += 1
    }
  }
  return hits
}

/** Resolve an exports target for the root subpath. Returns a relative path or null. */
export function rootExportTarget(manifest) {
  const exportsField = manifest.exports
  if (exportsField === undefined) return null
  const pick = (value) => {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
      for (const item of value) {
        const picked = pick(item)
        if (picked) return picked
      }
      return null
    }
    if (!isObject(value)) return null
    for (const key of ['import', 'default', 'node', 'require', 'module-sync', 'browser']) {
      if (Object.hasOwn(value, key)) {
        const picked = pick(value[key])
        if (picked) return picked
      }
    }
    return null
  }
  if (typeof exportsField === 'string' || Array.isArray(exportsField)) return pick(exportsField)
  if (!isObject(exportsField)) return null
  if (Object.hasOwn(exportsField, '.')) return pick(exportsField['.'])
  // A conditional object without subpath keys is the root export.
  if (Object.hasOwn(exportsField, 'import') || Object.hasOwn(exportsField, 'default') || Object.hasOwn(exportsField, 'require')) return pick(exportsField)
  return null
}

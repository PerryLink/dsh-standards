#!/usr/bin/env node
/**
 * build-offline-kit — one .tgz for air-gapped / intranet users.
 *
 * The kit carries:
 *   - the dsh-standards npm tarball (zero runtime dependencies)
 *   - adoption/market (rev1 label schema, revocation, disclaimer, ...)
 *   - market-contract (rev2 proposal, validate.mjs, examples)
 *   - examples/ (the shipped example plugins)
 *   - README.md (offline instructions) + OFFLINE-KIT.json (content manifest)
 *
 * It does not download anything. `market-contract` is not part of this repo
 * yet, so the source directory can be passed explicitly (--market-contract);
 * otherwise the usual sibling locations are probed and a clear error is
 * raised when none is found.
 *
 * Usage:
 *   node 40-checker/scripts/build-offline-kit.mjs \
 *     --out publish/dsh-standards-offline-1.2.2.tgz \
 *     --tarball /tmp/dsh-standards-1.2.2.tgz \
 *     --market-contract /path/to/00-live/market-contract
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')

function usage() {
  console.log(`build-offline-kit — bundle a self-contained offline kit

Usage:
  node 40-checker/scripts/build-offline-kit.mjs [options]

Options:
  --out <file>              output .tgz, default publish/dsh-standards-offline-<version>.tgz
  --tarball <file>          existing dsh-standards npm .tgz; default pack the current tree
  --root <dir>              source tree, default this repository
  --market-contract <dir>   market-contract source (rev2 proposal + validate.mjs + examples)
  --version <version>       kit/package version, default package.json version
  --today <YYYY-MM-DD>      fixed manifest/README date
  --help                    show this help

The output is a gzip tar with README.md, OFFLINE-KIT.json, the npm tarball,
adoption/market, market-contract and examples at its root.`)
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is not readable JSON (${file}): ${error.message}`)
  }
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function parseArgs(argv) {
  const options = {
    out: null, tarball: null, root: ROOT, marketContract: null,
    version: null, today: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      i += 1
      return value
    }
    if (arg === '--out') options.out = next()
    else if (arg === '--tarball') options.tarball = next()
    else if (arg === '--root') options.root = next()
    else if (arg === '--market-contract') options.marketContract = next()
    else if (arg === '--version') options.version = next()
    else if (arg === '--today') {
      const day = next()
      const parsed = new Date(`${day}T00:00:00.000Z`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
        throw new Error(`--today must be a real YYYY-MM-DD, got ${JSON.stringify(day)}`)
      }
      options.today = day
    } else if (arg === '--help' || arg === '-h') {
      usage()
      process.exit(0)
    } else {
      throw new Error(`unknown option: ${arg}`)
    }
  }
  options.root = path.resolve(options.root)
  return options
}

function findMarketContract(root, explicit) {
  const candidates = []
  if (explicit) candidates.push(path.resolve(explicit))
  if (process.env.DSH_MARKET_CONTRACT) candidates.push(path.resolve(process.env.DSH_MARKET_CONTRACT))
  candidates.push(
    path.join(root, 'market-contract'),
    path.join(root, '..', 'deepseek-community-hub', '00-live', 'market-contract'),
    path.join(root, '..', '..', 'deepseek-community-hub', '00-live', 'market-contract'),
    path.join(root, '..', 'market-contract'),
    path.join(root, '..', '..', '00-live', 'market-contract'),
    path.join(root, '00-live', 'market-contract'),
  )
  for (const candidate of candidates) {
    if (!fs.existsSync(path.join(candidate, 'validate.mjs'))) continue
    if (!fs.existsSync(path.join(candidate, 'label.schema.rev2.json'))) continue
    return candidate
  }
  throw new Error(
    'market-contract not found. Pass --market-contract <dir> (it must contain validate.mjs and label.schema.rev2.json). ' +
    `Tried: ${candidates.join(', ')}`,
  )
}

function findTarball(root, explicit, version) {
  if (explicit) {
    const file = path.resolve(explicit)
    if (!fs.existsSync(file)) throw new Error(`--tarball not found: ${file}`)
    return { file, temporary: false }
  }
  for (const name of [`dsh-standards-${version}.tgz`, `dsh-standards-${version}.tar.gz`]) {
    const candidate = path.join(root, name)
    if (fs.existsSync(candidate)) return { file: candidate, temporary: false }
  }
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-standards-pack-'))
  const run = spawnSync('npm', ['pack', '--ignore-scripts', '--pack-destination', packDir], {
    cwd: root,
    encoding: 'utf8',
  })
  if (run.status !== 0) {
    throw new Error(`npm pack failed (exit ${run.status}): ${(run.stderr || '').slice(-500)}`)
  }
  const produced = fs.readdirSync(packDir).filter(name => name.endsWith('.tgz'))
  if (produced.length !== 1) throw new Error(`npm pack produced ${produced.length} tarballs, expected 1`)
  return { file: path.join(packDir, produced[0]), temporary: true, packDir }
}

function copyDir(source, destination, label) {
  if (!fs.existsSync(source)) throw new Error(`${label} not found: ${source}`)
  if (!fs.statSync(source).isDirectory()) throw new Error(`${label} is not a directory: ${source}`)
  fs.cpSync(source, destination, { recursive: true, force: true })
}

function listFiles(directory, prefix = '') {
  const files = []
  for (const name of fs.readdirSync(directory).sort()) {
    const full = path.join(directory, name)
    const relative = prefix ? `${prefix}/${name}` : name
    if (fs.statSync(full).isDirectory()) files.push(...listFiles(full, relative))
    else files.push(relative)
  }
  return files
}

function makeReadme({ version, day, tarballName }) {
  return `# dsh-standards 离线包 ${version}

> 生成于 ${day}。**不需要联网**，不含遥测，不执行被检查插件的代码。

## 内容

| 路径 | 用途 |
|---|---|
| \`${tarballName}\` | dsh-standards npm 包（零运行时依赖，含 \`dsh-standards\` / \`dsh-levels\`） |
| \`adoption/market/\` | 市场标签 rev1 schema、撤回说明、免责声明、渲染规则 |
| \`market-contract/\` | rev2 提案 schema + \`validate.mjs\` + 4 个可校验样张 |
| \`examples/\` | 仓库自带的示例插件 |
| \`OFFLINE-KIT.json\` | 本包文件清单、npm tarball 的 sha256 与大小 |

## 快速开始（断网）

\`\`\`sh
tar -xzf dsh-standards-offline-${version}.tgz -C dsh-standards-offline
cd dsh-standards-offline
npm install --offline --no-audit --no-fund ./${tarballName}
node node_modules/dsh-standards/bin/dsh-levels.mjs <plugin-dir> --format json
\`\`\`

\`dsh-levels\` 默认只做静态 ENTRY 检查；FLOW 没有证据文件就是 \`not-run\`，
BOOST 没有证据卡就是 \`not-measured\`。静态 \`recognized\` **不等于** runtime。

## 校验市场契约

\`\`\`sh
node market-contract/validate.mjs --examples   # 期望 4/4 样张符合预期
\`\`\`

rev2 仍是提案（\`x-dsh-effective:false\`），现行市场记录仍按 \`adoption/market/label.schema.json\` 的 rev1 校验。
sidecar 是索引缓存，不是签发记录；本离线包不内置 \`publish/sidecar.json\`。

## 边界

- 不是官方标准、不是认证、不是安全审计、不排序、不比较、不做担保。
- 离线包不联网、不下载、不安装被检查插件的依赖。
- 许可证见 npm tarball 内的 \`LICENSE\` / \`LICENSE-APACHE\` / \`LICENSE-CC-BY\`。
`
}

function makeTar(staging, outFile) {
  const write = (flags) => spawnSync('tar', [...flags, '-czf', outFile, '-C', staging, '.'], {
    encoding: 'utf8',
  })
  let run = write(['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner'])
  if (run.status !== 0) {
    fs.rmSync(outFile, { force: true })
    run = write([])
  }
  if (run.status !== 0) {
    throw new Error(`tar failed (exit ${run.status}): ${(run.stderr || '').slice(-500)}`)
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const rootPkg = readJson(path.join(options.root, 'package.json'), 'package.json')
  const version = options.version ?? rootPkg.version
  if (typeof version !== 'string' || version === '') throw new Error('cannot determine kit version')
  const day = options.today ?? new Date().toISOString().slice(0, 10)
  const outFile = path.resolve(options.out ?? path.join(options.root, 'publish', `dsh-standards-offline-${version}.tgz`))

  const marketContract = findMarketContract(options.root, options.marketContract)
  const tarball = findTarball(options.root, options.tarball, version)
  const tarballName = `dsh-standards-${version}.tgz`
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-offline-kit-'))
  try {
    const kit = path.join(staging, 'kit')
    fs.mkdirSync(kit, { recursive: true })
    copyDir(path.join(options.root, 'adoption', 'market'), path.join(kit, 'adoption', 'market'), 'adoption/market')
    copyDir(marketContract, path.join(kit, 'market-contract'), 'market-contract')
    copyDir(path.join(options.root, 'examples'), path.join(kit, 'examples'), 'examples')
    fs.copyFileSync(tarball.file, path.join(kit, tarballName))

    const tarballSha256 = sha256File(tarball.file)
    fs.writeFileSync(path.join(kit, 'README.md'), makeReadme({ version, day, tarballName }))

    const contents = listFiles(kit).filter(file => file !== 'OFFLINE-KIT.json')
    const manifest = {
      schema: 'dsh-offline-kit/1',
      name: 'dsh-standards-offline',
      version,
      generatedAt: options.today ? `${day}T00:00:00.000Z` : new Date().toISOString(),
      package: {
        name: rootPkg.name,
        version,
        tarball: tarballName,
        sha256: tarballSha256,
        bytes: fs.statSync(tarball.file).size,
      },
      marketContract: { source: 'market-contract', files: listFiles(path.join(kit, 'market-contract')).length },
      contents,
    }
    fs.writeFileSync(path.join(kit, 'OFFLINE-KIT.json'), `${JSON.stringify(manifest, null, 2)}\n`)

    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    makeTar(kit, outFile)
    const bytes = fs.statSync(outFile).size
    console.log(JSON.stringify({
      out: outFile,
      bytes,
      sha256: sha256File(outFile),
      kit: { version, package: tarballName, files: contents.length + 1 },
      marketContract,
      tarball: { file: tarball.file, sha256: tarballSha256, bytes: manifest.package.bytes },
    }, null, 2))
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
    if (tarball.packDir) fs.rmSync(tarball.packDir, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  console.error(`build-offline-kit: ${error.message}`)
  process.exitCode = 3
}

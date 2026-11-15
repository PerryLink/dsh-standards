#!/usr/bin/env node
/**
 * Reference implementation: package.json -> Compatum/1 profile.
 *
 * It reads the declaration a package already ships (`dsh.capabilities`,
 * `engines.dsh`, `engines.node`, `dsh.bundle`, `dshWorkshop.lifecycle`,
 * `repository`) and emits the three profile fields:
 *
 *   capabilities[]  normalized to the 16-ID registry in compatum.schema.json
 *   requires        host ranges + install/uninstall semantics
 *   evidence[]      one "declared" / "NOT-RUN" record, never PASS
 *
 * The generated profile is then validated by the existing zero-dependency
 * validator (spec/compatum-validate.mjs); this file deliberately does not
 * re-implement JSON Schema.
 *
 * Missing `dsh.capabilities` is an error, not an empty array: the profile says
 * "missing means unknown, not none". An explicit `[]` is preserved as the
 * package's own none claim (the validator still reports it as a WARN).
 *
 * No network, no package install, no plugin code runs.
 *
 * Usage:
 *   node spec/compatum-reference.mjs <dir>
 *   node spec/compatum-reference.mjs <dir> --from-git [--rev origin/main]
 *   node spec/compatum-reference.mjs <dir> --commit <sha> --json
 *
 * Exit codes: 0 profile valid, 1 profile generated but failed validation,
 * 2 input/declaration error (no profile was produced).
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SCHEMA_PATH = join(HERE, 'compatum.schema.json');
const VALIDATOR_PATH = join(HERE, 'compatum-validate.mjs');
const SELF_PACKAGE_PATH = join(ROOT, 'package.json');

const ACTIVATION = {
  immediate: 'immediate',
  'hot-reload': 'hot-reload',
  restart: 'restart',
  'restart-profile': 'restart',
  'next-session': 'next-session',
};

export class ReferenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReferenceError';
    this.code = code;
  }
}

function readJson(file) {
  let text = readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ReferenceError('INVALID_JSON', `invalid JSON in ${file}: ${error.message}`);
  }
}

function git(dir, args) {
  const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return result.stdout.replace(/\n$/, '');
}

export function loadSchema() {
  return readJson(SCHEMA_PATH);
}

export function normalizeRepoUrl(value) {
  let url = String(value ?? '').trim();
  url = url.replace(/^git\+/, '');
  url = url.replace(/^git@github\.com:/, 'https://github.com/');
  url = url.replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/');
  url = url.replace(/\.git$/, '');
  return url.replace(/\/+$/, '');
}

function repoOf(pkg) {
  const repository = pkg.repository;
  if (typeof repository === 'string') return normalizeRepoUrl(repository);
  if (repository && typeof repository.url === 'string') return normalizeRepoUrl(repository.url);
  return '';
}

function parseHost(value) {
  const match = /^([a-z0-9][a-z0-9._-]*)@(.+)$/.exec(String(value));
  if (!match) {
    throw new ReferenceError('INVALID_HOST', `host must be <name>@<version>, got "${value}"`);
  }
  return { name: match[1], version: match[2] };
}

function installOf(pkg, options, warnings) {
  const bundle = pkg.dsh && typeof pkg.dsh === 'object' ? pkg.dsh.bundle : undefined;
  const unit = bundle ? 'bundle' : 'package';
  const entry = bundle ? 'dsh.bundle.patch' : 'package.json';
  const rawActivation = pkg.dshWorkshop?.lifecycle?.activation;
  let activation = ACTIVATION[rawActivation];
  if (!activation) {
    activation = 'restart';
    if (rawActivation !== undefined) {
      warnings.push(`unknown dshWorkshop.lifecycle.activation "${rawActivation}"; using "restart"`);
    }
  }
  let data;
  if (options.data !== undefined) {
    data = options.data;
  } else if (bundle) {
    data = `$DSH_HOME/${pkg.name}`;
  } else {
    data = 'none';
  }
  const residue =
    data === 'none'
      ? []
      : [`plugin data under ${data} is not removed by \`dsh plugin remove\``];
  return {
    unit,
    entry,
    activation,
    data,
    uninstall: {
      stops: true,
      removesCode: true,
      removesData: false,
      residue,
    },
  };
}

/**
 * Build one compatum/1 profile from a parsed package.json.
 *
 * @param {object} pkg parsed package.json
 * @param {{commit?: string, host?: string, data?: string, now?: string|Date, schema?: object}} [options]
 * @returns {{profile: object, warnings: string[]}}
 */
export function buildProfile(pkg, options = {}) {
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    throw new ReferenceError('INVALID_PACKAGE', 'package.json must be a JSON object');
  }
  if (typeof pkg.name !== 'string' || pkg.name.length === 0) {
    throw new ReferenceError('MISSING_NAME', 'package.json#name is required');
  }
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new ReferenceError('MISSING_VERSION', 'package.json#version is required');
  }

  const schema = options.schema ?? loadSchema();
  const registry = schema?.$defs?.capabilityRegistry?.const;
  const effects = schema?.$defs?.capabilityEffects?.const;
  const aliases = schema?.$defs?.capabilityAliases?.const;
  if (!Array.isArray(registry) || !effects || !aliases) {
    throw new ReferenceError('SCHEMA_REGISTRY', 'compatum.schema.json is missing its capability registry');
  }
  const canonical = new Set(registry);

  const declared = pkg.dsh && typeof pkg.dsh === 'object' ? pkg.dsh.capabilities : undefined;
  if (declared === undefined) {
    throw new ReferenceError(
      'MISSING_CAPABILITIES',
      'package.json#dsh.capabilities is missing; missing means unknown, not none. ' +
        'Declare an explicit [] only if the package really has no capabilities.',
    );
  }
  if (!Array.isArray(declared) || declared.some((id) => typeof id !== 'string')) {
    throw new ReferenceError(
      'INVALID_CAPABILITIES',
      'package.json#dsh.capabilities must be an array of capability ID strings',
    );
  }

  const warnings = [];
  const seen = new Set();
  const capabilities = declared.map((rawId) => {
    let id = rawId;
    let reason = 'Declared in package.json#dsh.capabilities.';
    if (Object.prototype.hasOwnProperty.call(aliases, rawId)) {
      id = aliases[rawId];
      reason = `Alias "${rawId}" normalized to "${id}" from package.json#dsh.capabilities.`;
      warnings.push(`normalized alias "${rawId}" -> "${id}"`);
    }
    if (!canonical.has(id)) {
      throw new ReferenceError(
        'UNKNOWN_CAPABILITY',
        `"${rawId}" is not one of the ${registry.length} capability IDs in compatum.schema.json`,
      );
    }
    if (seen.has(id)) {
      throw new ReferenceError('DUPLICATE_CAPABILITY', `duplicate capability id "${id}"`);
    }
    seen.add(id);
    return { id, effect: effects[id], reason };
  });

  const engines = pkg.engines && typeof pkg.engines === 'object' ? pkg.engines : {};
  const requires = { portable: '1.0' };
  if (typeof engines.dsh === 'string' && engines.dsh.length > 0) requires.dsh = engines.dsh;
  if (typeof engines.node === 'string' && engines.node.length > 0) requires.node = engines.node;
  if (requires.dsh === undefined && requires.node === undefined) {
    throw new ReferenceError(
      'MISSING_REQUIRES',
      'package.json#engines.dsh and package.json#engines.node are both missing; ' +
        'a compatum/1 profile needs at least one host or toolchain constraint',
    );
  }
  requires.install = installOf(pkg, options, warnings);

  const repo = options.repo ?? repoOf(pkg);
  if (!repo) {
    throw new ReferenceError(
      'MISSING_REPOSITORY',
      'package.json#repository.url is missing; pass --repo <url> so evidence can be anchored',
    );
  }
  const commit = options.commit;
  if (typeof commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(commit)) {
    throw new ReferenceError(
      'INVALID_COMMIT',
      'a lowercase 7-40 character commit anchor is required; pass --commit <sha> or use --from-git',
    );
  }
  if (!options.now || Number.isNaN(Date.parse(String(options.now)))) {
    throw new ReferenceError('INVALID_NOW', 'options.now must be a valid date-time');
  }
  const host = parseHost(options.host ?? 'dsh@not-run');
  const selfVersion = readJson(SELF_PACKAGE_PATH).version;

  const profile = {
    schema: 'compatum/1',
    name: pkg.name,
    version: pkg.version,
    capabilities,
    requires,
    evidence: [
      {
        schema: 'compatum-evidence/1',
        level: 'declared',
        subject: {
          repo,
          version: pkg.version,
          commit,
        },
        host,
        checker: `dsh-standards/compatum-reference@${selfVersion}`,
        result: 'NOT-RUN',
        scope: 'capability',
        checkedAt: new Date(options.now).toISOString(),
        reportPath: 'package.json#dsh.capabilities',
        stale: false,
      },
    ],
  };
  return { profile, warnings };
}

/**
 * Read package.json from the working tree or from one git revision.
 * A working-tree read requires a clean package.json: anchoring a dirty file to
 * HEAD would describe a version that is not in the commit.
 */
export function loadPackage(dir, options = {}) {
  const target = resolve(dir);
  if (options.fromGit) {
    const top = git(target, ['rev-parse', '--show-toplevel']);
    if (top === null) {
      throw new ReferenceError('NOT_A_REPOSITORY', `${target} is not inside a git checkout; --from-git needs one`);
    }
    const rev = options.rev ?? 'HEAD';
    const commit = git(top, ['rev-parse', rev]);
    if (commit === null || !/^[0-9a-f]{7,40}$/.test(commit)) {
      throw new ReferenceError('UNKNOWN_REVISION', `git rev-parse ${rev} did not return a commit`);
    }
    const prefix = git(top, ['rev-parse', '--show-prefix']) ?? '';
    const blobPath = `${prefix}package.json`;
    const text = git(top, ['show', `${rev}:${blobPath}`]);
    if (text === null) {
      throw new ReferenceError('NO_PACKAGE_JSON', `${blobPath} does not exist at ${rev}`);
    }
    let pkg;
    try {
      pkg = JSON.parse(text);
    } catch (error) {
      throw new ReferenceError('INVALID_JSON', `invalid JSON in ${rev}:${blobPath}: ${error.message}`);
    }
    return { pkg, commit, source: 'git', rev, path: `${top}/${blobPath}` };
  }

  const file = join(target, 'package.json');
  let pkg;
  try {
    pkg = readJson(file);
  } catch (error) {
    if (error instanceof ReferenceError) throw error;
    throw new ReferenceError('NO_PACKAGE_JSON', `cannot read ${file}: ${error.message}`);
  }
  const top = git(target, ['rev-parse', '--show-toplevel']);
  if (top !== null) {
    const dirty = git(target, ['status', '--porcelain', '--', 'package.json']);
    if (dirty === null) {
      throw new ReferenceError('GIT_STATUS', `git status failed for ${target}`);
    }
    if (dirty.length > 0) {
      throw new ReferenceError(
        'DIRTY_PACKAGE_JSON',
        'package.json has uncommitted changes; a HEAD anchor would not describe this file. ' +
          'Commit it, or pass --from-git to generate from a committed revision.',
      );
    }
  }
  let commit = options.commit;
  if (commit === undefined) {
    if (top !== null) {
      commit = git(top, ['rev-parse', 'HEAD']) ?? undefined;
    } else if (typeof pkg.gitHead === 'string') {
      commit = pkg.gitHead;
    }
  }
  return { pkg, commit, source: 'worktree', path: file };
}

/**
 * Run the existing validator over one profile in an isolated temp file.
 * @returns {{ok: boolean, exitCode: number, stdout: string, stderr: string}}
 */
export function validateProfile(profile) {
  const dir = mkdtempSync(join(tmpdir(), 'compatum-reference-'));
  if (!dir.startsWith(tmpdir())) {
    throw new ReferenceError('TEMP_DIR', `refusing to use unexpected temp dir ${dir}`);
  }
  try {
    const file = join(dir, 'profile.json');
    writeFileSync(file, `${JSON.stringify(profile, null, 2)}\n`);
    const result = spawnSync(process.execPath, [VALIDATOR_PATH, file], { encoding: 'utf8' });
    return {
      ok: result.status === 0,
      exitCode: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** package.json -> profile -> existing validator. */
export function generate(dir, options = {}) {
  const loaded = loadPackage(dir, options);
  const { profile, warnings } = buildProfile(loaded.pkg, {
    ...options,
    commit: options.commit ?? loaded.commit,
    now: options.now ?? new Date().toISOString(),
  });
  const validation = validateProfile(profile);
  return { profile, warnings, validation, source: loaded.source, path: loaded.path };
}

function usage() {
  return [
    'Usage: node spec/compatum-reference.mjs <dir> [options]',
    '',
    'Generate a compatum/1 profile from package.json and validate it with',
    'spec/compatum-validate.mjs.',
    '',
    'Options:',
    '  --from-git         read package.json from a git revision instead of the working tree',
    '  --rev <rev>        revision for --from-git (default: HEAD)',
    '  --commit <sha>     commit anchor when <dir> is not a git checkout',
    '  --repo <url>       repository URL when package.json has no repository.url',
    '  --host <name@ver>  exact host anchor for the declared record (default: dsh@not-run)',
    '  --data <value>     requires.install.data (default: $DSH_HOME/<name>, or none)',
    '  --out <file>       also write the generated profile JSON to <file>',
    '  --json             machine-readable {ok, profile, warnings, validation}',
    '  --help             this text',
    '',
    'Exit codes: 0 valid, 1 generated but invalid, 2 declaration/input error.',
    '',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    dir: null,
    fromGit: false,
    rev: 'HEAD',
    json: false,
    help: false,
  };
  const valueFlags = new Set(['rev', 'commit', 'repo', 'host', 'data', 'out']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--from-git') {
      options.fromGit = true;
      continue;
    }
    const [flag, inline] = arg.includes('=') ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    if (valueFlags.has(flag.slice(2)) && flag.startsWith('--')) {
      const value = inline ?? argv[(index += 1)];
      if (value === undefined || value.startsWith('--')) {
        throw new ReferenceError('USAGE', `${flag} needs a value`);
      }
      options[flag.slice(2)] = value;
      continue;
    }
    if (arg.startsWith('-')) throw new ReferenceError('USAGE', `unknown option ${arg}`);
    if (options.dir !== null) throw new ReferenceError('USAGE', `unexpected argument ${arg}`);
    options.dir = arg;
  }
  return options;
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`compatum-reference: ${error.message}\n${usage()}`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  if (!options.dir) {
    process.stderr.write(`compatum-reference: <dir> is required\n${usage()}`);
    return 2;
  }
  if (options.fromGit && options.commit !== undefined) {
    process.stderr.write('compatum-reference: --commit and --from-git are mutually exclusive\n');
    return 2;
  }

  let result;
  try {
    result = generate(options.dir, {
      fromGit: options.fromGit,
      rev: options.rev,
      commit: options.commit,
      repo: options.repo,
      host: options.host,
      data: options.data,
    });
  } catch (error) {
    process.stderr.write(`compatum-reference: ${error.code ?? 'ERROR'}: ${error.message}\n`);
    return 2;
  }

  if (options.out) {
    writeFileSync(resolve(options.out), `${JSON.stringify(result.profile, null, 2)}\n`);
  }
  for (const warning of result.warnings) {
    process.stderr.write(`note: ${warning}\n`);
  }
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: result.validation.ok,
          source: result.source,
          path: result.path,
          profile: result.profile,
          warnings: result.warnings,
          validation: {
            exitCode: result.validation.exitCode,
            stdout: result.validation.stdout,
            stderr: result.validation.stderr,
          },
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stdout.write(`${JSON.stringify(result.profile, null, 2)}\n`);
    process.stderr.write(result.validation.stdout);
    process.stderr.write(result.validation.stderr);
  }
  return result.validation.ok ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exitCode = main(process.argv.slice(2));

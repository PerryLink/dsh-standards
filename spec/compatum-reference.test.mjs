#!/usr/bin/env node
/**
 * Tests for the Compatum/1 reference implementation.
 *
 * Run: node --test spec/compatum-reference.test.mjs
 *
 * The positive cases build a profile and run it through the real
 * spec/compatum-validate.mjs; the integration cases exercise the CLI and the
 * `--from-git` anchor. No network, no package installs, no plugin code.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildProfile, validateProfile } from './compatum-reference.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REFERENCE = join(HERE, 'compatum-reference.mjs');
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const NOW = '2026-11-15T00:00:00.000Z';

function packageJson(overrides = {}) {
  return {
    name: 'dsh-fixture',
    version: '0.1.0',
    repository: { type: 'git', url: 'git+https://github.com/PerryLink/dsh-fixture.git' },
    engines: { dsh: '>=0.2.2-0 <0.3.0', node: '>=24.9.0' },
    dsh: { capabilities: [] },
    ...overrides,
  };
}

function build(overrides, options = {}) {
  return buildProfile(packageJson(overrides), { commit: COMMIT, now: NOW, ...options });
}

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'compatum-reference-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function run(args, options = {}) {
  return spawnSync(process.execPath, [REFERENCE, ...args], { encoding: 'utf8', ...options });
}

test('pure documentation package: explicit [] stays empty and validates as WARN, not PASS', () => {
  const { profile, warnings } = build();
  assert.deepEqual(warnings, []);
  assert.deepEqual(profile.capabilities, []);
  assert.equal(profile.schema, 'compatum/1');
  assert.equal(profile.requires.portable, '1.0');
  assert.equal(profile.requires.dsh, '>=0.2.2-0 <0.3.0');
  assert.equal(profile.requires.node, '>=24.9.0');
  assert.equal(profile.requires.install.unit, 'package');
  assert.equal(profile.requires.install.activation, 'restart');
  assert.equal(profile.requires.install.data, 'none');
  assert.deepEqual(profile.requires.install.uninstall.residue, []);
  assert.equal(profile.evidence.length, 1);
  assert.equal(profile.evidence[0].level, 'declared');
  assert.equal(profile.evidence[0].result, 'NOT-RUN');
  assert.equal(profile.evidence[0].host.version, 'not-run');

  const validation = validateProfile(profile);
  assert.equal(validation.ok, true, `${validation.stdout}\n${validation.stderr}`);
  assert.match(validation.stdout, /capabilities is empty: explicit none/);
});

test('fs:read + network:egress package: effects and bundle install are derived', () => {
  const { profile } = build({
    dsh: {
      capabilities: ['fs:read', 'network:egress'],
      bundle: { patch: './cordis.patch.yml' },
    },
  });
  assert.deepEqual(
    profile.capabilities.map(({ id, effect }) => ({ id, effect })),
    [
      { id: 'fs:read', effect: 'read' },
      { id: 'network:egress', effect: 'network' },
    ],
  );
  assert.equal(profile.requires.install.unit, 'bundle');
  assert.equal(profile.requires.install.entry, 'dsh.bundle.patch');
  assert.equal(profile.requires.install.data, '$DSH_HOME/dsh-fixture');
  assert.equal(profile.requires.install.uninstall.residue.length, 1);
  assert.match(profile.requires.install.uninstall.residue[0], /not removed/);
  assert.match(profile.capabilities[0].reason, /package\.json#dsh\.capabilities/);

  const validation = validateProfile(profile);
  assert.equal(validation.ok, true, `${validation.stdout}\n${validation.stderr}`);
});

test('session-log appender: sessions:write is emitted with effect write', () => {
  const { profile } = build({
    dsh: { capabilities: ['sessions:write'], bundle: { patch: './cordis.patch.yml' } },
  });
  assert.deepEqual(profile.capabilities, [
    {
      id: 'sessions:write',
      effect: 'write',
      reason: 'Declared in package.json#dsh.capabilities.',
    },
  ]);
  assert.equal(profile.requires.install.activation, 'restart');

  const validation = validateProfile(profile);
  assert.equal(validation.ok, true, `${validation.stdout}\n${validation.stderr}`);
});

test('aliases are normalized, and the invalid declarations are rejected', async (t) => {
  await t.test('alias listen is normalized, not written', () => {
    const { profile, warnings } = build({ dsh: { capabilities: ['listen'] } });
    assert.equal(profile.capabilities[0].id, 'network:ingress');
    assert.equal(profile.capabilities[0].effect, 'network');
    assert.deepEqual(warnings, ['normalized alias "listen" -> "network:ingress"']);
    assert.match(profile.capabilities[0].reason, /Alias "listen"/);
  });

  await t.test('missing dsh.capabilities is unknown, not none', () => {
    assert.throws(() => build({ dsh: {} }), { code: 'MISSING_CAPABILITIES' });
  });

  await t.test('unknown id is rejected', () => {
    assert.throws(() => build({ dsh: { capabilities: ['files:read'] } }), {
      code: 'UNKNOWN_CAPABILITY',
    });
  });

  await t.test('alias plus canonical id is a duplicate', () => {
    assert.throws(() => build({ dsh: { capabilities: ['network:ingress', 'listen'] } }), {
      code: 'DUPLICATE_CAPABILITY',
    });
  });

  await t.test('missing host constraint is rejected', () => {
    assert.throws(() => build({ engines: {} }), { code: 'MISSING_REQUIRES' });
  });
});

test('CLI: generates a profile, validates it, and can write it out', (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(packageJson(), null, 2)}\n`);
  const out = join(dir, 'compatum.json');

  const result = run([dir, '--commit', COMMIT, '--out', out, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.profile.name, 'dsh-fixture');
  assert.equal(parsed.profile.evidence[0].subject.commit, COMMIT);
  assert.equal(parsed.validation.exitCode, 0);
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), parsed.profile);
});

test('CLI: a declaration error exits 2 and prints no profile', (t) => {
  const dir = tempDir(t);
  const pkg = packageJson({ dsh: { capabilities: ['not:a:capability'] } });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

  const result = run([dir, '--commit', COMMIT]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /UNKNOWN_CAPABILITY/);
});

test('--from-git anchors the committed package.json and a dirty tree is refused', (t) => {
  const dir = tempDir(t);
  const file = join(dir, 'package.json');
  writeFileSync(file, `${JSON.stringify(packageJson(), null, 2)}\n`);
  const git = (...args) =>
    spawnSync(
      'git',
      ['-C', dir, '-c', 'user.name=compatum-test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args],
      { encoding: 'utf8' },
    );
  const init = git('init', '-q');
  assert.equal(init.status, 0, init.stderr);
  const add = git('add', 'package.json');
  assert.equal(add.status, 0, add.stderr);
  const commit = git('commit', '-q', '-m', 'fixture');
  assert.equal(commit.status, 0, commit.stderr);
  const rev = git('rev-parse', 'HEAD').stdout.trim();

  const fromGit = run([dir, '--from-git', '--json']);
  assert.equal(fromGit.status, 0, fromGit.stderr);
  const profile = JSON.parse(fromGit.stdout).profile;
  assert.equal(profile.version, '0.1.0');
  assert.equal(profile.evidence[0].subject.commit, rev);

  writeFileSync(file, `${JSON.stringify(packageJson({ version: '0.2.0' }), null, 2)}\n`);
  const dirty = run([dir, '--json']);
  assert.equal(dirty.status, 2);
  assert.match(dirty.stderr, /DIRTY_PACKAGE_JSON/);

  const stillCommitted = run([dir, '--from-git', '--json']);
  assert.equal(stillCommitted.status, 0, stillCommitted.stderr);
  assert.equal(JSON.parse(stillCommitted.stdout).profile.version, '0.1.0');
});

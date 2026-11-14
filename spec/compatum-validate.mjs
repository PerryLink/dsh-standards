#!/usr/bin/env node
/**
 * Zero-dependency validator for the Compatum/1 profile.
 *
 * It implements the JSON Schema 2020-12 subset used by
 * spec/compatum.schema.json, then applies the profile's non-schema rules:
 * duplicate IDs, aliases, effect consistency, stale historical evidence, and
 * "declared evidence may not carry a checked result".
 *
 * Usage:
 *   node spec/compatum-validate.mjs
 *   node spec/compatum-validate.mjs examples/compatum/plugin-full.json
 *   node spec/compatum-validate.mjs --json
 *
 * Exit code 0 means every example passed and the built-in negative self-test
 * rejected all cases. No network, no package install, no plugin code runs.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SCHEMA_PATH = join(HERE, 'compatum.schema.json');
const DEFAULT_EXAMPLES = join(ROOT, 'examples', 'compatum');

const KNOWN_FORMATS = new Set(['date', 'date-time', 'uri', 'uri-reference']);

function readJson(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${file}: ${error.message}`);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid JSON in ${file}: ${error.message}`);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function formatPath(path, segment) {
  if (typeof segment === 'number') return `${path}[${segment}]`;
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) return `${path}.${segment}`;
  return `${path}[${JSON.stringify(segment)}]`;
}

function resolveRef(root, ref) {
  if (ref === '#') return root;
  if (!ref.startsWith('#/')) return undefined;
  let node = root;
  for (const raw of ref.slice(2).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isPlainObject(node) && !Array.isArray(node)) return undefined;
    node = node[key];
    if (node === undefined) return undefined;
  }
  return node;
}

function matchesType(value, type) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((one) => {
    switch (one) {
      case 'object':
        return isPlainObject(value);
      case 'array':
        return Array.isArray(value);
      case 'string':
        return typeof value === 'string';
      case 'integer':
        return Number.isInteger(value);
      case 'number':
        return typeof value === 'number' && Number.isFinite(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'null':
        return value === null;
      default:
        return true;
    }
  });
}

function typeName(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function unicodeLength(value) {
  return Array.from(value).length;
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidDateTime(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(
      value,
    )
  ) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

function isValidUri(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    const url = new URL(value);
    return Boolean(url.protocol);
  } catch {
    return false;
  }
}

function checkFormat(format, value) {
  if (!KNOWN_FORMATS.has(format)) return true;
  switch (format) {
    case 'date':
      return isValidDate(value);
    case 'date-time':
      return isValidDateTime(value);
    case 'uri':
      return isValidUri(value);
    case 'uri-reference':
      return typeof value === 'string';
    default:
      return true;
  }
}

function isValidSemver(value) {
  return (
    typeof value === 'string' &&
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
      value,
    )
  );
}

function isValidSemverRange(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) return false;
  const trim = value.trim();
  if (trim === '*' || trim === 'x' || trim === 'X') return true;
  return trim.split('||').every((part) => {
    const group = part.trim();
    if (!group) return false;
    return group.split(/\s+/).every((token) => {
      if (/^[xX*]$/.test(token)) return true;
      return /^(?:[<>=^~]{0,2})v?[0-9]+(?:\.[0-9]+|\.[xX*]){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
        token,
      );
    });
  });
}

function pushError(errors, path, message) {
  errors.push({ path, message });
}

function validateSchema(schema, data, path, root, errors) {
  if (schema === true) return;
  if (schema === false) {
    pushError(errors, path, 'no value is allowed here');
    return;
  }
  if (!isPlainObject(schema)) return;

  if (schema.$ref !== undefined) {
    const target = resolveRef(root, schema.$ref);
    if (target === undefined) {
      pushError(errors, path, `unresolved $ref ${schema.$ref}`);
      return;
    }
    validateSchema(target, data, path, root, errors);
  }

  if (schema.type !== undefined && !matchesType(data, schema.type)) {
    pushError(
      errors,
      path,
      `must be ${Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type}, got ${typeName(data)}`,
    );
    return;
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const') && !deepEqual(data, schema.const)) {
    pushError(errors, path, `must equal ${JSON.stringify(schema.const)}`);
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => deepEqual(data, candidate))) {
    pushError(errors, path, `must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
  }

  if (typeof data === 'string') {
    if (schema.minLength !== undefined && unicodeLength(data) < schema.minLength) {
      pushError(errors, path, `must be at least ${schema.minLength} characters`);
    }
    if (schema.maxLength !== undefined && unicodeLength(data) > schema.maxLength) {
      pushError(errors, path, `must be at most ${schema.maxLength} characters`);
    }
    if (schema.pattern !== undefined) {
      let regex;
      try {
        regex = new RegExp(schema.pattern, 'u');
      } catch (error) {
        pushError(errors, path, `schema pattern is invalid: ${error.message}`);
        regex = null;
      }
      if (regex && !regex.test(data)) {
        pushError(errors, path, `must match ${schema.pattern}`);
      }
    }
    if (schema.format !== undefined && !checkFormat(schema.format, data)) {
      pushError(errors, path, `must be a valid ${schema.format}`);
    }
  }

  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      pushError(errors, path, `must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      pushError(errors, path, `must contain at most ${schema.maxItems} item(s)`);
    }
    if (schema.uniqueItems === true) {
      const seen = new Set();
      for (let index = 0; index < data.length; index += 1) {
        const key = stableStringify(data[index]);
        if (seen.has(key)) {
          pushError(errors, formatPath(path, index), 'must not contain duplicate items');
        }
        seen.add(key);
      }
    }
    if (schema.items !== undefined) {
      for (let index = 0; index < data.length; index += 1) {
        validateSchema(schema.items, data[index], formatPath(path, index), root, errors);
      }
    }
    if (Array.isArray(schema.prefixItems)) {
      schema.prefixItems.forEach((itemSchema, index) => {
        if (index < data.length) {
          validateSchema(itemSchema, data[index], formatPath(path, index), root, errors);
        }
      });
    }
  }

  if (isPlainObject(data)) {
    if (schema.minProperties !== undefined && Object.keys(data).length < schema.minProperties) {
      pushError(errors, path, `must have at least ${schema.minProperties} properties`);
    }
    if (schema.maxProperties !== undefined && Object.keys(data).length > schema.maxProperties) {
      pushError(errors, path, `must have at most ${schema.maxProperties} properties`);
    }
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) {
          pushError(errors, path, `missing required property "${key}"`);
        }
      }
    }
    if (Array.isArray(schema.dependentRequired)) {
      for (const [key, requiredKeys] of Object.entries(schema.dependentRequired)) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          for (const requiredKey of requiredKeys) {
            if (!Object.prototype.hasOwnProperty.call(data, requiredKey)) {
              pushError(errors, path, `property "${key}" requires "${requiredKey}"`);
            }
          }
        }
      }
    }

    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    const patternProperties = isPlainObject(schema.patternProperties) ? schema.patternProperties : {};
    const matched = new Set();

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        matched.add(key);
        validateSchema(propertySchema, data[key], formatPath(path, key), root, errors);
      }
    }
    for (const [pattern, propertySchema] of Object.entries(patternProperties)) {
      let regex;
      try {
        regex = new RegExp(pattern, 'u');
      } catch {
        continue;
      }
      for (const key of Object.keys(data)) {
        if (regex.test(key)) {
          matched.add(key);
          validateSchema(propertySchema, data[key], formatPath(path, key), root, errors);
        }
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(data)) {
        if (!matched.has(key)) {
          pushError(errors, formatPath(path, key), 'additional property is not allowed');
        }
      }
    } else if (isPlainObject(schema.additionalProperties)) {
      for (const key of Object.keys(data)) {
        if (!matched.has(key)) {
          validateSchema(schema.additionalProperties, data[key], formatPath(path, key), root, errors);
        }
      }
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const subSchema of schema.allOf) {
      validateSchema(subSchema, data, path, root, errors);
    }
  }

  if (Array.isArray(schema.anyOf)) {
    let anyValid = false;
    for (const subSchema of schema.anyOf) {
      if (isValidAgainst(subSchema, data, path, root)) {
        anyValid = true;
        break;
      }
    }
    if (!anyValid) {
      pushError(errors, path, `must match at least one of ${schema.anyOf.length} alternatives`);
    }
  }

  if (Array.isArray(schema.oneOf)) {
    let validCount = 0;
    for (const subSchema of schema.oneOf) {
      if (isValidAgainst(subSchema, data, path, root)) validCount += 1;
    }
    if (validCount !== 1) {
      pushError(errors, path, `must match exactly one of ${schema.oneOf.length} alternatives (matched ${validCount})`);
    }
  }

  if (schema.not !== undefined && isValidAgainst(schema.not, data, path, root)) {
    pushError(errors, path, 'must not match the disallowed schema');
  }

  if (schema.if !== undefined) {
    const branch = isValidAgainst(schema.if, data, path, root) ? schema.then : schema.else;
    if (branch !== undefined) validateSchema(branch, data, path, root, errors);
  }
}

function isValidAgainst(schema, data, path, root) {
  const errors = [];
  validateSchema(schema, data, path, root, errors);
  return errors.length === 0;
}

function checkRegistry(schema) {
  const errors = [];
  const registry = schema?.$defs?.capabilityRegistry?.const;
  const aliases = schema?.$defs?.capabilityAliases?.const;
  const effects = schema?.$defs?.capabilityEffects?.const;
  const idEnum = schema?.$defs?.capability?.properties?.id?.enum;

  if (!Array.isArray(registry) || registry.length !== 15) {
    errors.push({ path: '$.$defs.capabilityRegistry', message: 'must contain exactly 15 IDs' });
  } else if (new Set(registry).size !== registry.length) {
    errors.push({ path: '$.$defs.capabilityRegistry', message: 'must not contain duplicate IDs' });
  }
  if (!isPlainObject(aliases)) {
    errors.push({ path: '$.$defs.capabilityAliases', message: 'must be an alias object' });
  } else {
    for (const [alias, target] of Object.entries(aliases)) {
      if (registry?.includes(alias)) {
        errors.push({ path: '$.$defs.capabilityAliases', message: `alias "${alias}" must not be a canonical ID` });
      }
      if (!registry?.includes(target)) {
        errors.push({
          path: '$.$defs.capabilityAliases',
          message: `alias "${alias}" points at unknown ID "${target}"`,
        });
      }
    }
  }
  if (!isPlainObject(effects) || !Array.isArray(registry)) {
    errors.push({ path: '$.$defs.capabilityEffects', message: 'must map every registry ID to an effect' });
  } else {
    for (const id of registry) {
      if (!['read', 'write', 'exec', 'network', 'credential', 'control'].includes(effects[id])) {
        errors.push({ path: '$.$defs.capabilityEffects', message: `missing or invalid effect for "${id}"` });
      }
    }
  }
  if (!Array.isArray(idEnum)) {
    errors.push({ path: '$.$defs.capability.properties.id.enum', message: 'must be an array' });
  } else {
    const canonical = new Set(registry ?? []);
    for (const id of idEnum) {
      if (!canonical.has(id)) {
        errors.push({
          path: '$.$defs.capability.properties.id.enum',
          message: `"${id}" is in the schema enum but not the registry`,
        });
      }
    }
    for (const id of canonical) {
      if (!idEnum.includes(id)) {
        errors.push({
          path: '$.$defs.capability.properties.id.enum',
          message: `registry ID "${id}" is missing from the schema enum`,
        });
      }
    }
  }
  return errors;
}

const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
];

function checkDocument(document, schema) {
  const errors = [];
  const warnings = [];
  const aliases = schema?.$defs?.capabilityAliases?.const ?? {};
  const effects = schema?.$defs?.capabilityEffects?.const ?? {};

  if (Array.isArray(document.capabilities) && document.capabilities.length === 0) {
    warnings.push('capabilities is empty: explicit none, still WARN with risk unknown, never PASS');
  }

  const seen = new Set();
  if (Array.isArray(document.capabilities)) {
    document.capabilities.forEach((capability, index) => {
      if (!isPlainObject(capability)) return;
      const id = capability.id;
      if (typeof id === 'string') {
        if (Object.prototype.hasOwnProperty.call(aliases, id)) {
          errors.push({
            path: formatPath(formatPath('$.capabilities', index), 'id'),
            message: `alias "${id}" must be normalized to "${aliases[id]}" and not written`,
          });
        }
        if (seen.has(id)) {
          errors.push({
            path: formatPath(formatPath('$.capabilities', index), 'id'),
            message: `duplicate capability id "${id}"`,
          });
        }
        seen.add(id);
        if (
          capability.effect !== undefined &&
          Object.prototype.hasOwnProperty.call(effects, id) &&
          capability.effect !== effects[id]
        ) {
          errors.push({
            path: formatPath(formatPath('$.capabilities', index), 'effect'),
            message: `effect for "${id}" must be "${effects[id]}", got "${capability.effect}"`,
          });
        }
      }
      if (Array.isArray(capability.targets)) {
        capability.targets.forEach((target, targetIndex) => {
          if (typeof target === 'string' && SECRET_PATTERNS.some((pattern) => pattern.test(target))) {
            errors.push({
              path: formatPath(formatPath(formatPath('$.capabilities', index), 'targets'), targetIndex),
              message: 'target looks like a secret; declarations must not contain credentials',
            });
          }
        });
      }
    });
  }

  if (Array.isArray(document.evidence)) {
    document.evidence.forEach((record, index) => {
      if (!isPlainObject(record)) return;
      const base = formatPath('$.evidence', index);
      if (record.subject && typeof record.subject.version === 'string' && record.subject.version !== document.version) {
        if (record.stale !== true) {
          errors.push({
            path: `${base}.stale`,
            message: `subject version ${record.subject.version} differs from profile version ${document.version}; historical evidence must set stale:true`,
          });
        }
      }
      if (
        record.subject &&
        typeof record.subject.name === 'string' &&
        typeof document.name === 'string' &&
        record.subject.name !== document.name
      ) {
        errors.push({
          path: `${base}.subject.name`,
          message: `subject name "${record.subject.name}" does not match profile name "${document.name}"`,
        });
      }
      if (record.level === 'declared' && (record.result === 'PASS' || record.result === 'WARN')) {
        errors.push({
          path: `${base}.result`,
          message: `declared evidence cannot carry a ${record.result} result; use checked or tested`,
        });
      }
      if (record.result === 'NOT-RUN') {
        warnings.push(`evidence[${index}] result is NOT-RUN; it is preserved as not a pass`);
      }
      if (record.stale === true) {
        warnings.push(`evidence[${index}] is marked stale; consumers must not treat it as current`);
      }
    });
  }

  if (isPlainObject(document.requires)) {
    for (const key of ['dsh', 'node', 'claude-code', 'codex']) {
      const range = document.requires[key];
      if (range !== undefined && !isValidSemverRange(range)) {
        errors.push({
          path: `$.requires.${key}`,
          message: `"${range}" is not a readable SemVer range`,
        });
      }
    }
    if (isPlainObject(document.requires.install)) {
      const { unit, uninstall } = document.requires.install;
      if (unit === 'server' && uninstall?.removesData === true) {
        warnings.push('server unit declares removesData:true; server-owned data is normally retained');
      }
    }
  }

  return { errors, warnings };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runSelfTest(schema, validDocument) {
  const cases = [
    {
      name: 'alias id is rejected',
      document: (() => {
        const doc = clone(validDocument);
        doc.capabilities[0].id = 'listen';
        doc.capabilities[0].effect = 'network';
        return doc;
      })(),
      expect: 'listen',
    },
    {
      name: 'duplicate id is rejected',
      document: (() => {
        const doc = clone(validDocument);
        doc.capabilities.push(clone(doc.capabilities[0]));
        return doc;
      })(),
      expect: 'duplicate',
    },
    {
      name: 'effect mismatch is rejected',
      document: (() => {
        const doc = clone(validDocument);
        doc.capabilities[0].effect = 'exec';
        return doc;
      })(),
      expect: 'effect',
    },
    {
      name: 'version bump without stale is rejected',
      document: (() => {
        const doc = clone(validDocument);
        doc.version = '9.9.9';
        for (const record of doc.evidence) delete record.stale;
        return doc;
      })(),
      expect: 'stale',
    },
    {
      name: 'declared PASS is rejected',
      document: (() => {
        const doc = clone(validDocument);
        doc.evidence = [{ ...clone(doc.evidence[0]), level: 'declared', result: 'PASS' }];
        return doc;
      })(),
      expect: 'declared',
    },
  ];

  const failures = [];
  for (const testCase of cases) {
    const schemaErrors = [];
    validateSchema(schema, testCase.document, '$', schema, schemaErrors);
    const semantic = checkDocument(testCase.document, schema);
    const messages = [...schemaErrors, ...semantic.errors].map((error) => error.message).join(' | ');
    if (!messages.includes(testCase.expect)) {
      failures.push(`${testCase.name}: expected an error containing "${testCase.expect}", got: ${messages || 'no errors'}`);
    }
  }
  return { cases: cases.length, failures };
}

function collectFiles(inputs) {
  const files = [];
  for (const input of inputs) {
    const absolute = resolve(process.cwd(), input);
    let stat;
    try {
      stat = statSync(absolute);
    } catch {
      throw new Error(`path does not exist: ${input}`);
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) {
        if (name.endsWith('.json')) files.push(join(absolute, name));
      }
    } else {
      files.push(absolute);
    }
  }
  return files;
}

function display(file) {
  const path = relative(ROOT, file);
  return path.startsWith('..') ? file : path;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      [
        'Usage: node spec/compatum-validate.mjs [options] [file-or-directory ...]',
        '',
        'Validates Compatum/1 documents against spec/compatum.schema.json.',
        'With no paths, validates examples/compatum/*.json.',
        '',
        'Options:',
        '  --json    machine-readable output',
        '  --help    this text',
        '',
      ].join('\n'),
    );
    return 0;
  }

  const jsonOutput = args.includes('--json');
  const inputs = args.filter((arg) => !arg.startsWith('--'));
  const schema = readJson(SCHEMA_PATH);
  const registryErrors = checkRegistry(schema);
  if (registryErrors.length > 0) {
    if (jsonOutput) {
      process.stdout.write(`${JSON.stringify({ ok: false, registryErrors }, null, 2)}\n`);
    } else {
      process.stderr.write('FAIL schema registry\n');
      for (const error of registryErrors) process.stderr.write(`  ${error.path}: ${error.message}\n`);
    }
    return 1;
  }

  let files;
  try {
    files = collectFiles(inputs.length > 0 ? inputs : [DEFAULT_EXAMPLES]);
  } catch (error) {
    process.stderr.write(`FAIL ${error.message}\n`);
    return 1;
  }

  const results = [];
  let selfTest = { cases: 0, failures: [] };
  try {
    const seed = readJson(join(DEFAULT_EXAMPLES, 'plugin-full.json'));
    const seedErrors = [];
    validateSchema(schema, seed, '$', schema, seedErrors);
    selfTest = runSelfTest(schema, seed);
    if (seedErrors.length > 0) {
      selfTest.failures.push(
        `negative self-test seed is invalid: ${seedErrors.map((error) => error.message).join(' | ')}`,
      );
    }
  } catch (error) {
    selfTest = { cases: 0, failures: [`cannot load negative self-test seed: ${error.message}`] };
  }

  for (const file of files) {
    const errors = [];
    const warnings = [];
    let document;
    try {
      document = readJson(file);
    } catch (error) {
      errors.push({ path: '$', message: error.message });
      results.push({ file: display(file), ok: false, errors, warnings });
      continue;
    }
    validateSchema(schema, document, '$', schema, errors);
    const semantic = checkDocument(document, schema);
    errors.push(...semantic.errors);
    warnings.push(...semantic.warnings);
    results.push({ file: display(file), ok: errors.length === 0, errors, warnings });
  }

  const ok = results.every((result) => result.ok) && selfTest.failures.length === 0;

  if (jsonOutput) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok,
          schema: display(SCHEMA_PATH),
          registry: {
            ids: schema.$defs.capabilityRegistry.const.length,
            aliases: Object.keys(schema.$defs.capabilityAliases.const).length,
          },
          selfTest,
          files: results,
        },
        null,
        2,
      )}\n`,
    );
    return ok ? 0 : 1;
  }

  process.stdout.write('Compatum/1 schema validator (zero-dependency)\n');
  process.stdout.write(`schema: ${display(SCHEMA_PATH)}\n`);
  process.stdout.write(
    `registry: ${schema.$defs.capabilityRegistry.const.length} IDs, ` +
      `${Object.keys(schema.$defs.capabilityAliases.const).length} aliases, ` +
      `${Object.keys(schema.$defs.capabilityEffects.const).length} effect mappings\n`,
  );
  if (selfTest.failures.length === 0) {
    process.stdout.write(`self-test: ${selfTest.cases}/${selfTest.cases} negative cases rejected\n`);
  } else {
    process.stdout.write(`self-test: FAIL (${selfTest.failures.length} case(s))\n`);
    for (const failure of selfTest.failures) process.stdout.write(`  ${failure}\n`);
  }

  for (const result of results) {
    process.stdout.write(`${result.ok ? 'PASS' : 'FAIL'} ${result.file}\n`);
    for (const error of result.errors.slice(0, 20)) {
      process.stdout.write(`  ${error.path}: ${error.message}\n`);
    }
    if (result.errors.length > 20) {
      process.stdout.write(`  ... ${result.errors.length - 20} more error(s)\n`);
    }
    for (const warning of result.warnings) {
      process.stdout.write(`  note: ${warning}\n`);
    }
  }
  process.stdout.write(`${results.filter((result) => result.ok).length}/${results.length} examples valid\n`);
  return ok ? 0 : 1;
}

process.exitCode = main();

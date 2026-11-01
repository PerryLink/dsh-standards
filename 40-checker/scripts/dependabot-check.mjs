#!/usr/bin/env node
/**
 * dependabot-check.mjs — enforce the owner policy: no Dependabot in this repo.
 *
 * Fails when `.github/dependabot.yml`/`.yaml` exists, or when a workflow still
 * references Dependabot (for example an auto-merge job). The policy is recorded
 * in `46`/`51`; this script makes it machine-checkable.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const errors = []

for (const name of ['dependabot.yml', 'dependabot.yaml']) {
  const file = path.join(ROOT, '.github', name)
  if (fs.existsSync(file)) errors.push(`found ${path.relative(ROOT, file)}`)
}

const workflows = path.join(ROOT, '.github', 'workflows')
if (fs.existsSync(workflows)) {
  for (const name of fs.readdirSync(workflows)) {
    if (!/\.ya?ml$/.test(name)) continue
    const text = fs.readFileSync(path.join(workflows, name), 'utf8')
    // Only automation references count. The policy guard itself lives in a
    // workflow and must not trip this check.
    if (/dependabot\[bot\]|dependabot\/fetch-metadata|dependabot-auto-merge|dependabot\/merge|dependabot\/.*action/i.test(text)) {
      errors.push(`workflow ${name} references Dependabot automation`)
    }
  }
}

if (errors.length) {
  for (const error of errors) console.error(`FAIL dependabot: ${error}`)
  console.error(`FAIL dependabot: ${errors.length} error(s); owner policy is no Dependabot`)
  process.exit(1)
}
console.log('PASS dependabot: no config or automation reference')

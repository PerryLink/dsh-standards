import test from 'node:test'
import assert from 'node:assert/strict'
import { npmPackInvocation } from '../scripts/flow-collect.mjs'

test('flow-collect npm pack: win32 routes npm.cmd through a shell', () => {
  const invocation = npmPackInvocation('win32', ['pack', '--json', '--pack-destination', 'C:\\tmp with space'])
  assert.equal(invocation.command, 'npm.cmd')
  assert.equal(invocation.shell, true, 'a bare npm.cmd spawn is EINVAL on Windows; shell:true uses cmd.exe /c')
  assert.deepEqual(invocation.args, ['pack', '--json', '--pack-destination', 'C:\\tmp with space'])
})

test('flow-collect npm pack: linux keeps the direct npm spawn', () => {
  const invocation = npmPackInvocation('linux', ['pack', '--ignore-scripts', '--json'])
  assert.equal(invocation.command, 'npm')
  assert.equal(invocation.shell, false)
  assert.deepEqual(invocation.args, ['pack', '--ignore-scripts', '--json'])
})

test('flow-collect npm pack: darwin behaves like linux', () => {
  const invocation = npmPackInvocation('darwin', ['pack'])
  assert.equal(invocation.command, 'npm')
  assert.equal(invocation.shell, false)
})

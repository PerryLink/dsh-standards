import test from 'node:test'
import assert from 'node:assert/strict'
import { npmPackInvocation } from '../src/npm-command.mjs'
import { npmPackInvocation as collectorInvocation } from '../scripts/flow-collect.mjs'

const CMD = process.env.ComSpec || 'cmd.exe'

test('npm pack on win32 routes npm.cmd through cmd.exe /c, not a bare .cmd spawn', () => {
  const invocation = npmPackInvocation('win32', ['pack', '--json', '--pack-destination', 'C:\\tmp with space'])
  assert.equal(invocation.command, CMD)
  assert.deepEqual(invocation.args, [
    '/d', '/s', '/c', 'npm.cmd', 'pack', '--json', '--pack-destination', 'C:\\tmp with space',
  ])
  assert.equal(invocation.shell, false, 'shell:true would emit DEP0190; cmd.exe /c keeps args separate')
})

test('npm pack on linux keeps the direct npm spawn', () => {
  const invocation = npmPackInvocation('linux', ['pack', '--ignore-scripts', '--json'])
  assert.equal(invocation.command, 'npm')
  assert.deepEqual(invocation.args, ['pack', '--ignore-scripts', '--json'])
  assert.equal(invocation.shell, false)
})

test('npm pack on darwin behaves like linux', () => {
  const invocation = npmPackInvocation('darwin', ['pack'])
  assert.equal(invocation.command, 'npm')
  assert.deepEqual(invocation.args, ['pack'])
  assert.equal(invocation.shell, false)
})

test('flow-collect re-exports the shared npm invocation', () => {
  assert.deepEqual(
    collectorInvocation('win32', ['pack', '--json']),
    npmPackInvocation('win32', ['pack', '--json']),
  )
})

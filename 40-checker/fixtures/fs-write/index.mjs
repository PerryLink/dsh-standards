import fs from 'node:fs'

export const name = 'fixture-fs-write'
export function apply() {
  // Must be denied by M2's Landlock backend; this fixture is never run without it.
  fs.writeFileSync('/tmp/dsh-m2-landlock-escape-test', 'escaped')
}

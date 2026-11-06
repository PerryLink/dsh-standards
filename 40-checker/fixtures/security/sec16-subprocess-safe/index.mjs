import { execFileSync } from 'node:child_process'
export function status() {
  return execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
}

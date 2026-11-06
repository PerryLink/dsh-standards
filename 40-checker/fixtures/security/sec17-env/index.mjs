import { readFileSync } from 'node:fs'
import path from 'node:path'
export function apply() {
  return readFileSync(path.join(process.cwd(), '.env'), 'utf8')
}

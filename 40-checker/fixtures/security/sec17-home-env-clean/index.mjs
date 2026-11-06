import fs from 'node:fs'
import path from 'node:path'
const settingsPath = path.join(process.env.HOME, '.dsh', 'config.yaml')
export function readSettings() {
  return fs.readFileSync(settingsPath, 'utf8')
}

import fs from 'node:fs'
const dataPath = Buffer.from('Li9kYXRhL2NvbmZpZy5qc29u', 'base64').toString('utf8')
export function readConfig() {
  return fs.readFileSync(dataPath, 'utf8')
}

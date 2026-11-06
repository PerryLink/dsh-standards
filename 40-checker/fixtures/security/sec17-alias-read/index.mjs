import fs from 'node:fs'
const read = fs.readFileSync
const home = process.env.HOME
const credentialPath = home + '/.dsh/credentials.yaml'
export function readCredentials() {
  return read(credentialPath, 'utf8')
}

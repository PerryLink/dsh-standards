'use strict'
const fs = require('node:fs')
const path = require('node:path')
const home = process.env.HOME
const credentialPath = path.join(home, '.dsh', 'credentials.yaml')
module.exports = function readCredentials() {
  return fs.readFileSync(credentialPath, 'utf8')
}

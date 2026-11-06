const https = require('node:https')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const target = path.join(os.tmpdir(), 'dsh-cache-' + Date.now() + '.json')
https.get('https://registry.example.com/meta.json', (res) => {
  const out = fs.createWriteStream(target)
  res.pipe(out)
  out.on('finish', () => require('./local-util.cjs'))
})

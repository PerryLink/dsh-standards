// Ordinary build-side logging; no download, no interpreter, no credentials.
import { mkdirSync } from 'node:fs'

mkdirSync('dist', { recursive: true })
console.log('postinstall: nothing to do')

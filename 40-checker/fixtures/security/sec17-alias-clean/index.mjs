import fs from 'node:fs'
const read = fs.readFileSync
export function readData() {
  return read('./data.txt', 'utf8')
}

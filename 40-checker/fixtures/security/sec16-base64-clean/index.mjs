const greeting = Buffer.from('aGVsbG8=', 'base64').toString('utf8')
export function label() {
  return greeting
}

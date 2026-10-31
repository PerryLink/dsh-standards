#!/usr/bin/env node
import { main } from '../src/cli.mjs'

const code = await main()
process.exitCode = code
// A plugin under L1 may leave timers, sockets, or child processes behind.
// The report is already written; do not let those handles keep the checker alive.
setTimeout(() => process.exit(code), 250)

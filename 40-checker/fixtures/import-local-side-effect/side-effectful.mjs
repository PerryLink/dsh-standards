import { writeFileSync } from 'node:fs'

// C-10.3: the entry imports this module with a relative specifier, so its
// module-scope write executes on import of the entry.
writeFileSync('/tmp/dsh-fixture-import-local-side-effect.txt', 'x')

import { spawnSync } from 'node:child_process'

export const name = 'c12-command-arg'
export function apply() {}

// C-12.4: --add-dir is a real command-line argument here, not documentation.
spawnSync('dsh', ['agent', '--add-dir', './docs'], { stdio: 'inherit' })

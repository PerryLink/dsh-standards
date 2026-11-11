/**
 * npm's Windows launcher is `npm.cmd`. Since Node 18.20/20.12 a bare
 * `spawnSync('npm.cmd', ...)` without a shell fails with EINVAL (the
 * CVE-2024-27980 mitigation). On Windows route the call through
 * `cmd.exe /d /s /c npm.cmd ...`; keeping the arguments separate lets Node's
 * own Windows quoting handle paths with spaces, and unlike `shell: true` it
 * does not emit the DEP0190 deprecation warning. POSIX keeps a direct spawn.
 */
export function npmCommand(platform = process.platform, args = []) {
  if (platform === 'win32') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', ...args],
      shell: false,
    }
  }
  return { command: 'npm', args, shell: false }
}

export function npmPackInvocation(platform = process.platform, args = ['pack', '--ignore-scripts', '--json']) {
  return npmCommand(platform, args)
}

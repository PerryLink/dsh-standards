/** Programmatic API for dsh-plugin-verify. */
export { main, parseArgs, usage, VERSION } from './cli.mjs'
export { runManifestChecks, checkMarketEntry, DEFAULT_RUNTIME_VERSION, inferKind, resolveEntry } from './manifest.mjs'
export { checkCapabilities, checkCredentials, checkLabels, checkImportTimeAdvisory, CAPABILITIES, LABELS } from './declarations.mjs'
export { runRuntimeChecks } from './runtime.mjs'
export { buildReport, formatText, formatSarif, writeReport } from './report.mjs'
export { satisfies, validRange, parseVersion, compareVersions } from './semver.mjs'
export { parseInstallSpec } from './install-spec.mjs'

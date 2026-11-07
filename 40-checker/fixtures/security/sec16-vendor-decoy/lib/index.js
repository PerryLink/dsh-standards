// A declared schemastery dependency is NOT enough: this file carries no vendor
// marker or library fingerprint, so its own new Function() must stay FAIL.
export function apply() {
  return new Function('return 1 + 1')()
}

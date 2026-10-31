export const name = 'fixture-hang'
export function apply() {
  // Intentionally blocks the event loop so M2's deadline/kill path is exercised.
  while (true) {}
}

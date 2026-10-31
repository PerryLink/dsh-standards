/**
 * LEV-7 reference: bounded parallel with stable result order.
 * Not a Cordis plugin; it is the scheduling core a tool batch can use.
 */
export async function runWithLimit(tasks, limit = 4) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer')
  const results = new Array(tasks.length)
  let next = 0
  async function worker() {
    while (next < tasks.length) {
      const index = next++
      results[index] = await tasks[index]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

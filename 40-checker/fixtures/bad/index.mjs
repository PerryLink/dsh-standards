// Intentionally bad fixture: top-level side effect (C-10 advisory),
// a declared provide that never registers (C-5), a throwing apply (C-4),
// and a forbidden endorsement label (C-13.4).
setInterval(() => {}, 1000)

export const name = 'fixture-bad'
export const inject = ['tools']
export const provide = ['missing']

export function apply() {
  throw new Error('fixture-bad: apply always throws')
}

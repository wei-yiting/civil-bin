import type { State } from './domain'

export type CloudChange = {
  table: 'stores' | 'deliveries' | 'claims' | 'reviews'
  id: string
  expected: unknown
  value: unknown
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export function cloudChanges(before: State, after: State): CloudChange[] {
  const changes: CloudChange[] = []
  for (const table of ['stores', 'deliveries'] as const) {
    const old = new Map(before[table].map((row) => [row.id, row]))
    if (
      before[table].some(
        (row) => !after[table].some((next) => next.id === row.id),
      )
    )
      throw new Error('雲端模式不允許從此介面刪除紀錄。')
    for (const row of after[table]) {
      const previous = old.get(row.id) ?? null
      if (!same(previous, row))
        changes.push({ table, id: row.id, expected: previous, value: row })
    }
  }
  for (const table of ['claims', 'reviews'] as const) {
    for (const [id, value] of Object.entries(after[table])) {
      const expected = before[table][id] ?? null
      if (!same(expected, value)) changes.push({ table, id, expected, value })
    }
    if (Object.keys(before[table]).some((id) => !(id in after[table])))
      throw new Error('雲端模式不允許從此介面刪除紀錄。')
  }
  return changes
}

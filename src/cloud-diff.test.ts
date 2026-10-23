import { describe, expect, it } from 'vitest'
import { cloudChanges } from './cloud-diff'
import { seedState } from './domain'

describe('雲端逐筆變更', () => {
  it('只寫入變更列並保留前值，避免整份資料覆寫', () => {
    const before = seedState()
    const after = structuredClone(before)
    after.stores[0].enabled = false
    after.claims['2030-01-01:a'] = 15
    after.sizeClaims['2030-01-01:a'] = { S: 2, M: 3, L: 0 }
    const changes = cloudChanges(before, after)
    expect(changes).toHaveLength(3)
    expect(changes[0]).toEqual({
      table: 'stores',
      id: before.stores[0].id,
      expected: before.stores[0],
      value: after.stores[0],
    })
    expect(changes[1]).toEqual({
      table: 'claims',
      id: '2030-01-01:a',
      expected: null,
      value: 15,
    })
    expect(changes[2]).toEqual({
      table: 'sizeClaims',
      id: '2030-01-01:a',
      expected: null,
      value: { S: 2, M: 3, L: 0 },
    })
    expect(before.stores[0].enabled).toBe(true)
  })
  it('未修改資料不發出寫入', () => {
    const state = seedState()
    expect(cloudChanges(state, structuredClone(state))).toEqual([])
  })
  it('禁止刪除共享紀錄', () => {
    const before = seedState()
    expect(() => cloudChanges(before, { ...before, deliveries: [] })).toThrow(
      '不允許',
    )
  })
})

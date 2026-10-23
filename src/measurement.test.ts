import { weightedSizeCount } from './measurement'
import { describe, expect, it } from 'vitest'
import {
  aggregate,
  aggregateSizes,
  dateKey,
  migrateState,
  reviewKey,
  seedState,
  validateMeasurement,
  validateSizeCounts,
  measurementLabel,
  isDemoDelivery,
  type Delivery,
  type SizeMeasurement,
} from './domain'
const measurement: SizeMeasurement = {
  boardVersion: 'street-v1',
  size: 'S',
  quantity: 2,
}
function fixture() {
  const state = seedState()
  const base = state.deliveries.find((r) => r.storeId === 'a')!
  state.deliveries = [
    {
      ...base,
      id: 'size',
      liters: 0,
      low: 0,
      high: 0,
      measurement: { ...measurement },
      confirmedMeasurement: { ...measurement, size: 'M', quantity: 3 },
    },
  ]
  state.sizeClaims = {}
  state.claims = {}
  return state
}
describe('人工量測板的尺寸與件數', () => {
  it('只接受固定板版本、尺寸與有限整數件數', () => {
    for (const quantity of [1, 99])
      expect(() =>
        validateMeasurement({ ...measurement, quantity }),
      ).not.toThrow()
    for (const quantity of [0, -1, 100, 1.5, NaN, Infinity, '2'])
      expect(() => validateMeasurement({ ...measurement, quantity })).toThrow()
    expect(() => validateMeasurement({ ...measurement, size: 'XL' })).toThrow()
    expect(() =>
      validateMeasurement({ ...measurement, boardVersion: 'A4' }),
    ).toThrow()
    expect(() => validateMeasurement(null)).toThrow()
  })
  it('申報必須包含三級件數，保留明確零件且不容許未知級別', () => {
    expect(() => validateSizeCounts({ S: 0, M: 999, L: 0 })).not.toThrow()
    for (const counts of [
      { S: 0, M: 0 },
      { S: 0, M: 0, L: 0, XL: 0 },
      { S: -1, M: 0, L: 0 },
      { S: 0, M: 1.2, L: 0 },
      { S: 0, M: 0, L: 1000 },
      [],
    ])
      expect(() => validateSizeCounts(counts)).toThrow()
  })
  it('保留原選尺寸與店家確認值，不混算舊公升紀錄', () => {
    const state = fixture()
    state.deliveries.push({
      ...state.deliveries[0]!,
      id: 'legacy',
      measurement: undefined,
      confirmedMeasurement: undefined,
      liters: 7,
      low: 6,
      high: 8,
    })
    expect(aggregateSizes(state, 'a')).toEqual({
      reported: { S: 2, M: 0, L: 0 },
      confirmed: { S: 0, M: 3, L: 0 },
      photoCount: 1,
      manualCount: 0,
      pending: 0,
      total: 3,
    })
    expect(aggregate(state, 'a')).toMatchObject({
      count: 1,
      liters: 7,
      low: 6,
      high: 8,
    })
    expect(measurementLabel(state.deliveries[0]!)).toBe(
      '小件 × 2 件（10 × 15 公分內）',
    )
    expect(measurementLabel(state.deliveries[0]!, true)).toBe(
      '中件 × 3 件（15 × 20 公分內）',
    )
  })
  it('拒收不累計、待確認僅計待確認筆數、手動紀錄獨立標示', () => {
    const state = fixture()
    const original = state.deliveries[0]!
    state.deliveries = (['rejected', 'pending', 'accepted'] as const).map(
      (status, i): Delivery => ({
        ...original,
        id: String(i),
        status,
        source: 'manual',
        photo: null,
        confirmedMeasurement: undefined,
      }),
    )
    expect(aggregateSizes(state, 'a')).toEqual({
      reported: { S: 2, M: 0, L: 0 },
      confirmed: { S: 2, M: 0, L: 0 },
      photoCount: 0,
      manualCount: 1,
      pending: 1,
      total: 2,
    })
    expect(aggregateSizes(state, 'b').total).toBe(0)
    expect(aggregateSizes(state, 'a', '2000-01-01').total).toBe(0)
  })
  it('尺寸、確認件數、申報更新使查核失效，照片簽名網址更新則不影響', () => {
    const state = fixture()
    state.deliveries[0]!.photoKey = 'stable/key'
    const key = reviewKey(state, 'a')
    state.deliveries[0]!.photo = 'https://example.com/new-signature'
    expect(reviewKey(state, 'a')).toBe(key)
    state.deliveries[0]!.confirmedMeasurement!.quantity = 4
    expect(reviewKey(state, 'a')).not.toBe(key)
    const next = reviewKey(state, 'a')
    state.sizeClaims[`${dateKey()}:a`] = { S: 0, M: 4, L: 0 }
    expect(reviewKey(state, 'a')).not.toBe(next)
  })
  it('舊版 v3 升級保留資料，不虛構尺寸與件數；v4 保留零申報', () => {
    const state = fixture()
    const old = {
      ...state,
      version: 3,
      sizeClaims: undefined,
      deliveries: state.deliveries.map(
        ({ measurement: _m, confirmedMeasurement: _c, ...record }) => record,
      ),
    }
    const upgraded = migrateState(old)
    expect(upgraded.version).toBe(4)
    expect(upgraded.sizeClaims).toEqual({})
    expect(upgraded.deliveries).toEqual(old.deliveries)
    const key = `${dateKey()}:a`
    state.sizeClaims[key] = { S: 0, M: 0, L: 0 }
    expect(migrateState(state).sizeClaims[key]).toEqual({ S: 0, M: 0, L: 0 })
    expect(() =>
      migrateState({ ...state, sizeClaims: { [key]: { S: -1, M: 0, L: 0 } } }),
    ).toThrow()
  })
  it('每個示範點有三天的尺寸紀錄，舊公升總量未改變', () => {
    const state = seedState()
    expect(state.deliveries.filter((r) => r.measurement)).toHaveLength(216)
    expect(
      state.stores.every((store) => aggregateSizes(state, store.id).total > 0),
    ).toBe(true)
    expect(aggregate(state, 'a').liters).toBe(8.4)
  })
})

it('所有預載樣本不會冒充民眾自己的交付紀錄', () => {
  expect(seedState().deliveries.every(isDemoDelivery)).toBe(true)
  expect(isDemoDelivery({ id: 'sample-0-2026-10-24' })).toBe(true)
  expect(isDemoDelivery({ id: 'seed:2026-10-24:demo-01:0' })).toBe(true)
  expect(isDemoDelivery({ id: '8d6d3c6a-3803-408a-bbc9-3396d708fef9' })).toBe(
    false,
  )
  expect(isDemoDelivery({ id: 'legacy-personal-record' })).toBe(false)
})

it('以尺寸框面積比例加權，區分同件數的大小垃圾並保留零量', () => {
  expect(weightedSizeCount({ S: 1, M: 2, L: 3 })).toBe(17)
  expect(weightedSizeCount({ S: 6, M: 0, L: 0 })).toBe(6)
  expect(weightedSizeCount({ S: 0, M: 0, L: 6 })).toBe(24)
  expect(weightedSizeCount({ S: 0, M: 0, L: 0 })).toBe(0)
})

import { describe, expect, it } from 'vitest'
import {
  aggregate,
  capacityAnalysis,
  classification,
  dateKey,
  estimate,
  isOpen,
  reviewKey,
  seedState,
  type Delivery,
  type State,
} from './domain'
const empty = (): State => ({
  ...seedState(),
  deliveries: [],
  claims: {},
  reviews: {},
})
const record = (overrides: Partial<Delivery> = {}): Delivery => ({
  id: 'test',
  storeId: 'a',
  date: dateKey(),
  createdAt: new Date().toISOString(),
  kind: '飲料杯／容器',
  liters: 2,
  low: 1,
  high: 3,
  photo: '/sample-waste.svg',
  source: 'photo',
  status: 'accepted',
  reason: '',
  ...overrides,
})
describe('每日跨角色資料', () => {
  it('以台灣日期隔離跨日資料', () => {
    expect(dateKey(new Date('2026-10-23T17:00:00Z'))).toBe('2026-10-24')
    const state = empty()
    state.deliveries = [record(), record({ id: 'old', date: '2020-01-01' })]
    expect(aggregate(state, 'a').count).toBe(1)
  })
  it('保留原版三店與今日照片及申報值', () => {
    const state = seedState()
    expect(state.stores.map((s) => s.name)).toEqual([
      '阿明早餐店',
      '惠姐雜貨店',
      '小林豆漿',
    ])
    expect(aggregate(state, 'a').liters).toBeCloseTo(8.4)
    expect(aggregate(state, 'b').liters).toBeCloseTo(4.4)
    expect(aggregate(state, 'c').liters).toBeCloseTo(6.4)
    expect(state.claims[`${dateKey()}:a`]).toBe(22)
    expect(classification(state, 'a').level).toBe('high')
    expect(classification(state, 'b').level).toBe('normal')
  })
  it('排除待確認、拒收及手動量的照片佐證', () => {
    const state = empty()
    state.deliveries = [
      record(),
      record({ id: 'p', status: 'pending' }),
      record({ id: 'r', status: 'rejected' }),
      record({ id: 'm', source: 'manual', photo: null, liters: 5 }),
    ]
    expect(aggregate(state, 'a')).toEqual({
      count: 1,
      liters: 2,
      low: 1,
      high: 3,
      manualLiters: 5,
      pending: 1,
    })
    expect(capacityAnalysis(state, 'a').demand).toBe(7)
  })
  it('將未申報、明確零、無照片申報分開', () => {
    const state = empty()
    expect(classification(state, 'a').level).toBe('missing')
    expect(Number.isNaN(capacityAnalysis(state, 'a').demand)).toBe(true)
    state.claims[`${dateKey()}:a`] = 0
    expect(classification(state, 'a').level).toBe('normal')
    state.claims[`${dateKey()}:a`] = 4
    expect(classification(state, 'a').level).toBe('high')
    state.deliveries = [record()]
    delete state.claims[`${dateKey()}:a`]
    expect(classification(state, 'a').level).toBe('missing')
  })
  it('比較區間並使用明確閾值', () => {
    const state = empty()
    state.deliveries = [record()]
    state.claims[`${dateKey()}:a`] = 0.5
    expect(classification(state, 'a').level).toBe('low')
    state.claims[`${dateKey()}:a`] = 3.75
    expect(classification(state, 'a').level).toBe('normal')
    state.claims[`${dateKey()}:a`] = 3.76
    expect(classification(state, 'a').level).toBe('high')
  })
  it('以已收受需求和申報量較大者估算，拒收待確認不驅動需求', () => {
    const state = empty()
    state.deliveries = [
      record({ status: 'pending' }),
      record({ id: 'r', status: 'rejected' }),
    ]
    expect(Number.isNaN(capacityAnalysis(state, 'a').demand)).toBe(true)
    state.claims[`${dateKey()}:a`] = 12
    expect(capacityAnalysis(state, 'a').demand).toBe(12)
    expect(capacityAnalysis(state, 'a').recommendation).toContain('模擬')
  })
  it('缺少有效照片的紀錄不會變成已知零需求', () => {
    const state = empty()
    state.deliveries = [record({ photo: null })]
    expect(aggregate(state, 'a').count).toBe(0)
    expect(Number.isNaN(capacityAnalysis(state, 'a').demand)).toBe(true)
  })
  it('長照片使用有界查核鍵，內容改變會失效', () => {
    const state = empty()
    state.deliveries = [
      record({ photo: 'data:image/jpeg;base64,' + 'a'.repeat(500_000) }),
    ]
    const initial = reviewKey(state, 'a')
    expect(initial.length).toBeLessThan(150)
    state.deliveries[0]!.photo += 'b'
    expect(reviewKey(state, 'a')).not.toBe(initial)
  })
  it('新證據、申報或設施資料不沿用舊查核', () => {
    const state = seedState()
    const initial = reviewKey(state, 'a')
    state.reviews[initial] = '已查核'
    expect(reviewKey(state, 'a')).toBe(initial)
    state.claims[`${dateKey()}:a`] = 23
    expect(reviewKey(state, 'a')).not.toBe(initial)
    const next = reviewKey(state, 'a')
    state.deliveries.push(record())
    expect(reviewKey(state, 'a')).not.toBe(next)
  })
})
describe('估算與營業時間', () => {
  it('模擬估算依類別與尺寸參考，未知類別明確拒絕', () => {
    expect(estimate('飲料杯／容器', true)).toEqual({
      liters: 1.6,
      low: 1.2,
      high: 2,
    })
    expect(estimate('食物包裝', false).high).toBe(3.2)
    expect(() => estimate('unknown', true)).toThrow()
  })
  it('以台灣時間遵守時段、停收與跨午夜', () => {
    const store = {
      ...seedState().stores[0]!,
      hoursStart: '09:00',
      hoursEnd: '18:00',
    }
    expect(isOpen(store, new Date('2026-10-23T01:00:00Z'))).toBe(true)
    expect(isOpen(store, new Date('2026-10-23T10:00:00Z'))).toBe(false)
    expect(
      isOpen({ ...store, enabled: false }, new Date('2026-10-23T01:00:00Z')),
    ).toBe(false)
    expect(
      isOpen(
        { ...store, hoursStart: '22:00', hoursEnd: '02:00' },
        new Date('2026-10-23T17:00:00Z'),
      ),
    ).toBe(true)
  })
})

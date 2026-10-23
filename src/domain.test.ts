import publicBins from './data/public-bins.json'
import { haversineMeters } from './geo'
import { describe, expect, it } from 'vitest'
import {
  defaultWeeklyHours,
  validateWeeklyHours,
  todayHoursLabel,
  migrateState,
  registerStore,
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
    expect(state.stores.slice(0, 3).map((s) => s.name)).toEqual([
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
      weeklyHours: defaultWeeklyHours('09:00', '18:00'),
    }
    expect(isOpen(store, new Date('2026-10-23T01:00:00Z'))).toBe(true)
    expect(isOpen(store, new Date('2026-10-23T10:00:00Z'))).toBe(false)
    expect(
      isOpen({ ...store, enabled: false }, new Date('2026-10-23T01:00:00Z')),
    ).toBe(false)
    expect(
      isOpen(
        { ...store, weeklyHours: defaultWeeklyHours('22:00', '02:00') },
        new Date('2026-10-23T17:00:00Z'),
      ),
    ).toBe(true)
  })
})

describe('註冊與資料遷移', () => {
  const input = {
    name: '真實合作小店',
    address: '臺北市松山區民生東路四段1號',
    area: '松山區',
    lat: 25.058,
    lng: 121.545,
    hoursStart: '09:00',
    hoursEnd: '18:00',
  }
  it('註冊新店保留未知量能且不建立假申報', () => {
    const state = seedState()
    const store = registerStore(state, input)
    expect(state.stores).toHaveLength(270)
    expect(store).toMatchObject({
      ...input,
      isDemo: false,
      enabled: true,
      publicCapacity: null,
      collections: null,
      overflow: null,
    })
    state.stores.push(store)
    expect(state.claims[`${dateKey()}:${store.id}`]).toBeUndefined()
    expect(classification(state, store.id).level).toBe('missing')
    expect(Number.isNaN(capacityAnalysis(state, store.id).capacity)).toBe(true)
    expect(migrateState(JSON.parse(JSON.stringify(state))).stores).toHaveLength(
      271,
    )
  })
  it('拒絕空欄、無效時段、臺北範圍外及重複店家', () => {
    const state = seedState()
    for (const change of [
      { name: ' ' },
      { address: '' },
      { area: '' },
      { lat: 0 },
      { lng: NaN },
      { hoursStart: '25:00' },
      { hoursEnd: '09:00' },
    ])
      expect(() => registerStore(state, { ...input, ...change })).toThrow()
    state.stores.push(registerStore(state, input))
    expect(() =>
      registerStore(state, { ...input, name: ' ' + input.name + ' ' }),
    ).toThrow()
  })
  it('遷移v1保留照片申報查核，補示範座標，不偽造未知舊店位置', () => {
    const state = seedState()
    state.reviews.old = '舊查核'
    const old = {
      ...state,
      version: 1,
      stores: state.stores.map(({ lat, lng, isDemo, ...s }) => {
        void lat
        void lng
        void isDemo
        return s
      }),
    }
    old.stores.push({ ...old.stores[0]!, id: 'legacy', name: '未知舊店' })
    const migrated = migrateState(old)
    expect(migrated.version).toBe(4)
    expect(migrated.stores[0]).toMatchObject({
      lat: 25.0588,
      lng: 121.5434,
      isDemo: true,
    })
    expect(migrated.stores.at(-1)).toMatchObject({
      lat: null,
      lng: null,
      isDemo: true,
    })
    expect(migrated.deliveries).toEqual(state.deliveries)
    expect(migrated.claims).toEqual(state.claims)
    expect(migrated.reviews.old).toBe('舊查核')
  })
  it('拒絕損毀或未支援資料版本', () => {
    expect(() => migrateState({ ...seedState(), version: 99 })).toThrow()
    expect(() => migrateState({ ...seedState(), stores: [] })).toThrow()
  })
})

describe('每週時段與當日停收', () => {
  it('七天獨立時段且按臺北星期判斷休息日', () => {
    const store = {
      ...seedState().stores[0]!,
      weeklyHours: defaultWeeklyHours('09:00', '18:00'),
    }
    store.weeklyHours[6]!.closed = true
    const saturday = new Date('2026-10-24T02:00:00Z')
    expect(isOpen(store, saturday)).toBe(false)
    expect(todayHoursLabel(store, saturday)).toBe('今日休息')
    expect(isOpen(store, new Date('2026-10-23T02:00:00Z'))).toBe(true)
  })
  it('當日停收只作用於臺北當日，不永久停掉未來日期', () => {
    const store = {
      ...seedState().stores[0]!,
      pausedOn: '2026-10-24',
      pauseReason: '空間已滿',
    }
    expect(isOpen(store, new Date('2026-10-23T16:00:00Z'))).toBe(false)
    expect(todayHoursLabel(store, new Date('2026-10-23T16:00:00Z'))).toContain(
      '空間已滿',
    )
    expect(isOpen(store, new Date('2026-10-24T16:00:00Z'))).toBe(true)
  })
  it('跨夜看前一天時段，不把今日晚間時段誤套到今日凌晨', () => {
    const store = {
      ...seedState().stores[0]!,
      weeklyHours: defaultWeeklyHours('09:00', '18:00'),
    }
    store.weeklyHours[5] = { closed: false, start: '22:00', end: '02:00' }
    store.weeklyHours[6]!.closed = true
    expect(isOpen(store, new Date('2026-10-23T15:00:00Z'))).toBe(true)
    expect(isOpen(store, new Date('2026-10-23T17:00:00Z'))).toBe(true)
    expect(todayHoursLabel(store, new Date('2026-10-23T17:00:00Z'))).toContain(
      '前一日延續收受至 02:00',
    )
    expect(isOpen(store, new Date('2026-10-23T18:00:00Z'))).toBe(false)
    expect(isOpen(store, new Date('2026-10-22T17:00:00Z'))).toBe(false)
  })
  it('拒絕不完整、無效及零長度時段', () => {
    expect(() => validateWeeklyHours([])).toThrow()
    const hours = defaultWeeklyHours('10:00', '10:00')
    expect(() => validateWeeklyHours(hours)).toThrow()
    hours[0]!.start = '25:00'
    expect(() => validateWeeklyHours(hours)).toThrow()
  })
  it('270 店涵蓋十二行政區，新增店有多日交付且不偽造公共量能', () => {
    const state = seedState()
    expect(state.stores).toHaveLength(270)
    expect(new Set(state.stores.slice(3).map((s) => s.area)).size).toBe(12)
    for (const store of state.stores.slice(3)) {
      expect(store.isDemo).toBe(true)
      expect(store.address).toContain('虛構')
      expect(
        state.deliveries.filter((r) => r.storeId === store.id).length,
      ).toBeGreaterThanOrEqual(9)
      expect(store.publicCapacity).toBeNull()
    }
  })
  it('深夜仍有 265 家可收受示範點，保留五家不同時段與停收情境', () => {
    const state = seedState()
    const now = new Date('2026-10-24T01:50:00+08:00')
    const fullDay = state.stores
      .slice(3)
      .filter((store) =>
        store.weeklyHours.every(
          (hours) =>
            !hours.closed && hours.start === '00:00' && hours.end === '23:59',
        ),
      )
    expect(fullDay).toHaveLength(262)
    expect(state.stores.filter((store) => isOpen(store, now))).toHaveLength(265)
    const varied = state.stores
      .slice(3)
      .filter((store) => store.weeklyHours.some((hours) => hours.closed))
    expect(varied.map((store) => store.id)).toEqual([
      'demo-04',
      'demo-08',
      'demo-12',
      'demo-16',
      'demo-20',
    ])
    expect(state.stores.find((store) => store.id === 'demo-16')!.enabled).toBe(
      false,
    )
    expect(
      state.stores.find((store) => store.id === 'demo-08')!.pauseReason,
    ).toContain('空間已滿')
  })
  it('舊三店升級只補缺少示範店，保留舊證據並且再次載入不重複', () => {
    const seed = seedState()
    const original = {
      ...seed,
      version: 2,
      stores: seed.stores.slice(0, 3),
      deliveries: seed.deliveries.filter((r) =>
        ['a', 'b', 'c'].includes(r.storeId),
      ),
      claims: { [`${dateKey()}:a`]: 99 },
      reviews: { old: '已查核' },
    }
    original.stores[0]!.enabled = false
    const migrated = migrateState(original)
    expect(migrated.stores).toHaveLength(270)
    expect(migrated.stores[0]!.enabled).toBe(false)
    expect(migrated.claims[`${dateKey()}:a`]).toBe(99)
    expect(migrated.deliveries.slice(0, original.deliveries.length)).toEqual(
      original.deliveries,
    )
    expect(migrated.reviews.old).toBe('已查核')
    expect(migrateState(migrated)).toEqual(migrated)
  })
})

describe('示範合作網擴充', () => {
  it('店數至少為清潔箱三分之一，名稱與 ID 唯一且不冒充真實店家', () => {
    const state = seedState()
    expect(state.stores.length).toBeGreaterThanOrEqual(Math.ceil(773 / 3))
    expect(new Set(state.stores.map((s) => s.id)).size).toBe(270)
    expect(new Set(state.stores.map((s) => s.name)).size).toBe(270)
    expect(
      state.stores.every((s) => !s.name.includes('示範') && s.isDemo),
    ).toBe(true)
    expect(
      state.stores.slice(24).filter((s) => s.binDistance! >= 150).length,
    ).toBeGreaterThanOrEqual(185)
  })
  it('清潔箱距離由公開座標實算，示範照片不超出本機儲存預算', () => {
    const state = seedState()
    for (const store of state.stores) {
      const nearest = Math.min(
        ...publicBins.bins.map((bin) =>
          haversineMeters({ lat: store.lat!, lng: store.lng! }, bin),
        ),
      )
      expect(Math.abs(store.binDistance! - nearest)).toBeLessThanOrEqual(0.5)
    }
    expect(state.deliveries.filter((r) => !r.measurement)).toHaveLength(291)
    const photoSize = 1000
    const productionLength = JSON.stringify(
      state.deliveries.map((r) => ({
        ...r,
        photo: r.photo ? 'x'.repeat(photoSize) : null,
      })),
    ).length
    expect(productionLength * 2).toBeLessThan(4_500_000)
  })
  it('既有本機 24 店補新據點與尺寸申報，保留自訂並可重複載入', () => {
    const seed = seedState()
    const stores = structuredClone(seed.stores.slice(0, 24))
    stores[3]!.name = '公園口夥伴小店（示範）'
    stores[4]!.name = '自己的店名'
    const old = {
      ...seed,
      stores,
      deliveries: seed.deliveries.filter((r) =>
        stores.some((s) => s.id === r.storeId),
      ),
      sizeClaims: Object.fromEntries(
        Object.entries(seed.sizeClaims).filter(([key]) =>
          stores.some((s) => s.id === key.slice(11)),
        ),
      ),
    }
    const migrated = migrateState(old)
    expect(migrated.stores).toHaveLength(270)
    expect(migrated.stores[4]!.name).toBe('自己的店名')
    expect(migrated.stores[3]!.name).toBe(seed.stores[3]!.name)
    expect(migrated.sizeClaims[`${dateKey()}:demo-23`]).toBeDefined()
    expect(migrateState(migrated)).toEqual(migrated)
    expect(migrateState(old, false).stores).toHaveLength(24)
  })
})

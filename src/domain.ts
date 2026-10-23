import sampleWaste from './assets/sample-waste.svg'

export interface Store {
  id: string
  name: string
  area: string
  address: string
  hoursStart: string
  hoursEnd: string
  enabled: boolean
  x: number
  y: number
  binDistance: number
  publicCapacity: number
  collections: number
  overflow: number
}
export interface Delivery {
  id: string
  storeId: string
  date: string
  createdAt: string
  kind: string
  liters: number
  low: number
  high: number
  photo: string | null
  source: 'photo' | 'manual'
  status: 'pending' | 'accepted' | 'rejected'
  reason: string
}
export interface State {
  version: 1
  stores: Store[]
  deliveries: Delivery[]
  claims: Record<string, number>
  reviews: Record<string, string>
}
export interface Estimate {
  liters: number
  low: number
  high: number
}
export interface Aggregate extends Estimate {
  count: number
  manualLiters: number
  pending: number
}
export interface Classification {
  level: 'normal' | 'high' | 'low' | 'missing'
  label: string
  detail: string
}
export interface CapacityAnalysis {
  demand: number
  capacity: number
  utilization: number
  recommendation: string
}
const round = (value: number) => Math.round(value * 100) / 100
const validAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

export function dateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function seedState(): State {
  const date = dateKey()
  const stores: Store[] = [
    {
      id: 'a',
      name: '阿明早餐店',
      area: '民生東路商圈',
      address: '民生東路商圈示範點 A（非真實地址）',
      x: 25,
      y: 26,
      binDistance: 70,
      publicCapacity: 20,
      collections: 1,
      overflow: 3,
    },
    {
      id: 'b',
      name: '惠姐雜貨店',
      area: '市場周邊',
      address: '市場周邊示範點 B（非真實地址）',
      x: 67,
      y: 25,
      binDistance: 480,
      publicCapacity: 10,
      collections: 1,
      overflow: 0,
    },
    {
      id: 'c',
      name: '小林豆漿',
      area: '住宅街口',
      address: '住宅街口示範點 C（非真實地址）',
      x: 54,
      y: 73,
      binDistance: 150,
      publicCapacity: 20,
      collections: 1,
      overflow: 0,
    },
  ].map((s) => ({
    ...s,
    hoursStart: '00:00',
    hoursEnd: '23:59',
    enabled: true,
  }))
  const samples: [string, number][] = [
    ['a', 1.3],
    ['a', 2.2],
    ['a', 1.7],
    ['a', 1.6],
    ['a', 1.6],
    ['b', 1.2],
    ['b', 1.9],
    ['b', 1.3],
    ['c', 1.6],
    ['c', 1.3],
    ['c', 1.4],
    ['c', 2.1],
  ]
  const deliveries: Delivery[] = samples.map(([storeId, liters], i) => ({
    id: `sample-${i}`,
    storeId,
    date,
    createdAt: `${date}T${String(8 + Math.floor(i / 5)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00+08:00`,
    kind: i % 2 ? '食物包裝' : '飲料杯／容器',
    liters,
    low: round(Math.max(0.1, liters - 0.55)),
    high: round(liters + 0.55),
    photo: sampleWaste,
    source: 'photo',
    status: 'accepted',
    reason: '',
  }))
  return {
    version: 1,
    stores,
    deliveries,
    claims: { [`${date}:a`]: 22, [`${date}:b`]: 5.4, [`${date}:c`]: 10 },
    reviews: {},
  }
}

export function estimate(kind: string, reference: boolean): Estimate {
  const bases: Record<string, number> = {
    '飲料杯／容器': 1.6,
    食物包裝: 2.4,
    小型隨手垃圾: 0.9,
    其他一般垃圾: 3.2,
  }
  if (!Object.hasOwn(bases, kind)) throw new Error('請選擇有效的垃圾類別')
  const liters = bases[kind]!
  const error = reference ? 0.4 : 0.8
  return {
    liters,
    low: round(Math.max(0.1, liters - error)),
    high: round(liters + error),
  }
}

export function aggregate(
  state: State,
  storeId: string,
  date = dateKey(),
): Aggregate {
  const records = state.deliveries.filter(
    (r) => r.storeId === storeId && r.date === date,
  )
  const accepted = records.filter(
    (r) => r.status === 'accepted' && validAmount(r.liters),
  )
  const photos = accepted.filter(
    (r) =>
      r.source === 'photo' &&
      Boolean(r.photo) &&
      validAmount(r.low) &&
      validAmount(r.high) &&
      r.low <= r.liters &&
      r.high >= r.liters,
  )
  return {
    count: photos.length,
    liters: round(photos.reduce((sum, r) => sum + r.liters, 0)),
    low: round(photos.reduce((sum, r) => sum + r.low, 0)),
    high: round(photos.reduce((sum, r) => sum + r.high, 0)),
    manualLiters: round(
      accepted
        .filter((r) => r.source === 'manual')
        .reduce((sum, r) => sum + r.liters, 0),
    ),
    pending: records.filter((r) => r.status === 'pending').length,
  }
}

export function classification(
  state: State,
  storeId: string,
  date = dateKey(),
): Classification {
  const claim = state.claims[`${date}:${storeId}`]
  if (!validAmount(claim))
    return {
      level: 'missing',
      label: '尚未申報',
      detail: '缺少當日有效申報；未申報不能視為零公升。',
    }
  const evidence = aggregate(state, storeId, date)
  if (!evidence.count)
    return claim === 0
      ? {
          level: 'normal',
          label: '零量申報',
          detail: '店家明確申報零公升；沒有已收受照片可供交叉驗證。',
        }
      : {
          level: 'high',
          label: '待查核：缺少照片佐證',
          detail: '有申報量但沒有已收受照片；手動紀錄不能取代獨立照片佐證。',
        }
  // 模擬查核門檻：申報量超過照片上界 25%，或低於照片下界 25%。
  if (claim > evidence.high * 1.25)
    return {
      level: 'high',
      label: '待查核：申報偏高',
      detail: '申報量超過已收受照片估計上界的 125%；此為模擬篩選，不代表謊報。',
    }
  if (claim < evidence.low * 0.75)
    return {
      level: 'low',
      label: '待查核：申報偏低',
      detail: '申報量低於已收受照片估計下界的 75%；需確認漏登或估算誤差。',
    }
  return {
    level: 'normal',
    label: '落在容許範圍',
    detail: '申報量落在照片下界 × 75% 至上界 × 125% 之間；仍非實測驗證。',
  }
}

export function capacityAnalysis(
  state: State,
  storeId: string,
  date = dateKey(),
): CapacityAnalysis {
  const store = state.stores.find((s) => s.id === storeId)
  const evidence = aggregate(state, storeId, date)
  const claim = state.claims[`${date}:${storeId}`]
  const accepted =
    evidence.count > 0 ||
    state.deliveries.some(
      (r) =>
        r.storeId === storeId &&
        r.date === date &&
        r.status === 'accepted' &&
        r.source === 'manual' &&
        validAmount(r.liters),
    )
  const demand =
    validAmount(claim) || accepted
      ? Math.max(
          evidence.liters + evidence.manualLiters,
          validAmount(claim) ? claim : 0,
        )
      : NaN
  const capacity =
    store && validAmount(store.publicCapacity) && validAmount(store.collections)
      ? store.publicCapacity * store.collections
      : NaN
  const utilization =
    Number.isFinite(demand) && capacity > 0 ? demand / capacity : NaN
  let recommendation = '資料不足；需求或清運量能未知，請先補齊資料。'
  if (Number.isFinite(demand) && Number.isFinite(capacity) && store) {
    if (capacity === 0 && demand > 0)
      recommendation = '目前無有效清運量能，請優先安排現場調查及收運。'
    else if (store.overflow > 0 || utilization > 0.8)
      recommendation = '優先檢查滿溢與清運頻率，評估增班及垃圾桶容量。'
    else if (store.binDistance > 300 && demand > 0)
      recommendation = '公共垃圾桶距離較遠，建議持續觀察並評估新增設施。'
    else
      recommendation =
        '維持合作據點並持續觀察；新增設施前需比較成本與現場需求。'
  }
  return {
    demand: round(demand),
    capacity: round(capacity),
    utilization,
    recommendation: `模擬分析：${recommendation}需求採已收受照片量加手動量與申報量較大者；不是垃圾產量實測。`,
  }
}

export function isOpen(store: Store, now = new Date()): boolean {
  if (!store.enabled) return false
  const parse = (time: string) =>
    /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
      ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
      : NaN
  const start = parse(store.hoursStart)
  const end = parse(store.hoursEnd)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const current =
    Number(parts.find((p) => p.type === 'hour')!.value) * 60 +
    Number(parts.find((p) => p.type === 'minute')!.value)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end)
    return false
  return start < end
    ? current >= start && current < end
    : current >= start || current < end
}

export function reviewKey(
  state: State,
  storeId: string,
  date = dateKey(),
): string {
  const evidence = state.deliveries
    .filter((r) => r.storeId === storeId && r.date === date)
    .map((r) => [
      r.id,
      r.status,
      r.source,
      r.photo,
      r.liters,
      r.low,
      r.high,
      r.reason,
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  const store = state.stores.find((s) => s.id === storeId)
  const payload = JSON.stringify([
    date,
    storeId,
    state.claims[`${date}:${storeId}`] ?? null,
    evidence,
    store
      ? [
          store.binDistance,
          store.publicCapacity,
          store.collections,
          store.overflow,
        ]
      : null,
  ])
  // 僅供查核證據失效判斷；兩個 32-bit 雜湊降低意外碰撞，非安全或身分驗證用途。
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < payload.length; index += 1) {
    const code = payload.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  const hex = (value: number) => (value >>> 0).toString(16).padStart(8, '0')
  return `review-v2:${hex(first)}${hex(second)}`
}

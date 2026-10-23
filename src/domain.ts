import demoStores from './data/demo-stores.json'
import sampleWaste from './assets/sample-waste.svg'
import { hasCoordinates } from './geo'
import {
  validateMeasurement,
  validateSizeCounts,
  type SizeMeasurement,
  type SizeCounts,
} from './measurement'
export {
  SIZE_OPTIONS,
  validateMeasurement,
  validateSizeCounts,
  measurementLabel,
  emptySizeCounts,
} from './measurement'
export type { SizeMeasurement, SizeCounts } from './measurement'

export interface DailyHours {
  closed: boolean
  start: string
  end: string
}
export type WeeklyHours = DailyHours[]
export const WEEKDAYS = [
  '週日',
  '週一',
  '週二',
  '週三',
  '週四',
  '週五',
  '週六',
] as const
export const defaultWeeklyHours = (start: string, end: string): DailyHours[] =>
  WEEKDAYS.map(() => ({ closed: false, start, end }))
export function validateWeeklyHours(
  hours: unknown,
): asserts hours is DailyHours[] {
  if (
    !Array.isArray(hours) ||
    hours.length !== 7 ||
    hours.some(
      (h) => !h || typeof h.closed !== 'boolean' || !validHours(h.start, h.end),
    )
  )
    throw new Error('請設定一週七天的有效時段，開始與結束時間不得相同。')
}

export interface Store {
  id: string
  name: string
  area: string
  address: string
  hoursStart: string
  hoursEnd: string
  weeklyHours: DailyHours[]
  pausedOn: string | null
  pauseReason: string
  enabled: boolean
  x: number
  y: number
  lat: number | null
  lng: number | null
  isDemo: boolean
  binDistance: number | null
  selectionReason?: string
  publicCapacity: number | null
  collections: number | null
  overflow: number | null
}
export interface Delivery {
  id: string
  measurement?: SizeMeasurement
  confirmedMeasurement?: SizeMeasurement
  storeId: string
  date: string
  createdAt: string
  kind: string
  liters: number
  low: number
  high: number
  photo: string | null
  photoKey?: string
  source: 'photo' | 'manual'
  status: 'pending' | 'accepted' | 'rejected'
  reason: string
}
export interface State {
  version: 4
  sizeClaims: Record<string, SizeCounts>
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
  const stores: Store[] = demoStores.map((store, position) => {
    const index = position - 3
    const allDayDemo = position < 3 || index >= 21 || index % 4 !== 3
    const hoursStart = allDayDemo
      ? '00:00'
      : index % 3 === 0
        ? '07:00'
        : index % 3 === 1
          ? '10:00'
          : '16:00'
    const hoursEnd = allDayDemo ? '23:59' : index % 3 === 2 ? '23:00' : '20:00'
    const weeklyHours = defaultWeeklyHours(hoursStart, hoursEnd)
    if (!allDayDemo) weeklyHours[index % 7]!.closed = true
    return {
      ...store,
      isDemo: true,
      hoursStart,
      hoursEnd,
      weeklyHours,
      pausedOn: index === 7 ? date : null,
      pauseReason: index === 7 ? '今日空間已滿（示範）' : '',
      enabled: index !== 15,
      x: 50,
      y: 50,
      publicCapacity: position < 3 ? [20, 10, 20][position]! : null,
      collections: position < 3 ? 1 : null,
      overflow: position === 0 ? 3 : position < 3 ? 0 : null,
    }
  })
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
  const claims: Record<string, number> = {
    [`${date}:a`]: 22,
    [`${date}:b`]: 5.4,
    [`${date}:c`]: 10,
  }
  for (const [index, store] of stores.slice(3, 24).entries()) {
    for (let day = 0; day < 3; day += 1) {
      const recordDate = dateKey(
        new Date(Date.parse(`${date}T12:00:00+08:00`) - day * 86_400_000),
      )
      let total = 0
      for (let n = 0; n < 3 + (index % 4); n += 1) {
        const liters = round(1.2 + ((index * 3 + n + day) % 12) * 0.7)
        total += liters
        deliveries.push({
          id: `seed:${recordDate}:${store.id}:${n}`,
          storeId: store.id,
          date: recordDate,
          createdAt: `${recordDate}T${String(9 + n).padStart(2, '0')}:00:00+08:00`,
          kind: n % 2 ? '食物包裝' : '飲料杯／容器',
          liters,
          low: round(liters - 0.6),
          high: round(liters + 0.6),
          photo: sampleWaste,
          source: 'photo',
          status: 'accepted',
          reason: '',
        })
      }
      if (index % 6 !== 0 || day > 0)
        claims[`${recordDate}:${store.id}`] = round(
          total * (index % 5 === 0 ? 1.7 : 1.03),
        )
    }
  }
  const sizeClaims: Record<string, SizeCounts> = {}
  for (const [index, store] of stores.entries()) {
    for (let day = 0; day < 3; day += 1) {
      const recordDate = dateKey(
        new Date(Date.parse(`${date}T12:00:00+08:00`) - day * 86_400_000),
      )
      const counts: SizeCounts = { S: 0, M: 0, L: 0 }
      for (let n = 0; n < 3; n += 1) {
        const size = (['S', 'M', 'L'] as const)[(index + n + day) % 3]!
        const measurement: SizeMeasurement = {
          boardVersion: 'street-v1',
          size,
          quantity:
            index < 24
              ? 1 + ((index + n) % 3)
              : 1 +
                ((index * 7 + n * 3) % 7) *
                  ([0, 6].includes(
                    new Date(`${recordDate}T12:00:00+08:00`).getUTCDay(),
                  )
                    ? 1 + (index % 3)
                    : 1 + ((index + 1) % 2)),
        }
        counts[size] += measurement.quantity
        deliveries.push({
          id: `sample-size-${recordDate}-${store.id}-${n}`,
          storeId: store.id,
          date: recordDate,
          createdAt: `${recordDate}T${String(index < 24 ? 10 + n : 8 + (index % 6) + n * 3).padStart(2, '0')}:30:00+08:00`,
          kind: n % 2 ? '食物包裝' : '飲料杯／容器',
          liters: 0,
          low: 0,
          high: 0,
          photo: index < 24 || (day === 0 && n === 0) ? sampleWaste : null,
          source: index < 24 || (day === 0 && n === 0) ? 'photo' : 'manual',
          status: 'accepted',
          reason: '',
          measurement,
          confirmedMeasurement: { ...measurement },
        })
      }
      if (index % 6 !== 0 || day > 0)
        sizeClaims[`${recordDate}:${store.id}`] = {
          ...counts,
          S: counts.S + (index % 5 === 0 ? 2 : 0),
        }
    }
  }
  return {
    version: 4,
    sizeClaims,
    stores,
    deliveries,
    claims,
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
    (r) => r.storeId === storeId && r.date === date && !r.measurement,
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
        !r.measurement &&
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
    else if ((store.overflow ?? 0) > 0 || utilization > 0.8)
      recommendation = '優先檢查滿溢與清運頻率，評估增班及垃圾桶容量。'
    else if ((store.binDistance ?? 0) > 300 && demand > 0)
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

const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
function taipeiTime(now: Date) {
  const date = dateKey(now)
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const current =
    Number(parts.find((p) => p.type === 'hour')!.value) * 60 +
    Number(parts.find((p) => p.type === 'minute')!.value)
  return { date, weekday, current }
}
export function todayHoursLabel(store: Store, now = new Date()): string {
  const { date, weekday, current } = taipeiTime(now)
  if (!store.enabled) return '暫停合作收受'
  if (store.pausedOn === date)
    return `今日已停收${store.pauseReason ? `：${store.pauseReason}` : ''}`
  const hours = store.weeklyHours[weekday]!
  const previous = store.weeklyHours[(weekday + 6) % 7]!
  if (
    !previous.closed &&
    minutes(previous.start) > minutes(previous.end) &&
    current < minutes(previous.end)
  )
    return `前一日延續收受至 ${previous.end}${hours.closed ? '；今日其餘時間休息' : `；今日 ${hours.start}–${hours.end}`}`
  return hours.closed
    ? '今日休息'
    : `${hours.start}–${hours.end}${minutes(hours.start) > minutes(hours.end) ? '（隔日）' : ''}`
}
export function isOpen(store: Store, now = new Date()): boolean {
  const { date, weekday, current } = taipeiTime(now)
  if (!store.enabled || store.pausedOn === date) return false
  const today = store.weeklyHours[weekday]!
  const previous = store.weeklyHours[(weekday + 6) % 7]!
  const start = minutes(today.start),
    end = minutes(today.end)
  const priorStart = minutes(previous.start),
    priorEnd = minutes(previous.end)
  return (
    (!today.closed &&
      (start < end ? current >= start && current < end : current >= start)) ||
    (!previous.closed && priorStart > priorEnd && current < priorEnd)
  )
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
      r.photoKey ?? r.photo,
      r.liters,
      r.low,
      r.high,
      r.reason,
      r.measurement ?? null,
      r.confirmedMeasurement ?? null,
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  const store = state.stores.find((s) => s.id === storeId)
  const payload = JSON.stringify([
    date,
    storeId,
    state.claims[`${date}:${storeId}`] ?? null,
    state.sizeClaims?.[`${date}:${storeId}`] ?? null,
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

export const TAIPEI_DISTRICTS = [
  '中正區',
  '大同區',
  '中山區',
  '松山區',
  '大安區',
  '萬華區',
  '信義區',
  '士林區',
  '北投區',
  '內湖區',
  '南港區',
  '文山區',
] as const
export interface RegistrationInput {
  weeklyHours?: DailyHours[]
  name: string
  address: string
  area: string
  lat: number
  lng: number
  hoursStart: string
  hoursEnd: string
}
const validHours = (start: unknown, end: unknown) =>
  typeof start === 'string' &&
  typeof end === 'string' &&
  /^([01]\d|2[0-3]):[0-5]\d$/.test(start) &&
  /^([01]\d|2[0-3]):[0-5]\d$/.test(end) &&
  start !== end
export function registerStore(state: State, input: RegistrationInput): Store {
  const name = input.name.trim()
  const address = input.address.trim()
  const area = input.area.trim()
  if (!name || !address || !TAIPEI_DISTRICTS.some((d) => d === area))
    throw new Error('請填寫店名、臺北市行政區與完整地址。')
  if (name.length > 100 || address.length > 200)
    throw new Error('店名不得超過 100 字、地址不得超過 200 字。')
  if (
    !hasCoordinates(input) ||
    input.lat < 24.95 ||
    input.lat > 25.22 ||
    input.lng < 121.45 ||
    input.lng > 121.68
  )
    throw new Error('請選擇臺北市範圍內的有效座標。')
  if (!validHours(input.hoursStart, input.hoursEnd))
    throw new Error('請設定不同且有效的開始、結束時間。')
  if (input.weeklyHours !== undefined) validateWeeklyHours(input.weeklyHours)
  if (
    state.stores.some(
      (s) => s.name.trim() === name && s.address.trim() === address,
    )
  )
    throw new Error('相同店名與地址已登記。')
  let hash = 0x811c9dc5
  for (const char of `${name}\0${address}`)
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193)
  const base = `registered-${(hash >>> 0).toString(16)}`
  let id = base
  let suffix = 1
  while (state.stores.some((s) => s.id === id)) id = `${base}-${suffix++}`
  return {
    id,
    name,
    address,
    area,
    lat: input.lat,
    lng: input.lng,
    isDemo: false,
    hoursStart: input.hoursStart,
    hoursEnd: input.hoursEnd,
    weeklyHours: (
      input.weeklyHours ?? defaultWeeklyHours(input.hoursStart, input.hoursEnd)
    ).map((h) => ({ ...h })),
    pausedOn: null,
    pauseReason: '',
    enabled: true,
    x: 50,
    y: 50,
    binDistance: null,
    publicCapacity: null,
    collections: null,
    overflow: null,
  }
}

export function migrateState(raw: unknown, expandDemo = true): State {
  const fail = () => {
    throw new Error('資料格式無法辨識')
  }
  if (!raw || typeof raw !== 'object') return fail()
  const state = raw as State
  if (
    !([1, 2, 3, 4] as number[]).includes(state.version) ||
    !Array.isArray(state.stores) ||
    !state.stores.length ||
    !Array.isArray(state.deliveries) ||
    !state.claims ||
    typeof state.claims !== 'object' ||
    Array.isArray(state.claims) ||
    !state.reviews ||
    typeof state.reviews !== 'object' ||
    Array.isArray(state.reviews)
  )
    return fail()
  const seed = seedState()
  const demos = seed.stores
  const oldDemoLabels = [
    '公園口',
    '書街',
    '老街',
    '河岸',
    '樹蔭',
    '晴光',
    '綠巷',
    '車站邊',
    '學院',
    '花園',
    '街角',
    '南園',
    '山腳',
    '廣場',
    '文林',
    '溪畔',
    '溫泉',
    '湖畔',
    '科園',
    '東站',
    '茶香',
  ]
  const ids = new Set<string>()
  const stores = state.stores.map((s) => {
    if (
      !s ||
      typeof s.id !== 'string' ||
      !s.id ||
      ids.has(s.id) ||
      typeof s.name !== 'string' ||
      typeof s.address !== 'string' ||
      typeof s.area !== 'string' ||
      typeof s.enabled !== 'boolean' ||
      !validHours(s.hoursStart, s.hoursEnd)
    )
      return fail()
    if (state.version >= 3) {
      validateWeeklyHours(s.weeklyHours)
      if (
        !(
          s.pausedOn === null ||
          (typeof s.pausedOn === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(s.pausedOn))
        ) ||
        typeof s.pauseReason !== 'string'
      )
        return fail()
    }
    ids.add(s.id)
    const demo = demos.find(
      (d) => d.id === s.id && d.name === s.name && d.address === s.address,
    )
    const seedStore = demos.find((d) => d.id === s.id)
    const oldDemoIndex = Number(s.id.replace('demo-', '')) - 1
    const renameDemo =
      expandDemo &&
      s.isDemo &&
      seedStore &&
      s.name === `${oldDemoLabels[oldDemoIndex]}夥伴小店（示範）` &&
      s.lat === seedStore.lat &&
      s.lng === seedStore.lng
    const coordinates = hasCoordinates(s)
      ? { lat: s.lat, lng: s.lng }
      : demo
        ? { lat: demo.lat, lng: demo.lng }
        : { lat: null, lng: null }
    const amount = (value: unknown) => (validAmount(value) ? value : null)
    return {
      ...s,
      ...coordinates,
      name: renameDemo ? seedStore.name : s.name,
      area: demo && state.version < 3 ? demo.area : s.area,
      weeklyHours:
        state.version >= 3
          ? s.weeklyHours.map((h) => ({ ...h }))
          : defaultWeeklyHours(s.hoursStart, s.hoursEnd),
      pausedOn: state.version >= 3 ? s.pausedOn : null,
      pauseReason: state.version >= 3 ? s.pauseReason : '',
      isDemo:
        state.version >= 2 && typeof s.isDemo === 'boolean' ? s.isDemo : true,
      x: Number.isFinite(s.x) ? s.x : 50,
      y: Number.isFinite(s.y) ? s.y : 50,
      binDistance: amount(s.binDistance),
      publicCapacity: amount(s.publicCapacity),
      collections: amount(s.collections),
      overflow: amount(s.overflow),
    }
  })
  for (const r of state.deliveries) {
    if (r?.measurement !== undefined) validateMeasurement(r.measurement)
    if (r?.confirmedMeasurement !== undefined) {
      validateMeasurement(r.confirmedMeasurement)
      if (!r.measurement) return fail()
    }
    if (
      !r ||
      typeof r.id !== 'string' ||
      !ids.has(r.storeId) ||
      typeof r.date !== 'string' ||
      !validAmount(r.liters) ||
      !validAmount(r.low) ||
      !validAmount(r.high) ||
      r.low > r.liters ||
      r.high < r.liters ||
      typeof r.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(r.createdAt)) ||
      typeof r.kind !== 'string' ||
      !['pending', 'accepted', 'rejected'].includes(r.status) ||
      !['photo', 'manual'].includes(r.source) ||
      !(r.photo === null || typeof r.photo === 'string') ||
      typeof r.reason !== 'string'
    )
      return fail()
  }
  if (
    Object.values(state.claims).some((v) => !validAmount(v)) ||
    Object.values(state.reviews).some((v) => typeof v !== 'string')
  )
    return fail()
  if (state.version === 4) {
    if (
      !state.sizeClaims ||
      typeof state.sizeClaims !== 'object' ||
      Array.isArray(state.sizeClaims)
    )
      return fail()
    Object.values(state.sizeClaims).forEach(validateSizeCounts)
  }
  const expand =
    expandDemo &&
    ['a', 'b', 'c'].every((id) => stores.some((s) => s.id === id && s.isDemo))
  const missing = expand ? demos.filter((s) => !ids.has(s.id)) : []
  const missingIds = new Set(missing.map((s) => s.id))
  const deliveryIds = new Set(state.deliveries.map((r) => r.id))
  const deliveries = [
    ...state.deliveries,
    ...seed.deliveries.filter(
      (r) => missingIds.has(r.storeId) && !deliveryIds.has(r.id),
    ),
  ]
  const claims = { ...state.claims }
  for (const [key, value] of Object.entries(seed.claims))
    if (missingIds.has(key.slice(11)) && !Object.hasOwn(claims, key))
      claims[key] = value
  const sizeClaims = state.version === 4 ? { ...state.sizeClaims } : {}
  for (const [key, value] of Object.entries(seed.sizeClaims))
    if (missingIds.has(key.slice(11)) && !Object.hasOwn(sizeClaims, key))
      sizeClaims[key] = { ...value }
  return {
    ...state,
    version: 4,
    sizeClaims,
    stores: [...stores, ...missing],
    deliveries,
    claims,
  }
}

export function aggregateSizes(
  state: State,
  storeId: string,
  date = dateKey(),
) {
  const reported: SizeCounts = { S: 0, M: 0, L: 0 }
  const confirmed: SizeCounts = { S: 0, M: 0, L: 0 }
  let photoCount = 0,
    manualCount = 0,
    pending = 0
  for (const record of state.deliveries) {
    if (
      record.storeId !== storeId ||
      record.date !== date ||
      !record.measurement
    )
      continue
    if (record.status === 'pending') {
      pending += 1
      continue
    }
    if (record.status !== 'accepted') continue
    const original = record.measurement
    const accepted = record.confirmedMeasurement ?? original
    reported[original.size] += original.quantity
    confirmed[accepted.size] += accepted.quantity
    if (record.source === 'photo') photoCount += 1
    else manualCount += 1
  }
  return {
    reported,
    confirmed,
    photoCount,
    manualCount,
    pending,
    total: confirmed.S + confirmed.M + confirmed.L,
  }
}

export function isDemoDelivery(record: Pick<Delivery, 'id'>): boolean {
  return record.id.startsWith('sample-') || record.id.startsWith('seed:')
}

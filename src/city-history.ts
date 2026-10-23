import type { Delivery, Store, SizeCounts } from './domain'

export function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}
export function dayLabel(day: string): string {
  const date = new Date(`${day}T12:00:00Z`)
  const weekday = date.getUTCDay()
  return `${day}・星期${'日一二三四五六'[weekday]}・${weekday === 0 || weekday === 6 ? '週末' : '平日'}`
}
export function timeLabel(createdAt: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(createdAt))
}
export function scheduledHours(store: Store, day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  const current = store.weeklyHours[weekday]!
  const previous = store.weeklyHours[(weekday + 6) % 7]!
  const segments: string[] = []
  if (!previous.closed && previous.start > previous.end)
    segments.push(`00:00–${previous.end}（前一日延續）`)
  if (!current.closed)
    segments.push(
      `${current.start}–${current.end}${current.start > current.end ? '（隔日）' : ''}`,
    )
  return segments.join('；') || '當日休息'
}
export function collectionTimeline(
  deliveries: Delivery[],
  storeId: string,
  day: string,
) {
  const records = deliveries
    .filter(
      (record) =>
        record.date === day &&
        record.storeId === storeId &&
        record.status === 'accepted' &&
        record.measurement,
    )
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    counts: { S: 0, M: 0, L: 0 } as SizeCounts,
    total: 0,
  }))
  for (const record of records) {
    const measurement = record.confirmedMeasurement ?? record.measurement!
    const hour = Number(timeLabel(record.createdAt).slice(0, 2))
    hourly[hour].counts[measurement.size] += measurement.quantity
    hourly[hour].total += measurement.quantity
  }
  const peak = Math.max(0, ...hourly.map((entry) => entry.total))
  return {
    records,
    hourly,
    peak,
    total: hourly.reduce((sum, entry) => sum + entry.total, 0),
  }
}

import { describe, expect, it } from 'vitest'
import { seedState } from './domain'
import {
  collectionTimeline,
  dayLabel,
  scheduledHours,
  shiftDay,
  timeLabel,
} from './city-history'

describe('市府日期與時段觀察', () => {
  it('跨月份切換日期，依星期標記平日與週末', () => {
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31')
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01')
    expect(dayLabel('2026-10-24')).toContain('星期六・週末')
    expect(dayLabel('2026-10-23')).toContain('星期五・平日')
    expect(timeLabel('2026-10-23T23:30:00Z')).toBe('07:30')
  })
  it('只統計所選日與店家的已收受尺寸紀錄，以店家確認件數分時且保留原填資料', () => {
    const base = seedState().deliveries[0]
    const measurement = {
      boardVersion: 'street-v1',
      size: 'S',
      quantity: 2,
    } as const
    const record = {
      ...base,
      id: 'mine',
      storeId: 'a',
      date: '2026-10-24',
      createdAt: '2026-10-24T01:30:00Z',
      status: 'accepted' as const,
      measurement,
      confirmedMeasurement: { ...measurement, size: 'M' as const, quantity: 3 },
    }
    const result = collectionTimeline(
      [
        record,
        { ...record, id: 'pending', status: 'pending' },
        { ...record, id: 'rejected', status: 'rejected' },
        { ...record, id: 'other', storeId: 'b' },
        { ...record, id: 'yesterday', date: '2026-10-23' },
        { ...base, storeId: 'a', date: '2026-10-24', measurement: undefined },
      ],
      'a',
      '2026-10-24',
    )
    expect(result.records).toHaveLength(1)
    expect(result.total).toBe(3)
    expect(result.hourly[9].counts).toEqual({ S: 0, M: 3, L: 0 })
    expect(result.records[0].measurement?.quantity).toBe(2)
  })
  it('呈現跨日收受前一日延續時段，休息日沒有虛構時段', () => {
    const store = seedState().stores[0]
    store.weeklyHours = Array.from({ length: 7 }, () => ({
      closed: true,
      start: '09:00',
      end: '17:00',
    }))
    store.weeklyHours[5] = { closed: false, start: '22:00', end: '02:00' }
    expect(scheduledHours(store, '2026-10-24')).toBe(
      '00:00–02:00（前一日延續）',
    )
    expect(scheduledHours(store, '2026-10-25')).toBe('當日休息')
  })
})

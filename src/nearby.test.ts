import { describe, expect, it } from 'vitest'
import { nearbyPlaces, partitionNearby } from './nearby'
import type { NearbyPlace } from './nearby'
import { seedState } from './domain'
import type { PublicBin } from './bin-data'

const bin: PublicBin = {
  id: 'bin',
  district: '中山區',
  address: '測試位置',
  lat: 25,
  lng: 121,
  note: '',
}
function entry(id: string, distance: number, open = true): NearbyPlace {
  return open
    ? { type: 'bin', place: { ...bin, id }, distance, open: true }
    : {
        type: 'store',
        place: { ...seedState().stores[0], id },
        distance,
        open: false,
      }
}
describe('民眾附近據點', () => {
  it('混合官方桶點與店家依距離排序，1 公里包含邊界，停收店家放在其他據點', () => {
    const items = [
      entry('far', 1000.01),
      entry('edge', 1000),
      entry('closed', 10, false),
      entry('near', 100),
      entry('invalid', NaN),
    ]
    const result = partitionNearby(items)
    expect(result.nearby.map((r) => r.place.id)).toEqual(['near', 'edge'])
    expect(result.other.map((r) => r.place.id)).toEqual(['closed', 'far'])
    expect(items[0].place.id).toBe('far')
  })
  it('不同來源共用距離排序，略過缺座標或無效座標', () => {
    const now = new Date('2026-10-24T04:00:00Z')
    const store = {
      ...seedState().stores[0],
      lat: 25.001,
      lng: 121,
      enabled: true,
      pausedOn: null,
      weeklyHours: Array.from({ length: 7 }, () => ({
        closed: false,
        start: '00:00',
        end: '23:59',
      })),
    }
    const result = nearbyPlaces(
      { lat: 25, lng: 121 },
      [store, { ...store, id: 'missing', lat: null }],
      [
        { ...bin, lat: 25.0005 },
        { ...bin, id: 'invalid', lat: NaN },
      ],
      now,
    )
    expect(result.nearby.map((r) => r.type)).toEqual(['bin', 'store'])
    expect(result.other).toEqual([])
  })
})

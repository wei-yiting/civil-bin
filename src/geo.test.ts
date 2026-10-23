import { describe, expect, it } from 'vitest'
import { formatDistance, haversineMeters, nearestBin } from './geo'
describe('地理距離', () => {
  it('使用球面距離，對稱且同點為零', () => {
    const a = { lat: 25, lng: 121 }
    const b = { lat: 25.001, lng: 121 }
    expect(haversineMeters(a, a)).toBe(0)
    expect(haversineMeters(a, b)).toBeCloseTo(111.195, 1)
    expect(haversineMeters(a, b)).toBe(haversineMeters(b, a))
    expect(Number.isNaN(haversineMeters({ lat: NaN, lng: 121 }, b))).toBe(true)
  })
  it('未知顯示未知，距離標示公尺與公里', () => {
    expect(formatDistance(NaN)).toBe('未知')
    expect(formatDistance(70)).toBe('70 公尺')
    expect(formatDistance(1250)).toBe('1.3 公里')
  })
  it('忽略無效桶點，選最近者，不改動順序', () => {
    const bins = [
      { id: 'far', lat: 25.1, lng: 121 },
      { id: 'near', lat: 25.001, lng: 121 },
      { id: 'invalid', lat: NaN, lng: 121 },
    ]
    expect(nearestBin({ lat: 25, lng: 121 }, bins)?.bin.id).toBe('near')
    expect(bins[0].id).toBe('far')
    expect(nearestBin({ lat: null, lng: null }, bins)).toBeNull()
    expect(nearestBin({ lat: 25, lng: 121 }, [])).toBeNull()
  })
})

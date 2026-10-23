import { describe, expect, it } from 'vitest'
import { mergeBins, parseBins } from './bin-data'
const header = '行政區,地址,經度,緯度,備註\n'
describe('官方清潔箱資料', () => {
  it('解析中文欄位及含逗號的引號地址', () => {
    const result = parseBins(
      header + '士林區,"士東路,180號",121.5320202,25.1126108,嚴禁家用垃圾\n',
    )
    expect(result.bins).toHaveLength(1)
    expect(result.bins[0]).toMatchObject({
      district: '士林區',
      address: '士東路,180號',
      lat: 25.1126108,
      lng: 121.5320202,
      note: '嚴禁家用垃圾',
    })
  })
  it('拒絕空白、zero、非數字及不合理座標', () => {
    const result = parseBins(
      header +
        '中正區,A,,25.03,\n中正區,B,0,0,\n中正區,C,no,25.03,\n中正區,D,120.2,23.1,\n中正區,E,121.5,25.03,\n',
    )
    expect(result.bins).toHaveLength(1)
    expect(result.rejected).toBe(4)
  })
  it('合併來源時依相同座標或同區地址去重，保留不同區同名地點', () => {
    const a = parseBins(
      header + '中正區,A,121.5,25.03,\n中正區,B,121.51,25.04,\n',
    )
    const b = parseBins(
      header +
        '中正區,A,121.501,25.031,\n中正區,C,121.51,25.04,\n士林區,A,121.53,25.11,\n',
    )
    const result = mergeBins([a, b])
    expect(result.bins).toHaveLength(3)
    expect(result.duplicates).toBe(2)
  })
  it('不把失效 HTML 或錯誤欄位當成空的有效資料', () => {
    expect(() => parseBins('<html>error</html>')).toThrow()
    expect(() => parseBins('address,lat,lng\nA,25,121')).toThrow()
  })
  it('空列略過，ID 對來源與列順序穩定', () => {
    const a = parseBins('\uFEFF' + header + '中正區,A,121.5,25.03,\n\n', 'one')
    const b = parseBins(header + '中正區,A,121.5,25.03,\n', 'two')
    expect(a.rejected).toBe(0)
    expect(a.bins[0].id).toBe(b.bins[0].id)
  })
})

import { afterEach, vi } from 'vitest'
import { decodeCsvBuffer, fetchPublicBins } from './bin-data'
afterEach(() => vi.unstubAllGlobals())
describe('完整來源與編碼', () => {
  it('支援官方 Big5 與 UTF-8，避免中文欄位亂碼', () => {
    expect(
      decodeCsvBuffer(
        new Uint8Array([0xa6, 0xe6, 0xac, 0x46, 0xb0, 0xcf]).buffer,
      ),
    ).toBe('行政區')
    expect(decodeCsvBuffer(new TextEncoder().encode('行政區').buffer)).toBe(
      '行政區',
    )
  })
  it('任一來源下載失敗時整體失敗，不能發布不完整的 live 資料', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(header + '中正區,A,121.5,25.03,\n'))
      .mockRejectedValueOnce(new TypeError('CORS'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchPublicBins(new AbortController().signal)).rejects.toThrow(
      'CORS',
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('兩個來源均成功才標示取得時間並合併', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(header + '中正區,A,121.5,25.03,\n'))
        .mockResolvedValueOnce(
          new Response(header + '士林區,B,121.53,25.11,3處\n'),
        ),
    )
    const result = await fetchPublicBins(new AbortController().signal)
    expect(result.bins).toHaveLength(2)
    expect(result.sources.map((source) => source.count)).toEqual([1, 1])
    expect(Number.isFinite(Date.parse(result.fetchedAt))).toBe(true)
  })
})

import snapshotData from './data/public-bins.json'
import { isBinSnapshot } from './bin-data'
describe('同來源端點回應格式', () => {
  it('接受完整官方資料，但拒絕HTML、缺漏來源或不合理座標', () => {
    expect(isBinSnapshot(snapshotData)).toBe(true)
    expect(isBinSnapshot('<html>SPA fallback</html>')).toBe(false)
    expect(
      isBinSnapshot({
        ...snapshotData,
        sources: snapshotData.sources.slice(0, 1),
      }),
    ).toBe(false)
    expect(
      isBinSnapshot({
        ...snapshotData,
        bins: [{ ...snapshotData.bins[0], lat: 0 }],
      }),
    ).toBe(false)
    expect(isBinSnapshot({ ...snapshotData, fetchedAt: 'not-a-date' })).toBe(
      false,
    )
    expect(isBinSnapshot({ ...snapshotData, bins: [] })).toBe(false)
  })
})

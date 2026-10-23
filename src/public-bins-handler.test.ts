import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createPublicBinsHandler } from '../server/public-bins-handler'
import type { BinSnapshot } from './bin-data'
const snapshot: BinSnapshot = {
  bins: [
    {
      id: 'a',
      district: '中正區',
      address: 'A',
      lat: 25.03,
      lng: 121.5,
      note: '',
    },
  ],
  fetchedAt: '2026-10-23T16:00:00Z',
  sources: [],
  rejected: 0,
  duplicates: 0,
}
function request(method = 'GET', url = '/api/public-bins') {
  let body = ''
  const headers: Record<string, string | number | readonly string[]> = {}
  const res = {
    statusCode: 200,
    setHeader: (key: string, value: string | number | readonly string[]) => {
      headers[key.toLowerCase()] = value
    },
    end: (value: string) => {
      body = value
    },
  }
  return {
    req: { method, url } as IncomingMessage,
    res: res as unknown as ServerResponse,
    read: () => ({ status: res.statusCode, headers, body }),
  }
}
afterEach(() => vi.useRealTimers())
describe('官方清潔箱同來源端點', () => {
  it('完整成功資料快取一小時，並提供正確JSON/CDN標頭', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockResolvedValue(snapshot)
    const handler = createPublicBinsHandler(fetcher)
    const a = request()
    await handler(a.req, a.res)
    const b = request()
    await handler(b.req, b.res)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(a.read()).toMatchObject({
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=60, s-maxage=3600',
      },
    })
    expect(JSON.parse(b.read().body)).toEqual(snapshot)
    vi.setSystemTime(Date.now() + 3_600_001)
    const c = request()
    await handler(c.req, c.res)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('並行請求共用一個完整抓取，不接受url query指定其他來源', async () => {
    let resolve!: (data: BinSnapshot) => void
    const fetcher = vi.fn(
      (_signal: AbortSignal) =>
        new Promise<BinSnapshot>((done) => {
          resolve = done
        }),
    )
    const handler = createPublicBinsHandler(fetcher)
    const a = request('GET', '/api/public-bins?url=https://evil.example')
    const b = request()
    const tasks = [handler(a.req, a.res), handler(b.req, b.res)]
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]).toHaveLength(1)
    expect(fetcher.mock.calls[0][0]).toBeInstanceOf(AbortSignal)
    resolve(snapshot)
    await Promise.all(tasks)
    expect(a.read().status).toBe(200)
    expect(b.read().status).toBe(200)
  })
  it('上游失敗回503且不cache，下次可恢復，不以snapshot冒充live', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('private upstream detail'))
      .mockResolvedValueOnce(snapshot)
    const handler = createPublicBinsHandler(fetcher)
    const a = request()
    await handler(a.req, a.res)
    expect(a.read()).toMatchObject({
      status: 503,
      headers: { 'cache-control': 'no-store' },
    })
    expect(a.read().body).not.toContain('private upstream detail')
    expect(JSON.parse(a.read().body)).not.toHaveProperty('bins')
    const b = request()
    await handler(b.req, b.res)
    expect(b.read().status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('只允許GET且不觸發上游', async () => {
    const fetcher = vi.fn()
    const handler = createPublicBinsHandler(fetcher)
    const a = request('POST')
    await handler(a.req, a.res)
    expect(a.read()).toMatchObject({ status: 405, headers: { allow: 'GET' } })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('上游超過8秒回503，終止該批抓取', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const fetcher = vi.fn((next: AbortSignal) => {
      signal = next
      return new Promise<BinSnapshot>(() => {})
    })
    const handler = createPublicBinsHandler(fetcher)
    const a = request()
    const task = handler(a.req, a.res)
    await vi.advanceTimersByTimeAsync(8000)
    await task
    expect(signal?.aborted).toBe(true)
    expect(a.read().status).toBe(503)
  })
})

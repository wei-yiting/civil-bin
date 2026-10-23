import type { IncomingMessage, ServerResponse } from 'node:http'
import { fetchPublicBins, type BinSnapshot } from '../src/bin-data.ts'

export function createPublicBinsHandler(fetcher = fetchPublicBins) {
  let cache: { data: BinSnapshot; expiresAt: number } | null = null
  let inFlight: Promise<BinSnapshot> | null = null

  function load(): Promise<BinSnapshot> {
    if (cache && cache.expiresAt > Date.now())
      return Promise.resolve(cache.data)
    if (inFlight) return inFlight
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout>
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort()
        reject(new Error('官方資料讀取逾時'))
      }, 8000)
    })
    inFlight = Promise.race([fetcher(controller.signal), deadline])
      .then((data) => {
        cache = { data, expiresAt: Date.now() + 3_600_000 }
        return data
      })
      .finally(() => {
        clearTimeout(timeout)
        inFlight = null
      })
    return inFlight
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.setHeader('Allow', 'GET')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ error: '只支援 GET' }))
      return
    }
    try {
      const data = await load()
      res.statusCode = 200
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=3600')
      res.end(JSON.stringify(data))
    } catch {
      res.statusCode = 503
      res.setHeader('Cache-Control', 'no-store')
      res.end(
        JSON.stringify({
          error: '目前無法取得完整官方資料，請使用內嵌資料稍後重試',
        }),
      )
    }
  }
}

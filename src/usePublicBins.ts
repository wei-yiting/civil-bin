import { useCallback, useEffect, useState } from 'react'
import snapshotData from './data/public-bins.json'
import { isBinSnapshot, type BinSnapshot } from './bin-data'

export const publicBinsSnapshot: BinSnapshot = snapshotData

export function usePublicBins() {
  const canRefresh =
    import.meta.env.VITE_STATIC_DATA !== 'true' &&
    window.location.protocol !== 'file:'
  const [data, setData] = useState<BinSnapshot>(publicBinsSnapshot)
  const [source, setSource] = useState<'live' | 'snapshot'>('snapshot')
  const [loading, setLoading] = useState(canRefresh)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    if (!canRefresh) return
    const controller = new AbortController()
    let current = true
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    fetch(`${import.meta.env.BASE_URL}api/public-bins`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (
          !response.ok ||
          !response.headers.get('content-type')?.includes('application/json')
        ) {
          throw new Error('官方資料端點不可用')
        }
        const next: unknown = await response.json()
        if (!isBinSnapshot(next)) throw new Error('官方資料格式不完整')
        return next
      })
      .then((next) => {
        if (!current) return
        setData(next)
        setSource('live')
        setError(null)
      })
      .catch(() => {
        if (!current) return
        setError(
          '目前無法取得完整官方最新資料，顯示上次成功取得的資料。離線或純靜態預覽時可使用內嵌資料。',
        )
      })
      .finally(() => {
        window.clearTimeout(timeout)
        if (current) setLoading(false)
      })
    return () => {
      current = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [revision, canRefresh])

  const requestRefresh = useCallback(() => {
    setLoading(true)
    setError(null)
    refresh()
  }, [refresh])
  return {
    canRefresh,
    bins: data.bins,
    loading,
    source,
    updatedAt: data.fetchedAt,
    error,
    refresh: requestRefresh,
  }
}

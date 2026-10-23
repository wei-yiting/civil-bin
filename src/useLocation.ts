import { useState } from 'react'
import type { Coordinates } from './geo'

export function useLocation() {
  const [position, setPosition] = useState<
    (Coordinates & { accuracy: number }) | undefined
  >()
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  function locate() {
    if (!window.isSecureContext || !navigator.geolocation) {
      setError('這個瀏覽器或網址無法定位，請使用 HTTPS 網址或手動移動地圖。')
      return
    }
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setPosition({
          lat: result.coords.latitude,
          lng: result.coords.longitude,
          accuracy: result.coords.accuracy,
        })
        setLocating(false)
      },
      (reason) => {
        setLocating(false)
        setError(
          reason.code === 1
            ? '未取得定位權限，仍可拖曳地圖或搜尋店家。'
            : reason.code === 3
              ? '定位逾時，請重試或手動移動地圖。'
              : '暫時無法取得位置，請重試或手動移動地圖。',
        )
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }
  return { position, locating, error, locate }
}

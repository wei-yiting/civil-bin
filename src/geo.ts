export interface Coordinates {
  lat: number
  lng: number
}
export function hasCoordinates(point: {
  lat: number | null
  lng: number | null
}): point is Coordinates {
  return (
    typeof point.lat === 'number' &&
    typeof point.lng === 'number' &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  )
}
export function haversineMeters(a: Coordinates, b: Coordinates): number {
  if (!hasCoordinates(a) || !hasCoordinates(b)) return NaN
  const radians = (degree: number) => (degree * Math.PI) / 180
  const dLat = radians(b.lat - a.lat)
  const dLng = radians(b.lng - a.lng)
  const arc =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(dLng / 2) ** 2
  return (
    6_371_000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(Math.max(0, 1 - arc)))
  )
}
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '未知'
  return meters < 1000
    ? `${Math.round(meters)} 公尺`
    : `${(meters / 1000).toFixed(1)} 公里`
}
export function nearestBin<T extends Coordinates>(
  store: { lat: number | null; lng: number | null },
  bins: readonly T[],
): { bin: T; distance: number } | null {
  if (!hasCoordinates(store)) return null
  let nearest: { bin: T; distance: number } | null = null
  for (const bin of bins) {
    const distance = haversineMeters(store, bin)
    if (Number.isFinite(distance) && (!nearest || distance < nearest.distance))
      nearest = { bin, distance }
  }
  return nearest
}
